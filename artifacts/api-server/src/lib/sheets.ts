/**
 * Google Sheets public CSV fetch utility.
 *
 * Accepts a public "Anyone with the link can view" Google Sheets share URL,
 * extracts the spreadsheet ID and optional sheet GID, and returns the rows
 * as an array of plain objects (same shape as xlsx sheet_to_json output).
 *
 * No Google account or OAuth is required — the sheet must be publicly shared.
 */

export interface RawRow {
  [key: string]: string;
}

/**
 * Convert a Google Sheets share URL to a CSV export URL.
 *
 * Supported input formats:
 *   https://docs.google.com/spreadsheets/d/{ID}/edit#gid={GID}
 *   https://docs.google.com/spreadsheets/d/{ID}/edit?usp=sharing
 *   https://docs.google.com/spreadsheets/d/{ID}/pub?gid={GID}&single=true&output=csv
 *   https://docs.google.com/spreadsheets/d/{ID}/
 *
 * @param shareUrl  The URL pasted by the user.
 * @param gid       Optional sheet GID override (e.g. from tab selector).
 */
export function sheetsShareUrlToCsvUrl(shareUrl: string, gid?: string): string {
  const match = shareUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match?.[1]) {
    throw new Error(
      "Invalid Google Sheets URL — could not extract spreadsheet ID. " +
        "Make sure you copy the full URL from the browser address bar."
    );
  }
  const spreadsheetId = match[1];

  // Try to extract GID from the URL when not explicitly provided
  if (!gid) {
    const gidMatch = shareUrl.match(/[#&?]gid=(\d+)/);
    if (gidMatch?.[1]) gid = gidMatch[1];
  }

  const url = new URL(
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export`
  );
  url.searchParams.set("format", "csv");
  if (gid) url.searchParams.set("gid", gid);
  return url.toString();
}

/**
 * Extract the spreadsheet ID from a share URL (for display/storage).
 */
export function extractSpreadsheetId(shareUrl: string): string | null {
  const match = shareUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? null;
}


/**
 * Parse a CSV string into an array of row objects (header row → keys).
 */
export function parseCsv(csv: string): RawRow[] {
  const lines = csv.split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0] ?? "");
  const rows: RawRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!line.trim()) continue;
    const values = splitCsvLine(line);
    const row: RawRow = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? "").trim();
    });
    rows.push(row);
  }

  return rows;
}

/**
 * Minimal RFC 4180 CSV field splitter (handles quoted fields with embedded commas).
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Fetch a public Google Sheet as parsed CSV rows.
 * Throws on network errors, non-200 responses, or HTML redirect/login pages
 * (which Google returns when a sheet is private or sharing is revoked).
 */
export async function fetchSheetRows(
  shareUrl: string,
  gid?: string
): Promise<RawRow[]> {
  const csvUrl = sheetsShareUrlToCsvUrl(shareUrl, gid);
  const res = await fetch(csvUrl, {
    headers: { Accept: "text/csv,text/plain,*/*" },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(
      `Could not fetch sheet data (HTTP ${res.status}). ` +
        "Make sure the spreadsheet is shared as 'Anyone with the link can view'."
    );
  }

  const csv = await res.text();

  // Detect HTML login/error pages returned by Google when the sheet is private
  // or sharing has been revoked (Google returns 200 with HTML in that case).
  const trimmed = csv.trimStart();
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html") || trimmed.startsWith("<HTML")) {
    throw new Error(
      "Google returned a login page instead of CSV data. " +
        "Make sure the spreadsheet is still shared as 'Anyone with the link can view'."
    );
  }

  return parseCsv(csv);
}
