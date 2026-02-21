import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Mic, X, Volume2, Bot, User, PhoneOff, MessageSquare } from "lucide-react";
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

type VoiceState = "idle" | "listening" | "processing" | "speaking";

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

export default function VoiceChatMode({
  open,
  onClose,
  messages,
  onMessagesChange,
  businessId,
  businessName,
}: VoiceChatModeProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [currentAssistantText, setCurrentAssistantText] = useState("");
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const warmAudioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActiveRef = useRef(false);
  const messagesRef = useRef<Message[]>(messages);
  const businessIdRef = useRef(businessId);
  const onMessagesChangeRef = useRef(onMessagesChange);

  // Keep refs in sync
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { businessIdRef.current = businessId; }, [businessId]);
  useEffect(() => { onMessagesChangeRef.current = onMessagesChange; }, [onMessagesChange]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, interimTranscript, currentAssistantText]);

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      stopEverything();
      isActiveRef.current = false;
    }
    return () => { stopEverything(); };
  }, [open]);

  function stopEverything() {
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (abortRef.current) abortRef.current.abort();
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    window.speechSynthesis?.cancel();
    setVoiceState("idle");
    setInterimTranscript("");
    setCurrentAssistantText("");
  }

  // ─── CORE LOOP: listen → send → speak → listen ───

  function startListening() {
    if (!isActiveRef.current) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Speech recognition not supported");
      return;
    }

    // Kill any existing instance
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-AU";
    recognition.interimResults = true;
    recognition.continuous = false; // Single utterance — more reliable on mobile
    recognition.maxAlternatives = 1;

    let finalText = "";
    let hasResult = false;

    recognition.onresult = (event: any) => {
      let interim = "";
      finalText = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
          hasResult = true;
        } else {
          interim += result[0].transcript;
        }
      }
      setInterimTranscript(finalText + interim);

      // Auto-stop after 2s of silence once we have final text
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (finalText.trim()) {
        silenceTimerRef.current = setTimeout(() => {
          try { recognition.stop(); } catch {}
        }, 1500);
      }
    };

    recognition.onerror = (event: any) => {
      console.log("[Voice] recognition error:", event.error);
      if (event.error === "no-speech" || event.error === "aborted") {
        // Silently retry
        if (isActiveRef.current) {
          setTimeout(() => startListening(), 300);
        }
        return;
      }
      if (event.error === "not-allowed") {
        toast.error("Microphone access denied");
        isActiveRef.current = false;
        setVoiceState("idle");
        return;
      }
      // Other errors — retry
      if (isActiveRef.current) {
        setTimeout(() => startListening(), 500);
      }
    };

    recognition.onend = () => {
      console.log("[Voice] recognition ended, finalText:", finalText, "hasResult:", hasResult);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      recognitionRef.current = null;

      if (hasResult && finalText.trim() && isActiveRef.current) {
        handleUserSpeech(finalText.trim());
      } else if (isActiveRef.current) {
        // No speech detected, restart listening
        setTimeout(() => startListening(), 300);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setVoiceState("listening");
      setInterimTranscript("");
      console.log("[Voice] listening started");
    } catch (e) {
      console.error("[Voice] failed to start recognition:", e);
      if (isActiveRef.current) {
        setTimeout(() => startListening(), 1000);
      }
    }
  }

  async function handleUserSpeech(text: string) {
    if (!isActiveRef.current) return;

    console.log("[Voice] user said:", text);
    setVoiceState("processing");
    setInterimTranscript("");
    setCurrentAssistantText("");

    const userMsg: Message = { role: "user", content: text, timestamp: new Date() };
    const updatedMessages = [...messagesRef.current, userMsg];
    onMessagesChangeRef.current(updatedMessages);
    messagesRef.current = updatedMessages;

    let assistantText = "";

    try {
      abortRef.current = new AbortController();
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
          businessId: businessIdRef.current,
          voiceMode: true,
        }),
        signal: abortRef.current.signal,
      });

      if (!resp.ok) {
        console.error("[Voice] AI request failed:", resp.status);
        if (resp.status === 429) toast.error("Rate limit hit. Wait a moment.");
        else if (resp.status === 402) toast.error("AI credits exhausted.");
        else toast.error("AI request failed");
        setVoiceState("idle");
        if (isActiveRef.current) setTimeout(() => startListening(), 500);
        return;
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantText += content;
              setCurrentAssistantText(assistantText);
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Flush remaining
      for (const raw of textBuffer.split("\n")) {
        if (!raw || !raw.startsWith("data: ")) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) assistantText += content;
        } catch {}
      }

      console.log("[Voice] AI responded:", assistantText.substring(0, 100));

      // Save assistant message
      const assistantMsg: Message = { role: "assistant", content: assistantText, timestamp: new Date() };
      const finalMessages = [...updatedMessages, assistantMsg];
      onMessagesChangeRef.current(finalMessages);
      messagesRef.current = finalMessages;
      setCurrentAssistantText("");

      // Speak the response, then loop back to listening
      await speakText(assistantText);

    } catch (e: any) {
      if (e.name === "AbortError") return;
      console.error("[Voice] AI error:", e);
      toast.error("Failed to get AI response");
      setVoiceState("idle");
      if (isActiveRef.current) setTimeout(() => startListening(), 500);
    }
  }

  async function speakText(text: string) {
    const clean = cleanForSpeech(text);
    if (!clean) {
      if (isActiveRef.current) setTimeout(() => startListening(), 200);
      return;
    }

    setVoiceState("speaking");
    console.log("[Voice] speaking:", clean.substring(0, 80));

    try {
      const response = await fetch(TTS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ text: clean }),
      });

      if (!response.ok) {
        console.error("[Voice] TTS failed:", response.status);
        await fallbackSpeak(clean);
        return;
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      await new Promise<void>((resolve) => {
        const audio = warmAudioRef.current || new Audio();
        audio.src = audioUrl;
        audioRef.current = audio;

        // Try to route to main speaker
        try {
          if ('setSinkId' in audio && typeof (audio as any).setSinkId === 'function') {
            (audio as any).setSinkId('default');
          }
        } catch {}

        const cleanup = () => {
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
          audio.removeEventListener("ended", onEnd);
          audio.removeEventListener("error", onError);
        };

        const onEnd = () => { cleanup(); resolve(); };
        const onError = () => {
          console.error("[Voice] audio playback error");
          cleanup();
          resolve(); // resolve anyway to continue the loop
        };

        audio.addEventListener("ended", onEnd);
        audio.addEventListener("error", onError);
        audio.play().catch(() => { cleanup(); resolve(); });
      });

    } catch (e) {
      console.error("[Voice] TTS error:", e);
      await fallbackSpeak(clean);
      return;
    }

    // After speaking, go back to listening
    setVoiceState("idle");
    if (isActiveRef.current) {
      setTimeout(() => startListening(), 300);
    }
  }

  function fallbackSpeak(text: string): Promise<void> {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text.substring(0, 200));
      utterance.lang = "en-AU";
      utterance.rate = 1.05;
      utterance.volume = 1;

      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v => v.lang.startsWith("en-AU")) || voices.find(v => v.lang.startsWith("en"));
      if (preferred) utterance.voice = preferred;

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);

      // Safety timeout in case onend never fires
      setTimeout(() => resolve(), 15000);
    });
  }

  // ─── User actions ───

  function startConversation() {
    // Pre-warm audio element on user gesture
    if (!warmAudioRef.current) {
      const a = new Audio();
      a.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
      try {
        if ('setSinkId' in a && typeof (a as any).setSinkId === 'function') {
          (a as any).setSinkId('default');
        }
      } catch {}
      a.play().then(() => a.pause()).catch(() => {});
      warmAudioRef.current = a;
    }
    isActiveRef.current = true;
    startListening();
  }

  function endConversation() {
    isActiveRef.current = false;
    stopEverything();
  }

  function handleClose() {
    endConversation();
    onClose();
  }

  if (!open) return null;

  const stateConfig = {
    idle: { color: "bg-muted", pulseColor: "", label: "Tap to start", icon: <Mic className="h-8 w-8" /> },
    listening: { color: "bg-primary", pulseColor: "ring-4 ring-primary/30 animate-pulse", label: "Listening...", icon: <Mic className="h-8 w-8 text-primary-foreground" /> },
    processing: { color: "bg-warning", pulseColor: "ring-4 ring-warning/30 animate-pulse", label: "Thinking...", icon: <Bot className="h-8 w-8 text-warning-foreground" /> },
    speaking: { color: "bg-primary", pulseColor: "ring-4 ring-primary/20", label: "Speaking...", icon: <Volume2 className="h-8 w-8 text-primary-foreground animate-pulse" /> },
  };

  const config = stateConfig[voiceState];

  return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col" style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold text-foreground">Voice Chat</span>
          {businessName && <span className="text-xs text-muted-foreground">• {businessName}</span>}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground" onClick={handleClose}>
            <MessageSquare className="h-3.5 w-3.5" />
            Text mode
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Transcript area */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && voiceState === "idle" && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-4 ring-4 ring-primary/5">
              <Mic className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">Voice Assistant</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Have a natural voice conversation with your AI business assistant. Tap the button below to start.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
            )}
            <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm ${
              msg.role === "user"
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border/30 text-foreground"
            }`}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
              <span className={`text-[10px] block mt-1 ${msg.role === "user" ? "text-primary-foreground/60" : "text-muted-foreground/50"}`}>
                {msg.timestamp.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true })}
              </span>
            </div>
            {msg.role === "user" && (
              <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}

        {/* Live interim transcript */}
        {interimTranscript && voiceState === "listening" && (
          <div className="flex gap-2.5 justify-end">
            <div className="max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm bg-primary/60 text-primary-foreground">
              <p className="whitespace-pre-wrap italic">{interimTranscript}</p>
            </div>
            <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </div>
        )}

        {/* Live assistant response */}
        {currentAssistantText && voiceState === "processing" && (
          <div className="flex gap-2.5 justify-start">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Bot className="h-3.5 w-3.5 text-primary animate-pulse" />
            </div>
            <div className="max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm bg-card border border-border/30 text-foreground">
              <p className="whitespace-pre-wrap">{currentAssistantText}</p>
            </div>
          </div>
        )}

        {/* Processing indicator */}
        {voiceState === "processing" && !currentAssistantText && (
          <div className="flex gap-2.5 justify-start">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Bot className="h-3.5 w-3.5 text-primary animate-pulse" />
            </div>
            <div className="bg-card border border-border/30 rounded-xl px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span className="text-xs text-muted-foreground">Thinking...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="flex-shrink-0 px-4 py-6 flex flex-col items-center gap-3 border-t border-border/20">
        <span className="text-xs text-muted-foreground font-medium">{config.label}</span>

        <div className="flex items-center gap-4">
          {voiceState === "idle" ? (
            <button
              onClick={startConversation}
              className={`h-16 w-16 rounded-full ${config.color} flex items-center justify-center transition-all active:scale-95 shadow-lg`}
            >
              {config.icon}
            </button>
          ) : (
            <>
              <button
                onClick={endConversation}
                className="h-12 w-12 rounded-full bg-destructive flex items-center justify-center transition-all active:scale-95"
              >
                <PhoneOff className="h-5 w-5 text-destructive-foreground" />
              </button>
              <div className={`h-16 w-16 rounded-full ${config.color} ${config.pulseColor} flex items-center justify-center transition-all`}>
                {config.icon}
              </div>
              <div className="w-12" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
