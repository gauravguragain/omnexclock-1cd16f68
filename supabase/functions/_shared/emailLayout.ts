// Shared branded email frame. Every email the app sends is wrapped by renderBrandedEmail
// so all messages share the Regal look (charcoal band, gold accents, ivory card).

export interface EmailBrand {
  name: string;
  logoUrl?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  website?: string | null;
}

export const C = {
  ink: "#17191E",
  gold: "#AC845D",
  goldDark: "#916942",
  goldSoft: "#C9A96E",
  ivory: "#FCFCFC",
  sand: "#F6F1EA",
  line: "#E6DCCF",
  text: "#2D2C2C",
  muted: "#6B6660",
  page: "#EFEDEA",
  red: "#A1322B",
};
export const SERIF = "'Marcellus','Cormorant Garamond',Georgia,'Times New Roman',serif";
export const SANS = "'Barlow','Helvetica Neue',Helvetica,Arial,sans-serif";

export const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const DEFAULT_WEBSITE = "https://www.regalpavilion.com.au";

/** Fetch branding for a business (by id, or by exact name as a fallback). */
export async function loadBrand(db: any, opts: { businessId?: string | null; businessName?: string | null }): Promise<EmailBrand> {
  const fallback: EmailBrand = { name: opts.businessName || "Pro Regal Management" };
  try {
    let q = db.from("businesses").select("name, logo_url, phone, email, address");
    if (opts.businessId) q = q.eq("id", opts.businessId);
    else if (opts.businessName) q = q.eq("name", opts.businessName);
    else return fallback;
    const { data } = await q.limit(1).maybeSingle();
    if (!data) return fallback;
    return { name: data.name || fallback.name, logoUrl: data.logo_url, phone: data.phone, email: data.email, address: data.address };
  } catch {
    return fallback;
  }
}

export const p = (html: string) => `<p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.7;color:${C.text};">${html}</p>`;
export const small = (html: string) => `<p style="margin:0 0 14px;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.muted};">${html}</p>`;
export const heading = (text: string) => `<h3 style="margin:26px 0 12px;font-family:${SERIF};font-weight:400;font-size:19px;color:${C.ink};letter-spacing:.5px;">${text}</h3>`;

/** Label/value table. Values are escaped unless raw=true. Empty values are skipped. */
export function details(rows: [string, unknown, { bold?: boolean; raw?: boolean; color?: string }?][]): string {
  const r = rows.filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (!r.length) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-collapse:collapse;margin:8px 0 22px;">${r
    .map(([k, v, o], i) => `<tr style="background:${i % 2 ? C.sand : "#FFFFFF"};"><td style="padding:11px 16px;font-family:${SANS};font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${C.goldDark};width:40%;vertical-align:top;">${esc(k)}</td><td style="padding:11px 16px;font-family:${SANS};font-size:14px;color:${o?.color || C.ink};${o?.bold ? "font-weight:700;" : ""}">${o?.raw ? String(v) : esc(v)}</td></tr>`)
    .join("")}</table>`;
}

export function button(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:26px auto;"><tr><td style="background:${C.gold};border-radius:2px;"><a href="${esc(url)}" style="display:inline-block;padding:14px 34px;font-family:${SANS};font-size:13px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#FFFFFF;text-decoration:none;">${esc(label)}</a></td></tr></table>`;
}

/** Soft callout box. tone: gold (default) or red. */
export function note(html: string, tone: "gold" | "red" = "gold"): string {
  const bar = tone === "red" ? C.red : C.gold;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 20px;"><tr><td style="border-left:3px solid ${bar};background:${C.sand};padding:14px 18px;font-family:${SANS};font-size:13px;line-height:1.65;color:${C.text};">${html}</td></tr></table>`;
}

export function signoff(brand: EmailBrand): string {
  return `<p style="margin:26px 0 0;font-family:${SANS};font-size:15px;line-height:1.7;color:${C.text};">Warm regards,<br/><span style="font-family:${SERIF};font-size:18px;color:${C.goldDark};">The ${esc(brand.name)} team</span></p>`;
}

export interface BrandedEmailOptions {
  brand: EmailBrand;
  eyebrow?: string; // small caps line under the logo e.g. "Event Confirmation"
  title: string;
  preheader?: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  width?: number;
  footerNote?: string;
}

export function renderBrandedEmail(o: BrandedEmailOptions): string {
  const w = o.width || 600;
  const b = o.brand;
  const logo = b.logoUrl
    ? `<img src="${esc(b.logoUrl)}" alt="${esc(b.name)}" height="64" style="display:block;margin:0 auto 12px;max-height:64px;max-width:220px;border:0;" />`
    : "";
  const contact = [b.address, b.phone, b.email ? `<a href="mailto:${esc(b.email)}" style="color:${C.goldSoft};text-decoration:none;">${esc(b.email)}</a>` : ""]
    .filter(Boolean)
    .map((x, i) => (i < 2 && x !== b.email ? esc(x) : x))
    .join(" &nbsp;·&nbsp; ");
  const site = b.website || DEFAULT_WEBSITE;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="color-scheme" content="light only"/><meta name="supported-color-schemes" content="light"/><title>${esc(o.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Marcellus&family=Barlow:wght@400;600;700&display=swap" rel="stylesheet"/></head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%;">
${o.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(o.preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${w}px;background:${C.ivory};">
<tr><td align="center" style="background:${C.ink};padding:32px 24px 26px;">
${logo}<div style="font-family:${SERIF};font-size:24px;letter-spacing:4px;text-transform:uppercase;color:${C.gold};">${esc(b.name)}</div>
${o.eyebrow ? `<div style="margin-top:8px;font-family:${SANS};font-size:11px;letter-spacing:4px;text-transform:uppercase;color:${C.goldSoft};">${esc(o.eyebrow)}</div>` : ""}
</td></tr>
<tr><td style="height:3px;line-height:3px;font-size:0;background:${C.gold};">&nbsp;</td></tr>
<tr><td style="padding:40px 40px 34px;">
<h1 style="margin:0;font-family:${SERIF};font-weight:400;font-size:28px;line-height:1.25;color:${C.ink};">${esc(o.title)}</h1>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0 24px;"><tr><td style="width:48px;height:2px;line-height:2px;font-size:0;background:${C.gold};">&nbsp;</td></tr></table>
${o.bodyHtml}
${o.cta ? button(o.cta.label, o.cta.url) : ""}
</td></tr>
<tr><td align="center" style="background:${C.ink};padding:26px 24px;font-family:${SANS};font-size:12px;line-height:1.8;color:#B9B4AD;">
<div style="font-family:${SERIF};font-size:16px;letter-spacing:2px;color:${C.gold};">${esc(b.name)}</div>
${contact ? `<div>${contact}</div>` : ""}
<div><a href="${esc(site)}" style="color:${C.goldSoft};text-decoration:none;">${esc(site.replace(/^https?:\/\//, ""))}</a></div>
${o.footerNote ? `<div style="margin-top:8px;color:#8E8983;font-size:11px;">${o.footerNote}</div>` : ""}
<div style="margin-top:10px;color:#6F6A64;font-size:10px;letter-spacing:1px;">Sent by Pro Regal Management</div>
</td></tr>
</table></td></tr></table></body></html>`;
}
