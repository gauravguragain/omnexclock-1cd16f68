import { useState, useRef, useCallback, useEffect } from "react";
import { useActionLock } from "@/contexts/ActionLockContext";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Camera, Clock, Coffee, LogIn, LogOut, ArrowLeft, Delete, User, ShieldCheck } from "lucide-react";
import { toAusTime12, toAusTime12WithSeconds, toAusFormatted } from "@/lib/dateUtils";

type KioskStep = "loading" | "code_entry" | "action_select" | "photo_capture" | "confirmation";
type EmployeeStatus = "clocked_out" | "clocked_in" | "on_break";

export default function KioskPage() {
  const { runAction } = useActionLock();
  const { toast } = useToast();
  const { businessCode: urlBusinessCode } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState<KioskStep>("loading");
  const [businessName, setBusinessName] = useState("");
  const [businessLogo, setBusinessLogo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [selectedAction, setSelectedAction] = useState<string>("");
  const codeRef = useRef("");
  const actionRef = useRef("");
  const [employeeName, setEmployeeName] = useState("");
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [employeeStatus, setEmployeeStatus] = useState<EmployeeStatus>("clocked_out");
  const [loading, setLoading] = useState(false);
  const [photoData, setPhotoData] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load business from URL param and apply theme
  useEffect(() => {
    if (!urlBusinessCode) return;
    const loadBusiness = async () => {
      const { data } = await supabase
        .from("businesses")
        .select("name, logo_url, theme, status")
        .eq("business_code", urlBusinessCode.toUpperCase())
        .maybeSingle();
      if (data) {
        // Block suspended/deactivated businesses from kiosk
        if (data.status === "suspended" || data.status === "deactivated") {
          setBusinessName(data.name);
          setBusinessLogo(data.logo_url);
          toast({ title: "Business Unavailable", description: `This business has been ${data.status} by the platform administrator.`, variant: "destructive" });
          return;
        }
        setBusinessName(data.name);
        setBusinessLogo(data.logo_url);
        setStep("code_entry");
        // Apply business theme
        if (data.theme && typeof data.theme === "object") {
          const t = data.theme as Record<string, string>;
          const root = document.documentElement;
          Object.entries(t).forEach(([key, value]) => {
            root.style.setProperty(`--${key}`, value);
          });
        }
      }
    };
    loadBusiness();
    return () => {
      // Reset theme on unmount
      const root = document.documentElement;
      const defaults: Record<string, string> = {
        primary: "43 72% 52%", background: "0 0% 0%", foreground: "0 0% 96%",
        card: "0 0% 4%", border: "0 0% 16%", muted: "0 0% 10%", accent: "43 72% 52%",
      };
      Object.entries(defaults).forEach(([key, value]) => {
        root.style.setProperty(`--${key}`, value);
      });
    };
  }, [urlBusinessCode]);

  const getEmployeeStatusByCode = async (employeeCode: string): Promise<{ id: string; name: string; status: EmployeeStatus } | null> => {
    const { data, error } = await supabase.rpc("get_employee_status", { _employee_code: employeeCode, _business_code: urlBusinessCode?.toUpperCase() || null });
    if (error || !data || data.length === 0) return null;
    const row = data[0];
    return {
      id: row.employee_id,
      name: row.employee_name,
      status: (row.current_status as EmployeeStatus) || "clocked_out",
    };
  };

  // Realtime: if admin deletes/edits events while kiosk is on action_select, refresh status
  useEffect(() => {
    if (!employeeId || step !== "action_select") return;

    const channel = supabase
      .channel("kiosk-status-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "clock_events" }, async () => {
        // Re-check status via secure RPC
        if (codeRef.current) {
          const result = await getEmployeeStatusByCode(codeRef.current);
          if (result) {
            setEmployeeStatus(result.status);
            if (result.status === "clocked_out" && employeeStatus !== "clocked_out") {
              toast({ title: "Status Changed", description: "Your timesheet was updated by an admin." });
              resetKiosk();
            }
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [employeeId, step]);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      toast({ title: "Camera Error", description: "Unable to access camera.", variant: "destructive" });
    }
  }, [toast]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const submitClock = useCallback(async (photo: string) => {
    await runAction(async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("kiosk-clock", {
          body: {
            employee_code: codeRef.current,
            event_type: actionRef.current,
            photo_base64: photo,
            business_code: urlBusinessCode?.toUpperCase() || null,
            device_info: { userAgent: navigator.userAgent, screen: `${screen.width}x${screen.height}` },
          },
        });

        if (error || data?.error) {
          toast({ title: "Error", description: data?.error || error?.message || "Failed to clock", variant: "destructive" });
          resetKiosk();
        } else {
          setEmployeeName(data.employee_name);
          setStep("confirmation");
          setTimeout(resetKiosk, 4000);
        }
      } catch {
        toast({ title: "Error", description: "Network error", variant: "destructive" });
        resetKiosk();
      }
      setLoading(false);
    });
  }, [toast, runAction]);

  const captureAndSubmit = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(videoRef.current, 0, 0, 640, 480);
    const data = canvas.toDataURL("image/jpeg", 0.7);
    setPhotoData(data);
    stopCamera();
    submitClock(data);
  }, [stopCamera, submitClock]);

  const handleNumpadClick = (num: string) => {
    if (code.length < 4) setCode((prev) => prev + num);
  };

  const handleSubmitCode = async () => {
    if (!code) return;
    if (!/^\d{4}$/.test(code)) {
      toast({ title: "Invalid Code", description: "Please enter a valid employee code.", variant: "destructive" });
      setCode("");
      return;
    }
    await runAction(async () => {
      setLoading(true);
      try {
        const result = await getEmployeeStatusByCode(code);

        if (!result) {
          toast({ title: "Invalid Code", description: "Employee not found. Please try again.", variant: "destructive" });
          setCode("");
          setLoading(false);
          return;
        }

        setEmployeeName(result.name);
        setEmployeeId(result.id);
        setEmployeeStatus(result.status);
        codeRef.current = code;
        setStep("action_select");
      } catch {
        toast({ title: "Error", description: "Unable to verify employee code.", variant: "destructive" });
      }
      setLoading(false);
    });
  };

  const handleActionSelect = async (action: string) => {
    setSelectedAction(action);
    actionRef.current = action;
    setStep("photo_capture");

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        startCamera().then(() => resolve());
      }, 100);
    });
    // Small delay for camera to render, then capture
    setTimeout(() => captureAndSubmit(), 1500);
  };

  const resetKiosk = () => {
    setStep("code_entry");
    setCode("");
    codeRef.current = "";
    setSelectedAction("");
    actionRef.current = "";
    setEmployeeName("");
    setEmployeeId(null);
    setEmployeeStatus("clocked_out");
    setPhotoData(null);
    stopCamera();
  };

  const getAvailableActions = () => {
    switch (employeeStatus) {
      case "clocked_out":
        return ["clock_in"];
      case "clocked_in":
        return ["break_start", "clock_out"];
      case "on_break":
        return ["break_end"];
      default:
        return ["clock_in"];
    }
  };

  const statusConfig: Record<EmployeeStatus, { label: string; color: string; icon: React.ReactNode }> = {
    clocked_out: { label: "Clocked Out", color: "bg-muted text-muted-foreground", icon: <LogOut className="h-4 w-4" /> },
    clocked_in: { label: "Clocked In", color: "bg-success/20 text-success", icon: <LogIn className="h-4 w-4" /> },
    on_break: { label: "On Break", color: "bg-warning/20 text-warning", icon: <Coffee className="h-4 w-4" /> },
  };

  const actionLabels: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    clock_in: { label: "Clock In", icon: <LogIn className="h-8 w-8" />, color: "bg-success text-success-foreground" },
    clock_out: { label: "Clock Out", icon: <LogOut className="h-8 w-8" />, color: "bg-destructive text-destructive-foreground" },
    break_start: { label: "Start Break", icon: <Coffee className="h-8 w-8" />, color: "bg-warning text-warning-foreground" },
    break_end: { label: "End Break", icon: <Clock className="h-8 w-8" />, color: "bg-primary text-primary-foreground" },
  };

  const availableActions = getAvailableActions();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      {/* Header */}
      <div className="text-center mb-6">
        {businessLogo ? (
          <img src={businessLogo} alt={businessName} className="h-16 w-16 mx-auto rounded-lg object-cover mb-2" />
        ) : (
          <div className="h-16 w-16 mx-auto rounded-lg bg-primary/15 flex items-center justify-center mb-2">
            <Clock className="h-8 w-8 text-primary" />
          </div>
        )}
        <h1 className="text-xl font-bold text-primary">{businessName}</h1>
        <p className="text-3xl font-mono text-foreground mt-2">
          {toAusTime12WithSeconds(currentTime)}
        </p>
        <p className="text-sm text-muted-foreground">
          {toAusFormatted(currentTime, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {/* Loading */}
      {step === "loading" && (
        <div className="flex items-center justify-center">
          <Clock className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Code Entry */}
      {step === "code_entry" && (
        <Card className="w-full max-w-sm gold-border border gold-glow">
          <CardContent className="p-6 space-y-4">
            <p className="text-center text-sm text-muted-foreground">Enter your employee code</p>
            <Input
              value={code}
              readOnly
              className="text-center text-3xl tracking-[0.5em] font-mono h-16 bg-surface"
              placeholder="••••"
            />
            {/* Numpad */}
            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
                <Button key={n} variant="secondary" className="h-16 text-2xl font-bold" onClick={() => handleNumpadClick(n)}>
                  {n}
                </Button>
              ))}
              <Button variant="secondary" className="h-16" onClick={resetKiosk}>
                <ArrowLeft className="h-6 w-6" />
              </Button>
              <Button variant="secondary" className="h-16 text-2xl font-bold" onClick={() => handleNumpadClick("0")}>
                0
              </Button>
              <Button variant="secondary" className="h-16" onClick={() => setCode((p) => p.slice(0, -1))}>
                <Delete className="h-6 w-6" />
              </Button>
            </div>
            <Button className="w-full h-14 text-lg" onClick={handleSubmitCode} disabled={code.length !== 4 || loading}>
              {loading ? "Verifying..." : "Continue"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Action Select */}
      {step === "action_select" && (
        <Card className="w-full max-w-sm gold-border border">
          <CardContent className="p-6 space-y-4">
            {/* Employee info & status */}
            <div className="text-center space-y-2">
              <div className="flex items-center justify-center gap-2">
                <User className="h-5 w-5 text-primary" />
                <span className="text-lg font-semibold text-foreground">{employeeName}</span>
              </div>
              <div className="flex justify-center">
                <Badge className={`${statusConfig[employeeStatus].color} gap-1 px-3 py-1`}>
                  {statusConfig[employeeStatus].icon}
                  {statusConfig[employeeStatus].label}
                </Badge>
              </div>
            </div>

            <p className="text-center text-sm text-muted-foreground">Select action</p>
            <div className={`grid gap-3 ${availableActions.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
              {availableActions.map((key) => {
                const { label, icon, color } = actionLabels[key];
                return (
                  <Button key={key} className={`h-24 flex flex-col gap-2 ${color}`} onClick={() => handleActionSelect(key)}>
                    {icon}
                    <span className="text-sm font-semibold">{label}</span>
                  </Button>
                );
              })}
            </div>
            <Button variant="outline" className="w-full mt-2" onClick={resetKiosk}>
              Cancel
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Photo Capture */}
      {step === "photo_capture" && (
        <Card className="w-full max-w-sm gold-border border">
          <CardContent className="p-6 space-y-4">
            <p className="text-center text-sm text-muted-foreground">
              {loading ? "Submitting..." : photoData ? "Photo captured!" : "Hold still — capturing photo..."}
            </p>
            <div className="relative rounded-lg overflow-hidden bg-surface aspect-[4/3]">
              {photoData ? (
                <img src={photoData} alt="Captured" className="w-full h-full object-cover" />
              ) : (
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              )}
              {loading && (
                <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirmation */}
      {step === "confirmation" && (
        <Card className="w-full max-w-sm gold-border border gold-glow">
          <CardContent className="p-8 text-center space-y-4">
            <div className="h-20 w-20 mx-auto rounded-full bg-success/20 flex items-center justify-center">
              {actionLabels[selectedAction]?.icon}
            </div>
            <h2 className="text-2xl font-bold text-foreground">{actionLabels[selectedAction]?.label}</h2>
            <p className="text-xl gold-text font-semibold">{employeeName}</p>
            <p className="text-muted-foreground text-sm">
              {toAusTime12(currentTime)}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Footer */}
      <div className="mt-8 flex flex-col items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground"
          onClick={async () => {
            // Always sign out first so kiosk can never be backtracked to a logged-in admin session
            await supabase.auth.signOut();
            navigate(`/b/${urlBusinessCode}/admin`);
          }}
        >
          <ShieldCheck className="h-4 w-4 mr-1" />
          Admin Login
        </Button>
        <p className="text-xs text-muted-foreground">
          © 2024 Omnex Ventures Pty. Ltd. All rights reserved.
        </p>
      </div>
    </div>
  );
}
