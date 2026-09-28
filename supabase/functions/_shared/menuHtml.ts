// Shared by the app (print view) and the send-email function (email body).
// Pure TypeScript, no runtime-specific imports.
export type MenuItem = { name: string; tag?: string; price?: number | null; note?: string };
export type MenuCourse = { name: string; note?: string; items: MenuItem[] };
export type MenuSection = { title: string; subtitle?: string; description?: string; courses: MenuCourse[] };
export type MenuDoc = { businessName?: string; title?: string; recipientName?: string; message?: string; logoUrl?: string; sections: MenuSection[] };

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const money = (n: number) => `$${n.toFixed(2)}`;
const GOLD = "#c9a45c", INK = "#0d0d0d", PANEL = "#151515", MUTED = "#a89a80";

export function renderMenuHtml(doc: MenuDoc, opts: { forEmail?: boolean } = {}): string {
  const biz = esc(doc.businessName || "Pro Regal");
  const sections = doc.sections.map((s) => `
    <div class="menu-section" style="margin:0 0 34px;padding:30px 30px 22px;background:${PANEL};border:1px solid ${GOLD}55;border-radius:4px;page-break-inside:avoid;break-inside:avoid;">
      ${s.subtitle ? `<p style="margin:0 0 6px;text-align:center;color:${MUTED};font-size:10px;letter-spacing:4px;text-transform:uppercase;">${esc(s.subtitle)}</p>` : ""}
      <h2 style="margin:0;text-align:center;color:${GOLD};font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:26px;letter-spacing:1px;">${esc(s.title)}</h2>
      <div style="width:60px;height:1px;background:${GOLD};margin:12px auto 14px;"></div>
      ${s.description ? `<p style="margin:0 0 16px;text-align:center;color:#d8d0c0;font-size:13px;font-style:italic;">${esc(s.description)}</p>` : ""}
      ${s.courses.map((c) => `
        <div style="margin:18px 0 6px;">
          <p style="margin:0;text-align:center;color:${GOLD};font-size:12px;letter-spacing:3px;text-transform:uppercase;font-weight:bold;">${esc(c.name)}</p>
          ${c.note ? `<p style="margin:3px 0 0;text-align:center;color:${MUTED};font-size:11px;font-style:italic;">${esc(c.note)}</p>` : ""}
          <table style="width:100%;border-collapse:collapse;margin-top:8px;">
            ${c.items.map((i) => `<tr>
              <td style="padding:5px 0;color:#f3ede2;font-family:Georgia,serif;font-size:14px;border-bottom:1px dotted #3a3428;">${esc(i.name)}${i.tag ? ` <span style="color:${GOLD};font-size:10px;letter-spacing:1px;">${esc(i.tag)}</span>` : ""}${i.note ? `<br><span style="color:${MUTED};font-size:11px;font-style:italic;">${esc(i.note)}</span>` : ""}</td>
              <td style="padding:5px 0;color:${GOLD};font-size:13px;text-align:right;white-space:nowrap;border-bottom:1px dotted #3a3428;">${i.price != null && !isNaN(Number(i.price)) ? money(Number(i.price)) : ""}</td>
            </tr>`).join("")}
          </table>
        </div>`).join("")}
    </div>`).join("");

  const intro = opts.forEmail ? `
    <div style="padding:0 6px 22px;color:#e8e0d0;font-size:14px;line-height:1.6;">
      <p style="margin:0 0 10px;">Dear ${esc(doc.recipientName || "Guest")},</p>
      <p style="margin:0;">Thank you for your interest in ${biz}. Please find our menu below.</p>
      ${doc.message ? `<p style="margin:12px 0 0;white-space:pre-line;">${esc(doc.message)}</p>` : ""}
    </div>` : "";

  return `
  <div style="background:${INK};padding:36px 22px;font-family:'Segoe UI',Arial,sans-serif;">
    <div style="max-width:680px;margin:0 auto;">
      <div style="text-align:center;padding:10px 0 26px;border-bottom:1px solid ${GOLD};margin-bottom:28px;">
        ${doc.logoUrl ? `<img src="${esc(doc.logoUrl)}" alt="${biz}" style="height:64px;margin-bottom:10px;">` : ""}
        <h1 style="margin:0;color:${GOLD};font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:34px;letter-spacing:6px;text-transform:uppercase;">${biz}</h1>
        <p style="margin:8px 0 0;color:${MUTED};font-size:11px;letter-spacing:5px;text-transform:uppercase;">${esc(doc.title || "Menu")}</p>
      </div>
      ${intro}
      ${sections || `<p style="color:${MUTED};text-align:center;">No menu items selected.</p>`}
      <div style="text-align:center;border-top:1px solid ${GOLD}55;padding-top:16px;margin-top:10px;">
        <p style="margin:0;color:${MUTED};font-size:10px;letter-spacing:3px;text-transform:uppercase;">${biz} · regalmanagement.com.au</p>
        <p style="margin:6px 0 0;color:#6f6656;font-size:10px;">Menu and pricing subject to change. Please advise us of any dietary requirements or allergies.</p>
      </div>
    </div>
  </div>`;
}
