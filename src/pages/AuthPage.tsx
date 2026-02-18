import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { LogIn, UserPlus, ShieldCheck } from "lucide-react";

type AuthMode = "signIn" | "signUp";

export default function AuthPage() {
  const { user, isAdmin, isApproved, signIn, signUp } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<AuthMode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  if (user && isAdmin && isApproved) return <Navigate to="/admin" replace />;
  if (user && isApproved) return <Navigate to="/kiosk" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

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

  const title = mode === "signIn" ? "Sign In" : "Create Account";
  const description = mode === "signIn"
    ? "Sign in to the admin dashboard"
    : "Register a new admin account";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="h-20 w-20 mx-auto rounded-full bg-primary/15 flex items-center justify-center">
            <ShieldCheck className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Admin Sign In</h1>
          <p className="text-muted-foreground text-sm">Access your business dashboard</p>
        </div>

        <Card className="border border-border">
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
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Loading..." : mode === "signUp"
                  ? <><UserPlus className="mr-2 h-4 w-4" /> Create Account</>
                  : <><LogIn className="mr-2 h-4 w-4" /> Sign In</>}
              </Button>
            </form>
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
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          © 2024 Omnex Ventures Pty. Ltd. All rights reserved.
        </p>
      </div>
    </div>
  );
}
