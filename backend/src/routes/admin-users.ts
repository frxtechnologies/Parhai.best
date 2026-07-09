import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/auth";
import { supabaseAdmin } from "../lib/supabase";

const router: IRouter = Router();

const EmailBody = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
});

async function listAdminEmails(): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin.from("admin_users").select("email");
  if (error) throw error;
  return new Set((data ?? []).map((row) => String(row.email).toLowerCase()));
}

/** List all registered users with their admin status. Admin-only. */
router.get("/admin/users", requireAdmin, async (req, res): Promise<void> => {
  try {
    const [{ data: authData, error: authError }, adminEmails] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 }),
      listAdminEmails(),
    ]);
    if (authError) throw authError;

    const ids = authData.users.map((u) => u.id);
    const profileNames = new Map<string, { name: string | null; level: string | null }>();
    if (ids.length > 0) {
      const { data: profiles } = await supabaseAdmin.from("profiles").select("id,name,level").in("id", ids);
      for (const p of profiles ?? []) profileNames.set(p.id as string, { name: p.name as string | null, level: p.level as string | null });
    }

    const users = authData.users.map((user) => {
      const email = (user.email ?? "").toLowerCase();
      return {
        id: user.id,
        email: user.email ?? null,
        name: profileNames.get(user.id)?.name ?? (user.user_metadata?.name as string | undefined) ?? null,
        level: profileNames.get(user.id)?.level ?? null,
        isAdmin: email.length > 0 && adminEmails.has(email),
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at ?? null,
      };
    });

    res.json({ users, adminCount: [...adminEmails].length });
  } catch (error) {
    req.log.error({ error }, "Could not list users");
    res.status(500).json({ error: "Could not load users." });
  }
});

/** Grant admin access to an email (the account need not exist yet). Admin-only. */
router.post("/admin/admins", requireAdmin, async (req, res): Promise<void> => {
  const parsed = EmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid email." });
    return;
  }
  const { error } = await supabaseAdmin.from("admin_users").upsert({ email: parsed.data.email }, { onConflict: "email" });
  if (error) {
    req.log.error({ error }, "Could not add administrator");
    res.status(500).json({ error: "Could not grant admin access." });
    return;
  }
  res.json({ email: parsed.data.email, isAdmin: true });
});

/** Revoke admin access. Blocks removing yourself or the final administrator. */
router.delete("/admin/admins/:email", requireAdmin, async (req, res): Promise<void> => {
  const parsed = EmailBody.safeParse({ email: req.params.email });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid email." });
    return;
  }
  const target = parsed.data.email;
  const requesterEmail = res.locals.user?.email?.trim().toLowerCase();

  if (target === requesterEmail) {
    res.status(400).json({ error: "You cannot remove your own admin access." });
    return;
  }

  const adminEmails = await listAdminEmails();
  if (!adminEmails.has(target)) {
    res.status(404).json({ error: "That email is not an administrator." });
    return;
  }
  if (adminEmails.size <= 1) {
    res.status(400).json({ error: "At least one administrator must remain." });
    return;
  }

  const { error } = await supabaseAdmin.from("admin_users").delete().eq("email", target);
  if (error) {
    req.log.error({ error }, "Could not remove administrator");
    res.status(500).json({ error: "Could not revoke admin access." });
    return;
  }
  res.json({ email: target, isAdmin: false });
});

export default router;
