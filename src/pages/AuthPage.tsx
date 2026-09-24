import { useState, useEffect } from "react";
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
  const inviteToken = searchParams.get("invite");
  const [mode, setMode] = useState<AuthMode>(inviteToken ? "signUp" : "signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);

  // Accept invitation if token is present and user is logged in
  useEffect(() => {
    const acceptInvite = async () => {
      const token = sessionStorage.getItem("invite_token");
      if (!token || !user) return;
      
      try {
        const { data, error } = await supabase.rpc("accept_invitation", { _token: token });
        if (data) {
          sessionStorage.removeItem("invite_token");
          toast({ title: "Invitation accepted!", description: "Your role has been assigned. Redirecting..." });
          window.location.href = "/hub";
        }
      } catch (err) {
        console.error("Accept invitation error:", err);
      }
    };
    acceptInvite();
  }, [user]);

  if (user && isApproved && !denied) {
    if (isMasterLogin && isMaster) return <Navigate to="/master" replace />;
    if (!isMasterLogin) return <Navigate to={new URLSearchParams(window.location.search).get("next") === "events" ? "/hub?next=events" : "/hub"} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isMasterLogin) {
      const { error } = await signIn(email, password);
      if (!error) {
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
        if (inviteToken) {
          sessionStorage.setItem("invite_token", inviteToken);
        }
        toast({ title: "Success", description: "Check your email to confirm your account." });
      }
    } else {
      const { error } = await signIn(email, password);
      if (!error) {
        const { data: { user: signedInUser } } = await supabase.auth.getUser();
        if (signedInUser) {
          // Auto-accept any pending invitations for this email BEFORE checking roles,
          // so newly-invited admins/roster admins aren't blocked on first sign-in.
          try {
            await supabase.rpc("accept_pending_invitations_for_user");
          } catch (e) {
            console.warn("accept_pending_invitations_for_user failed", e);
          }

          const { data: roles } = await supabase
            .from("user_roles")
            .select("role, business_id")
            .eq("user_id", signedInUser.id);
          const hasBusinessRole = roles?.some(r => r.business_id !== null || r.role === "master");
          if (!hasBusinessRole) {
            setDenied(true);
            await supabase.auth.signOut();
            toast({ title: "Access Denied", description: "No business access found for this account.", variant: "destructive" });
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
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Ambient background */}
      <div className="absolute top-1/3 -left-24 w-56 h-56 rounded-full bg-primary/[0.03] blur-[80px] float" />
      <div className="absolute bottom-1/3 -right-24 w-60 h-60 rounded-full bg-primary/[0.025] blur-[80px] float" style={{ animationDelay: '2s' }} />

      <div className="w-full max-w-md space-y-6 relative z-10 animate-fade-in">
        <div className="text-center space-y-3">
          <div className="h-18 w-18 mx-auto rounded-2xl bg-primary/8 flex items-center justify-center shadow-lg shadow-primary/5 pulse-ring" style={{ height: '72px', width: '72px' }}>
            <IconComponent className="h-9 w-9 text-primary" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">{heading}</h1>
            <p className="text-muted-foreground text-sm">{subheading}</p>
          </div>
        </div>

        <Card className="border border-border/50 shadow-lg shadow-black/20">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isMasterLogin && mode === "signUp" && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" required className="h-11" />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={isMasterLogin ? "master@regalpavilion.com.au" : "admin@business.com"} required className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} className="h-11" />
              </div>
              <Button type="submit" className="w-full h-11 font-medium" disabled={loading}>
                {loading ? "Loading..." : isMasterLogin
                  ? <><Crown className="mr-2 h-4 w-4" /> Master Sign In</>
                  : mode === "signUp"
                    ? <><UserPlus className="mr-2 h-4 w-4" /> Create Account</>
                    : <><LogIn className="mr-2 h-4 w-4" /> Sign In</>}
              </Button>
            </form>
            <div className="mt-5 text-center space-y-2">
              {isMasterLogin && (
                <Link to="/reset-password?master=true" className="text-sm text-primary hover:underline block w-full">
                  Forgot password?
                </Link>
              )}
              {!isMasterLogin && (
                <>
                  {mode === "signIn" && (
                    <>
                      <Link to="/reset-password" className="text-sm text-primary hover:underline block w-full">
                        Forgot password?
                      </Link>
                      <button onClick={() => setMode("signUp")} className="text-sm text-muted-foreground hover:text-foreground hover:underline block w-full transition-colors">
                        Need an account? Sign Up
                      </button>
                    </>
                  )}
                  {mode === "signUp" && (
                    <button onClick={() => setMode("signIn")} className="text-sm text-muted-foreground hover:text-foreground hover:underline transition-colors">
                      Already have an account? Sign In
                    </button>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Link to="/" className="flex items-center justify-center text-sm text-muted-foreground hover:text-foreground transition-colors gap-1">
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}