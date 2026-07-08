import { Link, Redirect } from "wouter";
import { LockKeyhole, Mail } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useState } from "react";
import type { FormEvent } from "react";
import { signInWithGoogle, signInWithPassword, signUpWithPassword } from "@/api/client";
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

  const handleGoogleSignIn = async () => {
    if (!isSupabaseConfigured) {
      setError("Supabase is not connected. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
      return;
    }
    setIsSubmitting(true);
    setError("");
    setMessage("");
    try {
      // Redirects to Google; the browser navigates away, so no further code runs here.
      await signInWithGoogle();
    } catch (err) {
      setError(getAuthMessage(err));
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();

    if (!isSupabaseConfigured) {
      setError("Supabase is not connected. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
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
            Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the deployment environment.
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isSubmitting || !isSupabaseConfigured}
          className="mb-5 flex w-full items-center justify-center gap-3 rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-[#0B1F3A] transition-all hover:border-gray-300 hover:bg-slate-50 disabled:opacity-50"
        >
          <GoogleIcon className="h-5 w-5" />
          Continue with Google
        </button>

        <div className="mb-5 flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          or
          <span className="h-px flex-1 bg-slate-200" />
        </div>

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
          Parhai uses Supabase Auth for secure Google and email sign in.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
