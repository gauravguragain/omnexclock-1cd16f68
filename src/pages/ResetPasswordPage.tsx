import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, ArrowLeft, ShieldCheck, Lock, Crown, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type ResetStep = "email" | "otp" | "newPassword";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMasterReset = searchParams.get("master") === "true";
  const { toast } = useToast();
  const [step, setStep] = useState<ResetStep>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const startCooldown = () => {
    setResendCooldown(60);
    const interval = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSendOTP = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email.trim()) return;
    setLoading(true);

    const { data, error } = await supabase.functions.invoke("reset-password-otp", {
      body: { action: "send", email: email.trim() },
    });

    if (error) {
      toast({ title: "Error", description: "Failed to send code. Please try again.", variant: "destructive" });
    } else if (data?.error) {
      toast({ title: "Error", description: data.error, variant: "destructive" });
    } else {
      toast({ title: "Code Sent", description: "Check your email for the 6-digit verification code." });
      setStep("otp");
      startCooldown();
    }
    setLoading(false);
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) return;
    setLoading(true);

    const { data, error } = await supabase.functions.invoke("reset-password-otp", {
      body: { action: "verify", email: email.trim(), otp },
    });

    if (error || data?.error) {
      toast({
        title: "Invalid Code",
        description: data?.error || "The code you entered is incorrect or has expired.",
        variant: "destructive",
      });
    } else if (data?.verificationToken) {
      setVerificationToken(data.verificationToken);
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

    const { data, error } = await supabase.functions.invoke("reset-password-otp", {
      body: { action: "reset", email: email.trim(), otp: verificationToken, newPassword },
    });

    if (error || data?.error) {
      toast({
        title: "Error",
        description: data?.error || "Failed to reset password. Please try again.",
        variant: "destructive",
      });
    } else {
      toast({ title: "Password Reset", description: "Your password has been updated successfully. Please sign in." });
      navigate(isMasterReset ? "/auth?master=true" : "/auth");
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
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Ambient background — consistent with other pages */}
      <div className="absolute top-1/3 -left-24 w-56 h-56 rounded-full bg-primary/[0.03] blur-[80px] float" />
      <div className="absolute bottom-1/3 -right-24 w-60 h-60 rounded-full bg-primary/[0.025] blur-[80px] float" style={{ animationDelay: '2s' }} />

      <div className="w-full max-w-md space-y-6 relative z-10 animate-fade-in">
        <div className="text-center space-y-3">
          <div className="h-18 w-18 mx-auto rounded-2xl bg-primary/8 flex items-center justify-center shadow-lg shadow-primary/5" style={{ height: '72px', width: '72px' }}>
            {isMasterReset ? <Crown className="h-9 w-9 text-primary" /> : <Clock className="h-9 w-9 text-primary" />}
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">{isMasterReset ? "Master Admin" : "OmnexClock"}</h1>
            <p className="text-muted-foreground text-sm">Password Recovery</p>
          </div>
        </div>

        <Card className="border border-border/50 shadow-lg shadow-black/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <current.icon className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">{current.title}</CardTitle>
            </div>
            <CardDescription>{current.description}</CardDescription>
            {/* Step indicator */}
            <div className="flex items-center gap-2 pt-2">
              {(["email", "otp", "newPassword"] as ResetStep[]).map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div
                    className={`h-2 w-2 rounded-full transition-colors ${
                      step === s
                        ? "bg-primary"
                        : ["email", "otp", "newPassword"].indexOf(step) > i
                          ? "bg-primary/50"
                          : "bg-muted"
                    }`}
                  />
                  {i < 2 && (
                    <div
                      className={`h-px w-6 transition-colors ${
                        ["email", "otp", "newPassword"].indexOf(step) > i ? "bg-primary/50" : "bg-muted"
                      }`}
                    />
                  )}
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
                    placeholder="you@business.com"
                    required
                    autoFocus
                    className="h-11"
                  />
                </div>
                <Button type="submit" className="w-full h-11 font-medium" disabled={loading}>
                  {loading ? "Sending..." : (
                    <>
                      <KeyRound className="mr-2 h-4 w-4" /> Send Verification Code
                    </>
                  )}
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
                      disabled={resendCooldown > 0}
                      onClick={() => handleSendOTP()}
                      className="text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend"}
                    </button>
                  </p>
                </div>
                <Button type="submit" className="w-full h-11 font-medium" disabled={loading || otp.length !== 6}>
                  {loading ? "Verifying..." : (
                    <>
                      <ShieldCheck className="mr-2 h-4 w-4" /> Verify Code
                    </>
                  )}
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
                    className="h-11"
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
                    className="h-11"
                  />
                </div>
                <Button type="submit" className="w-full h-11 font-medium" disabled={loading}>
                  {loading ? "Updating..." : (
                    <>
                      <Lock className="mr-2 h-4 w-4" /> Reset Password
                    </>
                  )}
                </Button>
              </form>
            )}

            <div className="mt-5 text-center">
              <button
                onClick={() => {
                  if (step === "otp") {
                    setStep("email");
                    setOtp("");
                  } else {
                    navigate(isMasterReset ? "/auth?master=true" : "/auth");
                  }
                }}
                className="text-sm text-muted-foreground hover:text-foreground hover:underline inline-flex items-center gap-1 transition-colors"
              >
                <ArrowLeft className="h-3 w-3" />
                {step === "otp" ? "Change email" : "Back to Sign In"}
              </button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-[11px] text-muted-foreground/40 tracking-wide">
          © {new Date().getFullYear()} Omnex Ventures Pty. Ltd. All rights reserved.
        </p>
      </div>
    </div>
  );
}
