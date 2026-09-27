import { supabase } from "@/integrations/supabase/client";
import { addDays, type OpsData, type Range } from "@/lib/operationsData";

const db = supabase as any;

export type ColType = "text" | "money" | "num" | "date";
export type Col = { key: string; label: string; type?: ColType };
export type Row = Record<string, any>;
export type Ctx = { bid: string; range: Range; ops: OpsData | null; employees: () => Promise<Row[]> };
export type Dataset = {
  key: string;
  group: "Sales & events" | "Staff & labour" | "Compliance" | "Inventory";
  label: string;
  description: string;
  columns: Col[];
  load: (ctx: Ctx) => Promise<Row[]>;
  summary: (rows: Row[]) => [string, string | number][];
};

export const GROUPS: Dataset["group"][] = ["Sales & events", "Staff & labour", "Compliance", "Inventory"];

const pretty = (s: any) => (s == null || s === "" ? "" : String(s).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()));
const n = (v: any) => Number(v) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;
const sum = (rows: Row[], k: string) => r2(rows.reduce((s, x) => s + n(x[k]), 0));
const sydDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" }) : "");
const sydTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", minute: "2-digit", hour12: true }) : "");
const t12 = (t?: string | null) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};
const tsFrom = (r: Range) => new Date(r.from + "T00:00:00+10:00").toISOString();
const tsTo = (r: Range) => new Date(addDays(r.to, 1) + "T00:00:00+10:00").toISOString();
const countBy = (rows: Row[], k: string): [string, number][] => {
  const m: Record<string, number> = {};
  rows.forEach(x => { const v = x[k] || "Unspecified"; m[v] = (m[v] || 0) + 1; });
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
};

async function all(build: () => any): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

async function byEmployees(emps: Row[], build: (ids: string[]) => any): Promise<Row[]> {
  const ids = emps.map(e => e.id);
  const out: Row[] = [];
  for (let i = 0; i < ids.length; i += 150) out.push(...(await all(() => build(ids.slice(i, i + 150)))));
  return out;
}

const bookingCols: Col[] = [
  { key: "event_date", label: "Date", type: "date" },
  { key: "time", label: "Time" },
  { key: "event_name", label: "Booking" },
  { key: "event_type", label: "Type" },
  { key: "client", label: "Client" },
  { key: "venue_space", label: "Venue / service" },
  { key: "guests", label: "Guests", type: "num" },
  { key: "status", label: "Status" },
  { key: "total_amount", label: "Total", type: "money" },
  { key: "deposit_amount", label: "Deposit", type: "money" },
  { key: "deposit_paid", label: "Deposit paid" },
  { key: "balance_due_date", label: "Balance due", type: "date" },
];

const loadBookings = (kind: "event" | "catering") => async ({ bid, range }: Ctx) => {
  const rows = await all(() => db.from("crm_bookings")
    .select("event_date,start_time,end_time,event_name,event_type,venue_space,guest_count,adults,kids,status,total_amount,deposit_amount,deposit_paid,balance_due_date,booking_kind,crm_leads(full_name)")
    .eq("business_id", bid).gte("event_date", range.from).lte("event_date", range.to).order("event_date"));
  return rows
    .filter(b => (kind === "catering") === (b.booking_kind === "catering"))
    .map(b => ({
      ...b,
      time: [t12(b.start_time), t12(b.end_time)].filter(Boolean).join(" – "),
      event_type: pretty(b.event_type),
      client: b.crm_leads?.full_name || "",
      guests: n(b.guest_count) || n(b.adults) + n(b.kids),
      status: pretty(b.status),
      deposit_paid: b.deposit_paid ? "Yes" : "No",
    }));
};
const bookingSummary = (rows: Row[]): [string, string | number][] => {
  const live = rows.filter(r => !["Cancelled", "Declined", "Lost"].includes(r.status));
  return [
    ["Bookings", rows.length], ["Cancelled / declined", rows.length - live.length],
    ["Booked value (excl. cancelled)", sum(live, "total_amount")], ["Guests", sum(live, "guests")],
    ["Deposits paid", live.filter(r => r.deposit_paid === "Yes").length],
  ];
};

export const DATASETS: Dataset[] = [
  // ---------- Sales & events ----------
  {
    key: "leads", group: "Sales & events", label: "Leads", description: "Enquiries created in the period",
    columns: [
      { key: "created", label: "Created", type: "date" }, { key: "full_name", label: "Client" }, { key: "email", label: "Email" },
      { key: "phone", label: "Phone" }, { key: "lead_kind", label: "Kind" }, { key: "event_type", label: "Event type" },
      { key: "source", label: "Source" }, { key: "status", label: "Stage" }, { key: "estimated_guest_count", label: "Est. guests", type: "num" },
      { key: "estimated_value", label: "Est. value", type: "money" }, { key: "reason", label: "Lost / decline reason" },
    ],
    load: async ({ bid, range }) => (await all(() => db.from("crm_leads")
      .select("created_at,full_name,email,phone,lead_kind,event_type,source,status,estimated_guest_count,estimated_value,lost_reason,decline_reason")
      .eq("business_id", bid).gte("created_at", tsFrom(range)).lt("created_at", tsTo(range)).order("created_at")))
      .map(l => ({ ...l, created: sydDate(l.created_at), lead_kind: pretty(l.lead_kind || "event"), event_type: pretty(l.event_type), source: pretty(l.source), status: pretty(l.status), reason: l.decline_reason || l.lost_reason || "" })),
    summary: rows => [["New leads", rows.length], ["Estimated value", sum(rows, "estimated_value")], ...countBy(rows, "status").map(([k, v]) => [`Stage: ${k}`, v] as [string, number])],
  },
  {
    key: "event_bookings", group: "Sales & events", label: "Event bookings", description: "Confirmed events dated in the period",
    columns: bookingCols, load: loadBookings("event"), summary: bookingSummary,
  },
  {
    key: "catering_bookings", group: "Sales & events", label: "Catering bookings", description: "Catering orders dated in the period",
    columns: bookingCols, load: loadBookings("catering"), summary: bookingSummary,
  },
  {
    key: "catering_deliveries", group: "Sales & events", label: "Catering deliveries", description: "Standalone delivery entries",
    columns: [
      { key: "delivery_date", label: "Date", type: "date" }, { key: "client_name", label: "Client" }, { key: "number_of_guests", label: "Guests", type: "num" },
      { key: "status", label: "Status" }, { key: "cost_incl_gst", label: "Cost incl. GST", type: "money" },
    ],
    load: async ({ bid, range }) => (await all(() => db.from("catering_deliveries").select("*")
      .eq("business_id", bid).gte("delivery_date", range.from).lte("delivery_date", range.to).order("delivery_date")))
      .map(c => ({ ...c, client_name: c.client_name || c.customer_name || c.event_name || "", status: pretty(c.status) })),
    summary: rows => [["Deliveries", rows.length], ["Guests", sum(rows, "number_of_guests")], ["Value incl. GST", sum(rows, "cost_incl_gst")]],
  },
  {
    key: "payments", group: "Sales & events", label: "Payments received", description: "Payments recorded against bookings",
    columns: [
      { key: "paid_on", label: "Received", type: "date" }, { key: "booking", label: "Booking" }, { key: "kind", label: "Events / catering" },
      { key: "payment_type", label: "Type" }, { key: "method", label: "Method" }, { key: "reference", label: "Reference" },
      { key: "amount", label: "Amount", type: "money" }, { key: "notes", label: "Notes" },
    ],
    load: async ({ bid, range }) => (await all(() => db.from("crm_payments").select("paid_on,amount,payment_type,method,reference,notes,crm_bookings(event_name,event_date,booking_kind)")
      .eq("business_id", bid).gte("paid_on", range.from).lte("paid_on", range.to).order("paid_on")))
      .map(p => ({ ...p, booking: p.crm_bookings?.event_name || "", kind: p.crm_bookings?.booking_kind === "catering" ? "Catering" : "Event", payment_type: pretty(p.payment_type), method: pretty(p.method) })),
    summary: rows => [["Payments", rows.length], ["Net received", sum(rows, "amount")], ...countBy(rows, "payment_type").map(([k, v]) => [`Type: ${k}`, v] as [string, number])],
  },
  {
    key: "inspections", group: "Sales & events", label: "Inspections", description: "Venue inspections in the period",
    columns: [
      { key: "date", label: "Date", type: "date" }, { key: "time", label: "Time" }, { key: "client", label: "Client" },
      { key: "venue_space", label: "Venue" }, { key: "status", label: "Status" }, { key: "post_notes", label: "Notes" },
    ],
    load: async ({ bid, range }) => (await all(() => db.from("crm_inspections").select("starts_at,proposed_at,venue_space,status,post_notes,crm_leads(full_name)")
      .eq("business_id", bid).gte("starts_at", tsFrom(range)).lt("starts_at", tsTo(range)).order("starts_at")))
      .map(i => ({ ...i, date: sydDate(i.starts_at), time: sydTime(i.starts_at), client: i.crm_leads?.full_name || "", status: pretty(i.status) })),
    summary: rows => [["Inspections", rows.length], ...countBy(rows, "status").map(([k, v]) => [`Status: ${k}`, v] as [string, number])],
  },
  {
    key: "tasks", group: "Sales & events", label: "Sales tasks", description: "Tasks due in the period",
    columns: [
      { key: "due", label: "Due", type: "date" }, { key: "title", label: "Task" }, { key: "client", label: "Client" },
      { key: "priority", label: "Priority" }, { key: "status", label: "Status" }, { key: "completed", label: "Completed", type: "date" },
    ],
    load: async ({ bid, range }) => (await all(() => db.from("crm_tasks").select("due_at,title,priority,status,completed_at,crm_leads(full_name)")
      .eq("business_id", bid).gte("due_at", tsFrom(range)).lt("due_at", tsTo(range)).order("due_at")))
      .map(t => ({ ...t, due: sydDate(t.due_at), client: t.crm_leads?.full_name || "", priority: pretty(t.priority), status: pretty(t.status), completed: sydDate(t.completed_at) })),
    summary: rows => [["Tasks due", rows.length], ...countBy(rows, "status").map(([k, v]) => [`Status: ${k}`, v] as [string, number])],
  },
  {
    key: "venue_usage", group: "Sales & events", label: "Venue usage", description: "Events, guests and revenue per space",
    columns: [
      { key: "name", label: "Space" }, { key: "events", label: "Events", type: "num" }, { key: "guests", label: "Guests", type: "num" },
      { key: "revenue", label: "Revenue (split)", type: "money" }, { key: "hours", label: "Hours booked", type: "num" }, { key: "occupancy", label: "Days used %", type: "num" },
    ],
    load: async ({ ops }) => ops?.venue.venues || [],
    summary: rows => [["Spaces used", rows.length], ["Events", sum(rows, "events")], ["Revenue", sum(rows, "revenue")]],
  },
  // ---------- Staff & labour ----------
  {
    key: "staff_hours", group: "Staff & labour", label: "Staff hours & labour cost", description: "Clocked vs rostered hours per person (admin rate)",
    columns: [
      { key: "name", label: "Name" }, { key: "department", label: "Department" }, { key: "actual", label: "Actual hrs", type: "num" },
      { key: "rostered", label: "Rostered hrs", type: "num" }, { key: "variance", label: "Variance", type: "num" }, { key: "shifts", label: "Shifts", type: "num" },
      { key: "late", label: "Late clock-ins", type: "num" }, { key: "cost", label: "Labour cost", type: "money" },
    ],
    load: async ({ ops }) => (ops?.labour.staff || []).map(s => ({ ...s, variance: r2(s.actual - s.rostered) })),
    summary: rows => [["Staff worked", rows.length], ["Actual hours", sum(rows, "actual")], ["Rostered hours", sum(rows, "rostered")], ["Labour cost", sum(rows, "cost")]],
  },
  {
    key: "clock_events", group: "Staff & labour", label: "Clock events", description: "Every clock in, break and clock out",
    columns: [
      { key: "date", label: "Date", type: "date" }, { key: "time", label: "Time" }, { key: "name", label: "Employee" },
      { key: "department", label: "Department" }, { key: "event", label: "Event" }, { key: "notes", label: "Notes" },
    ],
    load: async ctx => {
      const emps = await ctx.employees();
      const by = Object.fromEntries(emps.map(e => [e.id, e]));
      return (await byEmployees(emps, ids => db.from("clock_events").select("*").in("employee_id", ids).gte("timestamp", tsFrom(ctx.range)).lt("timestamp", tsTo(ctx.range)).order("timestamp")))
        .map(c => ({ date: sydDate(c.timestamp), time: sydTime(c.timestamp), name: by[c.employee_id]?.name || "", department: by[c.employee_id]?.department || "", event: pretty(c.event_type), notes: c.notes || "" }));
    },
    summary: rows => countBy(rows, "event"),
  },
  {
    key: "shifts", group: "Staff & labour", label: "Rostered shifts", description: "Roster entries in the period",
    columns: [
      { key: "date", label: "Date", type: "date" }, { key: "name", label: "Employee" }, { key: "department", label: "Department" },
      { key: "start", label: "Start" }, { key: "end", label: "End" }, { key: "break_minutes", label: "Break (min)", type: "num" },
      { key: "hours", label: "Hours", type: "num" }, { key: "status", label: "Status" },
    ],
    load: async ctx => {
      const emps = await ctx.employees();
      const by = Object.fromEntries(emps.map(e => [e.id, e]));
      const h = (t?: string) => { if (!t) return 0; const [a, b] = t.split(":").map(Number); return a + (b || 0) / 60; };
      return (await byEmployees(emps, ids => db.from("shifts").select("employee_id,date,start_time,end_time,break_minutes,status").in("employee_id", ids).gte("date", ctx.range.from).lte("date", ctx.range.to).order("date")))
        .map(s => { let hrs = h(s.end_time) - h(s.start_time); if (hrs < 0) hrs += 24; return { date: s.date, name: by[s.employee_id]?.name || "", department: by[s.employee_id]?.department || "", start: t12(s.start_time), end: t12(s.end_time), break_minutes: n(s.break_minutes), hours: r2(Math.max(0, hrs - n(s.break_minutes) / 60)), status: pretty(s.status) }; });
    },
    summary: rows => [["Shifts", rows.length], ["Rostered hours", sum(rows, "hours")]],
  },
  {
    key: "leave", group: "Staff & labour", label: "Leave & availability requests", description: "Requests overlapping the period",
    columns: [
      { key: "name", label: "Employee" }, { key: "request_type", label: "Type" }, { key: "start_date", label: "From", type: "date" },
      { key: "end_date", label: "To", type: "date" }, { key: "status", label: "Status" }, { key: "reason", label: "Reason" },
    ],
    load: async ctx => {
      const emps = await ctx.employees();
      const by = Object.fromEntries(emps.map(e => [e.id, e]));
      return (await byEmployees(emps, ids => db.from("employee_requests").select("employee_id,request_type,start_date,end_date,status,reason").in("employee_id", ids).lte("start_date", ctx.range.to).order("start_date")))
        .filter(q => (q.end_date || q.start_date) >= ctx.range.from)
        .map(q => ({ ...q, name: by[q.employee_id]?.name || "", request_type: pretty(q.request_type), status: pretty(q.status) }));
    },
    summary: rows => [["Requests", rows.length], ...countBy(rows, "status").map(([k, v]) => [`Status: ${k}`, v] as [string, number])],
  },
  {
    key: "contractor_invoices", group: "Staff & labour", label: "Contractor invoices", description: "Generated staff invoices by week start",
    columns: [
      { key: "week_start", label: "Week start", type: "date" }, { key: "employee_name", label: "Contractor" }, { key: "invoice_number", label: "Invoice #" },
      { key: "net_hours", label: "Hours", type: "num" }, { key: "amount", label: "Amount", type: "money" },
    ],
    load: async ({ bid, range }) => all(() => db.from("invoices").select("*").eq("business_id", bid).gte("week_start", range.from).lte("week_start", range.to).order("week_start")),
    summary: rows => [["Invoices", rows.length], ["Hours", sum(rows, "net_hours")], ["Total", sum(rows, "amount")]],
  },
  {
    key: "employees", group: "Staff & labour", label: "Staff list", description: "All employees and pay rates",
    columns: [
      { key: "name", label: "Name" }, { key: "department", label: "Department" }, { key: "position", label: "Position" },
      { key: "email", label: "Email" }, { key: "phone", label: "Phone" }, { key: "pay_rate", label: "Pay rate", type: "money" },
      { key: "admin_hourly_rate", label: "Admin rate", type: "money" }, { key: "active", label: "Active" },
    ],
    load: async ctx => (await ctx.employees()).map(e => ({ ...e, active: e.active === false ? "No" : "Yes" })),
    summary: rows => [["Employees", rows.length], ["Active", rows.filter(r => r.active === "Yes").length], ...countBy(rows, "department").map(([k, v]) => [`Dept: ${k}`, v] as [string, number])],
  },
  // ---------- Compliance ----------
  {
    key: "fsl_entries", group: "Compliance", label: "Food safety log entries", description: "HACCP entries in the period",
    columns: [
      { key: "entry_date", label: "Date", type: "date" }, { key: "time", label: "Logged at" }, { key: "form", label: "Form" },
      { key: "check_key", label: "Check" }, { key: "staff_name", label: "Staff" }, { key: "status", label: "Status" },
      { key: "out_of_range", label: "Out of range" }, { key: "values", label: "Readings" },
    ],
    load: async ({ bid, range }) => {
      const forms = await all(() => db.from("fsl_forms").select("id,name").eq("business_id", bid));
      const fn = Object.fromEntries(forms.map(f => [f.id, f.name]));
      return (await all(() => db.from("fsl_entries").select("entry_date,created_at,form_id,check_key,staff_name,finished_by_name,status,out_of_range,field_values")
        .eq("business_id", bid).gte("entry_date", range.from).lte("entry_date", range.to).order("entry_date")))
        .map(e => ({
          ...e, time: sydTime(e.created_at), form: fn[e.form_id] || "", check_key: pretty(e.check_key), staff_name: e.staff_name || e.finished_by_name || "",
          status: pretty(e.status), out_of_range: e.out_of_range ? "Yes" : "No",
          values: e.field_values && typeof e.field_values === "object" ? Object.entries(e.field_values).map(([k, v]) => `${pretty(k)}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join("; ") : "",
        }));
    },
    summary: rows => [["Entries", rows.length], ["Out of range", rows.filter(r => r.out_of_range === "Yes").length], ...countBy(rows, "form").map(([k, v]) => [`Form: ${k}`, v] as [string, number])],
  },
  {
    key: "maintenance", group: "Compliance", label: "Service & maintenance", description: "Equipment servicing schedule",
    columns: [
      { key: "name", label: "Item" }, { key: "last_service_date", label: "Last service", type: "date" },
      { key: "next_service_date", label: "Next service", type: "date" }, { key: "state", label: "Status" },
    ],
    load: async ({ bid }) => {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
      return (await all(() => db.from("service_maintenance_tasks").select("*").eq("business_id", bid).order("next_service_date")))
        .filter(m => m.active !== false)
        .map(m => ({ ...m, state: !m.next_service_date ? "Not scheduled" : m.next_service_date < today ? "Overdue" : m.next_service_date <= addDays(today, 14) ? "Due within 14 days" : "OK" }));
    },
    summary: rows => countBy(rows, "state"),
  },
  {
    key: "documents", group: "Compliance", label: "Staff documents", description: "Certificates and IDs with expiry",
    columns: [
      { key: "name", label: "Employee" }, { key: "doc", label: "Document" }, { key: "status", label: "Verification" },
      { key: "expiry_date", label: "Expiry", type: "date" }, { key: "state", label: "Expiry status" },
    ],
    load: async ctx => {
      const emps = await ctx.employees();
      const by = Object.fromEntries(emps.map(e => [e.id, e]));
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
      return (await all(() => db.from("employee_documents").select("employee_id,category,custom_label,expiry_date,status").eq("business_id", ctx.bid).order("expiry_date")))
        .map(d => ({ name: by[d.employee_id]?.name || "", doc: d.custom_label || pretty(d.category), status: pretty(d.status), expiry_date: d.expiry_date || "", state: !d.expiry_date ? "No expiry" : d.expiry_date < today ? "Expired" : d.expiry_date <= addDays(today, 30) ? "Expires within 30 days" : "Valid" }));
    },
    summary: rows => [["Documents", rows.length], ...countBy(rows, "state"), ...countBy(rows, "status").map(([k, v]) => [`Verification: ${k}`, v] as [string, number])],
  },
  // ---------- Inventory ----------
  ...(["foh", "bar"] as const).flatMap(area => {
    const items = area === "foh" ? "inventory_items" : "bar_inventory_items";
    const orders = area === "foh" ? "inventory_orders" : "bar_inventory_orders";
    const name = area === "foh" ? "FOH" : "Bar";
    const stockCols: Col[] = [
      { key: "name", label: "Item" }, { key: "category", label: "Category" }, { key: "current_count", label: "On hand", type: "num" },
      { key: "min_count", label: "Par level", type: "num" }, { key: "unit", label: "Unit" }, { key: "state", label: "Status" },
    ];
    return [
      {
        key: `${area}_stock`, group: "Inventory", label: `${name} stock levels`, description: `Current ${name} stock vs par`,
        columns: stockCols,
        load: async ({ bid }: Ctx) => (await all(() => db.from(items).select("*").eq("business_id", bid).order("name")))
          .map(i => ({ ...i, state: n(i.current_count) < n(i.min_count) ? "Below par" : "OK" })),
        summary: (rows: Row[]) => [["Items", rows.length], ["Below par", rows.filter(r => r.state === "Below par").length]] as [string, number][],
      },
      {
        key: `${area}_orders`, group: "Inventory", label: `${name} orders`, description: `${name} stock orders raised in the period`,
        columns: [
          { key: "date", label: "Requested", type: "date" }, { key: "item", label: "Item" }, { key: "quantity", label: "Qty", type: "num" },
          { key: "unit", label: "Unit" }, { key: "status", label: "Status" }, { key: "notes", label: "Notes" },
        ],
        load: async ({ bid, range }: Ctx) => {
          const its = await all(() => db.from(items).select("id,name,unit").eq("business_id", bid));
          const by = Object.fromEntries(its.map(i => [i.id, i]));
          return (await all(() => db.from(orders).select("*").eq("business_id", bid).gte("created_at", tsFrom(range)).lt("created_at", tsTo(range)).order("created_at")))
            .map(o => ({ ...o, date: sydDate(o.created_at), item: by[o.item_id]?.name || "", unit: by[o.item_id]?.unit || "", status: pretty(o.status) }));
        },
        summary: (rows: Row[]) => [["Orders", rows.length], ...countBy(rows, "status")] as [string, number][],
      },
    ] as Dataset[];
  }),
];
