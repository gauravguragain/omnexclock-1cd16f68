import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { LogIn, UserPlus } from "lucide-react";

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isSignUp) {
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
            <CardTitle>{isSignUp ? "Create Account" : "Sign In"}</CardTitle>
            <CardDescription>
              {isSignUp ? "Register a new admin account" : "Sign in to the admin dashboard"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignUp && (
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
                {loading ? "Loading..." : isSignUp ? <><UserPlus className="mr-2 h-4 w-4" /> Create Account</> : <><LogIn className="mr-2 h-4 w-4" /> Sign In</>}
              </Button>
            </form>
            <div className="mt-4 text-center">
              <button onClick={() => setIsSignUp(!isSignUp)} className="text-sm text-primary hover:underline">
                {isSignUp ? "Already have an account? Sign In" : "Need an account? Sign Up"}
              </button>
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
