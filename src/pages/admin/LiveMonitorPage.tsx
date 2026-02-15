import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, LogIn, LogOut, Coffee } from "lucide-react";

interface LiveEmployee {
  id: string;
  name: string;
  lastEvent: string;
  lastTime: string;
  photoUrl?: string;
}

export default function LiveMonitorPage() {
  const [liveData, setLiveData] = useState<LiveEmployee[]>([]);

  const fetchLive = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: events } = await supabase
      .from("clock_events")
      .select("*, employees(name)")
      .gte("timestamp", today.toISOString())
      .order("timestamp", { ascending: false });

    if (!events) return;

    const seen = new Map<string, LiveEmployee>();
    for (const ev of events) {
      if (!seen.has(ev.employee_id)) {
        const emp = ev.employees as any;
        seen.set(ev.employee_id, {
          id: ev.employee_id,
          name: emp?.name || "Unknown",
          lastEvent: ev.event_type,
          lastTime: new Date(ev.timestamp).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true }),
          photoUrl: ev.photo_url || undefined,
        });
      }
    }
    setLiveData(Array.from(seen.values()));
  };

  useEffect(() => {
    fetchLive();

    // Realtime subscription instead of polling
    const channel = supabase
      .channel("live-monitor-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "clock_events" }, () => {
        fetchLive();
      })
      .subscribe();

    // Keep a slower fallback poll
    const interval = setInterval(fetchLive, 30000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const eventIcon = (type: string) => {
    switch (type) {
      case "clock_in": return <LogIn className="h-4 w-4 text-success" />;
      case "clock_out": return <LogOut className="h-4 w-4 text-destructive" />;
      case "break_start": return <Coffee className="h-4 w-4 text-warning" />;
      case "break_end": return <Clock className="h-4 w-4 text-primary" />;
      default: return null;
    }
  };

  const eventLabel = (type: string) => {
    switch (type) {
      case "clock_in": return "Clocked In";
      case "clock_out": return "Clocked Out";
      case "break_start": return "On Break";
      case "break_end": return "Back from Break";
      default: return type;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="h-3 w-3 rounded-full bg-success animate-pulse" />
        <span className="text-sm text-muted-foreground">Live — updates in real-time</span>
      </div>

      {liveData.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No activity today yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {liveData.map((emp) => (
            <Card key={emp.id} className="overflow-hidden">
              <CardContent className="p-4 flex items-center gap-4">
                {emp.photoUrl ? (
                  <img src={emp.photoUrl} alt={emp.name} className="h-14 w-14 rounded-lg object-cover" />
                ) : (
                  <div className="h-14 w-14 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground font-bold text-lg">
                    {emp.name.charAt(0)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">{emp.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {eventIcon(emp.lastEvent)}
                    <span className="text-sm text-muted-foreground">{eventLabel(emp.lastEvent)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{emp.lastTime}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
