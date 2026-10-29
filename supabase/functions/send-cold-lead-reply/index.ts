import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveColdLeadRecipientEmail } from "./contactEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const primeForgeApiKey = Deno.env.get("PRIMEFORGE_API_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!primeForgeApiKey && !resendApiKey) {
      return new Response(JSON.stringify({ error: "No email provider configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "super_admin"]);

    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { cold_lead_id, subject, body, reply_to_thread_id } = await req.json();

    if (!cold_lead_id || !body) {
      return new Response(JSON.stringify({ error: "cold_lead_id and body are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: lead, error: leadError } = await adminClient
      .from("cold_leads")
      .select("*")
      .eq("id", cold_lead_id)
      .single();

    if (leadError || !lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recipientEmail = resolveColdLeadRecipientEmail(lead.contact_email);
    if (!recipientEmail) {
      return new Response(
        JSON.stringify({
          error: "This lead has no email address; email reply is not available.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let emailSubject = subject || `Re: Follow-up`;
    if (reply_to_thread_id) {
      const { data: parentThread } = await adminClient
        .from("cold_lead_threads")
        .select("subject")
        .eq("id", reply_to_thread_id)
        .single();
      if (parentThread?.subject) {
        emailSubject = parentThread.subject.startsWith("Re:")
          ? parentThread.subject
          : `Re: ${parentThread.subject}`;
      }
    }

    const htmlBody = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">${body.replace(/\n/g, "<br>")}</div>`;

    let sendResultId = "";
    let fromEmail = "";

    if (primeForgeApiKey) {
      const pfResponse = await fetch(`${supabaseUrl}/functions/v1/send-via-primeforge`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: recipientEmail,
          subject: emailSubject,
          html: htmlBody,
          text: body,
          from_name: "HARC Solutions",
          template_category: "newsletter",
          related_entity_type: "cold_lead",
          related_entity_id: cold_lead_id,
        }),
      });

      const pfData = await pfResponse.json();
      if (!pfResponse.ok) {
        console.error("PrimeForge error:", pfData);
        return new Response(JSON.stringify({ error: "Failed to send email", details: pfData }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      sendResultId = pfData.messageId || "";
      fromEmail = pfData.from || "outreach@harcsolutions.live";
      console.log(`Cold lead reply sent via PrimeForge to ${recipientEmail}`);
    } else {
      fromEmail = "hello@harcsolutions.co.uk";
      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `HARC Solutions <${fromEmail}>`,
          to: [recipientEmail],
          subject: emailSubject,
          html: htmlBody,
          text: body,
        }),
      });

      const resendResult = await resendResponse.json();

      if (!resendResponse.ok) {
        console.error("Resend error:", resendResult);
        return new Response(JSON.stringify({ error: "Failed to send email", details: resendResult }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      sendResultId = resendResult.id || "";
    }

    const { data: thread, error: threadError } = await adminClient
      .from("cold_lead_threads")
      .insert({
        cold_lead_id,
        subject: emailSubject,
        html_body: htmlBody,
        text_body: body,
        direction: "outbound",
        from_email: fromEmail,
        to_email: recipientEmail,
        sent_at: new Date().toISOString(),
        external_message_id: sendResultId || null,
      })
      .select("id")
      .single();

    if (threadError) {
      console.error("Thread record error:", threadError);
    }

    await adminClient.from("cold_lead_events").insert({
      cold_lead_id,
      event_type: "replied",
      event_data: {
        sent_by: user.id,
        message_id: sendResultId,
        provider: primeForgeApiKey ? "primeforge" : "resend",
      },
      occurred_at: new Date().toISOString(),
    });

    if (lead.status === "lead") {
      await adminClient
        .from("cold_leads")
        .update({ status: "contacted", updated_at: new Date().toISOString() })
        .eq("id", cold_lead_id);
    }

    return new Response(
      JSON.stringify({ success: true, thread_id: thread?.id, message_id: sendResultId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Reply error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
