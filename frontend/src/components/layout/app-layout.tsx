import { Sidebar } from "./sidebar";
import { useAuth } from "@/context/auth-context";
import { BrandLogo } from "@/components/brand-logo";
import { Link, Redirect, useLocation } from "wouter";
import { Bell, Bot, Search } from "lucide-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isError } = useAuth();
  const [location] = useLocation();
  const wideWorkspace = /^\/subject\/\d+\/ai$/.test(location);

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F8FAFC]">
        <div className="rounded-3xl border border-white bg-white p-6 shadow-xl shadow-[#0B1F3A]/10">
          <BrandLogo linked={false} imageClassName="h-16 w-auto" />
        </div>
        <div className="mt-5 h-1.5 w-28 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-[#06B6D4]" />
        </div>
      </div>
    );
  }

  if (isError || !user) {
    return <Redirect to="/login" />;
  }

  if (!user.onboarded && !location.startsWith("/onboarding")) {
    return <Redirect to="/onboarding" />;
  }

  if (location.startsWith("/onboarding")) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Sidebar />
      <div className="flex min-h-screen flex-col md:pl-[248px]">
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur-xl md:px-8">
          <div className="flex max-w-2xl flex-1 items-center gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-2.5 transition focus-within:border-cyan-300 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(6,182,212,.08)]">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              type="search"
              placeholder="Search subjects, topics, or papers..."
              className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[#0B1F3A] outline-none placeholder:text-slate-400"
            />
            <kbd className="hidden rounded-md border bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400 sm:block">⌘ K</kbd>
          </div>
          <div className="ml-3 flex items-center gap-2">
            <Link href="/ai" className="hidden items-center gap-2 rounded-xl bg-[#0B1F3A] px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#12345a] sm:inline-flex">
              <Bot className="h-4 w-4" /> Ask AI Tutor
            </Link>
            <button aria-label="Notifications" className="relative rounded-xl border border-slate-200 bg-white p-2.5 transition hover:bg-slate-50">
              <Bell className="h-4 w-4 text-slate-500" />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-cyan-500 ring-2 ring-white"></span>
            </button>
          </div>
        </header>
        <main className={`w-full flex-1 ${wideWorkspace ? "max-w-none p-3 md:p-5" : "mx-auto max-w-[1440px] p-4 pb-24 sm:p-6 md:p-8 md:pb-10"}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
