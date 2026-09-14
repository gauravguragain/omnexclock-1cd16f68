import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

export type SelectableOption = { id?: string; value: string; label: string };

const OTHER = "__other__";

/** Dropdown backed by the configurable lists, with an "Other" choice that reveals a text input. */
export default function OptionSelect({ name, options, defaultValue = "", emptyLabel, required, otherLabel = "Other (type your own)", otherPlaceholder = "Type your own" }: {
  name: string;
  options: SelectableOption[];
  defaultValue?: string;
  emptyLabel?: string;
  required?: boolean;
  otherLabel?: string;
  otherPlaceholder?: string;
}) {
  const known = (value: string) => options.some((option) => option.value === value);
  const [choice, setChoice] = useState(() => (defaultValue && !known(defaultValue) ? OTHER : defaultValue));
  const [custom, setCustom] = useState(() => (defaultValue && !known(defaultValue) ? defaultValue : ""));

  useEffect(() => {
    setChoice(defaultValue && !known(defaultValue) ? OTHER : defaultValue);
    setCustom(defaultValue && !known(defaultValue) ? defaultValue : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValue, options.length]);

  const resolved = choice === OTHER ? custom : choice;

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={resolved} />
      <select
        value={choice}
        onChange={(event) => setChoice(event.target.value)}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
      >
        {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
        {options.map((option) => <option key={option.id || option.value} value={option.value}>{option.label}</option>)}
        <option value={OTHER}>{otherLabel}</option>
      </select>
      {choice === OTHER && (
        <Input
          value={custom}
          required={required}
          autoFocus
          placeholder={otherPlaceholder}
          onChange={(event) => setCustom(event.target.value)}
        />
      )}
    </div>
  );
}
