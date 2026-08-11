import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, FolderKanban, CheckSquare, Users, Bell,
  Bot, Leaf, MessageSquareOff, Contact2, BellRing, Activity, Webhook, ShoppingBag,
  LogOut, KeyRound, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { clearTeamAuth, changePasscode, isTeamAuthenticated } from "@/lib/team-auth";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

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
  { name: "Orders",           href: "/orders",          icon: ShoppingBag },
];

// ─── Change Password Dialog ───────────────────────────────────────────────────

function ChangePasswordDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!current.trim() || !next.trim() || !confirm.trim()) return;
    if (next.trim() !== confirm.trim()) {
      setError("New passcodes do not match.");
      return;
    }
    if (next.trim().length < 8) {
      setError("New passcode must be at least 8 characters.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await changePasscode(current.trim(), next.trim());
      toast({ title: "Passcode updated", description: "Your new passcode is active." });
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change passcode.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" />
            Change passcode
          </DialogTitle>
          <DialogDescription>
            Enter your current passcode and choose a new one (min. 8 characters).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-2">
            <Label htmlFor="cp-current">Current passcode</Label>
            <Input
              id="cp-current"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              disabled={loading}
              autoFocus
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp-new">New passcode</Label>
            <Input
              id="cp-new"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              disabled={loading}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp-confirm">Confirm new passcode</Label>
            <Input
              id="cp-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={loading}
              autoComplete="new-password"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !current.trim() || !next.trim() || !confirm.trim()}
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</> : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── AppLayout ────────────────────────────────────────────────────────────────

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const [changePassOpen, setChangePassOpen] = useState(false);

  function handleSignOut() {
    clearTeamAuth();
    navigate("/login", { replace: true });
  }

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

        {/* Bottom user / session area */}
        <div className="p-4 border-t border-sidebar-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-sidebar-accent/50 transition-colors text-left">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-medium text-sm flex-shrink-0">
                  T
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-sidebar-foreground truncate">Team session</p>
                  <p className="text-xs text-sidebar-foreground/60 truncate">
                    {isTeamAuthenticated() ? "Signed in" : "Session expired"}
                  </p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuItem onClick={() => setChangePassOpen(true)}>
                <KeyRound className="w-4 h-4 mr-2" />
                Change passcode
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-16 border-b bg-background/80 backdrop-blur-md flex items-center justify-between px-8 flex-shrink-0 sticky top-0 z-10">
          <div className="flex items-center gap-4" />
          <div className="flex items-center gap-2">
            <button className="relative p-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-accent/10">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-destructive border-2 border-background" />
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="text-muted-foreground hover:text-foreground gap-2"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-8 relative">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      <ChangePasswordDialog open={changePassOpen} onClose={() => setChangePassOpen(false)} />
    </div>
  );
}
