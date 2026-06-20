export const ADMIN_EMAILS = ["frx.technologies@gmail.com", "ferozemughal8@gmail.com"] as const;

export function isAdminEmail(email?: string | null) {
  const normalized = email?.trim().toLowerCase();
  return Boolean(normalized && ADMIN_EMAILS.some((adminEmail) => adminEmail === normalized));
}
