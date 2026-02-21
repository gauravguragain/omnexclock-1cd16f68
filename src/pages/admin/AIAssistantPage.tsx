import { useState, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import { useBusiness } from "@/contexts/BusinessContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Bot, Send, Trash2, Sparkles, User, Mic, MicOff, Volume2, VolumeX,
  Download, Copy, Check, Zap, TrendingUp, Users, Package, CalendarDays, DollarSign, AlertTriangle, FileText,
  History, ArrowLeft, Clock, X, Phone,
} from "lucide-react";
import VoiceChatMode from "@/components/VoiceChatMode";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "sonner";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";
// jsPDF is dynamically imported in exportPDF to avoid chunk load failures

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface HistorySession {
  id: string;
  messages: Message[];
  savedAt: string;
  preview: string;
}

interface ChartData {
  type: "bar" | "line" | "pie" | "area";
  title: string;
  data: Record<string, any>[];
  xKey: string;
  yKey: string;
  color?: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`;
const CHART_COLORS = ["#D4A843", "#6366f1", "#22c55e", "#ef4444", "#3b82f6", "#f97316", "#8b5cf6", "#ec4899"];

interface PromptCategory {
  label: string;
  icon: React.ReactNode;
  prompts: string[];
}

const promptCategories: PromptCategory[] = [
  {
    label: "Overview",
    icon: <Zap className="h-3.5 w-3.5" />,
    prompts: [
      "Give me a full business intelligence briefing for today",
      "What are the top 5 things I should know right now?",
      "Show me a complete weekly performance summary with charts",
    ],
  },
  {
    label: "Staffing",
    icon: <Users className="h-3.5 w-3.5" />,
    prompts: [
      "Who is clocked in right now?",
      "Show employee attendance reliability rankings this month",
      "Identify overtime trends and cost impact with a chart",
      "Which employees have unapproved timesheets?",
    ],
  },
  {
    label: "Finance",
    icon: <DollarSign className="h-3.5 w-3.5" />,
    prompts: [
      "Show payroll cost breakdown by department as a pie chart",
      "Compare labor costs: this week vs last week",
      "Who are the top 5 highest-cost employees this month?",
      "Calculate total payroll spend trend over the last 4 weeks",
    ],
  },
  {
    label: "Inventory",
    icon: <Package className="h-3.5 w-3.5" />,
    prompts: [
      "Which inventory items are low or out of stock?",
      "Show inventory order history trends",
      "Predict when current stock will run out based on usage",
    ],
  },
  {
    label: "Events",
    icon: <CalendarDays className="h-3.5 w-3.5" />,
    prompts: [
      "What events are coming up this week?",
      "Generate staffing recommendations for upcoming events",
      "Show event frequency trends over the last 3 months",
    ],
  },
  {
    label: "Alerts",
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    prompts: [
      "Flag any anomalies or issues I should address",
      "Show overdue service maintenance tasks",
      "List all pending employee requests needing attention",
    ],
  },
];

function parseCharts(text: string): { segments: Array<{ type: "text" | "chart"; content: string; chart?: ChartData }> } {
  const segments: Array<{ type: "text" | "chart"; content: string; chart?: ChartData }> = [];
  const chartRegex = /```chart\s*\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = chartRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    try {
      const chartData = JSON.parse(match[1]) as ChartData;
      segments.push({ type: "chart", content: "", chart: chartData });
    } catch {
      segments.push({ type: "text", content: match[0] });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) });
  }

  return { segments: segments.length ? segments : [{ type: "text", content: text }] };
}

function ChartRenderer({ chart }: { chart: ChartData }) {
  const { type, title, data, xKey, yKey, color } = chart;
  const primaryColor = color || "#D4A843";

  return (
    <div className="my-3 p-4 bg-background/50 border border-border/30 rounded-xl">
      <h4 className="text-xs font-semibold text-foreground mb-3">{title}</h4>
      <ResponsiveContainer width="100%" height={240}>
        {type === "bar" ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
            <Bar dataKey={yKey} fill={primaryColor} radius={[4, 4, 0, 0]} />
          </BarChart>
        ) : type === "line" ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
            <Line type="monotone" dataKey={yKey} stroke={primaryColor} strokeWidth={2} dot={{ r: 3, fill: primaryColor }} />
          </LineChart>
        ) : type === "area" ? (
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
            <Area type="monotone" dataKey={yKey} stroke={primaryColor} fill={primaryColor} fillOpacity={0.2} />
          </AreaChart>
        ) : (
          <PieChart>
            <Pie data={data} dataKey={yKey} nameKey={xKey} cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
          </PieChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

const STORAGE_KEY = "ai-assistant-history";

const HISTORY_KEY = "ai-assistant-sessions";

function loadHistory(businessId: string): Message[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}-${businessId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
  } catch { return []; }
}

function saveHistory(businessId: string, messages: Message[]) {
  try {
    const toSave = messages.slice(-50);
    localStorage.setItem(`${STORAGE_KEY}-${businessId}`, JSON.stringify(toSave));
  } catch { /* ignore */ }
}

function loadSessions(businessId: string): HistorySession[] {
  try {
    const raw = localStorage.getItem(`${HISTORY_KEY}-${businessId}`);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

function saveSessions(businessId: string, sessions: HistorySession[]) {
  try {
    // Keep last 30 sessions
    const toSave = sessions.slice(-30);
    localStorage.setItem(`${HISTORY_KEY}-${businessId}`, JSON.stringify(toSave));
  } catch { /* ignore */ }
}

function saveCurrentToHistory(businessId: string, messages: Message[]) {
  if (messages.length === 0) return;
  const sessions = loadSessions(businessId);
  const firstUserMsg = messages.find(m => m.role === "user");
  const session: HistorySession = {
    id: Date.now().toString(),
    messages: messages.map(m => ({ ...m, timestamp: m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp) })),
    savedAt: new Date().toISOString(),
    preview: firstUserMsg?.content?.slice(0, 80) || "Chat session",
  };
  sessions.push(session);
  saveSessions(businessId, sessions);
}

export default function AIAssistantPage() {
  const { business } = useBusiness();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [voiceModeOpen, setVoiceModeOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  // Load conversation history on mount
  useEffect(() => {
    if (business?.id) {
      const history = loadHistory(business.id);
      if (history.length > 0) setMessages(history);
      setSessions(loadSessions(business.id));
    }
  }, [business?.id]);

  // Save current chat to history and clear on unmount (leaving page)
  useEffect(() => {
    const businessId = business?.id;
    return () => {
      if (businessId) {
        const currentRaw = localStorage.getItem(`${STORAGE_KEY}-${businessId}`);
        if (currentRaw) {
          try {
            const currentMsgs = JSON.parse(currentRaw).map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
            if (currentMsgs.length > 0) {
              saveCurrentToHistory(businessId, currentMsgs);
            }
          } catch { /* ignore */ }
        }
        localStorage.removeItem(`${STORAGE_KEY}-${businessId}`);
      }
    };
  }, [business?.id]);

  // Save conversation when messages change
  useEffect(() => {
    if (business?.id && messages.length > 0) {
      saveHistory(business.id, messages);
    }
  }, [messages, business?.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Track speech synthesis state
  useEffect(() => {
    const interval = setInterval(() => {
      setIsSpeaking(window.speechSynthesis.speaking);
    }, 200);
    return () => clearInterval(interval);
  }, []);

  // Voice recognition setup
  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Speech recognition not supported in this browser");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-AU";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech error:", event.error);
      if (event.error !== "aborted") toast.error(`Voice error: ${event.error}`);
      setIsListening(false);
    };

    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const toggleVoice = useCallback(() => {
    if (isListening) stopListening();
    else startListening();
  }, [isListening, startListening, stopListening]);

  // Text-to-speech
  const speakText = useCallback((text: string) => {
    const clean = text
      .replace(/```chart[\s\S]*?```/g, "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/[#*_`~]/g, "")
      .replace(/\|[^\n]+\|/g, "")
      .replace(/[═╔╗╚╝║─┌┐└┘├┤┬┴┼│]/g, "")
      .trim();
    if (!clean) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = "en-AU";
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }, []);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel();
  }, []);

  // Copy message to clipboard
  const copyMessage = useCallback((text: string, idx: number) => {
    const clean = text
      .replace(/```chart[\s\S]*?```/g, "[Chart]")
      .trim();
    navigator.clipboard.writeText(clean);
    setCopiedIdx(idx);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedIdx(null), 2000);
  }, []);

  // Export conversation as PDF
  const exportPDF = useCallback(async () => {
    if (messages.length === 0) return;
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    const margin = 15;
    let y = margin;

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`AI Assistant — ${business?.name || "Business Report"}`, margin, y);
    y += 8;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney" })}`, margin, y);
    y += 10;

    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, 195, y);
    y += 6;

    for (const msg of messages) {
      const label = msg.role === "user" ? "You" : "AI Assistant";
      const clean = msg.content
        .replace(/```chart[\s\S]*?```/g, "[Chart — see app for visual]")
        .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, "").replace(/```/g, ""))
        .replace(/[#*_`~]/g, "");

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(msg.role === "user" ? 0 : 180, msg.role === "user" ? 0 : 140, msg.role === "user" ? 0 : 40);
      doc.text(`${label}:`, margin, y);
      y += 5;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(50, 50, 50);
      doc.setFontSize(9);
      const lines = doc.splitTextToSize(clean, 170);
      for (const line of lines) {
        if (y > 280) { doc.addPage(); y = margin; }
        doc.text(line, margin, y);
        y += 4.5;
      }
      y += 4;
    }

    doc.save(`AI-Report-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success("PDF exported successfully");
  }, [messages, business]);

  const sendMessage = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || !business || isLoading) return;

    if (isListening) stopListening();

    const userMsg: Message = { role: "user", content: messageText, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    let assistantSoFar = "";

    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar, timestamp: new Date() }];
      });
    };

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
          businessId: business.id,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Request failed" }));
        if (resp.status === 429) toast.error("Rate limit exceeded. Please wait a moment.");
        else if (resp.status === 402) toast.error("AI credits exhausted.");
        else toast.error(err.error || "AI request failed");
        setIsLoading(false);
        return;
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;

      while (!streamDone) {
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
          if (jsonStr === "[DONE]") { streamDone = true; break; }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Final flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      console.error("AI stream error:", e);
      toast.error("Failed to get AI response");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    window.speechSynthesis.cancel();
    if (business?.id && messages.length > 0) {
      saveCurrentToHistory(business.id, messages);
      setSessions(loadSessions(business.id));
    }
    setMessages([]);
    setInput("");
    if (business?.id) localStorage.removeItem(`${STORAGE_KEY}-${business.id}`);
  };

  const loadSession = (session: HistorySession) => {
    setMessages(session.messages.map(m => ({ ...m, timestamp: new Date(m.timestamp) })));
    setHistoryOpen(false);
  };

  const deleteSession = (sessionId: string) => {
    if (!business?.id) return;
    const updated = sessions.filter(s => s.id !== sessionId);
    setSessions(updated);
    saveSessions(business.id, updated);
  };

  const clearAllHistory = () => {
    if (!business?.id) return;
    setSessions([]);
    localStorage.removeItem(`${HISTORY_KEY}-${business.id}`);
    toast.success("History cleared");
  };

  // Markdown rendering
  const renderMarkdown = (text: string) => {
    let html = text
      .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-muted/50 rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono"><code>$2</code></pre>')
      .replace(/`([^`]+)`/g, '<code class="bg-muted/50 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^### (.+)$/gm, '<h4 class="text-sm font-semibold mt-3 mb-1 text-foreground">$1</h4>')
      .replace(/^## (.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-1.5 text-foreground">$1</h3>')
      .replace(/^# (.+)$/gm, '<h2 class="text-lg font-bold mt-4 mb-2 text-foreground">$1</h2>')
      .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>')
      .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-sm">$1</li>')
      .replace(/\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)*)/g, (_, header, body) => {
        const headers = header.split("|").map((h: string) => h.trim()).filter(Boolean);
        const rows = body.trim().split("\n").map((row: string) =>
          row.split("|").map((c: string) => c.trim()).filter(Boolean)
        );
        return `<div class="overflow-x-auto my-2 rounded-lg border border-border/30"><table class="w-full text-xs border-collapse"><thead><tr>${headers.map((h: string) => `<th class="border-b border-border/30 px-3 py-2 bg-muted/30 text-left font-semibold text-foreground">${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r: string[], ri: number) => `<tr class="${ri % 2 === 0 ? "" : "bg-muted/10"}">${r.map((c: string) => `<td class="border-b border-border/20 px-3 py-1.5 text-muted-foreground">${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      })
      .replace(/\n/g, '<br />');

    return <div className="prose-sm max-w-none leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />;
  };

  const renderMessage = (content: string) => {
    const { segments } = parseCharts(content);
    return (
      <>
        {segments.map((seg, i) =>
          seg.type === "chart" && seg.chart ? (
            <ChartRenderer key={i} chart={seg.chart} />
          ) : (
            <div key={i}>{renderMarkdown(seg.content)}</div>
          )
        )}
      </>
    );
  };

  const selectedCategory = promptCategories.find(c => c.label === activeCategory);

  return (
    <div className="flex flex-col -m-3 lg:-m-6 -mb-[calc(68px+env(safe-area-inset-bottom,0px)+0.75rem)] lg:-mb-6 relative" style={{ height: "calc(100dvh - 3rem)" }}>
      {/* Messages area - extra bottom padding on mobile for fixed input */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto scroll-native space-y-3 p-3 lg:p-6 pb-[10rem] lg:pb-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 ring-4 ring-primary/5">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-1">AI Business Intelligence</h2>
            <p className="text-sm text-muted-foreground mb-1 max-w-md">
              Your personal AI analyst with full access to all business data — ask anything, generate reports, spot trends & get actionable insights.
            </p>
            <p className="text-xs text-muted-foreground/60 mb-5 max-w-md flex items-center gap-1.5 justify-center">
              <Mic className="h-3 w-3" /> Voice chat available • All times AEST • Charts & PDF export
            </p>

            {/* Category tabs */}
            <div className="flex flex-wrap gap-1.5 justify-center mb-3 max-w-lg">
              {promptCategories.map((cat) => (
                <button
                  key={cat.label}
                  onClick={() => setActiveCategory(activeCategory === cat.label ? null : cat.label)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    activeCategory === cat.label
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {cat.icon}
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Prompts for selected category */}
            <div className="grid grid-cols-1 gap-2 w-full max-w-lg">
              {(selectedCategory ? selectedCategory.prompts : promptCategories[0].prompts).map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  className="text-left px-3.5 py-2.5 rounded-xl border border-border/40 bg-card hover:bg-accent/50 text-xs text-muted-foreground hover:text-foreground transition-all hover:border-primary/30 hover:shadow-sm"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"} group`}>
              {msg.role === "assistant" && (
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
              )}
              <div className="flex flex-col max-w-[90%] lg:max-w-[75%]">
                <div
                  className={`rounded-xl px-3.5 py-2.5 text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border/30"
                  }`}
                >
                  {msg.role === "assistant" ? renderMessage(msg.content) : <p className="whitespace-pre-wrap">{msg.content}</p>}
                </div>
                {/* Message actions */}
                {msg.role === "assistant" && !isLoading && (
                  <div className="flex items-center gap-0.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => speakText(msg.content)} title="Read aloud">
                      <Volume2 className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => copyMessage(msg.content, i)} title="Copy">
                      {copiedIdx === i ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                    </Button>
                    <span className="text-[10px] text-muted-foreground/50 ml-1">
                      {msg.timestamp.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true })}
                    </span>
                  </div>
                )}
                {msg.role === "user" && (
                  <span className="text-[10px] text-muted-foreground/50 ml-auto mt-0.5">
                    {msg.timestamp.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true })}
                  </span>
                )}
              </div>
              {msg.role === "user" && (
                <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              )}
            </div>
          ))
        )}
        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex gap-2.5">
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
                <span className="text-xs text-muted-foreground">Analyzing business data...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Voice listening indicator */}
      {isListening && (
        <div className="flex items-center gap-2 pb-2 justify-center">
          <div className="flex gap-0.5 items-center">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="w-1 bg-primary rounded-full animate-pulse"
                style={{
                  height: `${12 + Math.random() * 16}px`,
                  animationDelay: `${i * 100}ms`,
                  animationDuration: "0.6s",
                }}
              />
            ))}
          </div>
          <span className="text-xs text-primary font-medium">Listening...</span>
        </div>
      )}

      {/* Speaking indicator */}
      {isSpeaking && (
        <div className="flex items-center gap-2 pb-2 justify-center">
          <Volume2 className="h-3.5 w-3.5 text-primary animate-pulse" />
          <span className="text-xs text-primary font-medium">Speaking...</span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={stopSpeaking}>
            <VolumeX className="h-3 w-3 mr-1" /> Stop
          </Button>
        </div>
      )}

      {/* Input area */}
      <div className="fixed bottom-[calc(68px+env(safe-area-inset-bottom,0px))] lg:bottom-0 left-0 right-0 lg:left-64 z-20 bg-background border-t border-border/30 px-3 lg:px-6 pb-2 pt-2 flex-shrink-0">
        {/* Action buttons row */}
        {messages.length > 0 && (
          <div className="flex items-center gap-1 mb-1.5">
            <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground gap-1">
                  <History className="h-3.5 w-3.5" /> History
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[85vw] sm:w-96 p-0 pb-[env(safe-area-inset-bottom)]">
                <SheetHeader className="p-4 pt-[calc(env(safe-area-inset-top,0px)+1rem)] border-b border-border/30">
                  <SheetTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm">
                      <History className="h-4 w-4" /> Chat History
                    </span>
                    {sessions.length > 0 && (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={clearAllHistory}>
                        Clear All
                      </Button>
                    )}
                  </SheetTitle>
                </SheetHeader>
                <div className="overflow-y-auto h-[calc(100vh-5rem)]">
                  {sessions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-center px-4">
                      <Clock className="h-8 w-8 text-muted-foreground/30 mb-2" />
                      <p className="text-sm text-muted-foreground">No history yet</p>
                      <p className="text-xs text-muted-foreground/60">Chats are saved when you leave or clear</p>
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      {[...sessions].reverse().map((session) => {
                        const date = new Date(session.savedAt);
                        const msgCount = session.messages.length;
                        return (
                          <div
                            key={session.id}
                            className="flex items-start gap-3 px-4 py-3 border-b border-border/20 hover:bg-accent/30 transition-colors cursor-pointer group"
                            onClick={() => loadSession(session)}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{session.preview}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] text-muted-foreground">
                                  {date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                                </span>
                                <span className="text-[10px] text-muted-foreground/50">•</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {date.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true })}
                                </span>
                                <span className="text-[10px] text-muted-foreground/50">•</span>
                                <span className="text-[10px] text-muted-foreground">{msgCount} msgs</span>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive flex-shrink-0"
                              onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                              title="Delete"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground gap-1" onClick={clearChat} title="Clear chat">
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground gap-1" onClick={exportPDF} title="Export as PDF">
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          </div>
        )}
        {/* No messages: just history button inline */}
        {messages.length === 0 && (
          <div className="flex items-center gap-1 mb-1.5">
            <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground gap-1">
                  <History className="h-3.5 w-3.5" /> History
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[85vw] sm:w-96 p-0 pb-[env(safe-area-inset-bottom)]">
                <SheetHeader className="p-4 pt-[calc(env(safe-area-inset-top,0px)+1rem)] border-b border-border/30">
                  <SheetTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm">
                      <History className="h-4 w-4" /> Chat History
                    </span>
                    {sessions.length > 0 && (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={clearAllHistory}>
                        Clear All
                      </Button>
                    )}
                  </SheetTitle>
                </SheetHeader>
                <div className="overflow-y-auto h-[calc(100vh-5rem)]">
                  {sessions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-center px-4">
                      <Clock className="h-8 w-8 text-muted-foreground/30 mb-2" />
                      <p className="text-sm text-muted-foreground">No history yet</p>
                      <p className="text-xs text-muted-foreground/60">Chats are saved when you leave or clear</p>
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      {[...sessions].reverse().map((session) => {
                        const date = new Date(session.savedAt);
                        const msgCount = session.messages.length;
                        return (
                          <div
                            key={session.id}
                            className="flex items-start gap-3 px-4 py-3 border-b border-border/20 hover:bg-accent/30 transition-colors cursor-pointer group"
                            onClick={() => loadSession(session)}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{session.preview}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] text-muted-foreground">
                                  {date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                                </span>
                                <span className="text-[10px] text-muted-foreground/50">•</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {date.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true })}
                                </span>
                                <span className="text-[10px] text-muted-foreground/50">•</span>
                                <span className="text-[10px] text-muted-foreground">{msgCount} msgs</span>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive flex-shrink-0"
                              onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                              title="Delete"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        )}
        {/* Input row */}
        <div className="flex gap-2 items-end">
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 flex-shrink-0 border-primary/30 text-primary hover:bg-primary/10"
            onClick={() => setVoiceModeOpen(true)}
            title="Voice conversation"
          >
            <Phone className="h-4 w-4" />
          </Button>
          <Button
            variant={isListening ? "default" : "outline"}
            size="icon"
            className={`h-10 w-10 flex-shrink-0 ${isListening ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground animate-pulse" : ""}`}
            onClick={toggleVoice}
            title={isListening ? "Stop listening" : "Voice input"}
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isListening ? "Speak now..." : "Ask about your business..."}
            className="resize-none min-h-[44px] max-h-32 text-sm"
            rows={1}
            disabled={isLoading}
          />
          <Button
            size="icon"
            className="h-10 w-10 flex-shrink-0"
            onClick={() => sendMessage()}
            disabled={!input.trim() || isLoading}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground/40 text-center mt-1">
          AI responses are based on your business data • Super Admin exclusive
        </p>
      </div>

      {/* Voice Chat Mode Overlay */}
      <VoiceChatMode
        open={voiceModeOpen}
        onClose={() => {
          setVoiceModeOpen(false);
          setTimeout(() => textareaRef.current?.focus(), 100);
        }}
        messages={messages}
        onMessagesChange={setMessages}
        businessId={business?.id || ""}
        businessName={business?.name}
      />
    </div>
  );
}
