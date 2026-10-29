export function resolveColdLeadRecipientEmail(
  contactEmail: string | null | undefined,
): string | null {
  if (contactEmail == null) {
    return null;
  }
  const trimmed = contactEmail.trim();
  return trimmed.length > 0 ? trimmed : null;
}
