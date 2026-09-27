// Resolves the public origin the app is running on, so generated links
// (portal invites, run-sheet shares, QR posters) follow whatever domain
// the site is served from — the published Lovable URL today, any custom
// domain once connected. Previews/localhost fall back to the live site.
export function getAppOrigin(): string {
  if (typeof window === "undefined") return "https://www.regalmanagement.com.au";
  const origin = window.location.origin;
  if (
    origin.includes("localhost") ||
    origin.includes("preview--") ||
    origin.includes("lovableproject.com")
  ) {
    return "https://www.regalmanagement.com.au";
  }
  return origin;
}
