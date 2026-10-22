/** Operational fields only: omit signatures, bearer links, financials and client terms. */
export function rosterForecastContext(sheet: any, selection: any, items: any[]) {
  return {
    setup_items: sheet?.setup_items || [],
    setup_notes: sheet?.setup_notes || null,
    kitchen_notes: sheet?.ops_notes || null,
    foh_notes: sheet?.foh_notes || null,
    special_requests: sheet?.special_requests || null,
    service_schedule: sheet?.service_schedule || [],
    service_schedule_foh: sheet?.service_schedule_foh || [],
    dietary_requirements: selection?.dietary_requirements || null,
    allergies: selection?.allergies || null,
    menu: items.map(i => ({ course: i.course, dish: i.item_name, notes: i.notes,
      quantity: i.quantity, protein: i.selected_protein,
      service_start_time: i.service_start_time, service_end_time: i.service_end_time })),
  };
}