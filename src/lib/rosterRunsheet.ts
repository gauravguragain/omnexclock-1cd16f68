export function isEmailedRunsheet(sheet: { emailed_at?: string | null; emailed_to?: string[] | null }) {
  return Boolean(sheet.emailed_at || sheet.emailed_to?.length);
}

export function isLinkedRunsheet(event: { crm_runsheet_id?: string | null }) {
  return Boolean(event.crm_runsheet_id);
}

export function estimateRosterTables(adults: number, kids: number, chairs = 8) {
  return Math.ceil(Math.max(0, adults + kids) / (chairs > 0 ? chairs : 8));
}

export { rosterForecastContext } from "../../supabase/functions/_shared/rosterForecastContext";