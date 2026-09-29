import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { renderBrandedEmail, loadBrand, details, note, p, small, esc, button, heading } from "../_shared/emailLayout.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const DEFAULT_TERMS = "Terms & Conditions \n\nClient Responsibilities When Hiring a Function Hall with Pro Regal Pavilion\n\nAt Pro Regal Pavilion, we aim to ensure every event is executed smoothly and successfully. To support us in achieving this, we request all clients adhere to the following responsibilities when hiring our function hall:\n\n1. Booking and Payment Responsibilities\n\nBooking Confirmation: A deposit is required to confirm your booking. Until the deposit is received, the reservation remains tentative.\n\nFull Payment: The remaining balance must be paid according to the agreed timeline, typically no later than 7 days prior to the event, unless otherwise arranged in writing.\n\nCancellations: All cancellations must be made in writing. Please note that the initial deposit is non-refundable.\n\nInsurance: Clients may be required to provide proof of event insurance, especially for large-scale or high-risk events.\n\n2. Compliance with Laws and Venue Regulations\n\nPermits and Licenses: Clients are responsible for obtaining any necessary permits (e.g., for entertainment or live performances) and ensuring compliance with local council regulations, particularly for larger events.\n\nAlcohol Service: If alcohol is served, RSA (Responsible Service of Alcohol) requirements must be followed. An RSA-certified staff member may be required on-site.\n\nFor events with unlimited beverage packages, drinks will be served only from the bar; no table service will be provided.\n\nUnlimited beverage packages apply to the first 3 hours of the event duration only.\n\nNoise Restrictions: Clients must comply with local council regulations and venue policies regarding noise levels to avoid disturbances.\n\n3. Venue Usage and Care\n\nVenue Access: Access to the venue will be granted only for the agreed-upon times. Additional time may incur extra charges.\n\nSet-Up and Pack-Down: The client is responsible for arranging the setup and removal of decorations, equipment, and personal items within the allocated time unless prior arrangements are made.\n\nCleaning: A cleaning fee may apply if the venue is left excessively littered or messy.\n\nDamage and Loss: Any damage to the property, equipment, or furniture caused by the client or their guests will be the client’s responsibility. Repair or replacement costs will apply.\n\n4. Safety and Security\n\nGuest Conduct: The client is responsible for the behavior of their guests. Pro Regal Pavilion reserves the right to terminate the event immediately if there is disruptive or unlawful behavior.\n\nCapacity Limits: The client must ensure the number of attendees does not exceed the venue’s maximum capacity, as specified in the booking agreement.\n\nEmergency Procedures: The client must familiarize themselves with the venue’s emergency exits and safety procedures. A guest list may be required for safety or security purposes.\n\nSupervision of Children: If children are present, the client must ensure adequate supervision by responsible adults throughout the event.\n\n5. Catering and Vendor Coordination\n\nApproved Vendors: Any catering or additional vendors arranged by the client must be approved by Pro Regal Pavilion.\n\nVendor Coordination: Clients are responsible for coordinating with vendors regarding arrival, set-up, and pack-down times.\n\nFood and Beverage Regulations: No outside food or beverages are permitted unless prior written permission is granted. Corkage or additional fees may apply if exceptions are made.\n\nVendor Clean-Up: Vendors must leave the space in good condition and remove all equipment at the end of the event.\n\n6. Event Timing and Schedule\n\nAdherence to Schedule: The event must run according to the agreed schedule to avoid disruption or additional fees.\n\nOvertime Charges: Use of the venue beyond the agreed time will incur extra charges as outlined in the booking agreement.\n\n7. Communication and Changes\n\nEvent Changes: Any changes to the event schedule, guest numbers, or layout must be communicated in writing as soon as possible.\n\nFinal Confirmation: All event details, including catering, seating arrangements, and audiovisual requirements, must be finalized at least 7 days prior to the event.\n\nPoint of Contact: A designated point of contact must be available on the day of the event to liaise with venue staff regarding any issues that may arise.\n\n8. Liability and Indemnity\n\nLiability Waiver: Pro Regal Pavilion will not be held liable for any loss, injury, or damage to persons or property during the event, except where caused by negligence of venue staff.\n\nIndemnity: The client agrees to indemnify and hold Pro Regal Pavilion harmless from any claims, damages, or legal actions arising from the event or related activities.\n\nBy adhering to these responsibilities, we ensure a seamless experience for everyone involved. If you have any questions or need further clarification, please do not hesitate to contact us.\n\nWe look forward to hosting your event at Pro Regal Pavilion!\n\nAcknowledgment:\nAll clients are required to sign the booking agreement, confirming their understanding and acceptance of these responsibilities.\n\nPro Regal Pavilion Management";
async function loadBeverageDetail(db: any, businessId: string, packageName?: string | null) {
  if (!businessId || !packageName) return null;
  const { data: pkg } = await db.from("crm_packages").select("id, name, description, subtitle, menu_title, price_label").eq("business_id", businessId).eq("name", packageName).eq("package_type", "beverage").limit(1).maybeSingle();
  if (!pkg) return null;
  const { data: courses } = await db.from("crm_package_courses").select("id, name, picks, notes, sort_order").eq("package_id", pkg.id).order("sort_order");
  const ids = (courses || []).map((c: any) => c.id);
  const { data: rows } = ids.length ? await db.from("crm_package_course_items").select("course_id, drink_id, dish_id").in("course_id", ids) : { data: [] };
  const drinkIds = [...new Set((rows || []).map((r: any) => r.drink_id).filter(Boolean))];
  const dishIds = [...new Set((rows || []).map((r: any) => r.dish_id).filter(Boolean))];
  const [drinks, dishes] = await Promise.all([
    drinkIds.length ? db.from("crm_drinks").select("id, name").in("id", drinkIds) : { data: [] },
    dishIds.length ? db.from("crm_dishes").select("id, name").in("id", dishIds) : { data: [] },
  ]);
  const names: Record<string, string> = {};
  for (const x of [...(drinks.data || []), ...(dishes.data || [])]) names[x.id] = x.name;
  return {
    name: pkg.name, description: pkg.description || pkg.subtitle || "",
    sections: (courses || []).map((c: any) => ({
      name: c.name, notes: c.notes || "", picks: c.picks,
      items: (rows || []).filter((r: any) => r.course_id === c.id).map((r: any) => names[r.drink_id || r.dish_id]).filter(Boolean).sort((a: string, b: string) => a.localeCompare(b)),
    })),
  };
}

const UUID = /^[0-9a-f-]{36}$/i;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
async function handleSign(req: Request) {
  const b = await req.json().catch(() => null);
  const id = String(b?.id || ""), t = String(b?.t || ""), name = String(b?.name || "").trim(), date = String(b?.date || ""), signature = String(b?.signature || "");
  if (!UUID.test(id) || !UUID.test(t)) return json({ error: "Invalid link" }, 400);
  if (!name || name.length > 100) return json({ error: "Please enter your name" }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "Please choose a date" }, 400);
  if (!signature.startsWith("data:image/png;base64,") || signature.length > 600000) return json({ error: "Please sign again" }, 400);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: rs } = await db.from("crm_runsheets").select("id, business_id, lead_id, internal_share_token, event_order_number, revision, client_signed_at").eq("id", id).eq("share_token", t).maybeSingle();
  if (!rs) return json({ error: "Run sheet not found" }, 404);
  if (rs.client_signed_at) return json({ error: "This run sheet has already been signed" }, 409);
  const patch = { client_sign_name: name, client_sign_date: date, client_signature: signature, client_signed_at: new Date().toISOString() };
  const { error } = await db.from("crm_runsheets").update(patch).eq("id", id);
  if (error) { console.error(error); return json({ error: "Could not save signature" }, 500); }
  const [settings, biz, lead] = await Promise.all([
    db.from("crm_settings").select("signed_runsheet_email").eq("business_id", rs.business_id).maybeSingle(),
    db.from("businesses").select("name, email, logo_url, phone, address").eq("id", rs.business_id).maybeSingle(),
    rs.lead_id ? db.from("crm_leads").select("full_name, event_type").eq("id", rs.lead_id).maybeSingle() : { data: null },
  ]);
  if (rs.lead_id) await db.from("crm_interactions").insert({ business_id: rs.business_id, lead_id: rs.lead_id, interaction_type: "note", occurred_at: patch.client_signed_at, notes: `Client signed the run sheet online (${name}, ${date}).` });
  const to = settings.data?.signed_runsheet_email || biz.data?.email;
  const key = Deno.env.get("RESEND_API_KEY");
  if (to && key) {
    const link = `https://regalmanagement.com.au/runsheet/${rs.id}?t=${rs.internal_share_token}`;
    const client = lead.data?.full_name || name;
    const bd: any = biz.data || {};
    const html = renderBrandedEmail({
      brand: { name: bd.name || "Pro Regal Management", logoUrl: bd.logo_url, phone: bd.phone, email: bd.email, address: bd.address },
      eyebrow: "Run Sheet Signed", title: "Run sheet signed", preheader: `${client} has signed their run sheet`,
      bodyHtml: p(`<strong>${esc(client)}</strong> has signed their run sheet${rs.event_order_number ? ` (Event order ${esc(rs.event_order_number)})` : ""}.`) +
        details([["Signed by", name], ["Date", date]]) + button("View signed run sheet", link),
    });
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ from: `${biz.data?.name || "Pro Regal Management"} <noreply@regalmanagement.com.au>`, to: [to], subject: `Signed run sheet — ${client}`, html }) });
    if (!r.ok) console.error("Resend error", r.status, await r.text());
  }
  return json({ ok: true, rs: patch });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method === "POST") return await handleSign(req);
    const url = new URL(req.url);
    const id = url.searchParams.get("id") || ""; const t = url.searchParams.get("t") || "";
    if (!UUID.test(id) || !UUID.test(t)) return json({ error: "Invalid link" }, 400);
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: rs } = await db.from("crm_runsheets").select("*").eq("id", id).or(`share_token.eq.${t},internal_share_token.eq.${t}`).maybeSingle();
    if (!rs) return json({ error: "Run sheet not found" }, 404);
    const internal = rs.internal_share_token === t;
    const [lead, booking, biz, sel, settings] = await Promise.all([
      rs.lead_id ? db.from("crm_leads").select("full_name, phone, event_type, venue_space").eq("id", rs.lead_id).maybeSingle() : { data: null },
      rs.booking_id ? db.from("crm_bookings").select("event_date, start_time, end_time, duration_minutes, venue_space, event_type, booking_kind, fulfilment_method, service_location, event_name, kids, kids_5_to_10, kids_under_5").eq("id", rs.booking_id).maybeSingle()
        : rs.lead_id ? db.from("crm_bookings").select("event_date, start_time, end_time, duration_minutes, venue_space, event_type, booking_kind, fulfilment_method, service_location, event_name, kids, kids_5_to_10, kids_under_5").eq("lead_id", rs.lead_id).limit(1).maybeSingle() : { data: null },
      db.from("businesses").select("name, phone, email").eq("id", rs.business_id).maybeSingle(),
      rs.lead_id ? db.from("crm_menu_selections").select("id, beverage_package, corkage_enabled, corkage_note, dietary_requirements, allergies").eq("lead_id", rs.lead_id).order("updated_at", { ascending: false }).limit(1).maybeSingle() : { data: null },
      db.from("crm_settings").select("runsheet_terms, runsheet_terms_enabled").eq("business_id", rs.business_id).maybeSingle(),
    ]);
    let items: unknown[] = [];
    if (sel.data?.id) {
       const r = await db.from("crm_menu_selection_items").select("id, course, item_name, notes, quantity, service_start_time, service_end_time, created_at").eq("selection_id", sel.data.id).order("created_at");
      items = r.data || [];
      (sel.data as any).beverage_detail = await loadBeverageDetail(db, rs.business_id, sel.data.beverage_package);
    }
    // strip anything price-related and internal
    const { share_token: _s, internal_share_token: _i, ops_notes: _o, foh_notes: _f, distributed_to: _d, ...safe } = rs;
    return json({ rs: internal ? { ...safe, ops_notes: _o, foh_notes: _f } : safe, internal, lead: lead.data, booking: booking.data, businessName: biz.data?.name || "", businessPhone: biz.data?.phone || "", businessEmail: biz.data?.email || "", selection: sel.data, items, terms: booking.data?.booking_kind === "catering" || settings.data?.runsheet_terms_enabled === false ? null : (settings.data?.runsheet_terms?.trim() || DEFAULT_TERMS) });
  } catch (e) {
    console.error(e);
    return json({ error: "Unable to load run sheet" }, 500);
  }
});
