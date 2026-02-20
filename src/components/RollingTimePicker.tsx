import React, { useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface RollingTimePickerProps {
  value: string; // "HH:MM" format
  onChange: (value: string) => void;
  className?: string;
}

const ITEM_HEIGHT = 36;
const VISIBLE_ITEMS = 5;
const CENTER_INDEX = Math.floor(VISIBLE_ITEMS / 2);

function ScrollColumn({
  items,
  selected,
  onSelect,
}: {
  items: string[];
  selected: string;
  onSelect: (val: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const touchStartY = useRef<number | null>(null);

  const scrollToIndex = useCallback((index: number, smooth = true) => {
    if (!containerRef.current) return;
    containerRef.current.scrollTo({
      top: index * ITEM_HEIGHT,
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  useEffect(() => {
    const idx = items.indexOf(selected);
    if (idx >= 0) scrollToIndex(idx, false);
  }, [selected, items, scrollToIndex]);

  // Wheel + touch scroll handling for all devices
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Mouse wheel / trackpad support
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      el.scrollTop += e.deltaY;
      // Snap after scroll settles
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        const scrollTop = el.scrollTop;
        const index = Math.round(scrollTop / ITEM_HEIGHT);
        const clampedIndex = Math.max(0, Math.min(index, items.length - 1));
        scrollToIndex(clampedIndex);
        if (items[clampedIndex] !== selected) {
          onSelect(items[clampedIndex]);
        }
      }, 80);
    };

    const onTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (touchStartY.current === null) return;
      const deltaY = touchStartY.current - e.touches[0].clientY;
      touchStartY.current = e.touches[0].clientY;
      el.scrollTop += deltaY;
      e.preventDefault();
      e.stopPropagation();
    };

    const onTouchEnd = () => {
      touchStartY.current = null;
      // Snap to nearest item
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        const scrollTop = el.scrollTop;
        const index = Math.round(scrollTop / ITEM_HEIGHT);
        const clampedIndex = Math.max(0, Math.min(index, items.length - 1));
        scrollToIndex(clampedIndex);
        if (items[clampedIndex] !== selected) {
          onSelect(items[clampedIndex]);
        }
      }, 80);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [items, selected, onSelect, scrollToIndex]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    isScrollingRef.current = true;

    timeoutRef.current = setTimeout(() => {
      if (!containerRef.current) return;
      const scrollTop = containerRef.current.scrollTop;
      const index = Math.round(scrollTop / ITEM_HEIGHT);
      const clampedIndex = Math.max(0, Math.min(index, items.length - 1));
      scrollToIndex(clampedIndex);
      if (items[clampedIndex] !== selected) {
        onSelect(items[clampedIndex]);
      }
      isScrollingRef.current = false;
    }, 80);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const idx = items.indexOf(selected);
    if (e.key === "ArrowDown" && idx < items.length - 1) {
      e.preventDefault();
      onSelect(items[idx + 1]);
    } else if (e.key === "ArrowUp" && idx > 0) {
      e.preventDefault();
      onSelect(items[idx - 1]);
    }
  };

  return (
    <div className="relative" style={{ height: ITEM_HEIGHT * VISIBLE_ITEMS }}>
      {/* Selection highlight */}
      <div
        className="absolute left-0 right-0 bg-primary/10 rounded-md border border-primary/20 pointer-events-none z-10"
        style={{ top: CENTER_INDEX * ITEM_HEIGHT, height: ITEM_HEIGHT }}
      />
      {/* Fade overlays */}
      <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-background to-transparent pointer-events-none z-20" />
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent pointer-events-none z-20" />

      <div
        ref={containerRef}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        className="h-full overflow-y-auto scrollbar-hide snap-y snap-mandatory focus:outline-none"
        style={{
          paddingTop: CENTER_INDEX * ITEM_HEIGHT,
          paddingBottom: CENTER_INDEX * ITEM_HEIGHT,
          scrollSnapType: "y mandatory",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
        }}
      >
        {items.map((item) => (
          <div
            key={item}
            className={cn(
              "flex items-center justify-center cursor-pointer transition-all duration-150 snap-center select-none",
              item === selected
                ? "text-foreground font-semibold text-lg"
                : "text-muted-foreground text-sm opacity-60 hover:opacity-80"
            )}
            style={{ height: ITEM_HEIGHT }}
            onClick={() => {
              const idx = items.indexOf(item);
              scrollToIndex(idx);
              onSelect(item);
            }}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

export function RollingTimePicker({ value, onChange, className }: RollingTimePickerProps) {
  const [hour, minute] = (value || "00:00").split(":");
  const selectedHour = HOURS.includes(hour) ? hour : "00";
  // Snap to nearest 5-min
  const nearestMin = String(Math.round(parseInt(minute || "0") / 5) * 5).padStart(2, "0");
  const selectedMinute = MINUTES.includes(nearestMin) ? nearestMin : "00";

  return (
    <div className={cn("flex items-center gap-1 bg-background rounded-lg p-2", className)}>
      <ScrollColumn
        items={HOURS}
        selected={selectedHour}
        onSelect={(h) => onChange(`${h}:${selectedMinute}`)}
      />
      <span className="text-xl font-bold text-foreground px-1">:</span>
      <ScrollColumn
        items={MINUTES}
        selected={selectedMinute}
        onSelect={(m) => onChange(`${selectedHour}:${m}`)}
      />
    </div>
  );
}
