// Matches a lead against free text: name, email, phone (digits-only), company, event type, and dates.
export function leadMatches(l: { full_name?: string | null; email?: string | null; phone?: string | null; company?: string | null; event_type?: string | null; service_location?: string | null; preferred_dates?: string[] | null }, query: string, date?: string) {
  const dates = (l.preferred_dates || []).filter(Boolean);
  if (date && !dates.some(d => d.slice(0, 10) === date)) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const dateText = dates.flatMap(d => {
    const [y, m, day] = d.slice(0, 10).split("-");
    if (!y || !m || !day) return [d];
    const dt = new Date(`${d.slice(0, 10)}T00:00:00`);
    return [d, `${day}/${m}/${y}`, `${+day}/${+m}/${y}`, `${day}/${m}`, `${+day}/${+m}`,
      dt.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }),
      dt.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })];
  }).join(" ");
  const hay = `${l.full_name || ""} ${l.email || ""} ${l.phone || ""} ${l.company || ""} ${l.event_type || ""} ${l.service_location || ""} ${dateText}`.toLowerCase();
  if (hay.includes(q)) return true;
  const qDigits = q.replace(/\D/g, "");
  if (qDigits.length >= 3 && /^[\d\s+()-]+$/.test(q)) {
    const p = (l.phone || "").replace(/\D/g, "");
    return p.includes(qDigits) || p.replace(/^61/, "0").includes(qDigits.replace(/^61/, "0"));
  }
  return false;
}
