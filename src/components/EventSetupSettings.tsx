import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useActionLock } from "@/contexts/ActionLockContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, GripVertical, Warehouse, PartyPopper } from "lucide-react";

interface ConfigItem {
  id: string;
  config_type: string;
  label: string;
  sort_order: number;
  active: boolean;
}

export default function EventSetupSettings() {
  const { runAction } = useActionLock();
  const { business } = useBusiness();
  const { toast } = useToast();
  const [items, setItems] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEventSpace, setNewEventSpace] = useState("");
  const [newEventType, setNewEventType] = useState("");

  const fetchConfig = async () => {
    if (!business) return;
    setLoading(true);
    const { data } = await supabase
      .from("event_setup_config")
      .select("*")
      .eq("business_id", business.id)
      .order("sort_order");
    setItems((data as ConfigItem[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchConfig(); }, [business]);

  const eventSpaces = items.filter(i => i.config_type === "event_space" && i.active);
  const eventTypes = items.filter(i => i.config_type === "event_type" && i.active);

  const addItem = async (type: string, label: string) => {
    if (!label.trim() || !business) return;
    await runAction(async () => {
      const { error } = await supabase.from("event_setup_config").insert({
        business_id: business.id,
        config_type: type,
        label: label.trim(),
        sort_order: items.filter(i => i.config_type === type).length,
      });
      if (error) {
        if (error.message.includes("duplicate")) {
          toast({ title: "Already exists", description: `"${label.trim()}" is already added.`, variant: "destructive" });
        } else {
          toast({ title: "Error", description: error.message, variant: "destructive" });
        }
      } else {
        toast({ title: "Added", description: `"${label.trim()}" added successfully.` });
        fetchConfig();
      }
    });
  };

  const removeItem = async (id: string) => {
    await runAction(async () => {
      await supabase.from("event_setup_config").update({ active: false }).eq("id", id);
      toast({ title: "Removed" });
      fetchConfig();
    });
  };

  if (!business) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PartyPopper className="h-5 w-5" /> Event Setup Options
        </CardTitle>
        <CardDescription>
          Configure event spaces, event types, and other options used in the roster's daily event panel.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Event Spaces */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold flex items-center gap-2">
            <Warehouse className="h-4 w-4" /> Event Spaces
          </Label>
          <div className="flex flex-wrap gap-2">
            {eventSpaces.map(s => (
              <Badge key={s.id} variant="secondary" className="gap-1 pr-1 py-1">
                {s.label}
                <button onClick={() => removeItem(s.id)} className="ml-1 rounded-full hover:bg-destructive/20 p-0.5 transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {eventSpaces.length === 0 && <span className="text-xs text-muted-foreground">No event spaces added yet.</span>}
          </div>
          <div className="flex gap-2">
            <Input
              value={newEventSpace}
              onChange={e => setNewEventSpace(e.target.value)}
              placeholder="e.g. Grand Ballroom"
              className="h-9 text-sm"
              onKeyDown={e => { if (e.key === "Enter") { addItem("event_space", newEventSpace); setNewEventSpace(""); } }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => { addItem("event_space", newEventSpace); setNewEventSpace(""); }}
              disabled={!newEventSpace.trim()}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          </div>
        </div>


        {/* Event Types - hidden for PRP business */}
        {business.business_code !== "PRP" && (
          <div className="space-y-3">
            <Label className="text-sm font-semibold flex items-center gap-2">
              <PartyPopper className="h-4 w-4" /> Event Types
            </Label>
            <div className="flex flex-wrap gap-2">
              {eventTypes.map(s => (
                <Badge key={s.id} variant="secondary" className="gap-1 pr-1 py-1">
                  {s.label}
                  <button onClick={() => removeItem(s.id)} className="ml-1 rounded-full hover:bg-destructive/20 p-0.5 transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {eventTypes.length === 0 && <span className="text-xs text-muted-foreground">No event types added yet.</span>}
            </div>
            <div className="flex gap-2">
              <Input
                value={newEventType}
                onChange={e => setNewEventType(e.target.value)}
                placeholder="e.g. Wedding Reception"
                className="h-9 text-sm"
                onKeyDown={e => { if (e.key === "Enter") { addItem("event_type", newEventType); setNewEventType(""); } }}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => { addItem("event_type", newEventType); setNewEventType(""); }}
                disabled={!newEventType.trim()}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add
              </Button>
            </div>
          </div>
        )}

        {/* Info */}
        <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 border border-border/50">
          <strong>How it works:</strong> Event spaces{business.business_code !== "PRP" ? " and types" : ""} you add here will appear as dropdown options in the roster's daily event panel.{business.business_code === "PRP" ? " Event type is a free-text field on the roster." : ""}
          {" "}Tablecloth color (Black/White), number of tables, chairs per table, and extras (Cold Sparkles, Dry Ice, Red Carpet, Decor Access) are built-in options.
        </div>
      </CardContent>
    </Card>
  );
}
