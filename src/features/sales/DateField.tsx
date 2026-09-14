import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export default function DateField({ name, value, defaultValue, onChange, required, placeholder = "Pick a date", className }: {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [internal, setInternal] = useState(defaultValue || "");
  const current = value !== undefined ? value : internal;
  const [open, setOpen] = useState(false);
  const set = (v: string) => { if (value === undefined) setInternal(v); onChange?.(v); setOpen(false); };
  return (
    <>
      {name && <input type="hidden" name={name} value={current} required={required} />}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className={cn("w-full justify-start text-left font-normal", !current && "text-muted-foreground", className)}>
            <CalendarIcon className="mr-2 h-4 w-4" />
            {current ? format(new Date(`${current}T00:00:00`), "dd MMM yyyy") : <span>{placeholder}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={current ? new Date(`${current}T00:00:00`) : undefined}
            onSelect={(d) => { if (d) set(format(d, "yyyy-MM-dd")); }}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </>
  );
}
