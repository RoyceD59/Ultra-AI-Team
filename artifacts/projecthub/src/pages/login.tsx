import { useState } from "react";
import { useLocation } from "wouter";
import { KeyRound, Loader2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loginWithPasscode } from "@/lib/team-auth";

export default function LoginPage() {
  const [, navigate] = useLocation();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Read the `next` query param so we can redirect after login
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next") ?? "/";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!passcode.trim()) return;
    setError(null);
    setLoading(true);
    try {
      await loginWithPasscode(passcode.trim());
      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo mark */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shadow-md">
            <span className="text-primary-foreground font-mono text-2xl leading-none font-bold">P</span>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">ProjectHub</h1>
            <p className="text-sm text-muted-foreground mt-1">Team workspace</p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="w-4 h-4 text-primary" />
              Team sign-in
            </CardTitle>
            <CardDescription>
              Enter the team passcode to access ProjectHub.
              Your session lasts 8 hours.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="passcode">Team Passcode</Label>
                <Input
                  id="passcode"
                  type="password"
                  placeholder="Enter passcode…"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  disabled={loading}
                  autoFocus
                  autoComplete="current-password"
                />
                {error && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <KeyRound className="w-3 h-3" />
                    {error}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={loading || !passcode.trim()}
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Signing in…</>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
