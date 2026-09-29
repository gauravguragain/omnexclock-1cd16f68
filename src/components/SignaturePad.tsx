import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Finger / mouse / stylus drawing pad. Returns a transparent PNG data URL. */
export function SignaturePadDialog({ open, onOpenChange, onDone, title = "Sign here", doneLabel = "Use signature" }: {
  open: boolean; onOpenChange: (v: boolean) => void; onDone: (dataUrl: string) => void | Promise<void>; title?: string; doneLabel?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const c = canvasRef.current; if (!c) return;
      const r = c.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
      c.width = r.width * dpr; c.height = r.height * dpr;
      const ctx = c.getContext("2d")!; ctx.scale(dpr, dpr); ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#111";
      setEmpty(true);
    }, 50);
    return () => clearTimeout(t);
  }, [open]);

  const pos = (e: React.PointerEvent) => { const r = canvasRef.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e: React.PointerEvent) => { e.preventDefault(); canvasRef.current!.setPointerCapture(e.pointerId); drawing.current = true; last.current = pos(e); const ctx = canvasRef.current!.getContext("2d")!; ctx.beginPath(); ctx.arc(last.current.x, last.current.y, 1, 0, Math.PI * 2); ctx.fillStyle = "#111"; ctx.fill(); setEmpty(false); };
  const move = (e: React.PointerEvent) => { if (!drawing.current || !last.current) return; e.preventDefault(); const p = pos(e); const ctx = canvasRef.current!.getContext("2d")!; ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last.current = p; };
  const up = () => { drawing.current = false; last.current = null; };
  const clear = () => { const c = canvasRef.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setEmpty(true); };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">Draw your signature with your finger, stylus or mouse.</p>
      <canvas ref={canvasRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}
        className="h-48 w-full touch-none rounded-md border border-border bg-white" style={{ touchAction: "none" }} />
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={clear}>Clear</Button>
        <Button disabled={empty || busy} onClick={async () => { setBusy(true); try { await onDone(canvasRef.current!.toDataURL("image/png")); onOpenChange(false); } finally { setBusy(false); } }}>{busy ? "Saving…" : doneLabel}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
