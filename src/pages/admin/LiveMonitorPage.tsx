import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, LogIn, LogOut, Coffee, MapPin } from "lucide-react";
import { toAusTime12, ausStartOfToday } from "@/lib/dateUtils";
import { formatLocation, googleMapsUrl } from "@/lib/geocode";

interface LiveEmployee {
  id: string;
  name: string;
  lastEvent: string;
  lastTime: string;
  photoPath?: string;
  signedUrl?: string;
  geolocation?: { latitude: number; longitude: number; accuracy: number } | null;
  locationName?: string;
}

export default function LiveMonitorPage() {
  const [liveData, setLiveData] = useState<LiveEmployee[]>([]);

  const fetchLive = async () => {
    const todayISO = ausStartOfToday();

    const { data: events } = await supabase
      .from("clock_events")
      .select("*, employees(name)")
      .gte("created_at", todayISO)
      .order("created_at", { ascending: false });

    if (!events) return;

    const seen = new Map<string, LiveEmployee>();
    for (const ev of events) {
      if (!seen.has(ev.employee_id)) {
        const emp = ev.employees as any;
        seen.set(ev.employee_id, {
          id: ev.employee_id,
          name: emp?.name || "Unknown",
          lastEvent: ev.event_type,
          lastTime: toAusTime12(new Date(ev.created_at)),
          photoPath: ev.photo_url || undefined,
          geolocation: (ev as any).geolocation || null,
        });
      }
    }

    // Generate signed URLs for photos
    const entries = Array.from(seen.values());
    await Promise.all(entries.map(async (entry) => {
      if (entry.photoPath) {
        const { data } = await supabase.storage
          .from("clock-photos")
          .createSignedUrl(entry.photoPath, 3600);
        if (data?.signedUrl) {
          entry.signedUrl = data.signedUrl;
        }
      }
      if (entry.geolocation) {
        entry.locationName = formatLocation(entry.geolocation.latitude, entry.geolocation.longitude);
      }
    }));
    setLiveData(entries);
  };

  useEffect(() => {
    fetchLive();

    const channel = supabase
      .channel("live-monitor-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "clock_events" }, () => {
        fetchLive();
      })
      .subscribe();

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
                {emp.signedUrl ? (
                  <img src={emp.signedUrl} alt={emp.name} className="h-14 w-14 rounded-lg object-cover" />
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
                  {emp.geolocation && (
                    <a
                      href={googleMapsUrl(emp.geolocation.latitude, emp.geolocation.longitude)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-primary hover:underline mt-0.5"
                    >
                      <MapPin className="h-3 w-3" />
                      {emp.locationName || "Location"}
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
