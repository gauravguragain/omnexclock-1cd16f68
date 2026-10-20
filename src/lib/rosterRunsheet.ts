export function isEmailedRunsheet(sheet: { emailed_at?: string | null; emailed_to?: string[] | null }) {
  return Boolean(sheet.emailed_at || sheet.emailed_to?.length);
}

export function isLinkedRunsheet(event: { crm_runsheet_id?: string | null }) {
  return Boolean(event.crm_runsheet_id);
}