import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, ArrowLeft, ShieldCheck, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type ResetStep = "email" | "otp" | "newPassword";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState<ResetStep>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "OTP Sent", description: "Check your email for the 6-digit verification code." });
      setStep("otp");
    }
    setLoading(false);
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) return;
    setLoading(true);

    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp,
      type: "recovery",
    });

    if (error) {
      toast({ title: "Invalid Code", description: "The code you entered is incorrect or has expired. Please try again.", variant: "destructive" });
    } else {
      toast({ title: "Verified", description: "Code verified. Set your new password." });
      setStep("newPassword");
    }
    setLoading(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "Passwords do not match.", variant: "destructive" });
      return;
    }
    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Password Reset", description: "Your password has been updated successfully." });
      await supabase.auth.signOut();
      navigate("/auth");
    }
    setLoading(false);
  };

  const stepConfig = {
    email: {
      title: "Reset Password",
      description: "Enter your email address and we'll send you a verification code.",
      icon: KeyRound,
    },
    otp: {
      title: "Enter Verification Code",
      description: `A 6-digit code has been sent to ${email}`,
      icon: ShieldCheck,
    },
    newPassword: {
      title: "Set New Password",
      description: "Choose a strong password for your account.",
      icon: Lock,
    },
  };

  const current = stepConfig[step];

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
            <div className="flex items-center gap-2">
              <current.icon className="h-5 w-5 text-primary" />
              <CardTitle>{current.title}</CardTitle>
            </div>
            <CardDescription>{current.description}</CardDescription>
            {/* Step indicator */}
            <div className="flex items-center gap-2 pt-2">
              {(["email", "otp", "newPassword"] as ResetStep[]).map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full transition-colors ${
                    step === s ? "bg-primary" : 
                    (["email", "otp", "newPassword"].indexOf(step) > i) ? "bg-primary/50" : "bg-muted"
                  }`} />
                  {i < 2 && <div className={`h-px w-6 transition-colors ${
                    (["email", "otp", "newPassword"].indexOf(step) > i) ? "bg-primary/50" : "bg-muted"
                  }`} />}
                </div>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {step === "email" && (
              <form onSubmit={handleSendOTP} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email Address</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@proregal.com"
                    required
                    autoFocus
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Sending..." : <>
                    <KeyRound className="mr-2 h-4 w-4" /> Send Verification Code
                  </>}
                </Button>
              </form>
            )}

            {step === "otp" && (
              <form onSubmit={handleVerifyOTP} className="space-y-4">
                <div className="space-y-3">
                  <Label>Verification Code</Label>
                  <div className="flex justify-center">
                    <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Didn't receive the code?{" "}
                    <button
                      type="button"
                      onClick={handleSendOTP as any}
                      className="text-primary hover:underline"
                    >
                      Resend
                    </button>
                  </p>
                </div>
                <Button type="submit" className="w-full" disabled={loading || otp.length !== 6}>
                  {loading ? "Verifying..." : <>
                    <ShieldCheck className="mr-2 h-4 w-4" /> Verify Code
                  </>}
                </Button>
              </form>
            )}

            {step === "newPassword" && (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Updating..." : <>
                    <Lock className="mr-2 h-4 w-4" /> Reset Password
                  </>}
                </Button>
              </form>
            )}

            <div className="mt-4 text-center">
              <button
                onClick={() => {
                  if (step === "otp") setStep("email");
                  else navigate("/auth");
                }}
                className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1"
              >
                <ArrowLeft className="h-3 w-3" />
                {step === "otp" ? "Change email" : "Back to Sign In"}
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
