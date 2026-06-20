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
    <div className="min-h-screen bg-[#F8FAFC]">
      <Sidebar />
      <div className="md:pl-64 flex flex-col min-h-screen">
        <header className="h-16 px-4 md:px-8 border-b border-slate-200/80 bg-white/95 backdrop-blur flex items-center justify-between sticky top-0 z-30 shadow-sm shadow-slate-200/40">
          <div className="flex-1 max-w-xl flex items-center gap-2">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              type="search"
              placeholder="Search subjects, topics, or papers..."
              className="flex-1 bg-transparent border-0 outline-none text-sm text-[#0B1F3A] placeholder:text-gray-400"
            />
          </div>
          <div className="flex items-center gap-4">
            <button className="relative p-2 rounded-full hover:bg-gray-100 transition-colors">
              <Bell className="h-5 w-5 text-gray-500" />
              <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-[#06B6D4]"></span>
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
