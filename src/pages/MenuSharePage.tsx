import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { buildSectionsFromRows, renderMenuHtml, MENU_FONTS_LINK, type MenuRows } from "../../supabase/functions/_shared/menuHtml";
import { Loader2 } from "lucide-react";

type Share = MenuRows & { business_name?: string; recipient_name?: string; expires_at?: string; error?: string; drinks: any[] };

// Public online menu opened from the menu email. Uses the menu's own ivory/gold print palette on purpose.
export default function MenuSharePage() {
  const { token } = useParams();
  const [data, setData] = useState<Share | null>(null);
  const [book, setBook] = useState<string>("");
  const [pkg, setPkg] = useState<string | null>(null);

  useEffect(() => {
    if (!document.querySelector(`link[href="${MENU_FONTS_LINK}"]`)) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = MENU_FONTS_LINK; document.head.appendChild(l); }
    document.title = "Our menu — Pro Regal";
    (supabase.rpc as any)("get_menu_share", { _token: token }).then(({ data, error }: any) => {
      const d = (error ? { error: "not_found" } : data) as Share; setData(d);
      if (d?.books?.length) setBook(d.books[0].id); else if (d?.drinks?.length) setBook("drinks");
    });
  }, [token]);

  const sectionHtml = useMemo(() => {
    if (!data || data.error) return "";
    const drinksOnly = book === "drinks";
    const sections = buildSectionsFromRows({ ...data, drinks: data.drinks.map(x => ({ ...x, active: true })) }, drinksOnly ? [] : pkg ? [pkg] : [], drinksOnly);
    return sections.length ? renderMenuHtml({ businessName: data.business_name, logoUrl: "/regal-logo.png", sections }) : "";
  }, [data, book, pkg]);

  if (!data) return <div className="flex min-h-screen items-center justify-center bg-[#f3eee3]"><Loader2 className="h-6 w-6 animate-spin text-[#a8822e]" /></div>;
  if (data.error) return <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f3eee3] p-6 text-center text-[#2b2620]">
    <img src="/regal-logo.png" alt="Pro Regal" className="h-16" />
    <h1 className="font-serif text-2xl text-[#a8822e]">{data.error === "expired" ? "This menu link has expired" : "Menu not found"}</h1>
    <p className="max-w-sm text-sm">Menu links stay open for 15 days. Please contact our events team for an updated menu.</p>
  </div>;

  const pkgs = data.packages.filter(p => p.book_id === book);
  const courseCount = (id: string) => data.courses.filter(c => c.package_id === id);

  return <div className="min-h-screen bg-[#f3eee3] text-[#2b2620]" style={{ fontFamily: "Montserrat, 'Segoe UI', Arial, sans-serif" }}>
    <header className="border-b border-[#e8dcc2] bg-[#fdfbf6] px-4 py-6 text-center">
      <img src="/regal-logo.png" alt="Pro Regal" className="mx-auto h-14" />
      <h1 className="mt-2 text-5xl text-[#a8822e]" style={{ fontFamily: "'Great Vibes', cursive" }}>Our Menus</h1>
      <p className="mt-1 text-[11px] uppercase tracking-[0.35em] text-[#8a7f6d]">{data.recipient_name ? `Prepared for ${data.recipient_name}` : data.business_name}</p>
      <nav className="mx-auto mt-5 flex max-w-4xl flex-wrap justify-center gap-2">
        {data.books.map(b => <button key={b.id} onClick={() => { setBook(b.id); setPkg(null); }} className={`rounded-full border px-4 py-1.5 text-xs uppercase tracking-widest transition ${book === b.id ? "border-[#a8822e] bg-[#a8822e] text-white" : "border-[#e8dcc2] bg-white hover:border-[#a8822e]"}`}>{b.name}</button>)}
        {data.drinks.length > 0 && <button onClick={() => { setBook("drinks"); setPkg(null); }} className={`rounded-full border px-4 py-1.5 text-xs uppercase tracking-widest transition ${book === "drinks" ? "border-[#a8822e] bg-[#a8822e] text-white" : "border-[#e8dcc2] bg-white hover:border-[#a8822e]"}`}>Drinks</button>}
      </nav>
    </header>
    <main className="mx-auto max-w-5xl px-4 py-8">
      {book !== "drinks" && !pkg && <>
        {data.books.find(b => b.id === book)?.description && <p className="mb-6 text-center font-serif italic text-[#8a7f6d]">{data.books.find(b => b.id === book)?.description}</p>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pkgs.map(p => { const cs = courseCount(p.id); return <button key={p.id} onClick={() => { setPkg(p.id); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="group rounded-md border border-[#e8dcc2] bg-[#fdfbf6] p-6 text-center transition hover:-translate-y-0.5 hover:border-[#a8822e] hover:shadow-lg">
            {p.style_label && <p className="text-[10px] uppercase tracking-[0.3em] text-[#a8822e]">{p.style_label}</p>}
            <p className="mt-1 text-3xl text-[#a8822e]" style={{ fontFamily: "'Great Vibes', cursive" }}>{p.menu_title || p.name}</p>
            {p.subtitle && <p className="text-[11px] uppercase tracking-[0.25em]">{p.subtitle}</p>}
            <span className="mt-3 inline-block rounded-full bg-[#a8822e] px-3 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white">{p.name}</span>
            {(p.price_label || Number(p.price_per_head) > 0) && <p className="mt-3 font-serif text-2xl">{p.price_label || `$${Number(p.price_per_head)}`}<span className="ml-1 text-[10px] uppercase tracking-widest text-[#8a7f6d]">per person</span></p>}
            <p className="mt-3 text-xs text-[#8a7f6d]">{cs.map(c => c.name).join(" · ")}</p>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-widest text-[#a8822e] group-hover:underline">View menu</p>
          </button>; })}
        </div>
        {!pkgs.length && <p className="text-center text-sm text-[#8a7f6d]">No packages in this menu book.</p>}
      </>}
      {pkg && <button onClick={() => setPkg(null)} className="mb-4 text-xs font-semibold uppercase tracking-widest text-[#a8822e] hover:underline">← All packages</button>}
      {(pkg || book === "drinks") && <div className="-mx-4 sm:mx-0" dangerouslySetInnerHTML={{ __html: sectionHtml }} />}
      <p className="mt-8 text-center text-[11px] text-[#8a7f6d]">Link open until {data.expires_at ? new Date(data.expires_at).toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "long", year: "numeric" }) : ""}. To choose your menu, reply to our email or contact the events team.</p>
    </main>
  </div>;
}
