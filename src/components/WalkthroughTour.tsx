import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { X, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";

export interface TourStep {
  title: string;
  description: string;
  icon: React.ReactNode;
  highlight?: string; // optional CSS selector to highlight
}

interface WalkthroughTourProps {
  steps: TourStep[];
  storageKey: string; // unique key per tour (e.g. "admin-tour-seen", "portal-tour-seen")
  onComplete?: () => void;
}

export default function WalkthroughTour({ steps, storageKey, onComplete }: WalkthroughTourProps) {
  const [visible, setVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const seen = localStorage.getItem(storageKey);
    if (!seen) {
      // Small delay so page renders first
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, [storageKey]);

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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={dismiss} />

      {/* Tour card */}
      <Card className="relative z-10 w-[90vw] max-w-md bg-card border-border shadow-2xl animate-in fade-in zoom-in-95 duration-300">
        {/* Progress bar */}
        <div className="h-1 bg-secondary rounded-t-lg overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <CardContent className="p-6 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
                {step.icon}
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">
                  Step {currentStep + 1} of {steps.length}
                </p>
                <h3 className="text-lg font-bold text-foreground leading-tight">
                  {step.title}
                </h3>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground -mt-1 -mr-2" onClick={dismiss}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed">
            {step.description}
          </p>

          {/* Step indicators */}
          <div className="flex items-center justify-center gap-1.5 py-1">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentStep(i)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === currentStep
                    ? "w-6 bg-primary"
                    : i < currentStep
                    ? "w-2 bg-primary/40"
                    : "w-2 bg-secondary"
                }`}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={prev}
              disabled={isFirst}
              className="gap-1 text-muted-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>

            <div className="flex items-center gap-2">
              {!isLast && (
                <Button variant="ghost" size="sm" onClick={dismiss} className="text-muted-foreground text-xs">
                  Skip tour
                </Button>
              )}
              <Button size="sm" onClick={next} className="gap-1">
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
