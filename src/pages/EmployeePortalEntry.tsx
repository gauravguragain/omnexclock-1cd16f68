import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Clock, Users } from "lucide-react";
import { Link } from "react-router-dom";

export default function EmployeePortalEntry() {
  const [businessCode, setBusinessCode] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

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

    navigate(`/b/${data.business_code}/portal`);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="text-center space-y-2 mb-8">
        <div className="h-20 w-20 mx-auto rounded-full bg-primary/15 flex items-center justify-center">
          <Users className="h-10 w-10 text-primary" />
        </div>
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

      <Link to="/" className="mt-6">
        <Button variant="ghost" className="text-muted-foreground">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Home
        </Button>
      </Link>
    </div>
  );
}
