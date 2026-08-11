import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, FolderKanban, CheckSquare, Users, Bell,
  Bot, Leaf, MessageSquareOff, Contact2, BellRing, Activity, Webhook, ShoppingBag,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard",        href: "/",                icon: LayoutDashboard },
  { name: "Projects",         href: "/projects",        icon: FolderKanban },
  { name: "Tasks",            href: "/tasks",           icon: CheckSquare },
  { name: "Team",             href: "/team",            icon: Users },
  { name: "AI Monitor",       href: "/ai-monitor",      icon: Bot },
  { name: "UC Impact",        href: "/impact",          icon: Leaf },
  { name: "Alison Feedback",  href: "/alison-feedback", icon: MessageSquareOff },
  // Team Horizon
  { name: "Contacts",         href: "/contacts",        icon: Contact2 },
  { name: "Notifications",    href: "/notifications",   icon: BellRing },
  { name: "System Status",    href: "/system",          icon: Activity },
  { name: "Webhook Tester",   href: "/webhook",         icon: Webhook },
  { name: "Orders",           href: "/orders",           icon: ShoppingBag },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <div className="w-64 border-r bg-sidebar flex-shrink-0 flex flex-col z-10">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
          <div className="flex items-center gap-2 font-bold text-lg tracking-tight text-sidebar-foreground">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center shadow-sm">
              <span className="text-primary-foreground font-mono text-xl leading-none font-bold">P</span>
            </div>
            ProjectHub
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-6 px-3">
          <nav className="space-y-1">
            {navigation.map((item) => {
              const isActive =
                location === item.href ||
                (item.href !== "/" && location.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors group",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                >
                  <item.icon
                    className={cn(
                      "w-5 h-5 flex-shrink-0 transition-colors",
                      isActive
                        ? "text-primary"
                        : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/70"
                    )}
                  />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-medium text-sm">
              JS
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">Jane Smith</p>
              <p className="text-xs text-sidebar-foreground/60 truncate">jane@projecthub.inc</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-16 border-b bg-background/80 backdrop-blur-md flex items-center justify-between px-8 flex-shrink-0 sticky top-0 z-10">
          <div className="flex items-center gap-4" />
          <div className="flex items-center gap-4">
            <button className="relative p-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-accent/10">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-destructive border-2 border-background" />
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-8 relative">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
