import * as XLSX from "xlsx";

// Imports a simple client spreadsheet (Client Name, Event Date, Event Type, Event Room, Event Start Time, Deposit).
export type ClientRow = { ref: string; name: string; eventType: string; date: string | null; venue: string; roomRaw: string; start: string; end: string; timeRaw: string; deposit: number; depositRaw: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const pad = (n: number) => String(n).padStart(2, "0");

export function matchVenues(raw: string, spaces: string[]): string {
  const text = norm(raw);
  const hits = spaces.filter(s => {
    const n = norm(s); if (text.includes(n)) return true;
    // Match on the distinctive first word ("luxury", "royal", "regal"/"outdoor") so "The Luxury Manor" still matches.
    const words = s.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !["hall", "room", "the"].includes(w));
    return words.some(w => text.includes(norm(w)) || (w.startsWith("outdoor") && text.includes("outdoor")));
  });
  return hits.join(", ") || raw.trim() || "TBC";
}

function toMin(tok: string, fallbackPm?: boolean): number | null {
  const m = tok.trim().match(/^(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?\s*(am|pm)?$/i); if (!m) return null;
  let h = +m[1]; const mi = +(m[2] || 0); const ap = m[3]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12; else if (ap === "am" && h === 12) h = 0;
  else if (!ap && fallbackPm && h < 12) h += 12;
  return h * 60 + mi;
}
const fmt = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;

export function parseTimes(raw: string): { start: string; end: string } {
  const t = raw.trim().toLowerCase();
  if (!t || t === "evening") return { start: "18:00", end: "23:00" };
  if (t === "lunch") return { start: "11:00", end: "16:00" };
  if (t === "morning") return { start: "09:00", end: "14:00" };
  const [a, b] = t.split(/\s*(?:-|–|to)\s*/);
  const endAp = b?.match(/(am|pm)/)?.[1];
  let s = toMin(a); let e = b ? toMin(b) : null;
  if (s === null) return { start: "18:00", end: "23:00" };
  const aHasAp = /am|pm/.test(a);
  // Bare hours like "6" or "6:30" are evening; "10-4pm" means 10am to 4pm.
  if (!aHasAp && s < 12 * 60) { if (endAp === "pm" && e !== null && s < e - 12 * 60 + 12 * 60 && s >= 9 * 60) {/* morning start */} else if (s < 9 * 60 || !endAp) s += 12 * 60; }
  if (b && e !== null && !endAp && e <= 12 * 60) e = e === 12 * 60 ? 0 : e + 12 * 60;
  if (e !== null && /pm/.test(a) && /pm/.test(b || "") && e < s) s -= 12 * 60; // "9pm-3pm" → 9am-3pm
  if (e !== null && /pm/.test(a) && /pm/.test(b || "") && s > e) s -= 12 * 60;
  if (e === null) e = (s + 300) % 1440;
  return { start: fmt(s), end: fmt(e) };
}

const cellText = (v: any): string => {
  if (v == null) return "";
  if (v instanceof Date) return `${pad(v.getHours())}:${pad(v.getMinutes())}`;
  return String(v).trim();
};
const cellDate = (v: any): string | null => {
  if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  const s = String(v ?? "").trim();
  const d = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/); if (d) return `${d[3]}-${pad(+d[2])}-${pad(+d[1])}`;
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/); if (iso) return iso[0];
  return null;
};

export async function readClientList(file: File, spaces: string[]): Promise<ClientRow[] | null> {
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: null });
  if (!raw.length) return null;
  const key = (r: Record<string, any>, name: string) => { const k = Object.keys(r).find(k => norm(k) === norm(name)); return k ? r[k] : null; };
  if (!Object.keys(raw[0]).some(k => norm(k) === "clientname")) return null;
  return raw.filter(r => cellText(key(r, "Client Name"))).map((r, i) => {
    const date = cellDate(key(r, "Event Date"));
    const timeRaw = cellText(key(r, "Event Start Time"));
    const { start, end } = parseTimes(timeRaw);
    const depositRaw = cellText(key(r, "Deposit"));
    const dep = depositRaw.match(/\$?\s*([\d,]+(?:\.\d+)?)/);
    const roomRaw = cellText(key(r, "Event Room"));
    return {
      ref: `xlsx:${date || "nodate"}:${norm(cellText(key(r, "Client Name")))}:${i + 1}`,
      name: cellText(key(r, "Client Name")).replace(/\s+/g, " "),
      eventType: cellText(key(r, "Event Type")).replace(/\s+/g, " ") || "Other",
      date, venue: matchVenues(roomRaw, spaces), roomRaw, start, end, timeRaw,
      deposit: dep ? parseFloat(dep[1].replace(/,/g, "")) : 0, depositRaw,
    };
  });
}
