import { computeTimesheetEntries, filterTimesheetEntriesByDateRange, getTimesheetEventWindow } from "@/lib/timesheetUtils";
import { supabase } from "@/integrations/supabase/client";

export const SYDNEY = "Australia/Sydney";
export const dayStr = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: SYDNEY });
export const todayStr = () => dayStr(new Date());
export const addDays = (s: string, n: number) => {
  const d = new Date(s + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + "T12:00:00Z").getTime() - new Date(a + "T12:00:00Z").getTime()) / 86400000);
export const r2 = (n: number) => Math.round(n * 100) / 100;

export type Range = { from: string; to: string };

export type RangePreset = "week" | "month" | "quarter" | "year" | "last30" | "custom";

/** Operations dashboards only cover the current calendar year — cap any range end at 31 Dec of this year. */
export function capRangeCurrentYear(r: Range): Range {
  const yearEnd = `${todayStr().slice(0, 4)}-12-31`;
  return r.to > yearEnd ? { ...r, to: yearEnd } : r;
}

export function presetRange(p: RangePreset): Range {
  const t = todayStr();
  const [y, m] = t.split("-").map(Number);
  if (p === "week") {
    const dow = (new Date(t + "T12:00:00Z").getUTCDay() + 6) % 7;
    const from = addDays(t, -dow);
    return { from, to: addDays(from, 6) };
  }
  if (p === "month") {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { from: `${t.slice(0, 7)}-01`, to: `${t.slice(0, 7)}-${String(last).padStart(2, "0")}` };
  }
  if (p === "quarter") {
    const qs = Math.floor((m - 1) / 3) * 3 + 1;
    const qe = qs + 2;
    const last = new Date(Date.UTC(y, qe, 0)).getUTCDate();
    return { from: `${y}-${String(qs).padStart(2, "0")}-01`, to: `${y}-${String(qe).padStart(2, "0")}-${last}` };
  }
  if (p === "year") return { from: `${y}-01-01`, to: `${y}-12-31` };
  return { from: addDays(t, -29), to: t };
}

export function previousRange(r: Range): Range {
  const len = daysBetween(r.from, r.to) + 1;
  return { from: addDays(r.from, -len), to: addDays(r.from, -1) };
}

const db: any = supabase;
async function rows<T = any>(q: any): Promise<T[]> {
  try {
    const { data, error } = await q;
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}
async function inChunks<T = any>(ids: string[], build: (chunk: string[]) => any): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 150) out.push(...(await rows<T>(build(ids.slice(i, i + 150)))));
  return out;
}

const CLOSED_BOOKING = ["cancelled", "canceled", "declined", "lost"];
export const WON_STAGES = ["deposit_received", "menu_selected", "invoice_sent", "runsheet_sent", "full_payment_received", "completed", "confirmed"];
export const LOST_STAGES = ["lost", "cold", "declined", "cancelled"];

// Sydney-local date + hours for a timestamp
const sydDate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: SYDNEY });
const sydHour = (iso: string) => Number(new Date(iso).toLocaleString("en-AU", { timeZone: SYDNEY, hour: "2-digit", hour12: false }).slice(0, 2)) % 24;

const timeToH = (t?: string | null) => {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h + (m || 0) / 60;
};

export type OpsData = Awaited<ReturnType<typeof loadOperations>>;

export async function loadOperations(bid: string, r: Range) {
  const today = todayStr();
  const fromTs = new Date(r.from + "T00:00:00+10:00").toISOString();
  const toTs = new Date(addDays(r.to, 1) + "T00:00:00+10:00").toISOString();

  const [employees, leadsAll, bookings, payments, inspections, tasks, fslEntries, fslForms, maint, docs, invOrders, barOrders, catering, contractorInv] =
    await Promise.all([
      rows(db.from("employees").select("id,name,department,pay_rate,admin_hourly_rate,active").eq("business_id", bid)),
      rows(db.from("crm_leads").select("id,full_name,source,event_type,status,lead_kind,estimated_value,estimated_guest_count,created_at,preferred_dates,assigned_to,lost_reason,decline_reason").eq("business_id", bid)),
      rows(db.from("crm_bookings").select("id,lead_id,event_name,event_type,event_date,start_time,end_time,duration_minutes,guest_count,adults,kids,venue_space,total_amount,deposit_amount,deposit_paid,balance_due_date,status,booking_kind").eq("business_id", bid)),
      rows(db.from("crm_payments").select("booking_id,amount").eq("business_id", bid)),
      rows(db.from("crm_inspections").select("id,status,starts_at,proposed_at").eq("business_id", bid)),
      rows(db.from("crm_tasks").select("id,title,status,due_at,priority").eq("business_id", bid)),
      rows(db.from("fsl_entries").select("id,form_id,entry_date,status,out_of_range,staff_name,created_at").eq("business_id", bid).gte("entry_date", r.from).lte("entry_date", r.to)),
      rows(db.from("fsl_forms").select("id,name,active").eq("business_id", bid)),
      rows(db.from("service_maintenance_tasks").select("id,name,next_service_date,last_service_date,active").eq("business_id", bid)),
      rows(db.from("employee_documents").select("id,employee_id,category,custom_label,expiry_date,status").eq("business_id", bid)),
      rows(db.from("inventory_orders").select("id,status,created_at").eq("business_id", bid)),
      rows(db.from("bar_inventory_orders").select("id,status,created_at").eq("business_id", bid)),
      rows(db.from("catering_deliveries").select("id,delivery_date,number_of_guests,status,cost_incl_gst").eq("business_id", bid).gte("delivery_date", r.from).lte("delivery_date", r.to)),
      rows(db.from("invoices").select("id,amount,net_hours,week_start,employee_name").eq("business_id", bid).gte("week_start", r.from).lte("week_start", r.to)),
    ]);

  const empIds = employees.map((e: any) => e.id);
  const empById: Record<string, any> = Object.fromEntries(employees.map((e: any) => [e.id, e]));
  // Labour cost uses the admin hourly rate; falls back to pay rate when no admin rate is set.
  const rateOf = (id: string) => Number(empById[id]?.admin_hourly_rate) || Number(empById[id]?.pay_rate) || 0;

  const [clocks, shifts, requests, approvals] = await Promise.all([
    inChunks(empIds, c => db.from("clock_events").select("employee_id,event_type,timestamp").in("employee_id", c).gte("timestamp", fromTs).lt("timestamp", toTs).order("timestamp")),
    inChunks(empIds, c => db.from("shifts").select("employee_id,date,start_time,end_time,break_minutes,status").in("employee_id", c).gte("date", r.from).lte("date", r.to)),
    inChunks(empIds, c => db.from("employee_requests").select("employee_id,request_type,status,start_date,end_date").in("employee_id", c)),
    inChunks(empIds, c => db.from("timesheet_approvals").select("employee_id,date,approved").in("employee_id", c).gte("date", r.from).lte("date", r.to)),
  ]);

  // ---------- Sales ----------
  // Leads count in the period of their event date (first preferred date); fall back to creation date when no date is set.
  const leadDate = (l: any) => (Array.isArray(l.preferred_dates) && l.preferred_dates[0]) || sydDate(l.created_at);
  const leadsInRange = leadsAll.filter((l: any) => { const d = leadDate(l); return d >= r.from && d <= r.to; });
  const wonInRange = leadsInRange.filter((l: any) => WON_STAGES.includes(l.status));
  const lostInRange = leadsInRange.filter((l: any) => LOST_STAGES.includes(l.status));
  const activeLeads = leadsAll.filter((l: any) => !WON_STAGES.includes(l.status) && !LOST_STAGES.includes(l.status));
  const pipelineValue = activeLeads.reduce((s: number, l: any) => s + (Number(l.estimated_value) || 0), 0);
  const tally = (arr: any[], key: (x: any) => string) => {
    const m: Record<string, number> = {};
    arr.forEach(x => { const k = key(x) || "Unspecified"; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };
  const pretty = (s: string) => (s || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const leadSources = tally(leadsInRange, l => pretty(l.source));
  const leadStages = tally(leadsInRange, l => pretty(l.status));
  const lostReasons = tally(lostInRange, l => l.decline_reason || l.lost_reason || "Not recorded");

  // ---------- Bookings / revenue ----------
  const live = bookings.filter((b: any) => !CLOSED_BOOKING.includes((b.status || "").toLowerCase()));
  const inRange = live.filter((b: any) => b.event_date >= r.from && b.event_date <= r.to);
  const events = inRange.filter((b: any) => b.booking_kind !== "catering");
  const cater = inRange.filter((b: any) => b.booking_kind === "catering");
  const sum = (arr: any[], f: (x: any) => number) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const cateringDeliveriesRevenue = sum(catering, c => c.cost_incl_gst);
  const eventRevenue = sum(events, b => b.total_amount);
  const cateringRevenue = sum(cater, b => b.total_amount) + cateringDeliveriesRevenue;
  const revenue = eventRevenue + cateringRevenue;
  const guests = sum(inRange, b => b.guest_count || (Number(b.adults || 0) + Number(b.kids || 0))) + sum(catering, c => c.number_of_guests);
  // Outstanding balance: totals are often unknown when a deposit is taken, so only bookings with a
  // real total contribute, and everything actually paid (all payment records, not just the deposit)
  // is subtracted. A booking can never contribute less than $0.
  const paidByBooking: Record<string, number> = {};
  (payments as any[]).forEach(p => { if (p.booking_id) paidByBooking[p.booking_id] = (paidByBooking[p.booking_id] || 0) + (Number(p.amount) || 0); });
  const depositsCollected = sum(inRange, (b: any) => Math.min(Math.max(0, paidByBooking[b.id] || 0), Math.max(0, Number(b.deposit_amount || 0))));
  const balanceOf = (b: any) => { if (b.external_ref && b.event_date && b.created_at && b.event_date < new Date(b.created_at).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" })) return 0; return Math.max(0, Number(b.total_amount || 0) - (paidByBooking[b.id] || 0)); };
  const upcomingBookings = live.filter((b: any) => b.event_date >= today);
  const outstandingBalance = sum(upcomingBookings, balanceOf);
  const overdueBalances = live.filter((b: any) => b.balance_due_date && b.balance_due_date < today && b.event_date >= addDays(today, -60) && b.status !== "completed" && b.status !== "paid" && balanceOf(b) > 0);
  const cancelledInRange = bookings.filter((b: any) => CLOSED_BOOKING.includes((b.status || "").toLowerCase()) && b.event_date >= r.from && b.event_date <= r.to).length;

  // trend buckets: daily if <=45 days, else monthly
  const len = daysBetween(r.from, r.to) + 1;
  const monthly = len > 45;
  const bucket = (d: string) => (monthly ? d.slice(0, 7) : d);
  const buckets: string[] = [];
  if (monthly) { let d = r.from.slice(0, 7) + "-01"; while (d <= r.to) { buckets.push(d.slice(0, 7)); const [yy, mm] = d.split("-").map(Number); d = `${mm === 12 ? yy + 1 : yy}-${String(mm === 12 ? 1 : mm + 1).padStart(2, "0")}-01`; } }
  else for (let i = 0; i < len; i++) buckets.push(addDays(r.from, i));
  const trendMap: Record<string, any> = Object.fromEntries(buckets.map(b => [b, { period: b, events: 0, catering: 0, bookings: 0, guests: 0, leads: 0, hours: 0, labour: 0 }]));
  events.forEach((b: any) => { const t = trendMap[bucket(b.event_date)]; if (t) { t.events += Number(b.total_amount) || 0; t.bookings++; t.guests += Number(b.guest_count) || 0; } });
  cater.forEach((b: any) => { const t = trendMap[bucket(b.event_date)]; if (t) { t.catering += Number(b.total_amount) || 0; t.bookings++; } });
  catering.forEach((c: any) => { const t = trendMap[bucket(c.delivery_date)]; if (t) t.catering += Number(c.cost_incl_gst) || 0; });
  leadsInRange.forEach((l: any) => { const t = trendMap[bucket(leadDate(l))]; if (t) t.leads++; });

  // venue utilisation
  const venueMap: Record<string, { name: string; events: number; guests: number; revenue: number; hours: number }> = {};
  events.forEach((b: any) => {
    const spaces = String(b.venue_space || "Unassigned").split(",").map(s => s.trim()).filter(Boolean);
    const hrs = b.duration_minutes ? b.duration_minutes / 60 : Math.max(0, timeToH(b.end_time) - timeToH(b.start_time));
    spaces.forEach(s => {
      venueMap[s] ||= { name: s, events: 0, guests: 0, revenue: 0, hours: 0 };
      venueMap[s].events++;
      venueMap[s].guests += Number(b.guest_count) || 0;
      venueMap[s].revenue += (Number(b.total_amount) || 0) / spaces.length;
      venueMap[s].hours += hrs;
    });
  });
  const venues = Object.values(venueMap).map(v => ({ ...v, revenue: r2(v.revenue), hours: r2(v.hours), occupancy: r2((new Set(events.filter((b: any) => String(b.venue_space || "Unassigned").includes(v.name)).map((b: any) => b.event_date)).size / len) * 100) })).sort((a, b) => b.events - a.events);
  const dows = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const byDow = dows.map(d => ({ name: d, events: 0, guests: 0 }));
  events.forEach((b: any) => { const i = (new Date(b.event_date + "T12:00:00Z").getUTCDay() + 6) % 7; byDow[i].events++; byDow[i].guests += Number(b.guest_count) || 0; });
  const leadById: Record<string, any> = Object.fromEntries(leadsAll.map((l: any) => [l.id, l]));
  // Bookings often carry no event type of their own (imports store it on the lead), so fall back to the linked lead.
  const typeOf = (b: any) => b.event_type || (b.lead_id ? leadById[b.lead_id]?.event_type : "") || "";
  const eventTypes = tally(events, b => pretty(typeOf(b)));
  const nameOf = (b: any) => {
    const lead = b.lead_id ? leadById[b.lead_id] : null;
    const t = pretty(typeOf(b));
    return lead?.full_name ? (t ? `${t} – ${lead.full_name}` : lead.full_name) : (b.event_name || "");
  };
  const upcoming = live.filter((b: any) => b.event_date >= today && b.event_date <= addDays(today, 30)).sort((a: any, b: any) => a.event_date.localeCompare(b.event_date)).map((b: any) => {
    const lead = b.lead_id ? leadById[b.lead_id] : null;
    const t = pretty(typeOf(b));
    const label = lead?.full_name ? (t ? `${t} – ${lead.full_name}` : lead.full_name) : (b.event_name || "");
    return { ...b, event_name: nameOf(b), event_type_display: t, event_label: label };
  });


  const inspInRange = inspections.filter((i: any) => { const d = i.starts_at || i.proposed_at; if (!d) return false; const s = sydDate(d); return s >= r.from && s <= r.to; });
  const inspStatus = tally(inspInRange, i => pretty(i.status));
  const overdueTasks = tasks.filter((t: any) => t.status !== "completed" && t.status !== "done" && t.due_at && t.due_at < new Date().toISOString());

  // ---------- Labour ----------
  type Emp = { id: string; name: string; department: string; actual: number; rostered: number; cost: number; shifts: number; late: number };
  const empStats: Record<string, Emp> = {};
  const getE = (id: string) => (empStats[id] ||= { id, name: empById[id]?.name || "Unknown", department: empById[id]?.department || "—", actual: 0, rostered: 0, cost: 0, shifts: 0, late: 0 });
  // actual from clock pairs (Sydney date of clock-in)
  const perEmp: Record<string, any[]> = {};
  clocks.forEach((c: any) => (perEmp[c.employee_id] ||= []).push(c));
  const dayHours: Record<string, number> = {};
  const hourHeat = Array.from({ length: 24 }, (_, h) => ({ hour: h, clockIns: 0 }));
  const firstIn: Record<string, string> = {};
  Object.entries(perEmp).forEach(([eid, evs]) => {
    let inAt: number | null = null, breakAt: number | null = null, breakMs = 0, inIso = "";
    evs.forEach((e: any) => {
      const t = new Date(e.timestamp).getTime();
      if (e.event_type === "clock_in") { inAt = t; inIso = e.timestamp; breakMs = 0; breakAt = null; hourHeat[sydHour(e.timestamp)].clockIns++; const k = eid + sydDate(e.timestamp); if (!firstIn[k]) firstIn[k] = e.timestamp; }
      else if (e.event_type === "break_start") breakAt = t;
      else if (e.event_type === "break_end" && breakAt) { breakMs += t - breakAt; breakAt = null; }
      else if (e.event_type === "clock_out" && inAt) {
        const hrs = Math.max(0, (t - inAt - breakMs) / 3600000);
        if (hrs < 24) {
          const E = getE(eid); E.actual += hrs; E.shifts++;
          const d = sydDate(inIso); dayHours[d] = (dayHours[d] || 0) + hrs;
          const tb = trendMap[bucket(d)]; if (tb) { tb.hours += hrs; tb.labour += hrs * (rateOf(eid)); }
        }
        inAt = null;
      }
    });
  });
  shifts.forEach((s: any) => {
    const E = getE(s.employee_id);
    let h = timeToH(s.end_time) - timeToH(s.start_time); if (h < 0) h += 24;
    E.rostered += Math.max(0, h - (Number(s.break_minutes) || 0) / 60);
    const fi = firstIn[s.employee_id + s.date];
    if (fi && s.start_time) {
      const local = new Date(fi).toLocaleTimeString("en-GB", { timeZone: SYDNEY, hour12: false }).slice(0, 5);
      if (timeToH(local) - timeToH(s.start_time) > 5 / 60) E.late++;
    }
  });
  Object.values(empStats).forEach(E => { E.cost = r2(E.actual * (rateOf(E.id))); E.actual = r2(E.actual); E.rostered = r2(E.rostered); });
  const staff = Object.values(empStats).filter(e => e.actual || e.rostered).sort((a, b) => b.actual - a.actual);
  const actualHours = r2(staff.reduce((s, e) => s + e.actual, 0));
  const rosteredHours = r2(staff.reduce((s, e) => s + e.rostered, 0));
  const labourCost = r2(staff.reduce((s, e) => s + e.cost, 0));
  const contractorCost = r2(sum(contractorInv, i => i.amount));
  const deptMap: Record<string, { name: string; hours: number; cost: number }> = {};
  staff.forEach(e => { const d = e.department || "—"; deptMap[d] ||= { name: d, hours: 0, cost: 0 }; deptMap[d].hours = r2(deptMap[d].hours + e.actual); deptMap[d].cost = r2(deptMap[d].cost + e.cost); });
  const leaveInRange = requests.filter((q: any) => q.status === "approved" && q.start_date && q.start_date <= r.to && (q.end_date || q.start_date) >= r.from);
  const pendingRequests = requests.filter((q: any) => q.status === "pending").length;
  // Match the Timesheets tab: every worked session (clock-in inside the range) without an approval counts as pending.
  const tsWin = getTimesheetEventWindow(r.from, r.to, 36, 36);
  const tsClocks = await inChunks(empIds, c => db.from("clock_events").select("employee_id,event_type,timestamp").in("employee_id", c).gte("timestamp", tsWin.fromISO).lte("timestamp", tsWin.toISO).order("timestamp"));
  const approvedKeys = new Set(approvals.filter((a: any) => a.approved).map((a: any) => `${a.employee_id}-${a.date}`));
  const unapprovedDays = filterTimesheetEntriesByDateRange(computeTimesheetEntries(tsClocks), r.from, r.to)
    .filter(e => !approvedKeys.has(`${e.employee_id}-${e.date}`)).length;

  // ---------- Compliance ----------
  const formName: Record<string, string> = Object.fromEntries(fslForms.map((f: any) => [f.id, f.name]));
  const fslByForm = Object.values(fslEntries.reduce((m: any, e: any) => {
    const n = formName[e.form_id] || "Form";
    m[n] ||= { name: n, entries: 0, outOfRange: 0, daysLogged: new Set<string>() };
    m[n].entries++; if (e.out_of_range) m[n].outOfRange++; m[n].daysLogged.add(e.entry_date);
    return m;
  }, {})).map((f: any) => ({ name: f.name, entries: f.entries, outOfRange: f.outOfRange, daysLogged: f.daysLogged.size, coverage: r2((f.daysLogged.size / Math.min(len, daysBetween(r.from, today < r.to ? today : r.to) + 1 || 1)) * 100) }));
  const fslOut = fslEntries.filter((e: any) => e.out_of_range).length;
  const activeForms = fslForms.filter((f: any) => f.active);
  const maintActive = maint.filter((m: any) => m.active !== false);
  const maintOverdue = maintActive.filter((m: any) => m.next_service_date && m.next_service_date < today);
  const maintDue14 = maintActive.filter((m: any) => m.next_service_date && m.next_service_date >= today && m.next_service_date <= addDays(today, 14));
  const docsExpired = docs.filter((d: any) => d.expiry_date && d.expiry_date < today);
  const docsExpiring = docs.filter((d: any) => d.expiry_date && d.expiry_date >= today && d.expiry_date <= addDays(today, 30));
  const docsPending = docs.filter((d: any) => d.status === "pending");
  const ordersPending = [...invOrders, ...barOrders].filter((o: any) => ["requested", "pending", "approved", "ordered"].includes(o.status));

  return {
    range: r, len,
    sales: {
      leadsCount: leadsInRange.length, won: wonInRange.length, lost: lostInRange.length,
      conversion: leadsInRange.length ? r2((wonInRange.length / leadsInRange.length) * 100) : 0,
      activeLeads: activeLeads.length, pipelineValue, leadSources, leadStages, lostReasons,
      inspections: inspInRange.length, inspStatus,
      overdueTasks,
    },
    revenue: {
      total: r2(revenue), events: r2(eventRevenue), catering: r2(cateringRevenue), bookings: inRange.length + catering.length,
      eventCount: events.length, cateringCount: cater.length + catering.length, guests,
      avgPerEvent: events.length ? r2(eventRevenue / events.length) : 0,
      perGuest: guests ? r2(revenue / guests) : 0,
      depositsCollected: r2(depositsCollected), outstandingBalance: r2(outstandingBalance), overdueBalances, cancelled: cancelledInRange,
    },
    trend: buckets.map(b => ({ ...trendMap[b], hours: r2(trendMap[b].hours), labour: r2(trendMap[b].labour), label: monthly ? b : b.slice(5) })),
    venue: { venues, byDow, eventTypes, upcoming },
    labour: {
      actualHours, rosteredHours, variance: r2(actualHours - rosteredHours), labourCost, contractorCost,
      labourPct: revenue ? r2(((labourCost + contractorCost) / revenue) * 100) : 0,
      staffCount: staff.length, activeEmployees: employees.filter((e: any) => e.active !== false).length,
      lateArrivals: staff.reduce((s, e) => s + e.late, 0),
      staff, departments: Object.values(deptMap), hourHeat, leave: leaveInRange.length, pendingRequests, unapprovedDays,
    },
    compliance: {
      fslEntries: fslEntries.length, fslOut, fslByForm, activeForms: activeForms.length,
      maintOverdue, maintDue14, maintTotal: maintActive.length,
      docsExpired, docsExpiring, docsPending, ordersPending: ordersPending.length,
      empName: (id: string) => empById[id]?.name || "Unknown",
    },
  };
}
