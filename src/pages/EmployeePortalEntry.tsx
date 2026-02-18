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
      supabase
        .from("businesses")
        .select("business_code")
        .eq("business_code", saved)
        .maybeSingle()
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
      .from("businesses")
      .select("business_code")
      .eq("business_code", code)
      .maybeSingle();

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
        <Clock className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="text-center space-y-2 mb-8">
        <img src="/omnex-logo.jpg" alt="OmnexClock" className="h-20 w-20 mx-auto rounded-full object-cover" />
        <h1 className="text-2xl font-bold text-foreground">Employee Portal</h1>
        <p className="text-muted-foreground text-sm">Enter your business code to access your portal</p>
      </div>

      <Card className="w-full max-w-sm border border-border">
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              value={businessCode}
              onChange={(e) => setBusinessCode(e.target.value.toUpperCase())}
              placeholder="e.g. PRP"
              className="text-center text-lg tracking-widest uppercase"
              autoFocus
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Clock className="h-4 w-4 animate-spin" /> : "Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="mt-6 flex flex-col items-center gap-2">
        {hasSaved && (
          <Button variant="outline" size="sm" onClick={handleChangeBusiness} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Change Business
          </Button>
        )}
        <Link to="/">
          <Button variant="ghost" className="text-muted-foreground">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
