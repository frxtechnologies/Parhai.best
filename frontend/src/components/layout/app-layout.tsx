import { Sidebar } from "./sidebar";
import { useAuth } from "@/context/auth-context";
import { BrandLogo } from "@/components/brand-logo";
import { Redirect, useLocation } from "wouter";
import { Bell, Search } from "lucide-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isError } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center mesh-bg">
        <div className="relative animate-scale-in">
          <div className="absolute inset-0 rounded-3xl blur-2xl bg-cyan-500/20 animate-glow-pulse" />
          <div className="relative glass-dark rounded-3xl p-8 shadow-2xl">
            <BrandLogo linked={false} imageClassName="h-16 w-auto brightness-0 invert" />
          </div>
        </div>
        <div className="mt-8 flex items-center gap-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full bg-cyan-400 animate-bounce-dot"
              style={{ animationDelay: `${i * 0.18}s` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !user) return <Redirect to="/login" />;

  if (!user.onboarded && !location.startsWith("/onboarding")) {
    return <Redirect to="/onboarding" />;
  }

  if (location.startsWith("/onboarding")) return <>{children}</>;

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <Sidebar />

      <div className="md:pl-64 flex flex-col min-h-screen">
        {/* Header */}
        <header className="h-16 px-4 md:px-8 bg-white/90 backdrop-blur-xl border-b border-slate-200/50 flex items-center justify-between sticky top-0 z-30 shadow-[0_1px_20px_rgba(11,31,58,0.06)]">
          {/* Search pill */}
          <label className="flex-1 max-w-lg flex items-center gap-3 bg-slate-50/90 rounded-xl px-4 py-2.5 border border-slate-200/70 cursor-text hover:border-slate-300 transition-colors focus-within:border-cyan-400 focus-within:ring-3 focus-within:ring-cyan-500/10 focus-within:bg-white">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              type="search"
              placeholder="Search subjects, topics, papers…"
              className="flex-1 bg-transparent border-0 outline-none text-sm text-[#0B1F3A] placeholder:text-slate-400"
            />
          </label>

          {/* Right controls */}
          <div className="flex items-center gap-2 ml-4">
            <button className="relative p-2.5 rounded-xl hover:bg-slate-100 transition-colors group">
              <Bell className="h-5 w-5 text-slate-500 group-hover:text-[#0B1F3A] transition-colors" />
              <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-cyan-400" />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
