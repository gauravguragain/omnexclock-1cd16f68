import { useState, useRef, useCallback, useEffect } from "react";
import { useActionLock } from "@/contexts/ActionLockContext";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Camera, Clock, Coffee, LogIn, LogOut, ArrowLeft, Delete, User, ShieldCheck, VideoOff, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { Textarea } from "@/components/ui/textarea";
import { toAusTime12, toAusTime12WithSeconds, toAusFormatted } from "@/lib/dateUtils";

type KioskStep = "loading" | "camera_permission" | "code_entry" | "action_select" | "photo_capture" | "confirmation";
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
  const [description, setDescription] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [cameraGranted, setCameraGranted] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const captureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Prevent browser back button and navigation away from kiosk
  useEffect(() => {
    // Replace current history entry so there's nothing to go back to
    window.history.replaceState(null, "", window.location.href);

    const blockBack = () => {
      window.history.pushState(null, "", window.location.href);
    };
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", blockBack);

    // Warn on tab close / accidental navigation
    const blockUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", blockUnload);

    return () => {
      window.removeEventListener("popstate", blockBack);
      window.removeEventListener("beforeunload", blockUnload);
    };
  }, []);

  // Ensure kiosk PWA manifest is active (reinforces the inline script in index.html)
  useEffect(() => {
    if (!urlBusinessCode) return;

    // The inline script in index.html handles the initial manifest swap.
    // This effect ensures it stays correct and updates apple meta tags.
    const ensureKioskManifest = () => {
      const existingManifests = document.querySelectorAll('link[rel="manifest"]');
      let hasKioskManifest = false;
      existingManifests.forEach((el) => {
        if (el instanceof HTMLLinkElement && el.href.startsWith("blob:")) {
          hasKioskManifest = true;
        } else {
          el.remove();
        }
      });

      if (!hasKioskManifest) {
        // Re-inject kiosk manifest (fallback if inline script missed it)
        const kioskManifest = {
          name: "Kiosk Clock-In",
          short_name: "Kiosk",
          description: "Employee kiosk clock-in terminal",
          theme_color: "#000000",
          background_color: "#000000",
          display: "standalone",
          orientation: "portrait",
          start_url: `/t/${urlBusinessCode}/ck`,
          scope: "/",
          id: `/kiosk/${urlBusinessCode}`,
          categories: ["business", "productivity"],
          icons: [
            { src: "/pwa-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/pwa-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/pwa-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        };
        const blob = new Blob([JSON.stringify(kioskManifest)], { type: "application/json" });
        const link = document.createElement("link");
        link.rel = "manifest";
        link.href = URL.createObjectURL(blob);
        document.head.appendChild(link);
      }
    };

    ensureKioskManifest();

    // Update page title & apple meta for PWA install
    document.title = "Kiosk Clock-In";
    const appleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleMeta) {
      appleMeta.setAttribute("content", "Kiosk");
    } else {
      const meta = document.createElement("meta");
      meta.name = "apple-mobile-web-app-title";
      meta.content = "Kiosk";
      document.head.appendChild(meta);
    }

    // Watch for vite-plugin-pwa re-injecting the main manifest and remove it
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node instanceof HTMLLinkElement && node.rel === "manifest" && !node.href.startsWith("blob:")) {
            node.remove();
          }
        });
      }
    });
    observer.observe(document.head, { childList: true });

    return () => {
      observer.disconnect();
      document.title = "OmnexClock";
    };
  }, [urlBusinessCode]);

  // Load business from URL param and apply theme
  useEffect(() => {
    if (!urlBusinessCode) return;
    const loadBusiness = async () => {
      const { data } = await supabase
        .from("businesses_public" as any)
        .select("name, logo_url, theme, status")
        .eq("business_code", urlBusinessCode.toUpperCase())
        .maybeSingle() as { data: { name: string; logo_url: string | null; theme: any; status: string } | null };
      if (data) {
        if (data.status === "suspended" || data.status === "deactivated") {
          setBusinessName(data.name);
          setBusinessLogo(data.logo_url);
          toast({ title: "Business Unavailable", description: `This business has been ${data.status} by the platform administrator.`, variant: "destructive" });
          return;
        }
        setBusinessName(data.name);
        setBusinessLogo(data.logo_url);
        // Check if camera permission was already granted
        try {
          const permStatus = await navigator.permissions.query({ name: "camera" as PermissionName });
          if (permStatus.state === "granted") {
            setCameraGranted(true);
            setStep("code_entry");
          } else {
            setStep("camera_permission");
          }
        } catch {
          // Permissions API not supported — fall back to prompt
          setStep("camera_permission");
        }
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
      const root = document.documentElement;
      ["primary", "background", "foreground", "card", "border", "muted", "accent"].forEach((key) => {
        root.style.removeProperty(`--${key}`);
      });
    };
  }, [urlBusinessCode]);

  // Request camera permission
  const requestCameraPermission = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });
      // Permission granted — stop the test stream immediately
      stream.getTracks().forEach((t) => t.stop());
      setCameraGranted(true);
      setStep("code_entry");
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        setCameraError("Camera access was denied. Please allow camera access in your browser settings and try again.");
      } else if (err.name === "NotFoundError") {
        setCameraError("No camera found on this device. A camera is required for the kiosk.");
      } else {
        setCameraError("Unable to access camera. Please check your device settings.");
      }
    }
  };

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

  // Realtime status sync
  useEffect(() => {
    if (!employeeId || step !== "action_select") return;
    const channel = supabase
      .channel("kiosk-status-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "clock_events" }, async () => {
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
    // Stop any existing stream first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Wait for video to actually be playing before capturing
        await new Promise<void>((resolve) => {
          const video = videoRef.current!;
          const onPlaying = () => {
            video.removeEventListener("playing", onPlaying);
            resolve();
          };
          if (video.readyState >= 2) {
            resolve();
          } else {
            video.addEventListener("playing", onPlaying);
          }
        });
      }
    } catch {
      toast({ title: "Camera Error", description: "Unable to access camera. Submitting without photo.", variant: "destructive" });
      // Submit without photo after a brief delay
      setTimeout(() => submitClock("", actionRef.current === "clock_out" ? description : ""), 500);
    }
  }, [toast]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const submitClock = useCallback(async (photo: string, note?: string) => {
    await runAction(async () => {
      setLoading(true);
      try {
        // Use fetch directly so we can read the error body on non-2xx responses
        // (supabase.functions.invoke swallows the body and returns a generic message).
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/kiosk-clock`;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
          },
          body: JSON.stringify({
            employee_code: codeRef.current,
            event_type: actionRef.current,
            photo_base64: photo,
            business_code: urlBusinessCode?.toUpperCase() || null,
            device_info: { userAgent: navigator.userAgent, screen: `${screen.width}x${screen.height}` },
            ...(note ? { notes: note } : {}),
          }),
        });

        let data: any = null;
        try { data = await res.json(); } catch { /* ignore parse error */ }

        if (!res.ok || data?.error) {
          toast({
            title: "Error",
            description: data?.error || `Failed to clock (status ${res.status})`,
            variant: "destructive",
          });
          resetKiosk();
        } else {
          setEmployeeName(data.employee_name);
          setStep("confirmation");
          setTimeout(resetKiosk, 4000);
        }
      } catch (e: any) {
        toast({ title: "Error", description: e?.message || "Network error", variant: "destructive" });
        resetKiosk();
      }
      setLoading(false);
    });
  }, [toast, runAction, urlBusinessCode]);

  const captureAndSubmit = useCallback((note?: string) => {
    if (!videoRef.current || !canvasRef.current) {
      // Fallback: submit without photo if video isn't ready
      submitClock("", note);
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    // Use actual video dimensions for better quality
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0, w, h);
    const data = canvas.toDataURL("image/jpeg", 0.7);
    setPhotoData(data);
    stopCamera();
    submitClock(data, note);
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
    const note = action === "clock_out" ? description : "";
    setStep("photo_capture");

    // Start camera, then capture after 1.5s — with safety timeout
    try {
      await startCamera();
      captureTimeoutRef.current = setTimeout(() => captureAndSubmit(note), 1500);
    } catch {
      // If camera fails, submit without photo
      submitClock("", note);
    }
  };

  // Cleanup capture timeout on unmount
  useEffect(() => {
    return () => {
      if (captureTimeoutRef.current) clearTimeout(captureTimeoutRef.current);
      stopCamera();
    };
  }, []);

  // Safety: if stuck on photo_capture for >10s, reset
  useEffect(() => {
    if (step !== "photo_capture") return;
    const safety = setTimeout(() => {
      if (step === "photo_capture") {
        toast({ title: "Timeout", description: "Photo capture timed out. Please try again.", variant: "destructive" });
        resetKiosk();
      }
    }, 10000);
    return () => clearTimeout(safety);
  }, [step]);

  const resetKiosk = () => {
    if (captureTimeoutRef.current) {
      clearTimeout(captureTimeoutRef.current);
      captureTimeoutRef.current = null;
    }
    setStep("code_entry");
    setCode("");
    codeRef.current = "";
    setSelectedAction("");
    actionRef.current = "";
    setEmployeeName("");
    setEmployeeId(null);
    setEmployeeStatus("clocked_out");
    setPhotoData(null);
    setDescription("");
    stopCamera();
  };

  const getAvailableActions = () => {
    switch (employeeStatus) {
      case "clocked_out": return ["clock_in"];
      case "clocked_in": return ["break_start", "clock_out"];
      case "on_break": return ["break_end"];
      default: return ["clock_in"];
    }
  };

  const statusConfig: Record<EmployeeStatus, { label: string; color: string; icon: React.ReactNode }> = {
    clocked_out: { label: "Clocked Out", color: "bg-muted text-muted-foreground", icon: <LogOut className="h-4 w-4" /> },
    clocked_in: { label: "Clocked In", color: "bg-green-500/15 text-green-600 dark:text-green-400", icon: <LogIn className="h-4 w-4" /> },
    on_break: { label: "On Break", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400", icon: <Coffee className="h-4 w-4" /> },
  };

  const actionLabels: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    clock_in: { label: "Clock In", icon: <LogIn className="h-6 w-6 sm:h-8 sm:w-8" />, color: "bg-green-600 hover:bg-green-700 text-white" },
    clock_out: { label: "Clock Out", icon: <LogOut className="h-6 w-6 sm:h-8 sm:w-8" />, color: "bg-destructive hover:bg-destructive/90 text-destructive-foreground" },
    break_start: { label: "Start Break", icon: <Coffee className="h-6 w-6 sm:h-8 sm:w-8" />, color: "bg-amber-500 hover:bg-amber-600 text-white" },
    break_end: { label: "End Break", icon: <Clock className="h-6 w-6 sm:h-8 sm:w-8" />, color: "bg-primary hover:bg-primary/90 text-primary-foreground" },
  };

  const availableActions = getAvailableActions();

  const { theme, setTheme } = useTheme();

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col items-center justify-center px-3 py-4 sm:p-4 md:p-8 relative"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      {/* Dark mode toggle */}
      <div className="absolute top-3 right-3 z-20">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
      {/* Header */}
      <div className="text-center mb-3 sm:mb-4 md:mb-8">
        {businessLogo ? (
          <img src={businessLogo} alt={businessName} className="h-12 w-12 sm:h-14 sm:w-14 md:h-20 md:w-20 mx-auto rounded-lg object-cover mb-2" />
        ) : (
          <div className="h-12 w-12 sm:h-14 sm:w-14 md:h-20 md:w-20 mx-auto rounded-lg bg-primary/15 flex items-center justify-center mb-2">
            <Clock className="h-6 w-6 sm:h-7 sm:w-7 md:h-10 md:w-10 text-primary" />
          </div>
        )}
        <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground">{businessName}</h1>
        <p className="text-2xl sm:text-3xl md:text-4xl font-mono text-foreground mt-1 sm:mt-2">
          {toAusTime12WithSeconds(currentTime)}
        </p>
        <p className="text-xs sm:text-sm md:text-base text-muted-foreground">
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

      {/* Camera Permission Step */}
      {step === "camera_permission" && (
        <Card className="w-full max-w-[90vw] sm:max-w-sm md:max-w-md gold-border border gold-glow">
          <CardContent className="p-5 sm:p-6 md:p-8 space-y-5 text-center">
            <div className="h-16 w-16 sm:h-20 sm:w-20 mx-auto rounded-full bg-primary/15 flex items-center justify-center">
              <Camera className="h-8 w-8 sm:h-10 sm:w-10 text-primary" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg sm:text-xl font-bold text-foreground">Camera Access Required</h2>
              <p className="text-sm sm:text-base text-muted-foreground">
                This kiosk needs camera access to capture a photo each time an employee clocks in or out. Please allow camera access to continue.
              </p>
            </div>
            {cameraError && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-start gap-2">
                <VideoOff className="h-5 w-5 shrink-0 mt-0.5" />
                <span>{cameraError}</span>
              </div>
            )}
            <Button className="w-full h-12 sm:h-14 text-base sm:text-lg" onClick={requestCameraPermission}>
              <Camera className="h-5 w-5 mr-2" />
              {cameraError ? "Try Again" : "Allow Camera Access"}
            </Button>
            {cameraError && (
              <Button variant="outline" className="w-full text-foreground" onClick={() => {
                setCameraGranted(false);
                setStep("code_entry");
              }}>
                Continue Without Camera
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Code Entry */}
      {step === "code_entry" && (
        <Card className="w-full max-w-[90vw] sm:max-w-sm md:max-w-md gold-border border gold-glow">
          <CardContent className="p-4 sm:p-5 md:p-8 space-y-3 sm:space-y-4 md:space-y-5">
            <p className="text-center text-sm md:text-base text-muted-foreground">Enter your employee code</p>
            <Input
              value={code}
              readOnly
              className="text-center text-2xl sm:text-3xl md:text-4xl tracking-[0.5em] font-mono h-12 sm:h-14 md:h-18 bg-muted text-foreground"
              placeholder="••••"
            />
            {/* Numpad */}
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2 md:gap-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
                <Button key={n} variant="secondary" className="h-12 sm:h-14 md:h-18 text-xl sm:text-2xl md:text-3xl font-bold" onClick={() => handleNumpadClick(n)}>
                  {n}
                </Button>
              ))}
              <Button variant="secondary" className="h-12 sm:h-14 md:h-18" onClick={resetKiosk}>
                <ArrowLeft className="h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7" />
              </Button>
              <Button variant="secondary" className="h-12 sm:h-14 md:h-18 text-xl sm:text-2xl md:text-3xl font-bold" onClick={() => handleNumpadClick("0")}>
                0
              </Button>
              <Button variant="secondary" className="h-12 sm:h-14 md:h-18" onClick={() => setCode((p) => p.slice(0, -1))}>
                <Delete className="h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7" />
              </Button>
            </div>
            <Button className="w-full h-11 sm:h-12 md:h-14 text-base sm:text-lg md:text-xl" onClick={handleSubmitCode} disabled={code.length !== 4 || loading}>
              {loading ? "Verifying..." : "Continue"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Action Select */}
      {step === "action_select" && (
        <Card className="w-full max-w-[90vw] sm:max-w-sm md:max-w-md gold-border border">
          <CardContent className="p-4 sm:p-5 md:p-8 space-y-3 sm:space-y-4 md:space-y-5">
            <div className="text-center space-y-2">
              <div className="flex items-center justify-center gap-2">
                <User className="h-5 w-5 text-primary" />
                <span className="text-base sm:text-lg font-semibold text-foreground">{employeeName}</span>
              </div>
              <div className="flex justify-center">
                <Badge className={`${statusConfig[employeeStatus].color} gap-1 px-3 py-1`}>
                  {statusConfig[employeeStatus].icon}
                  {statusConfig[employeeStatus].label}
                </Badge>
              </div>
            </div>
            <p className="text-center text-sm text-muted-foreground">Select action</p>
            <div className={`grid gap-2 sm:gap-3 ${availableActions.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
              {availableActions.map((key) => {
                const { label, icon, color } = actionLabels[key];
                return (
                  <Button key={key} className={`h-20 sm:h-24 md:h-28 flex flex-col gap-1.5 sm:gap-2 ${color}`} onClick={() => handleActionSelect(key)}>
                    {icon}
                    <span className="text-xs sm:text-sm font-semibold">{label}</span>
                  </Button>
                );
              })}
            </div>
            {availableActions.includes("clock_out") && (
              <div className="space-y-1">
                <Textarea
                  placeholder="Optional: missed break, different start time, etc."
                  className="resize-none h-16 sm:h-20 text-sm"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={200}
                />
                <p className="text-right text-xs text-muted-foreground">{description.length}/200</p>
              </div>
            )}
            <Button variant="outline" className="w-full mt-2 text-foreground" onClick={resetKiosk}>
              Cancel
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Photo Capture */}
      {step === "photo_capture" && (
        <Card className="w-full max-w-[90vw] sm:max-w-sm md:max-w-md gold-border border">
          <CardContent className="p-4 sm:p-5 md:p-8 space-y-3 sm:space-y-4">
            <p className="text-center text-sm md:text-base text-muted-foreground">
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
        <Card className="w-full max-w-[90vw] sm:max-w-sm md:max-w-md gold-border border gold-glow">
          <CardContent className="p-5 sm:p-6 md:p-10 text-center space-y-3 sm:space-y-4">
            <div className="h-16 w-16 sm:h-20 sm:w-20 mx-auto rounded-full bg-primary/15 flex items-center justify-center text-primary">
              {actionLabels[selectedAction]?.icon}
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">{actionLabels[selectedAction]?.label}</h2>
            <p className="text-lg sm:text-xl text-primary font-semibold">{employeeName}</p>
            <p className="text-muted-foreground text-sm">
              {toAusTime12(currentTime)}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Footer */}
      <div className="mt-6 sm:mt-8 flex flex-col items-center gap-2 sm:gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate(`/b/${urlBusinessCode}/admin`);
          }}
        >
          <ShieldCheck className="h-4 w-4 mr-1" />
          Admin Login
        </Button>
        <p className="text-[11px] text-muted-foreground/60">
          © {new Date().getFullYear()} Omnex Ventures Pty. Ltd. All rights reserved.
        </p>
      </div>
    </div>
  );
}
