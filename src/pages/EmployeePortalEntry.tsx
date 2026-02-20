import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Clock, Users, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

const STORAGE_KEY = "omnexclock_portal_business_code";

export default function EmployeePortalEntry() {
  const [businessCode, setBusinessCode] = useState("");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  const [hasSaved, setHasSaved] = useState(false);

  // Auto-redirect if business code is saved on this device
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setHasSaved(true);
      (supabase
        .from("businesses_public" as any)
        .select("business_code")
        .eq("business_code", saved)
        .maybeSingle() as unknown as Promise<{ data: { business_code: string } | null }>)
        .then(({ data }) => {
          if (data) {
            navigate(`/b/${data.business_code}/portal`, { replace: true });
          } else {
            localStorage.removeItem(STORAGE_KEY);
            setHasSaved(false);
            setLoading(false);
          }
        });
    } else {
      setLoading(false);
    }
  }, []);

  const handleChangeBusiness = () => {
    localStorage.removeItem(STORAGE_KEY);
    setHasSaved(false);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = businessCode.trim().toUpperCase();
    if (!code) {
      toast({ title: "Enter Business Code", description: "Please enter your business code.", variant: "destructive" });
      return;
    }

    setLoading(true);
    const { data } = await supabase
      .from("businesses_public" as any)
      .select("business_code")
      .eq("business_code", code)
      .maybeSingle() as { data: { business_code: string } | null };

    if (!data) {
      toast({ title: "Business Not Found", description: "No business found with that code.", variant: "destructive" });
      setLoading(false);
      return;
    }

    localStorage.setItem(STORAGE_KEY, data.business_code);
    navigate(`/b/${data.business_code}/portal`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Clock className="h-8 w-8 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-background p-4 relative overflow-hidden standalone-top-pad safe-x">
      <div className="absolute top-1/3 -left-24 w-56 h-56 rounded-full bg-primary/[0.03] blur-[80px] float" />
      <div className="absolute bottom-1/3 -right-24 w-60 h-60 rounded-full bg-primary/[0.025] blur-[80px] float" style={{ animationDelay: '2s' }} />

      <div className="text-center space-y-4 mb-10 animate-fade-in">
        <img src="/omnex-logo.jpg" alt="OmnexClock" className="h-20 w-20 mx-auto rounded-2xl object-cover shadow-xl shadow-primary/10 pulse-ring" />
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Employee Portal</h1>
          <p className="text-muted-foreground text-sm">Enter your business code to access your portal</p>
        </div>
      </div>

      <Card className="w-full max-w-sm border border-border/50 shadow-lg shadow-black/20 animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              value={businessCode}
              onChange={(e) => setBusinessCode(e.target.value.toUpperCase())}
              placeholder="e.g. ABC123"
              className="text-center text-lg tracking-widest uppercase h-12"
              autoFocus
            />
            <Button type="submit" className="w-full h-12 font-medium touch-active btn-press" disabled={loading}>
              {loading ? <Clock className="h-4 w-4 animate-spin" /> : "Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="mt-8 flex flex-col items-center gap-2">
        {hasSaved && (
          <Button variant="outline" size="sm" onClick={handleChangeBusiness} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Change Business
          </Button>
        )}
        <Link to="/">
          <Button variant="ghost" className="text-muted-foreground hover:text-foreground transition-colors gap-1">
            ← Back to Home
          </Button>
        </Link>
      </div>
    </div>
  );
}