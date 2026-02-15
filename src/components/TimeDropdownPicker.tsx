import React, { useState, useRef, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimeDropdownPickerProps {
  value: string; // "HH:MM" 24h format
  onChange: (value: string) => void;
  placeholder?: string;
}

const HOURS_12 = ["12", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11"];
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
const PERIODS = ["AM", "PM"];

function to12Hour(h24: string): { hour12: string; period: string } {
  const n = parseInt(h24 || "0");
  if (n === 0) return { hour12: "12", period: "AM" };
  if (n < 12) return { hour12: String(n).padStart(2, "0"), period: "AM" };
  if (n === 12) return { hour12: "12", period: "PM" };
  return { hour12: String(n - 12).padStart(2, "0"), period: "PM" };
}

function to24Hour(hour12: string, period: string): string {
  let n = parseInt(hour12);
  if (period === "AM") {
    if (n === 12) n = 0;
  } else {
    if (n !== 12) n += 12;
  }
  return String(n).padStart(2, "0");
}

function ScrollColumn({
  items,
  selected,
  onSelect,
  width,
}: {
  items: string[];
  selected: string;
  onSelect: (val: string) => void;
  width?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (selectedRef.current && containerRef.current) {
      selectedRef.current.scrollIntoView({ block: "center", behavior: "auto" });
    }
  }, [selected]);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (containerRef.current) {
      containerRef.current.scrollTop += e.deltaY;
    }
  };

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      className={cn("overflow-y-auto overscroll-contain py-1 touch-pan-y", width || "w-14")}
      style={{ maxHeight: 220 }}
    >
      {items.map((item) => (
        <button
          key={item}
          ref={item === selected ? selectedRef : undefined}
          onClick={() => onSelect(item)}
          className={cn(
            "w-full text-center rounded-md px-2 py-1.5 text-sm transition-colors",
            item === selected
              ? "bg-primary text-primary-foreground font-medium"
              : "hover:bg-accent hover:text-accent-foreground"
          )}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

export function TimeDropdownPicker({ value, onChange, placeholder = "Select time" }: TimeDropdownPickerProps) {
  const [open, setOpen] = useState(false);
  const [hour24, minute] = (value || "").split(":");
  const { hour12, period } = to12Hour(hour24);
  const selectedHour = HOURS_12.includes(hour12) ? hour12 : "";
  const selectedMinute = minute && MINUTES.includes(minute) ? minute : "";
  const selectedPeriod = PERIODS.includes(period) ? period : "AM";

  const displayValue =
    selectedHour && selectedMinute
      ? `${selectedHour}:${selectedMinute} ${selectedPeriod}`
      : "";

  const update = (h12: string, m: string, p: string) => {
    const h24 = to24Hour(h12 || "12", p);
    onChange(`${h24}:${m || "00"}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !displayValue && "text-muted-foreground"
          )}
        >
          <Clock className="mr-2 h-4 w-4" />
          {displayValue || placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex divide-x divide-border">
          <div>
            <p className="text-xs font-medium text-muted-foreground px-3 py-2 border-b border-border text-center">HR</p>
            <ScrollColumn
              items={HOURS_12}
              selected={selectedHour}
              onSelect={(h) => update(h, selectedMinute, selectedPeriod)}
            />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground px-3 py-2 border-b border-border text-center">MIN</p>
            <ScrollColumn
              items={MINUTES}
              selected={selectedMinute}
              onSelect={(m) => update(selectedHour, m, selectedPeriod)}
            />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground px-3 py-2 border-b border-border text-center">&nbsp;</p>
            <ScrollColumn
              items={PERIODS}
              selected={selectedPeriod}
              onSelect={(p) => update(selectedHour, selectedMinute, p)}
              width="w-14"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
