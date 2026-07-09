import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/auth-context";
import { useIsAdmin } from "@/api/client";
import { BrandLogo } from "@/components/brand-logo";
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  FilePenLine,
  HelpCircle,
  Bot,
  LineChart,
  CalendarClock,
  ScanText,
  Sparkles,
  ClipboardCheck,
  LogOut,
  Flame,
  Menu,
  ShieldCheck,
  FlaskConical,
  RefreshCw,
  Tags,
  Users,
} from "lucide-react";

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

const NAV_ITEMS = [
  { label: "Dashboard",       href: "/dashboard",       icon: LayoutDashboard },
  { label: "Subjects",        href: "/subjects",        icon: BookOpen },
  { label: "Papers",          href: "/papers",          icon: FileText },
  { label: "Notes",           href: "/notes",           icon: FilePenLine },
  { label: "Questions",       href: "/questions",       icon: HelpCircle },
  { label: "AI Tutor",        href: "/ai",              icon: Bot },
  { label: "Question Solver", href: "/question-solver", icon: ScanText },
  { label: "Notes Generator", href: "/notes-generator", icon: Sparkles },
  { label: "Paper Checker",   href: "/paper-checker",   icon: ClipboardCheck },
  { label: "Revision Planner",href: "/revision-planner",icon: CalendarClock },
  { label: "Progress",        href: "/progress",        icon: LineChart },
];

const ADMIN_ITEMS = [
  { label: "Admin Panel",          href: "/admin",               icon: ShieldCheck },
  { label: "User Management",      href: "/admin/users",         icon: Users },
  { label: "Subjects & Resources", href: "/admin/resources",     icon: BookOpen },
  { label: "Processing Jobs",      href: "/admin/processing",    icon: RefreshCw },
  { label: "Topic Map Manager",    href: "/admin/topic-maps",    icon: Tags },
  { label: "Pipeline Testing",     href: "/admin/testing",       icon: FlaskConical },
  { label: "AI Testing",           href: "/admin/ai-testing",    icon: Bot },
  { label: "Paper Analytics",      href: "/analytics/papers",    icon: LineChart },
];

export function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { isAdmin } = useIsAdmin();

  const NavLink = ({ item, delay = 0 }: { item: typeof NAV_ITEMS[0]; delay?: number }) => {
    const isActive = location === item.href || location.startsWith(item.href + "/");
    return (
      <Link
        href={item.href}
        className={cn(
          "group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
          isActive
            ? "sidebar-active-item text-white"
            : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.055]"
        )}
        style={{ animationDelay: `${delay}ms` }}
      >
        {isActive && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-gradient-to-b from-indigo-400 to-violet-400 rounded-r-full shadow-[0_0_8px_rgba(99,102,241,0.7)]" />
        )}
        <item.icon
          className={cn(
            "h-[17px] w-[17px] shrink-0 transition-colors duration-200",
            isActive ? "text-indigo-400" : "text-slate-500 group-hover:text-slate-300"
          )}
        />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  };

  const content = (
    <div className="flex h-full flex-col" style={{ background: "var(--sidebar-bg)" }}>
      {/* Top glow accent */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />

      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/[0.06]">
        <BrandLogo href="/dashboard" dark imageClassName="h-8 w-auto" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item, i) => (
          <NavLink key={item.href} item={item} delay={i * 30} />
        ))}

        {isAdmin && (
          <div className="mt-5 pt-4 border-t border-white/[0.08]">
            <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-600 select-none">
              Admin
            </p>
            {ADMIN_ITEMS.map((item, i) => (
              <NavLink key={item.href} item={item} delay={i * 25} />
            ))}
          </div>
        )}
      </nav>

      {/* User footer */}
      {user && (
        <div className="p-4 border-t border-white/[0.06] bg-white/[0.02]">
          {/* Streak */}
          <div className="flex items-center gap-2 mb-3.5 px-3 py-2 rounded-xl bg-orange-500/[0.12] border border-orange-500/[0.18]">
            <Flame className="h-4 w-4 text-orange-400 fill-orange-400 shrink-0" />
            <span className="text-xs font-semibold text-orange-300">{user.streakDays} Day Streak</span>
          </div>

          {/* User row */}
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-indigo-500/25">
                {user.name.charAt(0)}
              </div>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#07101F]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-200 truncate">{user.name}</p>
              <p className="text-xs text-slate-500 truncate">
                {user.level === "O_LEVEL" ? "O Level" : user.level === "A_LEVEL" ? "A Level" : ""}
              </p>
            </div>
            <button
              onClick={logout}
              title="Log out"
              className="p-1.5 rounded-lg hover:bg-white/[0.08] transition-colors"
            >
              <LogOut className="h-4 w-4 text-slate-500 hover:text-slate-300 transition-colors" />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex h-screen w-64 flex-col fixed inset-y-0 z-50">
        {content}
      </div>

      {/* Mobile topbar */}
      <div
        className="md:hidden flex h-14 items-center border-b border-white/[0.08] px-4 sticky top-0 z-40"
        style={{ background: "var(--sidebar-bg)" }}
      >
        <MobileMenu content={content} />
        <BrandLogo href="/dashboard" className="ml-2" dark imageClassName="h-7 w-auto" />
      </div>
    </>
  );
}

function MobileMenu({ content }: { content: React.ReactNode }) {
  return (
    <div className="relative">
      <input type="checkbox" id="mobile-menu" className="peer hidden" />
      <label
        htmlFor="mobile-menu"
        className="-ml-2 p-2 cursor-pointer flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
      >
        <Menu className="h-5 w-5 text-slate-300" />
      </label>
      <div className="hidden peer-checked:block fixed inset-0 z-50">
        <label htmlFor="mobile-menu" className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div className="absolute left-0 top-0 h-full w-72 shadow-2xl shadow-black/40">
          {content}
        </div>
      </div>
    </div>
  );
}
