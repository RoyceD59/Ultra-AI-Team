/**
 * ConnectSheetDialog
 *
 * Team members paste a public Google Sheets share URL.  Tab selection works
 * by navigating to the desired tab in the browser and copying the resulting
 * URL — Google Sheets appends #gid=XXXXXXXX automatically, which we extract.
 * No retired Sheets v3 feed; no OAuth required.
 *
 * Flow: URL entry → CSV preview → Connect
 *       (connected state shows status + Sync now button)
 */

import { useState, useEffect } from "react";
import { getAuthHeaders } from "@/lib/team-auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListContactsQueryKey } from "@workspace/api-client-react";
import {
  Link2,
  Loader2,
  CheckCircle2,
  RefreshCw,
  Info,
  AlertCircle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawRow {
  [key: string]: string;
}

interface SheetStatus {
  connected: boolean;
  id?: number;
  sheetUrl?: string;
  sheetLabel?: string;
  lastSyncedAt?: string | null;
}

interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  syncedAt: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ConnectSheetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  syncStatus: SheetStatus | null;
  onStatusChange: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function teamHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(getAuthHeaders() ?? {}),
  };
}

/**
 * Extract the GID from a Google Sheets share URL.
 * Google appends #gid=XXXXXX when a non-default tab is selected.
 */
function extractGid(shareUrl: string): string | undefined {
  const m = shareUrl.match(/[#&?]gid=(\d+)/);
  return m?.[1];
}

/**
 * Convert a Google Sheets share URL to its public CSV export URL.
 */
function toCsvUrl(shareUrl: string): string {
  const m = shareUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m?.[1]) throw new Error("Not a valid Google Sheets URL");
  const id = m[1];
  const url = new URL(`https://docs.google.com/spreadsheets/d/${id}/export`);
  url.searchParams.set("format", "csv");
  const gid = extractGid(shareUrl);
  if (gid) url.searchParams.set("gid", gid);
  return url.toString();
}

function parseCsvPreview(csv: string): { headers: string[]; rows: RawRow[] } {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 1) return { headers: [], rows: [] };

  // Minimal RFC 4180 splitter
  function splitLine(line: string): string[] {
    const fields: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === "," && !inQ) {
        fields.push(cur.trim()); cur = "";
      } else {
        cur += ch;
      }
    }
    fields.push(cur.trim());
    return fields;
  }

  const headers = splitLine(lines[0] ?? "").slice(0, 7);
  const rows: RawRow[] = [];
  for (let i = 1; i < Math.min(lines.length, 6); i++) {
    const vals = splitLine(lines[i] ?? "");
    const row: RawRow = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] ?? ""; });
    rows.push(row);
  }
  return { headers, rows };
}

// ─── Component ────────────────────────────────────────────────────────────────

type Step = "url" | "preview" | "connected";

export function ConnectSheetDialog({
  open,
  onOpenChange,
  syncStatus,
  onStatusChange,
}: ConnectSheetDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("url");
  const [url, setUrl] = useState("");
  const [detectedGid, setDetectedGid] = useState<string | undefined>();
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<RawRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncing, setSyncing] = useState(false);

  // When dialog opens, show correct initial step
  useEffect(() => {
    if (open) {
      if (syncStatus?.connected) {
        setStep("connected");
        setUrl(syncStatus.sheetUrl ?? "");
      } else {
        setStep("url");
        setUrl("");
        setDetectedGid(undefined);
        setPreviewHeaders([]);
        setPreviewRows([]);
        setPreviewError(null);
        setSyncResult(null);
      }
    }
  }, [open, syncStatus?.connected, syncStatus?.sheetUrl]);

  // ── Load preview ─────────────────────────────────────────────────────────

  async function handlePreview() {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!trimmed.includes("docs.google.com/spreadsheets")) {
      setPreviewError("Paste a Google Sheets share link (docs.google.com/spreadsheets/...)");
      return;
    }
    setBusy(true);
    setPreviewError(null);
    try {
      const csvUrl = toCsvUrl(trimmed);
      const res = await fetch(csvUrl);
      if (!res.ok) {
        throw new Error(
          `Could not fetch sheet data (HTTP ${res.status}). ` +
          "Make sure the sheet is shared as 'Anyone with the link can view'."
        );
      }
      const csv = await res.text();
      // If we got an HTML redirect (login page), it means the sheet is private
      if (csv.trimStart().startsWith("<!DOCTYPE") || csv.trimStart().startsWith("<html")) {
        throw new Error(
          "Google returned a login page — make sure the sheet is shared as " +
          "'Anyone with the link can view'."
        );
      }
      const { headers, rows } = parseCsvPreview(csv);
      if (headers.length === 0) {
        throw new Error("The sheet appears to be empty.");
      }
      setDetectedGid(extractGid(trimmed));
      setPreviewHeaders(headers);
      setPreviewRows(rows);
      setStep("preview");
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Could not load sheet");
    } finally {
      setBusy(false);
    }
  }

  // ── Save connection ───────────────────────────────────────────────────────

  async function handleConnect() {
    setBusy(true);
    try {
      const res = await fetch("/api/contacts/sync/sheets", {
        method: "POST",
        headers: teamHeaders(),
        body: JSON.stringify({
          sheetUrl: url.trim(),
          sheetLabel: detectedGid ? `Tab (gid=${detectedGid})` : "Default tab",
          gid: detectedGid,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      onStatusChange();
      setStep("connected");
      toast({
        title: "Google Sheet connected!",
        description: "You can now sync contacts from this sheet.",
      });
    } catch (err) {
      toast({
        title: "Failed to save connection",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  // ── Sync now ─────────────────────────────────────────────────────────────

  async function handleSyncNow() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/contacts/sync/sheets/run", {
        method: "POST",
        headers: teamHeaders(),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const result = (await res.json()) as SyncResult;
      setSyncResult(result);
      onStatusChange();
      queryClient.invalidateQueries({ queryKey: getListContactsQueryKey() });
      toast({
        title: "Sync complete",
        description: `${result.created} created, ${result.updated} updated, ${result.skipped} skipped${result.failed > 0 ? `, ${result.failed} failed` : ""}.`,
      });
    } catch (err) {
      toast({
        title: "Sync failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  }

  // ── Change sheet ─────────────────────────────────────────────────────────

  function handleChangeSheet() {
    setStep("url");
    setUrl("");
    setDetectedGid(undefined);
    setPreviewHeaders([]);
    setPreviewRows([]);
    setPreviewError(null);
    setSyncResult(null);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-primary" />
            Connect Google Sheet
          </DialogTitle>
          <DialogDescription>
            Paste a public Google Sheets share URL. The sheet must be shared as{" "}
            <span className="font-medium text-foreground">"Anyone with the link can view"</span>.
          </DialogDescription>
        </DialogHeader>

        {/* ── Step: URL entry ── */}
        {step === "url" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sheet-url">Google Sheets share URL</Label>
              <Input
                id="sheet-url"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setPreviewError(null);
                }}
                onKeyDown={(e) => { if (e.key === "Enter") handlePreview(); }}
              />
              {previewError && (
                <div className="flex items-start gap-2 text-sm text-destructive">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{previewError}</span>
                </div>
              )}
            </div>

            <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <AlertDescription className="text-blue-800 dark:text-blue-300 text-sm">
                <strong>To sync a specific tab:</strong> click the tab in Google Sheets,
                then copy the URL from your browser — it will include{" "}
                <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded text-xs">#gid=XXXXXXXX</code>{" "}
                which identifies that tab.
              </AlertDescription>
            </Alert>

            <div className="rounded-lg border p-3 bg-muted/20 text-sm">
              <p className="font-semibold text-foreground mb-2">Expected column headers</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-muted-foreground text-xs">
                {[
                  ["full_name", "Full Name (required)"],
                  ["email", "Email"],
                  ["phone", "Phone"],
                  ["Preferred_contact", "sms / whatsapp"],
                  ["Primary_Product", "tag"],
                  ["Secondary_product", "tag"],
                  ["Customer_active", "active / inactive tag"],
                  ["Unique Record_ID", "id:… tag (dedup & update key)"],
                ].map(([col, desc]) => (
                  <span key={col}>
                    <span className="font-mono bg-muted px-1 rounded">{col}</span>
                    {" "}
                    <span className="text-muted-foreground/70">→ {desc}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Step: Preview ── */}
        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/40 border">
              <div className="flex items-center gap-2 min-w-0">
                <Link2 className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm font-medium truncate">{url}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {detectedGid && (
                  <Badge variant="outline" className="text-xs font-mono">
                    gid={detectedGid}
                  </Badge>
                )}
                <Badge variant="secondary" className="text-xs">
                  {previewRows.length} preview rows
                </Badge>
              </div>
            </div>

            {!detectedGid && (
              <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
                <Info className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <AlertDescription className="text-amber-800 dark:text-amber-300 text-sm">
                  No tab ID detected — this will sync the <strong>first (default) tab</strong>.
                  To sync a different tab, go back and paste the URL while viewing that tab.
                </AlertDescription>
              </Alert>
            )}

            {previewHeaders.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-muted-foreground mb-2">
                  Data preview (first {previewRows.length} rows)
                </p>
                <ScrollArea className="rounded-lg border" style={{ maxHeight: 200 }}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {previewHeaders.map((col) => (
                          <TableHead key={col} className="text-xs whitespace-nowrap">{col}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.map((row, i) => (
                        <TableRow key={i}>
                          {previewHeaders.map((col) => (
                            <TableCell key={col} className="text-xs truncate max-w-[120px]">
                              {row[col] ?? ""}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}
          </div>
        )}

        {/* ── Step: Connected ── */}
        {step === "connected" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-lg border bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                  Google Sheet connected
                </p>
                <p className="text-xs text-green-700 dark:text-green-400 break-all">
                  {syncStatus?.sheetUrl ?? url}
                </p>
                {syncStatus?.sheetLabel && (
                  <Badge variant="outline" className="text-xs border-green-300 text-green-700 dark:text-green-400">
                    {syncStatus.sheetLabel}
                  </Badge>
                )}
                {syncStatus?.lastSyncedAt && (
                  <p className="text-xs text-muted-foreground">
                    Last synced: {new Date(syncStatus.lastSyncedAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>

            {syncResult && (
              <div className="rounded-lg border p-3 bg-muted/20 text-sm space-y-1">
                <p className="font-semibold text-foreground">Last sync result</p>
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">{syncResult.created}</span> created,{" "}
                  <span className="font-medium text-foreground">{syncResult.updated}</span> updated,{" "}
                  <span className="font-medium text-foreground">{syncResult.skipped}</span> skipped
                  {syncResult.failed > 0 && (
                    <>
                      ,{" "}
                      <span className="font-medium text-destructive">{syncResult.failed}</span> failed
                    </>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(syncResult.syncedAt).toLocaleString()}
                </p>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button onClick={handleSyncNow} disabled={syncing} className="gap-2">
                {syncing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {syncing ? "Syncing…" : "Sync now"}
              </Button>
              <Button variant="outline" onClick={handleChangeSheet}>
                Connect different sheet
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              A daily automatic sync runs at 06:00 UTC. Contacts removed from
              the sheet are kept in the database.
            </p>
          </div>
        )}

        <DialogFooter>
          {step === "url" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handlePreview}
                disabled={busy || !url.trim()}
                className="gap-2"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {busy ? "Loading…" : "Preview sheet →"}
              </Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("url")}>
                ← Back
              </Button>
              <Button onClick={handleConnect} disabled={busy} className="gap-2">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {busy ? "Saving…" : "Connect Sheet"}
              </Button>
            </>
          )}
          {step === "connected" && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
