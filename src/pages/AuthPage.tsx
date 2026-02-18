import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { LogIn, UserPlus, ShieldCheck, Crown } from "lucide-react";

type AuthMode = "signIn" | "signUp";

export default function AuthPage() {
  const { user, isAdmin, isMaster, isApproved, signIn, signUp } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const isMasterLogin = searchParams.get("master") === "true";
  const [mode, setMode] = useState<AuthMode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect based on login type
  if (user && isApproved) {
    if (isMasterLogin && isMaster) return <Navigate to="/master" replace />;
    if (!isMasterLogin) return <Navigate to="/hub" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isMasterLogin) {
      const { error } = await signIn(email, password);
      if (!error) {
        // Verify user actually has master role after sign-in
        const { data: { user: signedInUser } } = await supabase.auth.getUser();
        if (signedInUser) {
          const { data: roles } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", signedInUser.id)
            .eq("role", "master");
          if (!roles || roles.length === 0) {
            await supabase.auth.signOut();
            toast({ title: "Access Denied", description: "This login is for master admins only.", variant: "destructive" });
            setLoading(false);
            return;
          }
        }
      } else {
        toast({ title: "Error", description: error, variant: "destructive" });
      }
    } else if (mode === "signUp") {
      const { error } = await signUp(email, password, fullName);
      if (error) {
        toast({ title: "Error", description: error, variant: "destructive" });
      } else {
        toast({ title: "Success", description: "Check your email to confirm your account." });
      }
    } else {
      const { error } = await signIn(email, password);
      if (!error) {
        // Block master-only accounts from business admin login
        const { data: { user: signedInUser } } = await supabase.auth.getUser();
        if (signedInUser) {
          const { data: roles } = await supabase
            .from("user_roles")
            .select("role, business_id")
            .eq("user_id", signedInUser.id);
          const hasMaster = roles?.some(r => r.role === "master");
          const hasBusinessRole = roles?.some(r => r.role !== "master" && r.business_id);
          if (hasMaster && !hasBusinessRole) {
            await supabase.auth.signOut();
            toast({ title: "Access Denied", description: "Master admin cannot sign in here. Use the Master Login on the home page.", variant: "destructive" });
            setLoading(false);
            return;
          }
        }
      } else {
        toast({ title: "Error", description: error, variant: "destructive" });
      }
    }
    setLoading(false);
  };

  const title = isMasterLogin
    ? "Master Admin Login"
    : mode === "signIn" ? "Sign In" : "Create Account";
  const description = isMasterLogin
    ? "Sign in with your master admin credentials"
    : mode === "signIn"
      ? "Sign in to the admin dashboard"
      : "Register a new admin account";

  const IconComponent = isMasterLogin ? Crown : ShieldCheck;
  const heading = isMasterLogin ? "Master Admin" : "Admin Sign In";
  const subheading = isMasterLogin ? "Platform management access" : "Access your business dashboard";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="h-20 w-20 mx-auto rounded-full bg-primary/15 flex items-center justify-center">
            <IconComponent className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{heading}</h1>
          <p className="text-muted-foreground text-sm">{subheading}</p>
        </div>

        <Card className="border border-border">
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isMasterLogin && mode === "signUp" && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" required />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={isMasterLogin ? "master@omnexclock.com" : "admin@business.com"} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Loading..." : isMasterLogin
                  ? <><Crown className="mr-2 h-4 w-4" /> Master Sign In</>
                  : mode === "signUp"
                    ? <><UserPlus className="mr-2 h-4 w-4" /> Create Account</>
                    : <><LogIn className="mr-2 h-4 w-4" /> Sign In</>}
              </Button>
            </form>
            {!isMasterLogin && (
              <div className="mt-4 text-center space-y-2">
                {mode === "signIn" && (
                  <>
                    <Link to="/reset-password" className="text-sm text-primary hover:underline block w-full">
                      Forgot password?
                    </Link>
                    <button onClick={() => setMode("signUp")} className="text-sm text-muted-foreground hover:underline block w-full">
                      Need an account? Sign Up
                    </button>
                  </>
                )}
                {mode === "signUp" && (
                  <button onClick={() => setMode("signIn")} className="text-sm text-muted-foreground hover:underline">
                    Already have an account? Sign In
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Link to="/" className="flex items-center justify-center text-sm text-muted-foreground hover:text-foreground">
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}
