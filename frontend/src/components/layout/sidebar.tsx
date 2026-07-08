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
  CalendarClock,
  LogOut,
  Flame,
  Menu,
  ShieldCheck,
  FlaskConical,
  RefreshCw,
  Tags,
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
  { label: "Revision Planner", href: "/revision-planner", icon: CalendarClock },
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
        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
        location === item.href || location.startsWith(item.href + "/")
          ? "bg-[#0B1F3A]/10 text-[#0B1F3A]"
          : "text-gray-500 hover:bg-gray-100 hover:text-[#0B1F3A]"
      )}
    >
      <item.icon className="h-5 w-5" />
      {item.label}
    </Link>
  );

  const content = (
    <div className="flex h-full flex-col border-r border-slate-200/80 bg-white">
      <div className="p-6">
        <BrandLogo href="/dashboard" imageClassName="h-12 w-auto" />
      </div>

      <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}

        {isAdmin && (
          <div className="my-2 border-t pt-2">
            {ADMIN_ITEMS.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </div>
        )}
      </nav>

      {user && (
        <div className="p-4 border-t">
          <div className="flex items-center justify-between mb-4 px-2 py-1.5 bg-orange-50 rounded-md">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500 fill-orange-500" />
              <span className="text-xs font-medium text-orange-700">
                {user.streakDays} Day Streak
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#0B1F3A]/10 flex items-center justify-center text-[#0B1F3A] font-bold text-sm shrink-0">
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
      <div className="hidden md:flex h-screen w-64 flex-col fixed inset-y-0 z-50">
        {content}
      </div>
      <div className="md:hidden flex h-14 items-center border-b border-slate-200/80 px-4 bg-white sticky top-0 z-40">
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
