import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Building2, ArrowLeft } from "lucide-react";
import { logMasterAudit } from "@/lib/auditLog";

export default function RegisterBusinessPage() {
  const { user, signUp } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState<"signup" | "business_details">(user ? "business_details" : "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessCode, setBusinessCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signUp(email, password, fullName);
    if (error) {
      toast({ title: "Error", description: error, variant: "destructive" });
    } else {
      toast({ title: "Account Created", description: "Please check your email to verify, then come back to register your business." });
    }
    setLoading(false);
  };

  const handleRegisterBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({ title: "Error", description: "Please sign in first", variant: "destructive" });
      return;
    }

    const code = businessCode.trim().toUpperCase().replace(/\s+/g, "-");
    if (code.length < 3) {
      toast({ title: "Error", description: "Business code must be at least 3 characters", variant: "destructive" });
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.rpc("register_business", {
      _business_name: businessName.trim(),
      _business_code: code,
    });

    if (error) {
      const msg = error.message.includes("duplicate")
        ? "This business code is already taken. Please choose another."
        : error.message;
      toast({ title: "Error", description: msg, variant: "destructive" });
    } else {
      toast({ title: "Business Registered!", description: "Your business has been registered. A platform administrator will review and approve your account shortly." });
      logMasterAudit("business_registered", { business_name: businessName.trim(), business_code: code });
    }
    setLoading(false);
  };

  if (user && step === "signup") {
    setStep("business_details");
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute top-1/3 -left-24 w-56 h-56 rounded-full bg-primary/[0.03] blur-[80px] float" />
      <div className="absolute bottom-1/3 -right-24 w-60 h-60 rounded-full bg-primary/[0.025] blur-[80px] float" style={{ animationDelay: '2s' }} />

      <div className="w-full max-w-md space-y-6 relative z-10 animate-fade-in">
        <div className="text-center space-y-3">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-primary/8 flex items-center justify-center shadow-lg shadow-primary/5">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Register Your Business</h1>
            <p className="text-muted-foreground text-sm">
              {step === "signup"
                ? "Create your account to get started"
                : "Set up your business details"}
            </p>
          </div>
        </div>

        <Card className="border border-border/50 shadow-lg shadow-black/20">
          <CardHeader>
            <CardTitle>{step === "signup" ? "Create Account" : "Business Details"}</CardTitle>
            <CardDescription>
              {step === "signup"
                ? "First, create your admin account"
                : "Your email will automatically become the admin for this business"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === "signup" ? (
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" required className="h-11" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourbusiness.com" required className="h-11" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} className="h-11" />
                </div>
                <Button type="submit" className="w-full h-11 font-medium" disabled={loading}>
                  {loading ? "Creating..." : "Create Account"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Already have an account?{" "}
                  <Link to="/auth" className="text-primary hover:underline">Sign in</Link>
                  {" "}then come back here.
                </p>
              </form>
            ) : (
              <form onSubmit={handleRegisterBusiness} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business Name</Label>
                  <Input id="businessName" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="My Amazing Business" required className="h-11" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessCode">Business Code</Label>
                  <Input
                    id="businessCode"
                    value={businessCode}
                    onChange={(e) => setBusinessCode(e.target.value.toUpperCase())}
                    placeholder="e.g. MAB or MY-BIZ"
                    required
                    minLength={3}
                    maxLength={20}
                    className="h-11"
                  />
                  <p className="text-xs text-muted-foreground">
                    Employees will use this code to access the kiosk and portal. Must be unique.
                  </p>
                </div>
                <Button type="submit" className="w-full h-11 font-medium" disabled={loading}>
                  {loading ? "Registering..." : "Register Business"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Link to="/" className="flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}