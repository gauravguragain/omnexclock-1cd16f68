// Shared by the app (print view, online menu) and the send-email function (email body).
// Pure TypeScript, no runtime-specific imports. Layout follows the Pro Regal "Western Menu" sample:
// ivory page, gold script title, package badge, price box, course counts, overview table,
// then one block per course with Vegetarian / Non-vegetarian / Seafood groups in two columns.
export type MenuItem = { name: string; tag?: string; price?: number | null; note?: string };
export type MenuGroup = { label?: string; choose?: number | null; items: MenuItem[] };
export type MenuCourse = { name: string; total?: number | null; breakdown?: string; note?: string; groups?: MenuGroup[]; items?: MenuItem[] };
export type MenuSection = {
  title: string; subtitle?: string; description?: string; courses: MenuCourse[];
  book?: string; menuTitle?: string; styleLabel?: string; tier?: string; priceLabel?: string; kind?: "package" | "drinks";
};
export type MenuDoc = { businessName?: string; title?: string; recipientName?: string; message?: string; logoUrl?: string; viewUrl?: string; sections: MenuSection[] };

type R = Record<string, any>;
export type MenuRows = { books: R[]; packages: R[]; courses: R[]; items: R[]; drinks?: R[] };

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
export const MENU_COLORS = { GOLD: "#a8822e", GOLD_SOFT: "#c9a45c", INK: "#2b2620", PAPER: "#fdfbf6", LINE: "#e8dcc2", MUTED: "#8a7f6d" };
const { GOLD, GOLD_SOFT, INK, PAPER, LINE, MUTED } = MENU_COLORS;
const SCRIPT = "'Great Vibes','Pinyon Script','Brush Script MT',cursive";
const SERIF = "'Playfair Display',Georgia,'Times New Roman',serif";
const SANS = "Montserrat,'Segoe UI',Arial,sans-serif";
export const MENU_FONTS_LINK = "https://fonts.googleapis.com/css2?family=Great+Vibes&family=Montserrat:wght@400;500;600&family=Playfair+Display:wght@400;600&display=swap";

const DIET_GROUPS: [string, string, string][] = [["veg", "Vegetarian", "veg_picks"], ["nonveg", "Non-vegetarian", "non_veg_picks"], ["seafood", "Seafood", "seafood_picks"]];
const dietOf = (d: unknown) => { const s = String(d || "veg").toLowerCase(); return s.startsWith("sea") ? "seafood" : s.startsWith("non") || s === "meat" ? "nonveg" : "veg"; };

/** Turns package rows (from the app or the public share RPC) into printable sections. */
export function buildSectionsFromRows(d: MenuRows, packageIds: string[] | null, includeDrinks: boolean): MenuSection[] {
  const out: MenuSection[] = [];
  const books = [...d.books].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const pkgs = books.flatMap((b) => d.packages.filter((p) => p.book_id === b.id && (packageIds ? packageIds.includes(p.id) : p.active !== false)));
  for (const p of pkgs) {
    const book = books.find((b) => b.id === p.book_id);
    const bev = p.package_type === "beverage";
    const courses = d.courses.filter((c) => c.package_id === p.id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((c): MenuCourse => {
      const items = d.items.filter((ci) => ci.course_id === c.id).map((ci) => {
        const extra = Number(ci.extra_price_per_head) > 0 ? `+${money(Number(ci.extra_price_per_head))} per person` : "";
        const prot = (ci.protein_options || []).length ? `Choice of ${(ci.protein_options as string[]).join(", ")}` : "";
        return { diet: dietOf(ci.diet), item: { name: ci.name, note: [prot, extra].filter(Boolean).join(" · ") || undefined } as MenuItem };
      }).filter((x) => x.item.name);
      const hasDietPicks = !bev && DIET_GROUPS.some(([, , col]) => c[col] != null);
      let groups: MenuGroup[];
      if (hasDietPicks) {
        groups = DIET_GROUPS.map(([k, label, col]) => ({ label, choose: c[col], items: items.filter((x) => x.diet === k).map((x) => x.item) })).filter((g) => g.items.length);
      } else groups = [{ items: items.map((x) => x.item) }];
      const dietTotal = DIET_GROUPS.reduce((s, [, , col]) => s + (Number(c[col]) || 0), 0);
      const total = c.picks ?? (dietTotal || null);
      const parts = DIET_GROUPS.filter(([, , col]) => Number(c[col]) > 0).map(([, label, col]) => `${c[col]} ${label}`);
      const breakdown = c.notes || (parts.length ? parts.join(" + ") : total ? `Any ${total} ${String(c.name).toLowerCase()}` : "");
      return { name: c.name, total, breakdown: breakdown || undefined, groups };
    }).filter((c) => c.groups!.some((g) => g.items.length));
    const price = Number(p.price_per_head) > 0 ? money(Number(p.price_per_head)) : "";
    out.push({ kind: "package", title: p.name, book: book?.name, subtitle: book?.name, menuTitle: p.menu_title || book?.name || p.name, styleLabel: p.style_label || undefined, tier: p.subtitle || undefined, priceLabel: p.price_label || price || undefined, description: p.description || undefined, courses });
  }
  if (includeDrinks && d.drinks) {
    const active = d.drinks.filter((x) => x.active !== false);
    const kindLabel = (k: string) => k === "soft" ? "Soft drinks" : k === "hard" ? "Beer, wine & spirits" : k.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
    const kinds = [...new Set(active.map((x) => String(x.kind || "soft").trim() || "soft"))].sort((a, b) => (a === "soft" ? -1 : b === "soft" ? 1 : a === "hard" ? -1 : b === "hard" ? 1 : a.localeCompare(b)));
    const groups = kinds.map((k) => ({ label: kindLabel(k), items: active.filter((x) => (String(x.kind || "soft").trim() || "soft") === k).map((x) => ({ name: x.name, price: x.price != null ? Number(x.price) : null })) })).filter((g) => g.items.length);
    if (groups.length) out.push({ kind: "drinks", title: "Drinks list", menuTitle: "Drinks", styleLabel: "Bar · Beverages", courses: [{ name: "Beverages", groups }] });
  }
  return out;
}

const pill = (t: string) => `<span style="display:inline-block;padding:3px 14px;border-radius:999px;background:${GOLD};color:#fff;font-family:${SANS};font-size:9px;font-weight:600;letter-spacing:3px;text-transform:uppercase;">${esc(t)}</span>`;
const overline = (t: string) => `<p style="margin:0;color:${GOLD};font-family:${SANS};font-size:10px;letter-spacing:5px;text-transform:uppercase;">${esc(t)}</p>`;

function itemsTable(items: MenuItem[]): string {
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += 2) {
    const cell = (it?: MenuItem) => it ? `<td valign="top" style="width:50%;padding:7px 14px 7px 0;border-bottom:1px solid ${LINE};font-family:${SANS};font-size:12.5px;color:${INK};line-height:1.45;">
      <span style="color:${GOLD_SOFT};font-size:11px;">&#9679;</span>&nbsp; ${esc(it.name)}${it.price != null && !isNaN(Number(it.price)) ? ` <span style="float:right;color:${GOLD};font-weight:600;">${money(Number(it.price))}</span>` : ""}${it.note ? `<br><span style="padding-left:18px;color:${MUTED};font-size:11px;font-style:italic;">${esc(it.note)}</span>` : ""}</td>` : `<td style="width:50%;"></td>`;
    rows.push(`<tr>${cell(items[i])}${cell(items[i + 1])}</tr>`);
  }
  return `<table role="presentation" style="width:100%;border-collapse:collapse;margin:6px 0 4px;">${rows.join("")}</table>`;
}

function renderSection(s: MenuSection, logo: string, forEmail: boolean): string {
  const courseCounts = s.courses.filter((c) => c.total);
  const cover = `
    <div class="menu-page" style="position:relative;text-align:center;padding:40px 24px 34px;">
      ${logo}
      ${s.styleLabel ? overline(s.styleLabel.replace(/\s*·\s*/g, "  ·  ")) : ""}
      <div style="width:44px;height:1px;background:${GOLD};margin:12px auto 6px;"></div>
      <h2 style="margin:0;color:${GOLD};font-family:${SCRIPT};font-weight:400;font-size:60px;line-height:1.15;">${esc(s.menuTitle || s.title)}</h2>
      ${s.tier ? `<p style="margin:6px 0 14px;color:${INK};font-family:${SERIF};font-size:15px;letter-spacing:5px;text-transform:uppercase;">${esc(s.tier)}</p>` : ""}
      <div style="margin:10px 0 18px;">${pill(s.title)}</div>
      ${s.priceLabel ? `<div style="display:inline-block;min-width:170px;padding:18px 28px;border:1px solid ${LINE};border-radius:6px;background:#fff;">
        <p style="margin:0;color:${INK};font-family:${SERIF};font-size:30px;">${esc(s.priceLabel)}</p>
        <p style="margin:4px 0 0;color:${MUTED};font-family:${SANS};font-size:9px;letter-spacing:3px;text-transform:uppercase;">Per person</p></div>` : ""}
      ${s.description ? `<p style="margin:16px auto 0;max-width:520px;color:${MUTED};font-family:${SERIF};font-size:13px;font-style:italic;">${esc(s.description)}</p>` : ""}
      ${courseCounts.length ? `<table role="presentation" style="margin:22px auto 0;border-collapse:collapse;"><tr>${courseCounts.map((c) => `<td style="padding:0 18px;text-align:center;"><p style="margin:0;color:${GOLD};font-family:${SERIF};font-size:20px;">${c.total}</p><p style="margin:2px 0 0;color:${MUTED};font-family:${SANS};font-size:9px;letter-spacing:2px;text-transform:uppercase;">${esc(c.name)}</p></td>`).join("")}</tr></table>` : ""}
    </div>`;
  const overview = s.kind === "package" && courseCounts.length ? `
    <div class="menu-page" style="padding:30px 28px;">
      ${overline(`How it works — ${s.title}`)}
      <h3 style="margin:8px 0 2px;color:${GOLD};font-family:${SERIF};font-weight:600;font-size:26px;">Menu Overview</h3>
      <p style="margin:0 0 16px;color:${MUTED};font-family:${SANS};font-size:10px;letter-spacing:2px;text-transform:uppercase;">Select the number of dishes shown below from each category</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;font-family:${SANS};font-size:12.5px;color:${INK};">
        <tr>${["Course", "Total items", "Breakdown"].map((h, i) => `<td style="padding:9px 10px;background:${GOLD};color:#fff;font-size:10px;letter-spacing:2px;text-transform:uppercase;${i === 1 ? "text-align:center;" : ""}">${h}</td>`).join("")}</tr>
        ${s.courses.map((c, i) => `<tr style="background:${i % 2 ? "#fff" : "#f8f3e8"};"><td style="padding:10px;font-family:${SERIF};font-size:14px;">${esc(c.name)}</td><td style="padding:10px;text-align:center;color:${GOLD};font-weight:600;">${c.total ?? "—"}</td><td style="padding:10px;">${esc(c.breakdown || "")}</td></tr>`).join("")}
      </table>
    </div>` : "";
  const courses = s.courses.map((c) => `
    <div class="menu-page course" style="padding:30px 28px 22px;">
      ${overline(s.kind === "drinks" ? "Drinks list" : s.book || s.title)}
      <h3 style="margin:8px 0 2px;color:${GOLD};font-family:${SERIF};font-weight:600;font-size:28px;text-transform:uppercase;letter-spacing:1px;">${esc(c.name)}</h3>
      ${c.total ? `<p style="margin:0 0 14px;color:${MUTED};font-family:${SANS};font-size:11px;letter-spacing:1px;">Select <b style="color:${GOLD};">${c.total} item${c.total === 1 ? "" : "s"}</b> in total</p>` : `<div style="height:10px;"></div>`}
      ${(c.groups || [{ items: c.items || [] }]).map((g) => `
        ${g.label ? `<div style="margin:16px 0 4px;padding-bottom:6px;border-bottom:1px solid ${LINE};"><span style="color:${INK};font-family:${SERIF};font-size:14px;letter-spacing:2px;text-transform:uppercase;">${esc(g.label)}</span>${g.choose != null ? `&nbsp;&nbsp;${pill(`Choose ${g.choose}`)}` : ""}</div>` : ""}
        ${itemsTable(g.items)}`).join("")}
    </div>`).join("");
  return `<div class="menu-section" style="margin:0 0 26px;background:${PAPER};border:1px solid ${LINE};border-radius:4px;${forEmail ? "" : "overflow:hidden;"}">${cover}${overview}${courses}</div>`;
}

export function renderMenuHtml(doc: MenuDoc, opts: { forEmail?: boolean } = {}): string {
  const biz = esc(doc.businessName || "Pro Regal");
  const logo = doc.logoUrl ? `<img src="${esc(doc.logoUrl)}" alt="${biz}" style="height:58px;margin:0 auto 14px;display:block;">` : "";
  const cta = doc.viewUrl ? `<div style="text-align:center;margin:0 0 26px;"><a href="${esc(doc.viewUrl)}" style="display:inline-block;padding:13px 30px;background:${GOLD};color:#fff;text-decoration:none;border-radius:999px;font-family:${SANS};font-size:12px;font-weight:600;letter-spacing:3px;text-transform:uppercase;">View menu books &amp; packages online</a><p style="margin:8px 0 0;color:${MUTED};font-family:${SANS};font-size:11px;">Link available for 15 days.</p></div>` : "";
  const intro = opts.forEmail ? `
    <div style="padding:0 6px 20px;color:${INK};font-family:${SANS};font-size:14px;line-height:1.6;">
      <p style="margin:0 0 10px;">Dear ${esc(doc.recipientName || "Guest")},</p>
      <p style="margin:0;">Thank you for your interest in ${biz}. Please find our menu below${doc.viewUrl ? ", or browse every menu book and package online" : ""}.</p>
      ${doc.message ? `<p style="margin:12px 0 0;white-space:pre-line;">${esc(doc.message)}</p>` : ""}
    </div>${cta}` : "";
  return `
  <div style="background:#f3eee3;padding:30px 14px;font-family:${SANS};">
    <div style="max-width:760px;margin:0 auto;">
      ${intro}
      ${doc.sections.map((s) => renderSection(s, logo, !!opts.forEmail)).join("") || `<p style="color:${MUTED};text-align:center;">No menu items selected.</p>`}
      <div style="text-align:center;padding-top:10px;">
        <p style="margin:0;color:${GOLD};font-size:10px;letter-spacing:3px;text-transform:uppercase;">${biz} · regalmanagement.com.au</p>
        <p style="margin:6px 0 0;color:${MUTED};font-size:10px;">Menu and pricing subject to change. Please advise us of any dietary requirements or allergies.</p>
      </div>
    </div>
  </div>`;
}
