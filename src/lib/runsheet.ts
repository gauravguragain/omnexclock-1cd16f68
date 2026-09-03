import { supabase } from "@/integrations/supabase/client";

/**
 * Opens an event runsheet PDF.
 * The `event-runsheets` bucket is private, so access always goes through the
 * `runsheet-signed-url` edge function, which authorises either a signed-in staff
 * member of the owning business or an employee via their portal credentials.
 */
export async function openRunsheet(
  urlOrPath: string,
  creds?: { employeeCode?: string | null; businessCode?: string | null },
): Promise<string | null> {
  const storagePathMatch = urlOrPath.match(
    /\/storage\/v1\/object\/(?:public\/|sign\/)?event-runsheets\/([^?#]+)/,
  );
  const rawPath = storagePathMatch ? decodeURIComponent(storagePathMatch[1]) : urlOrPath;

  // Truly external URL (not our runsheet storage)
  if (rawPath.startsWith("http") && !storagePathMatch) {
    window.open(rawPath, "_blank", "noopener,noreferrer");
    return null;
  }

  const filePath = rawPath.split("?")[0].trim();

  // Open synchronously from the click event. Mobile Safari and other browsers
  // otherwise block window.open after the signed-URL request has completed.
  const pdfWindow = window.open("", "_blank");
  if (pdfWindow) {
    pdfWindow.document.title = "Opening runsheet…";
    pdfWindow.document.body.textContent = "Opening runsheet PDF…";
  }

  const { data, error } = await supabase.functions.invoke("runsheet-signed-url", {
    body: {
      file_path: filePath,
      employee_code: creds?.employeeCode ?? undefined,
      business_code: creds?.businessCode ?? undefined,
    },
  });

  if (error || !data?.url) {
    pdfWindow?.close();
    // Surface the edge function's error message when available
    try {
      const ctx = (error as { context?: Response } | null)?.context;
      if (ctx) {
        const body = await ctx.json();
        if (body?.error) return String(body.error);
      }
    } catch { /* fall through to generic message */ }
    return "Unable to open runsheet";
  }

  if (pdfWindow) {
    pdfWindow.opener = null;
    pdfWindow.location.replace(String(data.url));
  } else {
    // Fallback for browsers configured to block all new tabs.
    window.location.assign(String(data.url));
  }
  return null;
}
