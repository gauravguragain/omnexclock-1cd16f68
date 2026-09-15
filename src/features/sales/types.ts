export type CrmLead = {
  id: string; business_id: string; full_name: string; phone: string | null; email: string | null;
  company: string | null; source: string; event_type: string; preferred_dates: string[];
  flexible_date: boolean; estimated_guest_count: number | null; budget_min: number | null;
  budget_max: number | null; status: string; lost_reason: string | null; assigned_to: string | null;
  tags: string[]; venue_space: string | null; estimated_value: number; last_contact_at: string | null;
  calendly_source: boolean; created_at: string; updated_at: string;
};

export type CrmOption = {
  id: string; option_type: string; label: string; value: string; description: string | null;
  image_url: string | null; sort_order: number; active: boolean;
};

export type CrmInspection = {
  id: string; lead_id: string; proposed_at: string | null; starts_at: string | null; ends_at: string | null;
  status: string; assigned_to: string | null; venue_space: string; pre_notes: string | null;
  post_notes: string | null; calendly_source: boolean;
};

export type CrmTask = {
  id: string; lead_id: string | null; title: string; description: string | null; task_type: string;
  assigned_to: string | null; due_at: string; priority: string; status: string; automated: boolean;
};

export type CrmInteraction = {
  id: string; lead_id: string; interaction_type: string; occurred_at: string; duration_minutes: number | null;
  notes: string; follow_up_required: boolean; follow_up_at: string | null; shareable_feedback: boolean;
  ai_summary: Record<string, unknown> | null; logged_by: string | null;
};

export const CRM_STAGE_VALUES = ["new", "contacted", "inspection_booked", "inspected", "menu_selected", "invoice_sent", "deposit_received", "runsheet_sent", "full_payment_received"];

/** Cold leads are parked, not part of the forward pipeline. */
export const CRM_COLD_STATUS = "cold";
export const CRM_LEAD_STATUSES = [...CRM_STAGE_VALUES, CRM_COLD_STATUS];

export const prettyCrmValue = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
