// Broadcasts an in-app "app:db-write" event after every successful database write
// (insert/update/delete/RPC), so every open screen refreshes instantly even if
// the realtime feed is delayed or misses the change.
let installed = false;
export function installDbWriteSignal() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await orig(input, init);
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      const m = url.match(/\/rest\/v1\/(rpc\/)?([^?/]+)/);
      if (m && res.ok && (m[1] ? true : method !== "GET" && method !== "HEAD")) {
        const table = m[1] ? "*" : m[2];
        window.dispatchEvent(new CustomEvent("app:db-write", { detail: { table } }));
      }
    } catch { /* ignore */ }
    return res;
  };
}
