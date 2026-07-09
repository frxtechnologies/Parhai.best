import { useState } from "react";
import { Redirect } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from "@/context/auth-context";
import { useAdminUsers, useIsAdmin, useSetUserAdmin } from "@/api/client";
import type { AdminUser } from "@/api/types";
import { Loader2, ShieldCheck, ShieldOff, UserPlus, Users } from "lucide-react";

export default function AdminUsers() {
  const { user, isLoading } = useAuth();
  const { isAdmin, isResolved } = useIsAdmin();
  const { data: users = [], isLoading: usersLoading, isError, error } = useAdminUsers();
  const setAdmin = useSetUserAdmin();
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [actionError, setActionError] = useState("");

  if (isLoading || !isResolved) return <AppLayout><div className="p-12 text-center text-slate-400">Loading…</div></AppLayout>;
  if (!isAdmin) return <Redirect to="/dashboard" />;

  const currentEmail = user?.email?.trim().toLowerCase();
  const adminCount = users.filter((u) => u.isAdmin).length;

  const runAction = (email: string, makeAdmin: boolean) => {
    setActionError("");
    setAdmin.mutate({ email, makeAdmin }, { onError: (err) => setActionError(err.message) });
  };

  const handleAdd = () => {
    const email = newAdminEmail.trim().toLowerCase();
    if (!email) return;
    setActionError("");
    setAdmin.mutate({ email, makeAdmin: true }, {
      onSuccess: () => setNewAdminEmail(""),
      onError: (err) => setActionError(err.message),
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6 pb-10">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Users className="h-6 w-6" /></span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[#0B1F3A]">User Management</h1>
              <p className="mt-1 text-sm text-slate-500">{users.length} users · {adminCount} administrator{adminCount === 1 ? "" : "s"}</p>
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-[#0B1F3A]">Grant admin access by email</h2>
          <p className="mt-1 text-xs text-slate-400">The account does not need to exist yet — access applies as soon as they sign in.</p>
          <div className="mt-3 flex gap-2">
            <input
              type="email"
              value={newAdminEmail}
              onChange={(e) => setNewAdminEmail(e.target.value)}
              placeholder="teacher@example.com"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={setAdmin.isPending || !newAdminEmail.trim()}
              className="flex items-center gap-2 rounded-lg bg-[#0B1F3A] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#142f50] disabled:opacity-50"
            >
              <UserPlus className="h-4 w-4" /> Add admin
            </button>
          </div>
          {actionError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{actionError}</p>}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {usersLoading ? (
            <div className="p-10 text-center text-slate-400">Loading users…</div>
          ) : isError ? (
            <div className="p-10 text-center text-sm text-red-600">{error instanceof Error ? error.message : "Could not load users."}</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-3 font-medium">User</th>
                  <th className="px-5 py-3 font-medium">Level</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    isSelf={u.email?.trim().toLowerCase() === currentEmail}
                    isLastAdmin={u.isAdmin && adminCount <= 1}
                    pending={setAdmin.isPending}
                    onToggle={(makeAdmin) => u.email && runAction(u.email, makeAdmin)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </AppLayout>
  );
}

function UserRow({ user, isSelf, isLastAdmin, pending, onToggle }: {
  user: AdminUser;
  isSelf: boolean;
  isLastAdmin: boolean;
  pending: boolean;
  onToggle: (makeAdmin: boolean) => void;
}) {
  const disabledReason = isSelf ? "You cannot change your own access." : isLastAdmin ? "At least one admin must remain." : "";
  return (
    <tr className="hover:bg-slate-50/60">
      <td className="px-5 py-3">
        <p className="font-medium text-[#0B1F3A]">{user.name ?? "—"}</p>
        <p className="text-xs text-slate-400">{user.email}</p>
      </td>
      <td className="px-5 py-3 text-slate-500">{user.level === "O_LEVEL" ? "O Level" : user.level === "A_LEVEL" ? "A Level" : "—"}</td>
      <td className="px-5 py-3">
        {user.isAdmin ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700"><ShieldCheck className="h-3.5 w-3.5" /> Admin</span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">Student</span>
        )}
      </td>
      <td className="px-5 py-3 text-right">
        <button
          type="button"
          onClick={() => onToggle(!user.isAdmin)}
          disabled={pending || Boolean(disabledReason)}
          title={disabledReason || undefined}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
            user.isAdmin ? "border-red-200 text-red-600 hover:bg-red-50" : "border-teal-200 text-teal-700 hover:bg-teal-50"
          }`}
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : user.isAdmin ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          {user.isAdmin ? "Revoke" : "Make admin"}
        </button>
      </td>
    </tr>
  );
}
