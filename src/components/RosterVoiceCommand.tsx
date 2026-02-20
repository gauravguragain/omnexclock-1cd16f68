import { useState, useRef, useCallback } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

      setParsedActions(data.actions);
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
        <DialogContent className="max-w-md">
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
              return (
                <div
                  key={idx}
                  className={`rounded-lg border p-3 space-y-1 ${
                    action.match_error && !action.employee_id ? "border-destructive/50 bg-destructive/5" : "border-border"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {action.match_error && !action.employee_id ? (
                      <div className="w-full space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">
                            Heard: "<span className="font-medium text-foreground">{action.employee_name}</span>"
                          </span>
                          <Badge variant="destructive" className="text-xs">Not found</Badge>
                        </div>
                        <Select
                          onValueChange={(val) => {
                            const selectedEmp = employees.find((e) => e.id === val);
                            if (selectedEmp) {
                              setParsedActions((prev) =>
                                prev.map((a, i) =>
                                  i === idx
                                    ? { ...a, employee_id: selectedEmp.id, employee_name: selectedEmp.name, match_error: undefined }
                                    : a
                                )
                              );
                            }
                          }}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Select employee..." />
                          </SelectTrigger>
                          <SelectContent>
                            {employees.map((e) => (
                              <SelectItem key={e.id} value={e.id}>
                                {e.name}{e.department ? ` (${e.department})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <span className="font-semibold">
                        {emp?.name || action.employee_name}
                      </span>
                    )}
                  </div>
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
            <Button onClick={handleConfirm} disabled={inserting}>
              {inserting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Add {parsedActions.filter((a) => !a.match_error).length} Shift(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
