import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
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

// ─── Animated Orb ───
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

// ═══════════════════════════════════════════════════
// Main VoiceChatMode — State-machine architecture
// ═══════════════════════════════════════════════════
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

  // All mutable state lives in refs to avoid stale closures
  const activeRef = useRef(false);
  const msgsRef = useRef(messages);
  const recognitionRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);
  const emptyCountRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioResolveRef = useRef<(() => void) | null>(null);

  // Keep messages ref in sync
  useEffect(() => { msgsRef.current = messages; }, [messages]);

  // ──────────────────────────────────────
  // CLEANUP — stops everything immediately
  // ──────────────────────────────────────
  const killAll = useCallback(() => {
    console.log("[Voice] killAll called");
    activeRef.current = false;
    emptyCountRef.current = 0;

    // Kill speech recognition
    try { recognitionRef.current?.abort(); } catch {}
    recognitionRef.current = null;

    // Kill pending AI request
    try { abortRef.current?.abort(); } catch {}
    abortRef.current = null;

    // Kill tracked Audio element
    if (audioRef.current) {
      try { audioRef.current.pause(); audioRef.current.currentTime = 0; } catch {}
      audioRef.current = null;
    }
    if (audioResolveRef.current) {
      audioResolveRef.current();
      audioResolveRef.current = null;
    }

    // Kill browser TTS
    try { window.speechSynthesis?.cancel(); } catch {}

    setVoiceState("idle");
    setTranscript("");
    setAssistantText("");
  }, []);

  // ──────────────────────────────────────
  // STEP 1: Play audio via Browser TTS (enhanced for natural sound)
  // Returns a promise that resolves when audio finishes
  // ──────────────────────────────────────
  const playAudio = useCallback(async (text: string): Promise<void> => {
    const clean = cleanForSpeech(text);
    if (!clean || !activeRef.current) return;
    await playBrowserTTS(clean.substring(0, 800));
  }, []);

  // Browser TTS — enhanced for natural, human-like speech
  const playBrowserTTS = useCallback((text: string): Promise<void> => {
    return new Promise<void>(async (resolve) => {
      if (!activeRef.current) { resolve(); return; }

      const synth = window.speechSynthesis;
      if (!synth) {
        console.log("[Voice] speechSynthesis not available");
        resolve();
        return;
      }

      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };

      // Wait for voices to load (required on many mobile browsers)
      const getVoices = (): Promise<SpeechSynthesisVoice[]> => {
        return new Promise((res) => {
          let voices = synth.getVoices();
          if (voices.length > 0) { res(voices); return; }
          const onVoices = () => {
            voices = synth.getVoices();
            res(voices);
          };
          synth.addEventListener("voiceschanged", onVoices, { once: true });
          setTimeout(() => res(synth.getVoices()), 2000);
        });
      };

      try {
        synth.cancel();
        const voices = await getVoices();

        const utterance = new SpeechSynthesisUtterance(text);

        // Prioritize the most natural-sounding voices available
        // Google and Microsoft Neural voices sound significantly more human
        const preferredVoiceNames = [
          // Google's natural voices (Chrome)
          "Google UK English Female",
          "Google UK English Male",
          "Google US English",
          // Microsoft Neural voices (Edge)
          "Microsoft Natasha Online (Natural) - English (Australia)",
          "Microsoft Libby Online (Natural) - English (United Kingdom)",
          "Microsoft Ryan Online (Natural) - English (United Kingdom)",
          "Microsoft Jenny Online (Natural) - English (United States)",
          "Microsoft Aria Online (Natural) - English (United States)",
          // macOS/iOS high-quality voices
          "Karen",      // Australian
          "Samantha",   // US (very natural on Apple)
          "Daniel",     // UK
          "Moira",      // Irish
          "Tessa",      // South African
        ];

        let selectedVoice: SpeechSynthesisVoice | undefined;
        
        // Try preferred voices first
        for (const name of preferredVoiceNames) {
          selectedVoice = voices.find(v => v.name.includes(name));
          if (selectedVoice) break;
        }
        
        // Fallback: any en-AU, then en-GB, then any English voice
        if (!selectedVoice) {
          selectedVoice = voices.find(v => v.lang === "en-AU")
            || voices.find(v => v.lang.startsWith("en-AU"))
            || voices.find(v => v.lang === "en-GB")
            || voices.find(v => v.lang.startsWith("en-GB"))
            || voices.find(v => v.lang.startsWith("en"))
            || voices[0];
        }

        if (selectedVoice) {
          utterance.voice = selectedVoice;
          utterance.lang = selectedVoice.lang;
          console.log("[Voice] Using voice:", selectedVoice.name, selectedVoice.lang);
        } else {
          utterance.lang = "en-AU";
        }

        // Natural speech parameters — slightly slower with natural pitch
        utterance.rate = 0.95;    // Slightly slower than default for warmth
        utterance.pitch = 1.0;    // Natural pitch
        utterance.volume = 1.0;

        utterance.onend = finish;
        utterance.onerror = (e) => {
          console.log("[Voice] Browser TTS error:", (e as any)?.error || e);
          finish();
        };

        synth.speak(utterance);
        console.log("[Voice] TTS speaking:", text.substring(0, 50) + "...");

        // Chrome bug: speechSynthesis can pause mid-utterance. Periodically resume.
        const resumeInterval = setInterval(() => {
          if (done) { clearInterval(resumeInterval); return; }
          if (synth.paused) synth.resume();
          if (!synth.speaking && !synth.pending) {
            clearInterval(resumeInterval);
            finish();
          }
        }, 300);

        // Safety timeout
        setTimeout(() => { clearInterval(resumeInterval); finish(); }, 30000);
      } catch (e) {
        console.log("[Voice] Browser TTS exception:", e);
        finish();
      }
    });
  }, []);

  // ──────────────────────────────────────
  // STEP 2: Listen for speech input
  // Returns transcript text (empty string if nothing heard)
  // ──────────────────────────────────────
  const listenForSpeech = useCallback((): Promise<string> => {
    return new Promise<string>((resolve) => {
      if (!activeRef.current) { resolve(""); return; }

      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) {
        toast.error("Speech recognition not supported in this browser");
        resolve("");
        return;
      }

      // Stop any previous recognition
      try { recognitionRef.current?.abort(); } catch {}

      const rec = new SR();
      rec.lang = "en-AU";
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      recognitionRef.current = rec;

      let finalText = "";
      let resolved = false;

      const done = (text: string) => {
        if (resolved) return;
        resolved = true;
        recognitionRef.current = null;
        resolve(text);
      };

      rec.onresult = (e: any) => {
        let interim = "";
        finalText = "";
        for (let i = 0; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript;
          else interim += r[0].transcript;
        }
        setTranscript(finalText || interim);
      };

      rec.onerror = (e: any) => {
        console.log("[Voice] Recognition error:", e.error);
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          toast.error("Microphone access denied. Please allow mic access and try again.");
          activeRef.current = false; // Kill the whole session
        }
        // Let onend handle resolution
      };

      rec.onend = () => {
        const result = finalText.trim();
        console.log("[Voice] Recognition ended →", result || "(silence)");
        done(result);
      };

      // Safety: 12s timeout (recognition usually ends by itself within 5-10s)
      setTimeout(() => {
        if (!resolved) {
          console.log("[Voice] Recognition timeout, aborting");
          try { rec.abort(); } catch {}
          done(finalText.trim());
        }
      }, 12000);

      try {
        rec.start();
        console.log("[Voice] 🎤 Listening...");
      } catch (e: any) {
        console.error("[Voice] rec.start() failed:", e.message);
        done("");
      }
    });
  }, []);

  // ──────────────────────────────────────
  // STEP 3: Get AI response (streaming)
  // ──────────────────────────────────────
  const fetchAIResponse = useCallback(async (userText: string): Promise<string> => {
    // Save user message
    const userMsg: Message = { role: "user", content: userText, timestamp: new Date() };
    const withUser = [...msgsRef.current, userMsg];
    msgsRef.current = withUser;
    onMessagesChange(withUser);

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
          messages: withUser.map(m => ({ role: m.role, content: m.content })),
          businessId,
          voiceMode: true,
        }),
        signal: abortRef.current.signal,
      });

      if (!resp.ok) {
        console.error("[Voice] AI returned:", resp.status);
        return "Sorry, I couldn't process that. Try again.";
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let aiText = "";

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
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") break;
          try {
            const chunk = JSON.parse(payload)?.choices?.[0]?.delta?.content;
            if (chunk) {
              aiText += chunk;
              setAssistantText(aiText);
            }
          } catch {}
        }
      }

      // Save AI message
      const aiMsg: Message = { role: "assistant", content: aiText, timestamp: new Date() };
      const withAI = [...withUser, aiMsg];
      msgsRef.current = withAI;
      onMessagesChange(withAI);
      setAssistantText("");

      return aiText || "I didn't get a response. Try asking again.";
    } catch (e: any) {
      if (e.name === "AbortError") return "";
      console.error("[Voice] AI fetch error:", e);
      return "Something went wrong. Try again.";
    }
  }, [businessId, onMessagesChange]);

  // ══════════════════════════════════════════════
  // STATE MACHINE — Each step triggers the next
  // ══════════════════════════════════════════════

  // Transition to the next step. This is the CORE of the state machine.
  // It schedules the next action asynchronously so the call stack stays clean.
  const nextStep = useCallback((step: "greet" | "listen" | "process" | "speak", payload?: string) => {
    if (!activeRef.current) {
      console.log("[Voice] Session inactive, stopping at step:", step);
      setVoiceState("idle");
      return;
    }

    switch (step) {
      case "greet":
        doGreet();
        break;
      case "listen":
        doListen();
        break;
      case "process":
        doProcess(payload || "");
        break;
      case "speak":
        doSpeak(payload || "");
        break;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const doGreet = useCallback(async () => {
    try {
      setVoiceState("greeting");
      const greeting = businessName
        ? `Hey! What can I help you with for ${businessName}?`
        : "Hey! What do you need help with?";

      setAssistantText(greeting);

      // Save greeting as assistant message
      const greetMsg: Message = { role: "assistant", content: greeting, timestamp: new Date() };
      msgsRef.current = [...msgsRef.current, greetMsg];
      onMessagesChange(msgsRef.current);

      await playAudio(greeting);
      setAssistantText("");

      // → Next: listen
      if (activeRef.current) {
        await delay(400);
        nextStep("listen");
      }
    } catch (e) {
      console.error("[Voice] Greet error:", e);
      if (activeRef.current) { await delay(500); nextStep("listen"); }
    }
  }, [businessName, onMessagesChange, playAudio]); // eslint-disable-line react-hooks/exhaustive-deps

  const doListen = useCallback(async () => {
    if (!activeRef.current) return;

    try {
      setVoiceState("listening");
      setTranscript("");

      const userText = await listenForSpeech();

      if (!activeRef.current) return;

      if (!userText) {
        emptyCountRef.current++;
        console.log(`[Voice] No speech (${emptyCountRef.current}/8)`);

        if (emptyCountRef.current >= 8) {
          // Too many empty results — auto-close
          toast.info("Voice session ended due to inactivity");
          killAll();
          return;
        }

        // Retry listening with a small delay
        await delay(300);
        nextStep("listen");
        return;
      }

      emptyCountRef.current = 0;
      nextStep("process", userText);
    } catch (e) {
      console.error("[Voice] Listen error:", e);
      if (activeRef.current) { await delay(800); nextStep("listen"); }
    }
  }, [listenForSpeech, killAll]); // eslint-disable-line react-hooks/exhaustive-deps

  const doProcess = useCallback(async (userText: string) => {
    if (!activeRef.current) return;

    try {
      setVoiceState("processing");
      setTranscript("");
      console.log("[Voice] User:", userText);

      const aiResponse = await fetchAIResponse(userText);

      if (!activeRef.current) return;

      if (!aiResponse) {
        nextStep("listen");
        return;
      }

      nextStep("speak", aiResponse);
    } catch (e) {
      console.error("[Voice] Process error:", e);
      if (activeRef.current) { await delay(500); nextStep("listen"); }
    }
  }, [fetchAIResponse]); // eslint-disable-line react-hooks/exhaustive-deps

  const doSpeak = useCallback(async (text: string) => {
    if (!activeRef.current) return;

    try {
      setVoiceState("speaking");
      setAssistantText(text);
      console.log("[Voice] AI:", text.substring(0, 80));

      await playAudio(text);

      setAssistantText("");

      if (!activeRef.current) return;

      // → Next: listen (with a small gap so browser releases audio before mic)
      await delay(500);
      nextStep("listen");
    } catch (e) {
      console.error("[Voice] Speak error:", e);
      if (activeRef.current) { await delay(500); nextStep("listen"); }
    }
  }, [playAudio]); // eslint-disable-line react-hooks/exhaustive-deps

  // ──────────────────────────────────────
  // START / STOP / INTERRUPT
  // ──────────────────────────────────────
  const startSession = useCallback(async () => {
    if (activeRef.current) return;

    // Request mic permission FIRST before doing anything
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop()); // Release immediately
    } catch {
      toast.error("Microphone access is required for voice chat.");
      return;
    }


    console.log("[Voice] ▶ Session starting");
    activeRef.current = true;
    emptyCountRef.current = 0;
    nextStep("greet");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const endSession = useCallback(() => {
    console.log("[Voice] ■ Session ending");
    killAll();
  }, [killAll]);

  const handleClose = useCallback(() => {
    killAll();
    onClose();
  }, [killAll, onClose]);

  const handleOrbClick = useCallback(() => {
    if (voiceState === "idle") {
      startSession();
    } else if (voiceState === "speaking" || voiceState === "greeting") {
      // Interrupt: stop all audio, jump to listen
      console.log("[Voice] ⏸ Interrupting speech");
      try { window.speechSynthesis?.cancel(); } catch {}
      // Stop tracked audio element
      if (audioRef.current) {
        try { audioRef.current.pause(); audioRef.current.currentTime = 0; } catch {}
        audioRef.current = null;
      }
      // Resolve any pending audio promise so doSpeak continues
      if (audioResolveRef.current) {
        audioResolveRef.current();
        audioResolveRef.current = null;
      }
    }
  }, [voiceState, startSession]);

  // ──────────────────────────────────────
  // LIFECYCLE: Auto-start on open, cleanup on close
  // ──────────────────────────────────────
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        if (!activeRef.current) {
          startSession();
        }
      }, 300);
      return () => clearTimeout(timer);
    } else {
      killAll();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => killAll, [killAll]);

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

  const overlay = (
    <div
      className="fixed inset-0 flex flex-col items-center justify-between"
      style={{
        zIndex: 99999,
        background: "radial-gradient(ellipse at center, hsl(0 0% 8%) 0%, hsl(0 0% 3%) 100%)",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
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

      {/* Center: Orb + status */}
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

          {assistantText && (voiceState === "speaking" || voiceState === "greeting" || voiceState === "processing") && (
            <div className="mt-3 px-4 py-2.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm max-h-24 overflow-y-auto">
              <p className="text-white/70 text-sm">{assistantText}</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer buttons */}
      <div className="flex-shrink-0 pb-8 pt-4 flex flex-col items-center gap-4">
        {voiceState !== "idle" && (
          <button
            onClick={endSession}
            className="h-14 w-14 rounded-full bg-destructive flex items-center justify-center active:scale-90 transition-all shadow-lg shadow-destructive/30"
          >
            <PhoneOff className="h-5 w-5 text-white" />
          </button>
        )}
        {voiceState === "idle" && (
          <button
            onClick={startSession}
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

  return createPortal(overlay, document.body);
}

// Simple delay helper
function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
