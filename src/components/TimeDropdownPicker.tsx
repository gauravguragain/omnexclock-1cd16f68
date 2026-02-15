import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimeDropdownPickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

export function TimeDropdownPicker({ value, onChange, placeholder = "Select time" }: TimeDropdownPickerProps) {
  const [open, setOpen] = useState(false);
  const [hour, minute] = (value || "").split(":");
  const selectedHour = HOURS.includes(hour) ? hour : "";
  const nearestMin = minute ? String(Math.round(parseInt(minute) / 5) * 5).padStart(2, "0") : "";
  const selectedMinute = MINUTES.includes(nearestMin) ? nearestMin : "";

  const displayValue = selectedHour && selectedMinute ? `${selectedHour}:${selectedMinute}` : "";

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
      <PopoverContent className="w-48 p-0" align="start">
        <div className="flex">
          <div className="flex-1 border-r border-border">
            <p className="text-xs font-medium text-muted-foreground px-3 py-2 border-b border-border">HR</p>
            <ScrollArea className="h-52">
              <div className="p-1">
                {HOURS.map((h) => (
                  <button
                    key={h}
                    onClick={() => {
                      const newMin = selectedMinute || "00";
                      onChange(`${h}:${newMin}`);
                    }}
                    className={cn(
                      "w-full text-center rounded-md px-2 py-1.5 text-sm transition-colors",
                      h === selectedHour
                        ? "bg-primary text-primary-foreground font-medium"
                        : "hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium text-muted-foreground px-3 py-2 border-b border-border">MIN</p>
            <ScrollArea className="h-52">
              <div className="p-1">
                {MINUTES.map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      const newHour = selectedHour || "00";
                      onChange(`${newHour}:${m}`);
                    }}
                    className={cn(
                      "w-full text-center rounded-md px-2 py-1.5 text-sm transition-colors",
                      m === selectedMinute
                        ? "bg-primary text-primary-foreground font-medium"
                        : "hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
