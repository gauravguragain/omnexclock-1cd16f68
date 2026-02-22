import { useState, useRef, useEffect, useCallback } from "react";
import { X, Mic, PhoneOff } from "lucide-react";
import { toast } from "sonner";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface VoiceChatModeProps {
  open: boolean;
  onClose: () => void;
  messages: Message[];
  onMessagesChange: (msgs: Message[]) => void;
  businessId: string;
  businessName?: string;
}

type VoiceState = "idle" | "greeting" | "listening" | "processing" | "speaking";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`;
const TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`;

function cleanForSpeech(text: string): string {
  return text
    .replace(/```chart[\s\S]*?```/g, "I've prepared a chart for you.")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[#*_`~]/g, "")
    .replace(/\|[^\n]+\|/g, "")
    .replace(/[═╔╗╚╝║─┌┐└┘├┤┬┴┼│]/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, ". ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ─── Animated Orb Component ───
function VoiceOrb({ state, onClick }: { state: VoiceState; onClick?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const stateRef = useRef(state);

  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const size = 280;
    canvas.width = size * 2;
    canvas.height = size * 2;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(2, 2);

    const center = size / 2;
    let t = 0;

    function draw() {
      t += 0.016;
      ctx.clearRect(0, 0, size, size);
      const s = stateRef.current;

      const glowRadius = s === "listening" ? 110 + Math.sin(t * 3) * 15
        : s === "speaking" || s === "greeting" ? 110 + Math.sin(t * 5) * 20 + Math.sin(t * 7) * 8
        : s === "processing" ? 105 + Math.sin(t * 2) * 5
        : 100 + Math.sin(t * 1.5) * 3;

      if (s === "listening" || s === "speaking" || s === "greeting") {
        for (let i = 0; i < 3; i++) {
          const ringR = glowRadius + 15 + i * 18 + Math.sin(t * 2 + i) * 5;
          const alpha = (s === "speaking" || s === "greeting")
            ? 0.12 - i * 0.035 + Math.sin(t * 4 + i * 0.7) * 0.04
            : 0.08 - i * 0.02 + Math.sin(t * 3 + i) * 0.03;
          ctx.beginPath();
          ctx.arc(center, center, ringR, 0, Math.PI * 2);
          ctx.strokeStyle = `hsla(43, 72%, 52%, ${Math.max(0, alpha)})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      if (s === "processing") {
        ctx.save();
        ctx.translate(center, center);
        ctx.rotate(t * 2);
        const grad = ctx.createConicGradient(0, 0, 0);
        grad.addColorStop(0, "hsla(43, 72%, 52%, 0)");
        grad.addColorStop(0.7, "hsla(43, 72%, 52%, 0.4)");
        grad.addColorStop(1, "hsla(43, 72%, 52%, 0)");
        ctx.beginPath();
        ctx.arc(0, 0, glowRadius + 12, 0, Math.PI * 2);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.restore();
      }

      const orbGrad = ctx.createRadialGradient(center, center, 0, center, center, glowRadius);
      if (s === "listening") {
        orbGrad.addColorStop(0, "hsla(43, 72%, 62%, 0.35)");
        orbGrad.addColorStop(0.6, "hsla(43, 72%, 52%, 0.18)");
        orbGrad.addColorStop(1, "hsla(43, 72%, 52%, 0)");
      } else if (s === "speaking" || s === "greeting") {
        orbGrad.addColorStop(0, "hsla(43, 80%, 58%, 0.4)");
        orbGrad.addColorStop(0.5, "hsla(43, 72%, 52%, 0.2)");
        orbGrad.addColorStop(1, "hsla(43, 72%, 52%, 0)");
      } else if (s === "processing") {
        orbGrad.addColorStop(0, "hsla(43, 60%, 55%, 0.25)");
        orbGrad.addColorStop(0.7, "hsla(43, 72%, 52%, 0.1)");
        orbGrad.addColorStop(1, "hsla(43, 72%, 52%, 0)");
      } else {
        orbGrad.addColorStop(0, "hsla(43, 50%, 55%, 0.15)");
        orbGrad.addColorStop(0.8, "hsla(43, 72%, 52%, 0.05)");
        orbGrad.addColorStop(1, "hsla(43, 72%, 52%, 0)");
      }
      ctx.beginPath();
      ctx.arc(center, center, glowRadius, 0, Math.PI * 2);
      ctx.fillStyle = orbGrad;
      ctx.fill();

      const innerR = (s === "speaking" || s === "greeting") ? 42 + Math.sin(t * 6) * 6
        : s === "listening" ? 44 + Math.sin(t * 3) * 4
        : s === "processing" ? 40 + Math.sin(t * 2) * 2
        : 40;
      const innerGrad = ctx.createRadialGradient(center - 8, center - 8, 0, center, center, innerR);
      innerGrad.addColorStop(0, "hsl(46, 80%, 60%)");
      innerGrad.addColorStop(1, "hsl(40, 65%, 42%)");
      ctx.beginPath();
      ctx.arc(center, center, innerR, 0, Math.PI * 2);
      ctx.fillStyle = innerGrad;
      ctx.fill();

      const specGrad = ctx.createRadialGradient(center - 10, center - 12, 0, center - 10, center - 12, innerR * 0.6);
      specGrad.addColorStop(0, "hsla(0, 0%, 100%, 0.35)");
      specGrad.addColorStop(1, "hsla(0, 0%, 100%, 0)");
      ctx.beginPath();
      ctx.arc(center, center, innerR, 0, Math.PI * 2);
      ctx.fillStyle = specGrad;
      ctx.fill();

      if (s === "speaking" || s === "greeting") {
        ctx.save();
        ctx.translate(center, center);
        const barCount = 24;
        for (let i = 0; i < barCount; i++) {
          const angle = (i / barCount) * Math.PI * 2;
          const h = 8 + Math.sin(t * 8 + i * 0.9) * 10 + Math.sin(t * 5 + i * 1.3) * 6;
          ctx.save();
          ctx.rotate(angle);
          ctx.fillStyle = `hsla(43, 72%, 52%, ${0.4 + Math.sin(t * 4 + i) * 0.2})`;
          ctx.fillRect(innerR + 6, -1.5, Math.max(2, h), 3);
          ctx.restore();
        }
        ctx.restore();
      }

      if (s === "listening") {
        const rippleR = innerR + 8 + Math.sin(t * 4) * 8;
        ctx.beginPath();
        ctx.arc(center, center, rippleR, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(43, 72%, 52%, ${0.3 + Math.sin(t * 3) * 0.15})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      animRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return (
    <button
      onClick={onClick}
      className="relative focus:outline-none active:scale-95 transition-transform duration-150"
      aria-label={state === "idle" ? "Start conversation" : "Voice active"}
    >
      <canvas ref={canvasRef} className="block" />
    </button>
  );
}

// ─── Main Component ───
export default function VoiceChatMode({
  open,
  onClose,
  messages,
  onMessagesChange,
  businessId,
  businessName,
}: VoiceChatModeProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [assistantText, setAssistantText] = useState("");

  // All mutable state lives in refs to avoid stale closures entirely
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeRef = useRef(false);
  const msgsRef = useRef<Message[]>(messages);
  const onMsgsChangeRef = useRef(onMessagesChange);
  const warmAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { msgsRef.current = messages; }, [messages]);
  useEffect(() => { onMsgsChangeRef.current = onMessagesChange; }, [onMessagesChange]);

  useEffect(() => {
    if (!open) { stop(); activeRef.current = false; }
    return () => stop();
  }, [open]);

  function stop() {
    try { recognitionRef.current?.abort(); } catch {}
    recognitionRef.current = null;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; audioRef.current = null; }
    abortRef.current?.abort();
    window.speechSynthesis?.cancel();
    setVoiceState("idle");
    setTranscript("");
    setAssistantText("");
  }

  // ═══════════════════════════════════════════
  // Core loop: each function calls the next
  // All are plain functions (not useCallback) 
  // reading from refs — no stale closures
  // ═══════════════════════════════════════════

  async function playAudio(text: string): Promise<boolean> {
    try {
      const resp = await fetch(TTS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ text: text.substring(0, 5000) }),
      });
      if (!resp.ok) return false;
      const blob = await resp.blob();
      if (blob.size < 100 || !blob.type.includes("audio")) return false;

      return new Promise<boolean>((resolve) => {
        const audio = warmAudioRef.current || new Audio();
        const url = URL.createObjectURL(blob);
        audio.src = url;
        audioRef.current = audio;
        const done = (ok: boolean) => {
          URL.revokeObjectURL(url);
          audioRef.current = null;
          audio.onended = null;
          audio.onerror = null;
          resolve(ok);
        };
        audio.onended = () => done(true);
        audio.onerror = () => done(false);
        audio.play().catch(() => done(false));
      });
    } catch {
      return false;
    }
  }

  function playBrowserTTS(text: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(text.substring(0, 500));
      u.lang = "en-AU";
      u.rate = 1.05;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
      // Safety timeout
      setTimeout(resolve, 15000);
    });
  }

  async function speakAndContinue(text: string) {
    if (!activeRef.current) return;
    const clean = cleanForSpeech(text);
    if (!clean) {
      if (activeRef.current) startListening();
      return;
    }

    setVoiceState("speaking");
    console.log("[Voice] speaking:", clean.substring(0, 60));

    const ok = await playAudio(clean);
    if (!ok && activeRef.current) {
      console.log("[Voice] ElevenLabs failed, using browser TTS");
      await playBrowserTTS(clean);
    }

    // After speaking finishes → listen again
    if (activeRef.current) {
      console.log("[Voice] speech done, resuming listening");
      startListening();
    } else {
      setVoiceState("idle");
    }
  }

  async function processInput(text: string) {
    if (!activeRef.current) return;
    console.log("[Voice] user said:", text);
    setVoiceState("processing");
    setTranscript("");

    const userMsg: Message = { role: "user", content: text, timestamp: new Date() };
    const updated = [...msgsRef.current, userMsg];
    msgsRef.current = updated;
    onMsgsChangeRef.current(updated);

    let aiText = "";

    try {
      abortRef.current = new AbortController();
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: updated.map(m => ({ role: m.role, content: m.content })),
          businessId,
          voiceMode: true,
        }),
        signal: abortRef.current.signal,
      });

      if (!resp.ok) {
        console.error("[Voice] AI error:", resp.status);
        await speakAndContinue("Sorry, couldn't get a response. Try again.");
        return;
      }

      // Parse streaming response
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") break;
          try {
            const chunk = JSON.parse(json)?.choices?.[0]?.delta?.content;
            if (chunk) { aiText += chunk; setAssistantText(aiText); }
          } catch {}
        }
      }

      console.log("[Voice] AI:", aiText.substring(0, 80));

      const aMsg: Message = { role: "assistant", content: aiText, timestamp: new Date() };
      const finalMsgs = [...updated, aMsg];
      msgsRef.current = finalMsgs;
      onMsgsChangeRef.current(finalMsgs);
      setAssistantText("");

      // Speak the response → then auto-listen
      await speakAndContinue(aiText);

    } catch (e: any) {
      if (e.name === "AbortError") return;
      console.error("[Voice] error:", e);
      await speakAndContinue("Something went wrong. Try again.");
    }
  }

  function startListening() {
    if (!activeRef.current) return;

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error("Speech recognition not supported"); return; }

    // Kill any existing recognition
    try { recognitionRef.current?.abort(); } catch {}
    recognitionRef.current = null;

    const rec = new SR();
    rec.lang = "en-AU";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    recognitionRef.current = rec;

    let finalText = "";
    let hadError = false;

    rec.onresult = (e: any) => {
      finalText = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      setTranscript(finalText || interim);
    };

    rec.onerror = (e: any) => {
      console.log("[Voice] mic error:", e.error);
      hadError = true;
      if (e.error === "not-allowed") {
        toast.error("Microphone access denied.");
        activeRef.current = false;
        setVoiceState("idle");
      }
      // onend handles restart for other errors
    };

    rec.onend = () => {
      recognitionRef.current = null;
      if (!activeRef.current) return;

      if (finalText.trim()) {
        // Got user input → process it
        processInput(finalText.trim());
      } else {
        // No speech detected → restart listening
        const delay = hadError ? 600 : 300;
        console.log("[Voice] no input, re-listening in", delay);
        setTimeout(() => {
          if (activeRef.current) startListening();
        }, delay);
      }
    };

    try {
      rec.start();
      setVoiceState("listening");
      setTranscript("");
      console.log("[Voice] listening...");
    } catch (e) {
      console.error("[Voice] mic start failed:", e);
      recognitionRef.current = null;
      if (activeRef.current) setTimeout(() => startListening(), 1000);
    }
  }

  // ─── Entry Point ───

  async function beginConversation() {
    // Pre-warm audio context on user gesture
    if (!warmAudioRef.current) {
      const a = new Audio();
      a.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
      try { if ("setSinkId" in a) (a as any).setSinkId("default"); } catch {}
      a.play().then(() => a.pause()).catch(() => {});
      warmAudioRef.current = a;
    }

    activeRef.current = true;
    setVoiceState("greeting");

    // AI greets the user
    const greeting = businessName
      ? `Hey! What can I help you with for ${businessName}?`
      : "Hey! What do you need help with?";

    setAssistantText(greeting);

    // Store greeting as a message
    const greetMsg: Message = { role: "assistant", content: greeting, timestamp: new Date() };
    const updated = [...msgsRef.current, greetMsg];
    msgsRef.current = updated;
    onMsgsChangeRef.current(updated);

    // Speak greeting, then start listening
    const ok = await playAudio(greeting);
    if (!ok && activeRef.current) {
      await playBrowserTTS(greeting);
    }

    setAssistantText("");
    if (activeRef.current) {
      console.log("[Voice] greeting done, listening...");
      startListening();
    }
  }

  function endConversation() {
    activeRef.current = false;
    stop();
  }

  function handleClose() {
    endConversation();
    onClose();
  }

  function handleOrbClick() {
    if (voiceState === "idle") {
      beginConversation();
    } else if (voiceState === "speaking" || voiceState === "greeting") {
      // Interrupt speech → resume listening
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; audioRef.current = null; }
      window.speechSynthesis?.cancel();
      if (activeRef.current) startListening();
    }
  }

  if (!open) return null;

  const stateLabel: Record<VoiceState, string> = {
    idle: "Tap to start talking",
    greeting: "Speaking...",
    listening: "Listening...",
    processing: "Thinking...",
    speaking: "Speaking...",
  };

  const stateHint: Record<VoiceState, string> = {
    idle: "Your AI business assistant is ready",
    greeting: "Tap the orb to interrupt",
    listening: "Say something — I'm all ears",
    processing: "Analysing your request",
    speaking: "Tap the orb to interrupt",
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-between"
      style={{
        background: "radial-gradient(ellipse at center, hsl(0 0% 8%) 0%, hsl(0 0% 3%) 100%)",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* Header */}
      <div className="w-full flex items-center justify-between px-5 pt-4 pb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-medium text-white/50">
            {businessName || "Voice Assistant"}
          </span>
        </div>
        <button
          onClick={handleClose}
          className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
        >
          <X className="h-4 w-4 text-white/70" />
        </button>
      </div>

      {/* Center: Orb + Status */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 min-h-0">
        <VoiceOrb state={voiceState} onClick={handleOrbClick} />

        <div className="text-center space-y-2 max-w-xs">
          <p className="text-white/90 text-base font-medium tracking-wide">
            {stateLabel[voiceState]}
          </p>
          <p className="text-white/40 text-xs">
            {stateHint[voiceState]}
          </p>

          {transcript && voiceState === "listening" && (
            <div className="mt-3 px-4 py-2.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <p className="text-white/80 text-sm italic">{transcript}</p>
            </div>
          )}

          {assistantText && (voiceState === "processing" || voiceState === "greeting") && (
            <div className="mt-3 px-4 py-2.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm max-h-24 overflow-y-auto">
              <p className="text-white/70 text-sm">{assistantText}</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom controls */}
      <div className="flex-shrink-0 pb-8 pt-4 flex flex-col items-center gap-4">
        {voiceState !== "idle" && (
          <button
            onClick={endConversation}
            className="h-14 w-14 rounded-full bg-destructive flex items-center justify-center active:scale-90 transition-all shadow-lg shadow-destructive/30"
          >
            <PhoneOff className="h-5 w-5 text-white" />
          </button>
        )}
        {voiceState === "idle" && (
          <button
            onClick={beginConversation}
            className="h-14 w-14 rounded-full bg-white/10 border border-white/20 flex items-center justify-center active:scale-90 transition-all hover:bg-white/15"
          >
            <Mic className="h-5 w-5 text-white/80" />
          </button>
        )}
        <span className="text-[10px] text-white/25">
          {voiceState === "idle" ? "or tap the orb above" : "end conversation"}
        </span>
      </div>
    </div>
  );
}
