import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/auth-context";
import { isAdminEmail } from "@/config/admin";
import { BrandLogo } from "@/components/brand-logo";
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  FilePenLine,
  HelpCircle,
  Bot,
  LineChart,
  LogOut,
  Flame,
  Menu,
  ShieldCheck,
  FlaskConical,
  RefreshCw,
  Tags,
  ClipboardCheck,
  ScanSearch,
  TrendingUp,
  CalendarDays,
} from "lucide-react";

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Subjects", href: "/subjects", icon: BookOpen },
  { label: "Papers", href: "/papers", icon: FileText },
  { label: "Notes", href: "/notes", icon: FilePenLine },
  { label: "Questions", href: "/questions", icon: HelpCircle },
  { label: "AI Tutor", href: "/ai", icon: Bot },
  { label: "Paper Checker", href: "/paper-checker", icon: ClipboardCheck },
  { label: "Paper Analyzer", href: "/paper-analyzer", icon: ScanSearch },
  { label: "Repeated Topics", href: "/repeated-topics", icon: TrendingUp },
  { label: "Revision Planner", href: "/revision-planner", icon: CalendarDays },
  { label: "Progress", href: "/progress", icon: LineChart },
];

const ADMIN_ITEMS = [
  { label: "Admin Panel", href: "/admin", icon: ShieldCheck },
  { label: "Subjects & Resources", href: "/admin/resources", icon: BookOpen },
  { label: "Processing Jobs", href: "/admin/processing", icon: RefreshCw },
  { label: "Topic Map Manager", href: "/admin/topic-maps", icon: Tags },
  { label: "Pipeline Testing", href: "/admin/testing", icon: FlaskConical },
  { label: "AI Testing", href: "/admin/ai-testing", icon: Bot },
  { label: "Paper Analytics", href: "/analytics/papers", icon: LineChart },
];

export function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const isAdmin = isAdminEmail(user?.email);

  const NavLink = ({ item }: { item: typeof NAV_ITEMS[0] }) => (
    <Link
      href={item.href}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
        location === item.href || location.startsWith(item.href + "/")
          ? "bg-white text-[#0B1F3A] shadow-[0_6px_20px_rgba(15,23,42,.08)] ring-1 ring-slate-200/80"
          : "text-slate-500 hover:bg-white/70 hover:text-[#0B1F3A]"
      )}
    >
      <item.icon className={cn("h-[18px] w-[18px] transition-colors", location === item.href || location.startsWith(item.href + "/") ? "text-cyan-600" : "text-slate-400 group-hover:text-cyan-600")} />
      <span className="flex-1">{item.label}</span>
      {(location === item.href || location.startsWith(item.href + "/")) && <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />}
    </Link>
  );

  const content = (
    <div className="flex h-full flex-col border-r border-slate-200/70 bg-slate-50/95 backdrop-blur-xl">
      <div className="px-5 pb-5 pt-6">
        <BrandLogo href="/dashboard" imageClassName="h-11 w-auto" />
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[.18em] text-slate-400">Cambridge study workspace</p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Study</p>
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}

        {isAdmin && (
          <div className="my-3 border-t border-slate-200/80 pt-3">
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Administration</p>
            {ADMIN_ITEMS.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </div>
        )}
      </nav>

      {user && (
        <div className="border-t border-slate-200/80 p-3">
          <div className="mb-3 flex items-center justify-between rounded-xl bg-gradient-to-r from-orange-50 to-amber-50 px-3 py-2 ring-1 ring-orange-100">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500 fill-orange-500" />
              <span className="text-xs font-medium text-orange-700">
                {user.streakDays} Day Streak
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-white">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0B1F3A] text-sm font-bold text-white shadow-sm">
              {user.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#0B1F3A] truncate">{user.name}</p>
              <p className="text-xs text-gray-500 truncate">
                {user.level === "O_LEVEL" ? "O Level" : user.level === "A_LEVEL" ? "A Level" : ""}
              </p>
            </div>
            <button
              onClick={logout}
              className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
              title="Log out"
            >
              <LogOut className="h-4 w-4 text-gray-400" />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="fixed inset-y-0 z-50 hidden h-screen w-[248px] flex-col md:flex">
        {content}
      </div>
      <div className="sticky top-0 z-40 flex h-14 items-center border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur md:hidden">
        <MobileMenu content={content} />
        <BrandLogo href="/dashboard" className="ml-2" imageClassName="h-8 w-auto" />
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
        className="-ml-2 p-2 cursor-pointer flex items-center justify-center rounded-md hover:bg-gray-100"
      >
        <Menu className="h-5 w-5 text-[#0B1F3A]" />
      </label>
      <div className="hidden peer-checked:block fixed inset-0 z-50">
        <label htmlFor="mobile-menu" className="absolute inset-0 bg-black/40" />
        <div className="absolute left-0 top-0 h-full w-72 shadow-xl">
          {content}
        </div>
      </div>
    </div>
  );
}
