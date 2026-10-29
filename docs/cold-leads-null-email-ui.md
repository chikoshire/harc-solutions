# Admin UI: cold leads without email

Apply these edits in the **private HARC app monorepo** (Leads Inbox under admin email marketing / cold-leads). Paths are typical; search for `queryKey: ["cold-leads"]` if filenames differ.

## Shared helper

```ts
export function formatColdLeadEmail(email: string | null | undefined): string {
  const trimmed = email?.trim();
  return trimmed ? trimmed : "No email";
}

export function coldLeadHasEmail(email: string | null | undefined): boolean {
  return Boolean(email?.trim());
}
```

## List search filter (crashes today on `contact_email.toLowerCase()`)

Replace:

```ts
h.contact_email.toLowerCase().includes(a.toLowerCase())
```

With:

```ts
(h.contact_email?.toLowerCase().includes(a.toLowerCase()) ?? false)
```

## List row subtitle

Replace `{h.contact_email}` with `{formatColdLeadEmail(h.contact_email)}`.

## Detail header subtitle

Replace `{s.contact_email}` (and optional company suffix) with `{formatColdLeadEmail(s.contact_email)}` plus company when present.

## Reply action

- Compute `const canEmail = coldLeadHasEmail(lead.contact_email)`.
- Hide the **Reply** button when `!canEmail`, or render it `disabled` with `title="No email on file"`.
- Do not open the reply composer when there is no email (`f && canEmail` for the composer panel).
- In `send-cold-lead-reply` mutation `onError`, surface the 400 message from the edge function.

## Convert dialog

Allow conversion without email if phone or name is present (align with DB CHECK):

```ts
if (!i.name?.trim() && !i.email?.trim() && !i.phone?.trim()) {
  se.error("At least a name, email, or phone is required");
  return;
}
```

Only append `email=` to the post-convert quote URL when `i.email?.trim()` is set.

## Types

After migration, regenerate Supabase types. Expected changes on `cold_leads`:

- `contact_email`: `string` → `string | null`
- `contact_name`: `string` → `string | null`
