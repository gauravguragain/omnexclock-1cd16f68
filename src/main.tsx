import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const GLOBAL_SYNC_VERSION = "2026-09-03-runsheet-view-v2";
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

// Recover from stale builds: when a lazily-loaded page chunk no longer exists
// (new deploy replaced hashed files), clear caches and hard-reload once.
const CHUNK_RELOAD_KEY = "chunk_reload_at";
const recoverFromStaleChunk = async () => {
  const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
  if (Date.now() - last < 30_000) return; // avoid reload loops
  sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // reload anyway
  }
  const url = new URL(window.location.href);
  url.searchParams.set("r", Date.now().toString());
  window.location.replace(url.toString());
};
const isChunkError = (msg: string) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk/i.test(msg);
window.addEventListener("vite:preloadError", (e) => {
  e.preventDefault();
  void recoverFromStaleChunk();
});
window.addEventListener("unhandledrejection", (e) => {
  if (isChunkError(String(e.reason?.message ?? e.reason ?? ""))) void recoverFromStaleChunk();
});
window.addEventListener("error", (e) => {
  if (isChunkError(String(e.message ?? ""))) void recoverFromStaleChunk();
});

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
