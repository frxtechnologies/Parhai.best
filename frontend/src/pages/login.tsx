import { Link, Redirect } from "wouter";
import { LockKeyhole, Mail } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useState } from "react";
import type { FormEvent } from "react";
import { signInWithPassword, signUpWithPassword } from "@/api/client";
import { isSupabaseConfigured } from "@/lib/supabase";
import { BrandLogo } from "@/components/brand-logo";

type AuthTab = "login" | "signup";

function getAuthMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes("invalid login credentials")) {
    return "The email or password is incorrect.";
  }
  if (lower.includes("email not confirmed") || lower.includes("confirm")) {
    return "Please confirm your email before logging in. Check your inbox for the Supabase confirmation email.";
  }
  if (lower.includes("already registered") || lower.includes("already exists") || lower.includes("user already")) {
    return "An account already exists with this email. Use the Login tab instead.";
  }
  if (lower.includes("password") && (lower.includes("weak") || lower.includes("6") || lower.includes("short"))) {
    return "Use a stronger password with at least 6 characters.";
  }
  if (lower.includes("rate limit")) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  return message || "Authentication failed. Please try again.";
}

export default function Login() {
  const { user, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<AuthTab>("login");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  if (isLoading) return null;
  if (user) return <Redirect to="/dashboard" />;

  const isSignup = activeTab === "signup";

  const switchTab = (tab: AuthTab) => {
    setActiveTab(tab);
    setError("");
    setMessage("");
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();

    if (!isSupabaseConfigured) {
      setError("Supabase is not connected. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to frontend/.env.");
      return;
    }
    if (!cleanEmail || !password) {
      setError("Enter your email and password.");
      return;
    }
    if (isSignup && password.length < 6) {
      setError("Use a stronger password with at least 6 characters.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setMessage("");

    try {
      if (isSignup) {
        const data = await signUpWithPassword(cleanEmail, password);
        const identities = data.user ? ((data.user as { identities?: unknown[] }).identities ?? []) : [];
        if (data.user && identities.length === 0) {
          setError("An account already exists with this email. Use the Login tab instead.");
          return;
        }
        if (!data.session) {
          setMessage("Account created. Please confirm your email, then come back and log in.");
          return;
        }
      } else {
        await signInWithPassword(cleanEmail, password);
      }

      window.location.href = "/dashboard";
    } catch (err) {
      setError(getAuthMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#F8FAFC] p-4">
      <Link href="/" className="absolute left-6 top-6 md:left-8 md:top-8">
        <BrandLogo linked={false} imageClassName="h-12 w-auto" />
      </Link>

      <div className="w-full max-w-md rounded-3xl border border-white/80 bg-white p-8 text-center shadow-xl shadow-[#0B1F3A]/10 md:p-10">
        <div className="mx-auto mb-6 flex justify-center">
          <BrandLogo linked={false} imageClassName="h-16 w-auto" />
        </div>

        <h1 className="mb-2 text-3xl font-bold text-[#0B1F3A]">
          {isSignup ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mb-7 text-sm leading-6 text-[#0B1F3A]/60">
          {isSignup
            ? "Start your Parhai study workspace with a simple email and password."
            : "Log in to continue to your dashboard."}
        </p>

        <div className="mb-6 grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => switchTab("login")}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
              activeTab === "login" ? "bg-white text-[#0B1F3A] shadow-sm" : "text-slate-500 hover:text-[#0B1F3A]"
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => switchTab("signup")}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
              activeTab === "signup" ? "bg-white text-[#0B1F3A] shadow-sm" : "text-slate-500 hover:text-[#0B1F3A]"
            }`}
          >
            Create Account
          </button>
        </div>

        {!isSupabaseConfigured && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-900">
            <div className="mb-1 flex items-center gap-2 font-semibold">
              <LockKeyhole className="h-4 w-4" />
              Supabase is not connected
            </div>
            Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to `frontend/.env`.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-[#0B1F3A]" htmlFor="email">
              Email
            </label>
            <div className="flex items-center gap-3 rounded-xl border-2 border-gray-200 bg-white px-4 py-3 focus-within:border-[#06B6D4] focus-within:ring-4 focus-within:ring-[#06B6D4]/10">
              <Mail className="h-5 w-5 text-gray-400" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="student@example.com"
                autoComplete="email"
                className="w-full bg-transparent text-sm text-[#0B1F3A] outline-none"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-[#0B1F3A]" htmlFor="password">
              Password
            </label>
            <div className="flex items-center gap-3 rounded-xl border-2 border-gray-200 bg-white px-4 py-3 focus-within:border-[#06B6D4] focus-within:ring-4 focus-within:ring-[#06B6D4]/10">
              <LockKeyhole className="h-5 w-5 text-gray-400" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={isSignup ? "Minimum 6 characters" : "Your password"}
                autoComplete={isSignup ? "new-password" : "current-password"}
                className="w-full bg-transparent text-sm text-[#0B1F3A] outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !isSupabaseConfigured}
            className="w-full rounded-xl bg-[#0B1F3A] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[#0B1F3A]/15 transition-all hover:-translate-y-0.5 hover:bg-[#08162B] disabled:translate-y-0 disabled:opacity-50"
          >
            {isSubmitting ? "Please wait..." : isSignup ? "Create Account" : "Login"}
          </button>
        </form>

        {message && <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-left text-sm text-emerald-700">{message}</p>}
        {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-left text-sm text-red-600">{error}</p>}

        <p className="mt-8 text-xs leading-5 text-[#0B1F3A]/40">
          Parhai uses Supabase Auth for secure email and password sign in.
        </p>
      </div>
    </div>
  );
}
