import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, UserPlus, Shield, ShieldOff, RotateCcw,
  Copy, Check, Loader2, UserX, UserCheck, Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  listUsers, inviteUser, updateUserRole, updateUser, adminResetPassword,
  isTeamAdmin, type TeamUserRecord,
} from "@/lib/team-auth";

// ─── Invite Dialog ─────────────────────────────────────────────────────────────

function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const mutation = useMutation({
    mutationFn: () => inviteUser(email.trim()),
    onSuccess: (data) => {
      setInviteUrl(data.inviteUrl);
      void qc.invalidateQueries({ queryKey: ["team-users"] });
    },
    onError: (err: Error) => {
      toast({ title: "Invite failed", description: err.message, variant: "destructive" });
    },
  });

  async function copyLink() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose() {
    setEmail("");
    setInviteUrl(null);
    setCopied(false);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" />
            Invite team member
          </DialogTitle>
          <DialogDescription>
            An invite link will be generated (valid 7 days). We'll also try to email it.
          </DialogDescription>
        </DialogHeader>

        {inviteUrl ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Invite link for <strong>{email}</strong>:
            </p>
            <div className="flex gap-2">
              <Input value={inviteUrl} readOnly className="font-mono text-xs" />
              <Button size="icon" variant="outline" onClick={copyLink}>
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Share this link with the invitee. It expires in 7 days.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email address</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="colleague@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={mutation.isPending}
                onKeyDown={(e) => e.key === "Enter" && email.trim() && mutation.mutate()}
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>Cancel</Button>
              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !email.trim()}>
                {mutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Generating…</> : "Send invite"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {inviteUrl && (
          <DialogFooter>
            <Button onClick={handleClose}>Done</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Reset Password Dialog ──────────────────────────────────────────────────────

function ResetPasswordDialog({
  user, open, onClose,
}: { user: TeamUserRecord | null; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [result, setResult] = useState<{ resetUrl: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const mutation = useMutation({
    mutationFn: () => adminResetPassword(user!.id),
    onSuccess: (data) => setResult(data),
    onError: (err: Error) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  async function copyLink() {
    if (!result) return;
    await navigator.clipboard.writeText(result.resetUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose() {
    setResult(null);
    setCopied(false);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-primary" />
            Reset password for {user?.name}
          </DialogTitle>
          <DialogDescription>
            A reset link (valid 24 hours) will be generated and emailed to {user?.email}.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Reset link generated:</p>
            <div className="flex gap-2">
              <Input value={result.resetUrl} readOnly className="font-mono text-xs" />
              <Button size="icon" variant="outline" onClick={copyLink}>
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Share this link if the email didn't arrive.</p>
            <DialogFooter><Button onClick={handleClose}>Done</Button></DialogFooter>
          </div>
        ) : (
          <DialogFooter>
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Generating…</> : "Generate reset link"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<TeamUserRecord | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["team-users"],
    queryFn: listUsers,
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: "admin" | "member" }) => updateUserRole(id, role),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["team-users"] }),
    onError: (err: Error) => toast({ title: "Role change failed", description: err.message, variant: "destructive" }),
  });

  const activeMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateUser(id, { isActive }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["team-users"] }),
    onError: (err: Error) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  if (!isTeamAdmin()) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        You don't have permission to view this page.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6" /> User Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Invite team members, manage roles, and reset passwords.
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)} className="gap-2">
          <UserPlus className="w-4 h-4" /> Invite member
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading users…
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} className={!user.isActive ? "opacity-50" : ""}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Mail className="w-3 h-3" />{user.email}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                      {user.role === "admin" ? (
                        <><Shield className="w-3 h-3 mr-1" />Admin</>
                      ) : "Member"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.isActive ? "outline" : "destructive"}>
                      {user.isActive ? "Active" : "Deactivated"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      {/* Toggle role */}
                      <Button
                        size="sm" variant="ghost"
                        title={user.role === "admin" ? "Demote to member" : "Promote to admin"}
                        disabled={roleMutation.isPending}
                        onClick={() => roleMutation.mutate({ id: user.id, role: user.role === "admin" ? "member" : "admin" })}
                      >
                        {user.role === "admin" ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                      </Button>
                      {/* Reset password */}
                      <Button
                        size="sm" variant="ghost" title="Reset password"
                        onClick={() => setResetTarget(user)}
                      >
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                      {/* Deactivate / reactivate */}
                      <Button
                        size="sm" variant="ghost"
                        title={user.isActive ? "Deactivate account" : "Reactivate account"}
                        disabled={activeMutation.isPending}
                        onClick={() => activeMutation.mutate({ id: user.id, isActive: !user.isActive })}
                      >
                        {user.isActive ? <UserX className="w-4 h-4 text-destructive" /> : <UserCheck className="w-4 h-4 text-green-600" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No team members yet. Invite someone to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <ResetPasswordDialog user={resetTarget} open={!!resetTarget} onClose={() => setResetTarget(null)} />
    </div>
  );
}
