import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { LogIn, UserPlus, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type AuthMode = "signIn" | "signUp" | "forgotPassword";

export default function AuthPage() {
  const { user, isAdmin, signIn, signUp } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<AuthMode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  if (user && isAdmin) return <Navigate to="/admin" replace />;
  if (user) return <Navigate to="/kiosk" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (mode === "forgotPassword") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth?mode=reset`,
      });
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Email Sent", description: "Check your inbox for the password reset link." });
        setMode("signIn");
      }
      setLoading(false);
      return;
    }

    if (mode === "signUp") {
      const { error } = await signUp(email, password, fullName);
      if (error) {
        toast({ title: "Error", description: error, variant: "destructive" });
      } else {
        toast({ title: "Success", description: "Check your email to confirm your account." });
      }
    } else {
      const { error } = await signIn(email, password);
      if (error) {
        toast({ title: "Error", description: error, variant: "destructive" });
      }
    }
    setLoading(false);
  };

  const title = mode === "signIn" ? "Sign In" : mode === "signUp" ? "Create Account" : "Reset Password";
  const description = mode === "signIn"
    ? "Sign in to the admin dashboard"
    : mode === "signUp"
    ? "Register a new admin account"
    : "Enter your email to receive a password reset link";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <img src="/logo.jpeg" alt="Pro Regal Pavilion" className="h-20 w-20 mx-auto rounded-lg object-cover" />
          <h1 className="text-2xl font-bold gold-text">Pro Regal Pavilion</h1>
          <p className="text-muted-foreground text-sm">Admin Portal</p>
        </div>

        <Card className="gold-border border">
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signUp" && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" required />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@proregal.com" required />
              </div>
              {mode !== "forgotPassword" && (
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Loading..." : mode === "signUp"
                  ? <><UserPlus className="mr-2 h-4 w-4" /> Create Account</>
                  : mode === "forgotPassword"
                  ? <><KeyRound className="mr-2 h-4 w-4" /> Send Reset Link</>
                  : <><LogIn className="mr-2 h-4 w-4" /> Sign In</>}
              </Button>
            </form>
            <div className="mt-4 text-center space-y-2">
              {mode === "signIn" && (
                <>
                  <button onClick={() => setMode("forgotPassword")} className="text-sm text-primary hover:underline block w-full">
                    Forgot password?
                  </button>
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
              {mode === "forgotPassword" && (
                <button onClick={() => setMode("signIn")} className="text-sm text-muted-foreground hover:underline">
                  Back to Sign In
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          © 2024 Omnex Ventures Pty. Ltd. All rights reserved.
        </p>
      </div>
    </div>
  );
}
