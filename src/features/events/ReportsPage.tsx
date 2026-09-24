import { useMemo, useState } from "react";
import { format, subMonths } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, FileSpreadsheet } from "lucide-react";
import { useCrmData } from "@/features/sales/useCrmData";
import { prettyCrmValue } from "@/features/sales/types";

const money = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);

export default function ReportsPage() {
  const crm = useCrmData(); const [months, setMonths] = useState(12);
  const r = useMemo(() => {
    const from = format(subMonths(new Date(), months - 1), "yyyy-MM-01");
    const bookings = crm.bookings.filter(b => b.status !== "cancelled" && b.event_date >= from && b.booking_kind !== "catering");
    const byMonth = Array.from({ length: months }, (_, i) => { const m = format(subMonths(new Date(), months - 1 - i), "yyyy-MM"); const list = bookings.filter(b => String(b.event_date).startsWith(m)); return { month: format(new Date(`${m}-01T00:00:00`), "MMM yy"), events: list.length, revenue: list.reduce((s, b) => s + Number(b.total_amount || 0), 0) }; });
    const group = (key: (b: any) => string) => Object.entries(bookings.reduce<Record<string, { count: number; revenue: number; guests: number }>>((a, b) => { const k = key(b) || "Not set"; a[k] ||= { count: 0, revenue: 0, guests: 0 }; a[k].count++; a[k].revenue += Number(b.total_amount || 0); a[k].guests += Number(b.guest_count || 0); return a; }, {})).sort((a, b) => b[1].count - a[1].count);
    const byType = group(b => prettyCrmValue(b.event_type || crm.leads.find(l => l.id === b.lead_id)?.event_type || ""));
    const byHall = group(b => b.venue_space);
    const leads = crm.leads.filter(l => l.created_at >= from && l.lead_kind !== "catering" && l.event_type !== "catering");
    const bySource = Object.entries(leads.reduce<Record<string, { total: number; won: number }>>((a, l) => { const k = prettyCrmValue(l.source); a[k] ||= { total: 0, won: 0 }; a[k].total++; if (l.lead_outcome === "confirmed" || l.status === "full_payment_received") a[k].won++; return a; }, {})).sort((a, b) => b[1].total - a[1].total);
    return { bookings, byMonth, byType, byHall, bySource, leads };
  }, [crm.bookings, crm.leads, months]);
  if (!crm.business) return null;
  const code = crm.business.business_code; const stamp = format(new Date(), "dd.MM.yyyy");
  const tables = [
    { title: "Events per month", head: ["Month", "Events", "Revenue"], rows: r.byMonth.map(m => [m.month, m.events, money(m.revenue)]) },
    { title: "By event type", head: ["Type", "Bookings", "Guests", "Revenue"], rows: r.byType.map(([k, v]) => [k, v.count, v.guests, money(v.revenue)]) },
    { title: "Hall usage", head: ["Hall", "Bookings", "Guests", "Revenue"], rows: r.byHall.map(([k, v]) => [k, v.count, v.guests, money(v.revenue)]) },
    { title: "Lead conversion by source", head: ["Source", "Leads", "Confirmed", "Conversion"], rows: r.bySource.map(([k, v]) => [k, v.total, v.won, `${Math.round(v.won / v.total * 100)}%`]) },
  ];
  const pdf = () => { const doc = new jsPDF(); doc.setFontSize(16); doc.text(`${crm.business!.name} — Events report`, 14, 16); doc.setFontSize(9); doc.text(`Last ${months} months · generated ${stamp}`, 14, 22); let y = 28; tables.forEach(t => { doc.setFontSize(11); doc.text(t.title, 14, y + 4); autoTable(doc, { startY: y + 6, head: [t.head], body: t.rows as any, theme: "grid", headStyles: { fillColor: [20, 20, 20], textColor: [212, 175, 55] }, styles: { fontSize: 8 } }); y = (doc as any).lastAutoTable.finalY + 8; }); doc.save(`${code}__Events-Report__${stamp}.pdf`); };
  const xlsx = () => { const wb = XLSX.utils.book_new(); tables.forEach(t => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([t.head, ...t.rows]), t.title.slice(0, 31))); XLSX.writeFile(wb, `${code}__Events-Report__${stamp}.xlsx`); };
  const totalRev = r.bookings.reduce((s, b) => s + Number(b.total_amount || 0), 0);
  const conv = r.leads.length ? Math.round(r.leads.filter(l => l.lead_outcome === "confirmed").length / r.leads.length * 100) : 0;

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="font-serif text-3xl font-semibold">Reports</h1><p className="text-sm text-muted-foreground">How the venue is performing.</p></div>
      <div className="flex gap-2"><select value={months} onChange={e => setMonths(Number(e.target.value))} className="h-10 rounded-md border border-input bg-background px-3 text-sm">{[3, 6, 12, 24].map(m => <option key={m} value={m}>Last {m} months</option>)}</select><Button variant="outline" onClick={pdf}><Download className="mr-2 h-4 w-4" />PDF</Button><Button variant="outline" onClick={xlsx}><FileSpreadsheet className="mr-2 h-4 w-4" />Excel</Button></div></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Bookings", r.bookings.length], ["Revenue", money(totalRev)], ["Guests served", r.bookings.reduce((s, b) => s + Number(b.guest_count || 0), 0)], ["Lead conversion", `${conv}%`]].map(([l, v]) => <Card key={l as string}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{l}</p><p className="mt-2 font-serif text-3xl">{v}</p></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle>Events per month</CardTitle></CardHeader><CardContent className="h-72"><ResponsiveContainer><BarChart data={r.byMonth}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="month" fontSize={11} stroke="hsl(var(--muted-foreground))" /><YAxis allowDecimals={false} fontSize={11} stroke="hsl(var(--muted-foreground))" /><Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} /><Bar dataKey="events" fill="hsl(var(--primary))" /></BarChart></ResponsiveContainer></CardContent></Card>
    <div className="grid gap-6 lg:grid-cols-3">{tables.slice(1).map(t => <Card key={t.title}><CardHeader><CardTitle>{t.title}</CardTitle></CardHeader><CardContent><table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground">{t.head.map(h => <th key={h} className="pb-2">{h}</th>)}</tr></thead><tbody>{t.rows.map((row, i) => <tr key={i} className="border-t">{row.map((c, j) => <td key={j} className="py-2">{c}</td>)}</tr>)}{!t.rows.length && <tr><td className="py-4 text-muted-foreground" colSpan={4}>No data yet.</td></tr>}</tbody></table></CardContent></Card>)}</div>
  </div>;
}
