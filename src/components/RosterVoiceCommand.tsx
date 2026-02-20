import { useState, useRef, useCallback, useMemo } from "react";
import { Mic, MicOff, Loader2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

interface Employee {
  id: string;
  name: string;
  department: string | null;
}

interface WeekDate {
  dayName: string;
  date: string; // YYYY-MM-DD
}

interface ParsedAction {
  employee_id: string | null;
  employee_name: string;
  match_error?: string;
  date: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  break_minutes?: number;
  notes?: string;
}

interface RosterVoiceCommandProps {
  employees: Employee[];
  weekDates: WeekDate[];
  weekStartDate: string;
  onInsertShift: (action: ParsedAction) => Promise<void>;
}

function formatTime12(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hr = parseInt(h);
  const ampm = hr >= 12 ? "PM" : "AM";
  const h12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
  return `${h12}:${m} ${ampm}`;
}

/** Simple fuzzy similarity score (0-1) using character bigrams */
function similarity(a: string, b: string): number {
  const sa = a.toLowerCase().trim();
  const sb = b.toLowerCase().trim();
  if (sa === sb) return 1;
  if (sa.length < 2 || sb.length < 2) {
    // fallback: check if one contains the other
    if (sb.includes(sa) || sa.includes(sb)) return 0.7;
    return 0;
  }
  const bigrams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const bg1 = bigrams(sa);
  const bg2 = bigrams(sb);
  let intersection = 0;
  bg1.forEach((b) => { if (bg2.has(b)) intersection++; });
  return (2 * intersection) / (bg1.size + bg2.size);
}

function getSuggestions(spokenName: string, employees: Employee[], topN = 3): Employee[] {
  const spoken = spokenName.toLowerCase().trim();
  const scored = employees
    .map((e) => {
      const firstName = e.name.split(/\s+/)[0].toLowerCase();
      // Boost score significantly for first-name matches
      const firstNameScore = similarity(spoken, firstName);
      const fullNameScore = similarity(spoken, e.name);
      const score = Math.max(firstNameScore * 1.3, fullNameScore);
      return { employee: e, score };
    })
    .filter((s) => s.score > 0.15)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, topN).map((s) => s.employee);
}

export default function RosterVoiceCommand({
  employees,
  weekDates,
  weekStartDate,
  onInsertShift,
}: RosterVoiceCommandProps) {
  const { toast } = useToast();
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [parsedActions, setParsedActions] = useState<ParsedAction[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [showAllEmployees, setShowAllEmployees] = useState<Record<number, boolean>>({});
  const recognitionRef = useRef<any>(null);

  const startListening = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({
        title: "Not supported",
        description: "Speech recognition is not available in this browser. Try Chrome.",
        variant: "destructive",
      });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-AU";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;
    recognitionRef.current = recognition;

    recognition.onresult = async (event: any) => {
      const text = event.results[0][0].transcript;
      setTranscript(text);
      setListening(false);
      await parseCommand(text);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setListening(false);
      if (event.error === "not-allowed") {
        toast({
          title: "Microphone blocked",
          description: "Please allow microphone access to use voice commands.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Voice error",
          description: `Could not capture voice: ${event.error}`,
          variant: "destructive",
        });
      }
    };

    recognition.onend = () => {
      setListening(false);
    };

    setListening(true);
    setTranscript("");
    setParsedActions([]);
    setShowAllEmployees({});
    recognition.start();
  }, [toast]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const parseCommand = async (text: string) => {
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("parse-roster-voice", {
        body: {
          transcript: text,
          employees: employees.map((e) => ({ id: e.id, name: e.name })),
          weekDates,
        },
      });

      if (error) throw error;

      if (data.error) {
        toast({
          title: "Could not parse command",
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      if (!data.actions || data.actions.length === 0) {
        toast({
          title: "No actions found",
          description: "Could not understand any roster actions from your command.",
          variant: "destructive",
        });
        return;
      }

      // Client-side: validate all employee_ids exist in our list, FORCE dates to selected week
      const resolvedActions = (data.actions as ParsedAction[]).map((action) => {
        // ALWAYS force the date to the selected week based on day_of_week
        const dayMatch = weekDates.find(
          (wd) => wd.dayName.toLowerCase() === action.day_of_week?.toLowerCase()
        );
        if (dayMatch) {
          action = { ...action, date: dayMatch.date };
        }

        // CRITICAL: Validate that the AI-returned employee_id actually exists in our list
        if (action.employee_id) {
          const validEmployee = employees.find((e) => e.id === action.employee_id);
          if (!validEmployee) {
            // AI hallucinated an employee_id — reset it so we can try matching below
            action = { ...action, employee_id: null, match_error: `"${action.employee_name}" not found in employee list` };
          } else {
            // Valid match — ensure we use the canonical name
            return { ...action, employee_name: validEmployee.name, match_error: undefined };
          }
        }
        
        // Try first-name match
        const spoken = action.employee_name.toLowerCase().trim();
        const firstNameMatch = employees.find((e) => {
          const firstName = e.name.split(/\s+/)[0].toLowerCase();
          return firstName === spoken || e.name.toLowerCase() === spoken;
        });
        
        if (firstNameMatch) {
          return {
            ...action,
            employee_id: firstNameMatch.id,
            employee_name: firstNameMatch.name,
            match_error: undefined,
          };
        }

        // Try partial/contains match
        const partialMatch = employees.find((e) =>
          e.name.toLowerCase().includes(spoken) || spoken.includes(e.name.split(/\s+/)[0].toLowerCase())
        );

        if (partialMatch) {
          return {
            ...action,
            employee_id: partialMatch.id,
            employee_name: partialMatch.name,
            match_error: undefined,
          };
        }

        return action;
      });

      setParsedActions(resolvedActions);
      setConfirmOpen(true);
    } catch (err: any) {
      toast({
        title: "Parse error",
        description: err.message || "Failed to parse voice command",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const selectEmployee = (idx: number, emp: Employee) => {
    setParsedActions((prev) =>
      prev.map((a, i) =>
        i === idx
          ? { ...a, employee_id: emp.id, employee_name: emp.name, match_error: undefined }
          : a
      )
    );
    setShowAllEmployees((prev) => ({ ...prev, [idx]: false }));
  };

  const readyActions = useMemo(
    () => parsedActions.filter((a) => a.employee_id && !a.match_error),
    [parsedActions]
  );

  const handleConfirm = async () => {
    setInserting(true);
    try {
      let successCount = 0;
      for (const action of parsedActions) {
        if (!action.employee_id || action.match_error) {
          toast({
            title: `Skipped: ${action.employee_name}`,
            description: action.match_error || "Employee not found",
            variant: "destructive",
          });
          continue;
        }
        await onInsertShift(action);
        successCount++;
      }
      if (successCount > 0) {
        toast({
          title: "Shifts added!",
          description: `${successCount} shift(s) added via voice command.`,
        });
      }
      setConfirmOpen(false);
      setParsedActions([]);
      setTranscript("");
      setShowAllEmployees({});
    } catch (err: any) {
      toast({
        title: "Error adding shifts",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setInserting(false);
    }
  };

  const matchedEmployee = (action: ParsedAction) => {
    if (action.employee_id) {
      return employees.find((e) => e.id === action.employee_id);
    }
    return null;
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={listening ? "destructive" : "outline"}
            size="icon"
            onClick={listening ? stopListening : startListening}
            disabled={processing}
            className="relative"
          >
            {processing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : listening ? (
              <>
                <MicOff className="h-4 w-4" />
                <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-destructive animate-pulse" />
              </>
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {processing
            ? "Processing voice command..."
            : listening
            ? "Listening... click to stop"
            : "Voice command: add shifts by speaking"}
        </TooltipContent>
      </Tooltip>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirm Voice Command</DialogTitle>
          </DialogHeader>

          {transcript && (
            <div className="rounded-md bg-muted p-3 text-sm italic text-muted-foreground">
              "{transcript}"
            </div>
          )}

          <div className="space-y-3 mt-2">
            {parsedActions.map((action, idx) => {
              const emp = matchedEmployee(action);
              const isUnmatched = !action.employee_id || !!action.match_error;
              const suggestions = isUnmatched ? getSuggestions(action.employee_name, employees) : [];
              const showAll = showAllEmployees[idx] || false;

              return (
                <div
                  key={idx}
                  className={`rounded-lg border p-3 space-y-2 ${
                    isUnmatched ? "border-destructive/50 bg-destructive/5" : "border-border"
                  }`}
                >
                  {isUnmatched ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-muted-foreground">
                          Heard: "<span className="font-medium text-foreground">{action.employee_name}</span>"
                        </span>
                        <Badge variant="destructive" className="text-xs">Not matched</Badge>
                      </div>

                      {/* AI Suggestions */}
                      {suggestions.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">Did you mean:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {suggestions.map((s) => (
                              <Button
                                key={s.id}
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs px-2.5"
                                onClick={() => selectEmployee(idx, s)}
                              >
                                <UserRound className="h-3 w-3 mr-1" />
                                {s.name}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Show all employees button / list */}
                      {!showAll ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground px-1"
                          onClick={() => setShowAllEmployees((prev) => ({ ...prev, [idx]: true }))}
                        >
                          Browse all employees...
                        </Button>
                      ) : (
                        <div className="max-h-32 overflow-y-auto rounded border border-border bg-background p-1 space-y-0.5">
                          {employees.map((e) => (
                            <button
                              key={e.id}
                              className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted transition-colors"
                              onClick={() => selectEmployee(idx, e)}
                            >
                              {e.name}
                              {e.department && (
                                <span className="text-muted-foreground ml-1">({e.department})</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{emp?.name || action.employee_name}</span>
                      <Badge variant="outline" className="text-xs text-green-600 border-green-600/30">
                        ✓ Matched
                      </Badge>
                    </div>
                  )}

                  <div className="text-sm text-muted-foreground">
                    {action.day_of_week} ({action.date})
                  </div>
                  <div className="text-sm">
                    {formatTime12(action.start_time)} – {formatTime12(action.end_time)}
                    {action.break_minutes != null && (
                      <span className="text-muted-foreground ml-2">
                        ({action.break_minutes}m break)
                      </span>
                    )}
                  </div>
                  {action.notes && (
                    <div className="text-xs text-muted-foreground">{action.notes}</div>
                  )}
                </div>
              );
            })}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={inserting || readyActions.length === 0}>
              {inserting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Add {readyActions.length} Shift(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}