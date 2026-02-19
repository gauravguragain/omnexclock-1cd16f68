import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { X, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";

export interface TourStep {
  title: string;
  description: string;
  icon: React.ReactNode;
  highlight?: string; // CSS selector for element to spotlight
}

interface WalkthroughTourProps {
  steps: TourStep[];
  storageKey: string;
  onComplete?: () => void;
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export default function WalkthroughTour({ steps, storageKey, onComplete }: WalkthroughTourProps) {
  const [visible, setVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number; placement: string }>({ top: 0, left: 0, placement: "center" });
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const seen = localStorage.getItem(storageKey);
    if (!seen) {
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, [storageKey]);

  // Update spotlight position when step changes
  useEffect(() => {
    if (!visible) return;

    const step = steps[currentStep];
    if (!step.highlight) {
      setSpotlight(null);
      setCardPos({ top: 0, left: 0, placement: "center" });
      return;
    }

    const updatePosition = () => {
      const el = document.querySelector(step.highlight!);
      if (!el) {
        setSpotlight(null);
        setCardPos({ top: 0, left: 0, placement: "center" });
        return;
      }

      // Scroll element into view
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });

      requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const padding = 6;
        const sr: SpotlightRect = {
          top: rect.top - padding,
          left: rect.left - padding,
          width: rect.width + padding * 2,
          height: rect.height + padding * 2,
        };
        setSpotlight(sr);

        // Position card: prefer right of element, fallback to bottom
        const cardW = 380;
        const cardH = 320;
        const gap = 16;

        // Try right side
        if (rect.right + gap + cardW < window.innerWidth) {
          setCardPos({
            top: Math.max(16, Math.min(rect.top, window.innerHeight - cardH - 16)),
            left: rect.right + gap,
            placement: "right",
          });
        }
        // Try left side
        else if (rect.left - gap - cardW > 0) {
          setCardPos({
            top: Math.max(16, Math.min(rect.top, window.innerHeight - cardH - 16)),
            left: rect.left - gap - cardW,
            placement: "left",
          });
        }
        // Bottom
        else {
          setCardPos({
            top: Math.min(rect.bottom + gap, window.innerHeight - cardH - 16),
            left: Math.max(16, (window.innerWidth - cardW) / 2),
            placement: "bottom",
          });
        }
      });
    };

    // Small delay for DOM to settle
    const timer = setTimeout(updatePosition, 150);
    window.addEventListener("resize", updatePosition);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updatePosition);
    };
  }, [visible, currentStep, steps]);

  const dismiss = useCallback(() => {
    setVisible(false);
    localStorage.setItem(storageKey, "true");
    onComplete?.();
  }, [storageKey, onComplete]);

  const next = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      dismiss();
    }
  };

  const prev = () => {
    if (currentStep > 0) setCurrentStep(prev => prev - 1);
  };

  if (!visible) return null;

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;
  const isFirst = currentStep === 0;
  const progress = ((currentStep + 1) / steps.length) * 100;
  const hasHighlight = !!spotlight;

  return (
    <div className="fixed inset-0 z-[100]" style={{ pointerEvents: "auto" }}>
      {/* SVG overlay with spotlight cutout */}
      <svg
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: "none" }}
        onClick={dismiss}
      >
        <defs>
          <mask id="tour-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {spotlight && (
              <rect
                x={spotlight.left}
                y={spotlight.top}
                width={spotlight.width}
                height={spotlight.height}
                rx="8"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.65)"
          mask="url(#tour-spotlight-mask)"
          style={{ pointerEvents: "auto", cursor: "pointer" }}
          onClick={dismiss}
        />
      </svg>

      {/* Highlight ring */}
      {spotlight && (
        <div
          className="absolute rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-transparent transition-all duration-300 ease-out pointer-events-none"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
          }}
        />
      )}

      {/* Tour card */}
      <Card
        ref={cardRef}
        className="absolute z-10 w-[90vw] max-w-[380px] bg-card border-border shadow-2xl animate-in fade-in zoom-in-95 duration-300"
        style={
          hasHighlight
            ? { top: cardPos.top, left: cardPos.left }
            : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }
        }
      >
        {/* Progress bar */}
        <div className="h-1 bg-secondary rounded-t-lg overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <CardContent className="p-5 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
                {step.icon}
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">
                  Step {currentStep + 1} of {steps.length}
                </p>
                <h3 className="text-base font-bold text-foreground leading-tight">
                  {step.title}
                </h3>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground -mt-1 -mr-1" onClick={dismiss}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed">
            {step.description}
          </p>

          {/* Step indicators */}
          <div className="flex items-center justify-center gap-1.5 py-0.5">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentStep(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentStep
                    ? "w-5 bg-primary"
                    : i < currentStep
                    ? "w-1.5 bg-primary/40"
                    : "w-1.5 bg-secondary"
                }`}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={prev}
              disabled={isFirst}
              className="gap-1 text-muted-foreground h-8"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>

            <div className="flex items-center gap-2">
              {!isLast && (
                <Button variant="ghost" size="sm" onClick={dismiss} className="text-muted-foreground text-xs h-8">
                  Skip tour
                </Button>
              )}
              <Button size="sm" onClick={next} className="gap-1 h-8">
                {isLast ? (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Get Started
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
