import { prettyCrmValue } from "@/features/sales/types";

/** Standard event identifier used across the app: "Event type – Customer name". */
export function eventLabel(b: any, clientName?: string | null, leadType?: string | null): string {
  const kindFallback = b?.booking_kind === "catering" ? "Catering" : "";
  const rawType = b?.event_type || leadType || "";
  const type = rawType ? prettyCrmValue(String(rawType)) : kindFallback;
  const name = (clientName || b?.client_name || "").trim();
  if (type && name) return `${type} – ${name}`;
  return name || b?.event_name || type || "Event";
}
