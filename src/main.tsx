import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const GLOBAL_SYNC_VERSION = "2026-03-02-unclamped-weeks-v1";
const GLOBAL_SYNC_KEY = "omnex_global_sync_version";

const runOneTimeGlobalSyncRefresh = async () => {
  try {
    const syncedVersion = localStorage.getItem(GLOBAL_SYNC_KEY);
    if (syncedVersion === GLOBAL_SYNC_VERSION) return;

    localStorage.setItem(GLOBAL_SYNC_KEY, GLOBAL_SYNC_VERSION);

    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map(async (registration) => {
          registration.waiting?.postMessage({ type: "SKIP_WAITING" });
          await registration.unregister();
        })
      );
    }

    if ("caches" in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
    }

    const url = new URL(window.location.href);
    url.searchParams.set("sync", GLOBAL_SYNC_VERSION);
    window.location.replace(url.toString());
    return;
  } catch {
    // keep startup resilient even if cache cleanup fails
  }
};

void runOneTimeGlobalSyncRefresh();

// Silently check for SW updates without forcing reload
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.ready.then((registration) => {
    // Check for updates every 60 seconds
    setInterval(() => {
      registration.update().catch(() => {});
    }, 60 * 1000);

    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            // Skip waiting so the new SW activates on next navigation
            newWorker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      }
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
