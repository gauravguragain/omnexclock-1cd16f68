import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import type { SelectableOption } from "./OptionSelect";

/** Parse a stored venue string ("Hall A, Garden") into individual values. */
export const splitMulti = (value?: string | null) => String(value || "").split(",").map((v) => v.trim()).filter(Boolean);

/** Tap-to-toggle multi-select that saves the choices as one comma-separated value. */
export default function MultiOptionSelect({ name, options, defaultValue = "", placeholder = "Add another (type your own)" }: {
  name: string;
  options: SelectableOption[];
  defaultValue?: string | null;
  placeholder?: string;
}) {
  const [picked, setPicked] = useState<string[]>(() => splitMulti(defaultValue));
  const [custom, setCustom] = useState("");
  useEffect(() => { setPicked(splitMulti(defaultValue)); }, [defaultValue]);

  const toggle = (v: string) => setPicked((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));
  const extras = picked.filter((v) => !options.some((o) => o.value === v));
  const addCustom = () => { const v = custom.trim(); if (v && !picked.includes(v)) setPicked([...picked, v]); setCustom(""); };

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={picked.join(", ")} />
      <div className="flex flex-wrap gap-2">
        {[...options.map((o) => ({ value: o.value, label: o.label })), ...extras.map((v) => ({ value: v, label: v }))].map((o) => {
          const on = picked.includes(o.value);
          return (
            <button key={o.value} type="button" onClick={() => toggle(o.value)} aria-pressed={on}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:border-primary"}`}>
              {on ? "✓ " : ""}{o.label}
            </button>
          );
        })}
      </div>
      <Input value={custom} placeholder={placeholder} onChange={(e) => setCustom(e.target.value)}
        onBlur={addCustom} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} />
      <p className="text-xs text-muted-foreground">{picked.length ? `${picked.length} selected` : "Tap one or more venues"}</p>
    </div>
  );
}
