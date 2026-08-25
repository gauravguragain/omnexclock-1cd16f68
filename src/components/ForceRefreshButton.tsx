import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Clears service workers + caches and hard-reloads the app.
 * Useful when a device is stuck on a stale build.
 */
export default function ForceRefreshButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);

  const handleRefresh = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          regs.map(async (r) => {
            r.waiting?.postMessage({ type: "SKIP_WAITING" });
            await r.unregister();
          })
        );
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      // keep going — reload is the important part
    }
    const url = new URL(window.location.href);
    url.searchParams.set("r", Date.now().toString());
    window.location.replace(url.toString());
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Force refresh"
      title="Force refresh"
      onClick={handleRefresh}
      disabled={busy}
      className={className}
    >
      <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
    </Button>
  );

}
