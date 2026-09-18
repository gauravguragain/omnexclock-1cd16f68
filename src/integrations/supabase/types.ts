export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_invitations: {
        Row: {
          business_id: string
          created_at: string
          departments: string[] | null
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
          token: string
        }
        Insert: {
          business_id: string
          created_at?: string
          departments?: string[] | null
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role: Database["public"]["Enums"]["app_role"]
          status?: string
          token: string
        }
        Update: {
          business_id?: string
          created_at?: string
          departments?: string[] | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_invitations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_invitations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          business_id: string | null
          details: Json | null
          id: string
          timestamp: string
          user_id: string | null
        }
        Insert: {
          action: string
          business_id?: string | null
          details?: Json | null
          id?: string
          timestamp?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          business_id?: string | null
          details?: Json | null
          id?: string
          timestamp?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
        ]
      }
      bar_inventory_items: {
        Row: {
          business_id: string
          category: string | null
          created_at: string
          current_count: number
          id: string
          min_count: number
          name: string
          notes: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          category?: string | null
          created_at?: string
          current_count?: number
          id?: string
          min_count?: number
          name: string
          notes?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          category?: string | null
          created_at?: string
          current_count?: number
          id?: string
          min_count?: number
          name?: string
          notes?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bar_inventory_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_inventory_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
        ]
      }
      bar_inventory_orders: {
        Row: {
          business_id: string
          created_at: string
          id: string
          item_id: string
          notes: string | null
          quantity: number
          requested_by: string
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          item_id: string
          notes?: string | null
          quantity?: number
          requested_by: string
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          item_id?: string
          notes?: string | null
          quantity?: number
          requested_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bar_inventory_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_inventory_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_inventory_orders_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "bar_inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      business_notes: {
        Row: {
          author_id: string
          business_id: string
          content: string
          created_at: string
          id: string
        }
        Insert: {
          author_id: string
          business_id: string
          content: string
          created_at?: string
          id?: string
        }
        Update: {
          author_id?: string
          business_id?: string
          content?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_notes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_notes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          address: string | null
          business_code: string
          created_at: string | null
          description: string | null
          email: string | null
          id: string
          industry: string | null
          logo_url: string | null
          name: string
          owner_id: string
          phone: string | null
          status: string
          theme: Json | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          business_code: string
          created_at?: string | null
          description?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name: string
          owner_id: string
          phone?: string | null
          status?: string
          theme?: Json | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          business_code?: string
          created_at?: string | null
          description?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name?: string
          owner_id?: string
          phone?: string | null
          status?: string
          theme?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      catering_deliveries: {
        Row: {
          business_id: string
          contact_number: string | null
          contact_person: string
          cost_excl_gst: number
          cost_incl_gst: number
          created_at: string
          delivery_address: string
          delivery_date: string
          delivery_time: string | null
          driver_id: string | null
          id: string
          notes: string | null
          number_of_guests: number
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          contact_number?: string | null
          contact_person: string
          cost_excl_gst?: number
          cost_incl_gst?: number
          created_at?: string
          delivery_address: string
          delivery_date: string
          delivery_time?: string | null
          driver_id?: string | null
          id?: string
          notes?: string | null
          number_of_guests?: number
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          contact_number?: string | null
          contact_person?: string
          cost_excl_gst?: number
          cost_incl_gst?: number
          created_at?: string
          delivery_address?: string
          delivery_date?: string
          delivery_time?: string | null
          driver_id?: string | null
          id?: string
          notes?: string | null
          number_of_guests?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catering_deliveries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catering_deliveries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catering_deliveries_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catering_deliveries_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "employees_public"
            referencedColumns: ["id"]
          },
        ]
      }
      catering_delivery_status_logs: {
        Row: {
          created_at: string
          delivery_id: string
          id: string
          notes: string | null
          status: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          delivery_id: string
          id?: string
          notes?: string | null
          status: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          delivery_id?: string
          id?: string
          notes?: string | null
          status?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catering_delivery_status_logs_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "catering_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catering_delivery_status_logs_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catering_delivery_status_logs_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "employees_public"
            referencedColumns: ["id"]
          },
        ]
      }
      clock_events: {
        Row: {
          created_at: string
          device_info: Json | null
          employee_id: string
          event_type: Database["public"]["Enums"]["clock_event_type"]
          geolocation: Json | null
          id: string
          notes: string | null
          photo_url: string | null
          timestamp: string
        }
        Insert: {
          created_at?: string
          device_info?: Json | null
          employee_id: string
          event_type: Database["public"]["Enums"]["clock_event_type"]
          geolocation?: Json | null
          id?: string
          notes?: string | null
          photo_url?: string | null
          timestamp?: string
        }
        Update: {
          created_at?: string
          device_info?: Json | null
          employee_id?: string
          event_type?: Database["public"]["Enums"]["clock_event_type"]
          geolocation?: Json | null
          id?: string
          notes?: string | null
          photo_url?: string | null
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "clock_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clock_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_public"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_bookings: {
        Row: {
          balance_due_date: string | null
          business_id: string
          confirmation_sent_at: string | null
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          deposit_amount: number
          deposit_due_date: string | null
          deposit_paid: boolean
          duration_minutes: number
          event_date: string
          guest_count: number
          id: string
          lead_id: string
          menu_selection_id: string | null
          roster_event_id: string | null
          start_time: string
          status: string
          total_amount: number
          updated_at: string
          updated_by: string | null
          venue_space: string
        }
        Insert: {
          balance_due_date?: string | null
          business_id: string
          confirmation_sent_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          deposit_amount?: number
          deposit_due_date?: string | null
          deposit_paid?: boolean
          duration_minutes: number
          event_date: string
          guest_count: number
          id?: string
          lead_id: string
          menu_selection_id?: string | null
          roster_event_id?: string | null
          start_time: string
          status?: string
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
          venue_space: string
        }
        Update: {
          balance_due_date?: string | null
          business_id?: string
          confirmation_sent_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          deposit_amount?: number
          deposit_due_date?: string | null
          deposit_paid?: boolean
          duration_minutes?: number
          event_date?: string
          guest_count?: number
          id?: string
          lead_id?: string
          menu_selection_id?: string | null
          roster_event_id?: string | null
          start_time?: string
          status?: string
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
          venue_space?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_bookings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_bookings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_bookings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_bookings_menu_selection_id_fkey"
            columns: ["menu_selection_id"]
            isOneToOne: false
            referencedRelation: "crm_menu_selections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_bookings_roster_event_id_fkey"
            columns: ["roster_event_id"]
            isOneToOne: false
            referencedRelation: "roster_day_events"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_calendly_connections: {
        Row: {
          business_id: string
          calendly_organization_uri: string | null
          calendly_user_uri: string | null
          connected_by: string
          created_at: string
          enabled: boolean
          id: string
          last_error: string | null
          last_sync_at: string | null
          status: string
          updated_at: string
          webhook_subscription_uri: string | null
        }
        Insert: {
          business_id: string
          calendly_organization_uri?: string | null
          calendly_user_uri?: string | null
          connected_by: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          status?: string
          updated_at?: string
          webhook_subscription_uri?: string | null
        }
        Update: {
          business_id?: string
          calendly_organization_uri?: string | null
          calendly_user_uri?: string | null
          connected_by?: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          status?: string
          updated_at?: string
          webhook_subscription_uri?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_calendly_connections_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_calendly_connections_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_calendly_mappings: {
        Row: {
          active: boolean
          business_id: string
          calendly_event_type_name: string
          calendly_event_type_uri: string
          created_at: string
          crm_event_type: string | null
          id: string
          updated_at: string
          venue_space: string | null
        }
        Insert: {
          active?: boolean
          business_id: string
          calendly_event_type_name: string
          calendly_event_type_uri: string
          created_at?: string
          crm_event_type?: string | null
          id?: string
          updated_at?: string
          venue_space?: string | null
        }
        Update: {
          active?: boolean
          business_id?: string
          calendly_event_type_name?: string
          calendly_event_type_uri?: string
          created_at?: string
          crm_event_type?: string | null
          id?: string
          updated_at?: string
          venue_space?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_calendly_mappings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_calendly_mappings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_confirmation_tokens: {
        Row: {
          booking_id: string
          business_id: string
          created_at: string
          expires_at: string
          id: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          booking_id: string
          business_id: string
          created_at?: string
          expires_at: string
          id?: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          booking_id?: string
          business_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_confirmation_tokens_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "crm_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_confirmation_tokens_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_confirmation_tokens_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_inspections: {
        Row: {
          assigned_to: string | null
          business_id: string
          calendly_event_uri: string | null
          calendly_invitee_uri: string | null
          calendly_source: boolean
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          lead_id: string
          post_notes: string | null
          pre_notes: string | null
          proposed_at: string | null
          reminder_hours: number[]
          starts_at: string | null
          status: string
          superseded_by: string | null
          updated_at: string
          updated_by: string | null
          venue_space: string
        }
        Insert: {
          assigned_to?: string | null
          business_id: string
          calendly_event_uri?: string | null
          calendly_invitee_uri?: string | null
          calendly_source?: boolean
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          lead_id: string
          post_notes?: string | null
          pre_notes?: string | null
          proposed_at?: string | null
          reminder_hours?: number[]
          starts_at?: string | null
          status?: string
          superseded_by?: string | null
          updated_at?: string
          updated_by?: string | null
          venue_space: string
        }
        Update: {
          assigned_to?: string | null
          business_id?: string
          calendly_event_uri?: string | null
          calendly_invitee_uri?: string | null
          calendly_source?: boolean
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          lead_id?: string
          post_notes?: string | null
          pre_notes?: string | null
          proposed_at?: string | null
          reminder_hours?: number[]
          starts_at?: string | null
          status?: string
          superseded_by?: string | null
          updated_at?: string
          updated_by?: string | null
          venue_space?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_inspections_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_inspections_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_inspections_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_inspections_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "crm_inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_interactions: {
        Row: {
          ai_summary: Json | null
          business_id: string
          created_at: string
          duration_minutes: number | null
          follow_up_at: string | null
          follow_up_required: boolean
          id: string
          interaction_type: string
          lead_id: string
          logged_by: string | null
          notes: string
          occurred_at: string
          shareable_feedback: boolean
          updated_at: string
        }
        Insert: {
          ai_summary?: Json | null
          business_id: string
          created_at?: string
          duration_minutes?: number | null
          follow_up_at?: string | null
          follow_up_required?: boolean
          id?: string
          interaction_type: string
          lead_id: string
          logged_by?: string | null
          notes: string
          occurred_at?: string
          shareable_feedback?: boolean
          updated_at?: string
        }
        Update: {
          ai_summary?: Json | null
          business_id?: string
          created_at?: string
          duration_minutes?: number | null
          follow_up_at?: string | null
          follow_up_required?: boolean
          id?: string
          interaction_type?: string
          lead_id?: string
          logged_by?: string | null
          notes?: string
          occurred_at?: string
          shareable_feedback?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_interactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_interactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_interactions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_leads: {
        Row: {
          assigned_to: string | null
          budget_max: number | null
          budget_min: number | null
          business_id: string
          calendly_source: boolean
          company: string | null
          created_at: string
          created_by: string | null
          email: string | null
          estimated_guest_count: number | null
          estimated_value: number
          event_type: string
          flexible_date: boolean
          full_name: string
          id: string
          last_contact_at: string | null
          lost_reason: string | null
          normalized_email: string | null
          normalized_phone: string | null
          phone: string | null
          preferred_dates: string[]
          source: string
          status: string
          tags: string[]
          updated_at: string
          updated_by: string | null
          venue_space: string | null
        }
        Insert: {
          assigned_to?: string | null
          budget_max?: number | null
          budget_min?: number | null
          business_id: string
          calendly_source?: boolean
          company?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          estimated_guest_count?: number | null
          estimated_value?: number
          event_type: string
          flexible_date?: boolean
          full_name: string
          id?: string
          last_contact_at?: string | null
          lost_reason?: string | null
          normalized_email?: string | null
          normalized_phone?: string | null
          phone?: string | null
          preferred_dates?: string[]
          source: string
          status?: string
          tags?: string[]
          updated_at?: string
          updated_by?: string | null
          venue_space?: string | null
        }
        Update: {
          assigned_to?: string | null
          budget_max?: number | null
          budget_min?: number | null
          business_id?: string
          calendly_source?: boolean
          company?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          estimated_guest_count?: number | null
          estimated_value?: number
          event_type?: string
          flexible_date?: boolean
          full_name?: string
          id?: string
          last_contact_at?: string | null
          lost_reason?: string | null
          normalized_email?: string | null
          normalized_phone?: string | null
          phone?: string | null
          preferred_dates?: string[]
          source?: string
          status?: string
          tags?: string[]
          updated_at?: string
          updated_by?: string | null
          venue_space?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_leads_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_menu_items: {
        Row: {
          active: boolean
          business_id: string
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          dietary_tags: string[]
          flat_price: number | null
          id: string
          name: string
          price_per_head: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          business_id: string
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          dietary_tags?: string[]
          flat_price?: number | null
          id?: string
          name: string
          price_per_head?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          business_id?: string
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          dietary_tags?: string[]
          flat_price?: number | null
          id?: string
          name?: string
          price_per_head?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_menu_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_menu_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_menu_selection_items: {
        Row: {
          business_id: string
          course: string | null
          created_at: string
          flat_price: number | null
          id: string
          item_name: string
          menu_item_id: string | null
          notes: string | null
          price_per_head: number | null
          quantity: number
          selection_id: string
        }
        Insert: {
          business_id: string
          course?: string | null
          created_at?: string
          flat_price?: number | null
          id?: string
          item_name: string
          menu_item_id?: string | null
          notes?: string | null
          price_per_head?: number | null
          quantity?: number
          selection_id: string
        }
        Update: {
          business_id?: string
          course?: string | null
          created_at?: string
          flat_price?: number | null
          id?: string
          item_name?: string
          menu_item_id?: string | null
          notes?: string | null
          price_per_head?: number | null
          quantity?: number
          selection_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_menu_selection_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_menu_selection_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_menu_selection_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "crm_menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_menu_selection_items_selection_id_fkey"
            columns: ["selection_id"]
            isOneToOne: false
            referencedRelation: "crm_menu_selections"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_menu_selections: {
        Row: {
          allergies: string | null
          beverage_package: string | null
          business_id: string
          corkage_enabled: boolean
          corkage_flat: number | null
          corkage_per_head: number | null
          created_at: string
          created_by: string | null
          dietary_requirements: string | null
          guest_count: number
          id: string
          lead_id: string
          package_name: string | null
          package_price_per_head: number | null
          total_estimate: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allergies?: string | null
          beverage_package?: string | null
          business_id: string
          corkage_enabled?: boolean
          corkage_flat?: number | null
          corkage_per_head?: number | null
          created_at?: string
          created_by?: string | null
          dietary_requirements?: string | null
          guest_count?: number
          id?: string
          lead_id: string
          package_name?: string | null
          package_price_per_head?: number | null
          total_estimate?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allergies?: string | null
          beverage_package?: string | null
          business_id?: string
          corkage_enabled?: boolean
          corkage_flat?: number | null
          corkage_per_head?: number | null
          created_at?: string
          created_by?: string | null
          dietary_requirements?: string | null
          guest_count?: number
          id?: string
          lead_id?: string
          package_name?: string | null
          package_price_per_head?: number | null
          total_estimate?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_menu_selections_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_menu_selections_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_menu_selections_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_options: {
        Row: {
          active: boolean
          business_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          image_url: string | null
          label: string
          option_type: string
          sort_order: number
          updated_at: string
          value: string
        }
        Insert: {
          active?: boolean
          business_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          label: string
          option_type: string
          sort_order?: number
          updated_at?: string
          value: string
        }
        Update: {
          active?: boolean
          business_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          label?: string
          option_type?: string
          sort_order?: number
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_options_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_options_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_runsheets: {
        Row: {
          access_time: string | null
          adult_guests: number | null
          booking_id: string | null
          booking_reference: string | null
          business_id: string
          client_notes: string | null
          created_at: string
          created_by: string | null
          distributed_to: string | null
          event_coordinator: string | null
          event_order_number: string | null
          generated_at: string | null
          id: string
          kids_guests: number | null
          lead_id: string
          onsite_contact_name: string | null
          onsite_contact_phone: string | null
          ops_notes: string | null
          revision: number
          sales_person: string | null
          sent_at: string | null
          service_schedule: Json
          setup_items: string[]
          setup_notes: string | null
          special_requests: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          access_time?: string | null
          adult_guests?: number | null
          booking_id?: string | null
          booking_reference?: string | null
          business_id: string
          client_notes?: string | null
          created_at?: string
          created_by?: string | null
          distributed_to?: string | null
          event_coordinator?: string | null
          event_order_number?: string | null
          generated_at?: string | null
          id?: string
          kids_guests?: number | null
          lead_id: string
          onsite_contact_name?: string | null
          onsite_contact_phone?: string | null
          ops_notes?: string | null
          revision?: number
          sales_person?: string | null
          sent_at?: string | null
          service_schedule?: Json
          setup_items?: string[]
          setup_notes?: string | null
          special_requests?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          access_time?: string | null
          adult_guests?: number | null
          booking_id?: string | null
          booking_reference?: string | null
          business_id?: string
          client_notes?: string | null
          created_at?: string
          created_by?: string | null
          distributed_to?: string | null
          event_coordinator?: string | null
          event_order_number?: string | null
          generated_at?: string | null
          id?: string
          kids_guests?: number | null
          lead_id?: string
          onsite_contact_name?: string | null
          onsite_contact_phone?: string | null
          ops_notes?: string | null
          revision?: number
          sales_person?: string | null
          sent_at?: string | null
          service_schedule?: Json
          setup_items?: string[]
          setup_notes?: string | null
          special_requests?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_runsheets_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "crm_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_runsheets_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_runsheets_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_runsheets_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_settings: {
        Row: {
          assignment_mode: string
          business_id: string
          calendar_token: string | null
          calendly_enabled: boolean
          confirmation_terms: string | null
          created_at: string
          created_by: string | null
          fixed_assignee_id: string | null
          id: string
          inspection_day_end: string
          inspection_day_start: string
          reminder_hours: number[]
          stale_days: number
          updated_at: string
        }
        Insert: {
          assignment_mode?: string
          business_id: string
          calendar_token?: string | null
          calendly_enabled?: boolean
          confirmation_terms?: string | null
          created_at?: string
          created_by?: string | null
          fixed_assignee_id?: string | null
          id?: string
          inspection_day_end?: string
          inspection_day_start?: string
          reminder_hours?: number[]
          stale_days?: number
          updated_at?: string
        }
        Update: {
          assignment_mode?: string
          business_id?: string
          calendar_token?: string | null
          calendly_enabled?: boolean
          confirmation_terms?: string | null
          created_at?: string
          created_by?: string | null
          fixed_assignee_id?: string | null
          id?: string
          inspection_day_end?: string
          inspection_day_start?: string
          reminder_hours?: number[]
          stale_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_tasks: {
        Row: {
          assigned_to: string | null
          automated: boolean
          booking_id: string | null
          business_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string
          id: string
          lead_id: string | null
          priority: string
          status: string
          task_type: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          automated?: boolean
          booking_id?: string | null
          business_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at: string
          id?: string
          lead_id?: string | null
          priority?: string
          status?: string
          task_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          automated?: boolean
          booking_id?: string | null
          business_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string
          id?: string
          lead_id?: string | null
          priority?: string
          status?: string
          task_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_tasks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "crm_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_templates: {
        Row: {
          active: boolean
          body: string
          business_id: string
          channel: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          subject: string | null
          template_type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          body: string
          business_id: string
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          subject?: string | null
          template_type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          body?: string
          business_id?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          subject?: string | null
          template_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_templates_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_templates_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_timeline_events: {
        Row: {
          actor_id: string | null
          business_id: string
          created_at: string
          details: Json
          event_type: string
          id: string
          lead_id: string
          title: string
        }
        Insert: {
          actor_id?: string | null
          business_id: string
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          lead_id: string
          title: string
        }
        Update: {
          actor_id?: string | null
          business_id?: string
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          lead_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_timeline_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_timeline_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_timeline_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_webhook_receipts: {
        Row: {
          business_id: string | null
          error: string | null
          event_type: string
          external_id: string
          id: string
          payload: Json
          processed_at: string | null
          provider: string
          received_at: string
        }
        Insert: {
          business_id?: string | null
          error?: string | null
          event_type: string
          external_id: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider: string
          received_at?: string
        }
        Update: {
          business_id?: string | null
          error?: string | null
          event_type?: string
          external_id?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_webhook_receipts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_webhook_receipts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_documents: {
        Row: {
          admin_note: string | null
          business_id: string
          category: string
          created_at: string
          custom_label: string | null
          employee_id: string
          expiry_date: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          status: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          admin_note?: string | null
          business_id: string
          category: string
          created_at?: string
          custom_label?: string | null
          employee_id: string
          expiry_date?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          status?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          admin_note?: string | null
          business_id?: string
          category?: string
          created_at?: string
          custom_label?: string | null
          employee_id?: string
          expiry_date?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          status?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_public"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_requests: {
        Row: {
          admin_note: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          employee_id: string
          end_date: string | null
          end_time: string | null
          id: string
          is_recurring: boolean
          reason: string | null
          recurring_days: string[] | null
          recurring_end_date: string | null
          recurring_start_date: string | null
          request_type: string
          start_date: string | null
          start_time: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          employee_id: string
          end_date?: string | null
          end_time?: string | null
          id?: string
          is_recurring?: boolean
          reason?: string | null
          recurring_days?: string[] | null
          recurring_end_date?: string | null
          recurring_start_date?: string | null
          request_type?: string
          start_date?: string | null
          start_time?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          employee_id?: string
          end_date?: string | null
          end_time?: string | null
          id?: string
          is_recurring?: boolean
          reason?: string | null
          recurring_days?: string[] | null
          recurring_end_date?: string | null
          recurring_start_date?: string | null
          request_type?: string
          start_date?: string | null
          start_time?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_public"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          abn: string | null
          account_name: string | null
          account_number: string | null
          active: boolean
          admin_hourly_rate: number
          bsb: string | null
          business_id: string | null
          created_at: string
          department: string | null
          email: string | null
          employee_code: string
          id: string
          job_title: string | null
          name: string
          pay_id: string | null
          pay_rate: number
          phone: string | null
          updated_at: string
        }
        Insert: {
          abn?: string | null
          account_name?: string | null
          account_number?: string | null
          active?: boolean
          admin_hourly_rate?: number
          bsb?: string | null
          business_id?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          employee_code: string
          id?: string
          job_title?: string | null
          name: string
          pay_id?: string | null
          pay_rate?: number
          phone?: string | null
          updated_at?: string
        }
        Update: {
          abn?: string | null
          account_name?: string | null
          account_number?: string | null
          active?: boolean
          admin_hourly_rate?: number
          bsb?: string | null
          business_id?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          employee_code?: string
          id?: string
          job_title?: string | null
          name?: string
          pay_id?: string | null
          pay_rate?: number
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
        ]
      }
      event_setup_config: {
        Row: {
          active: boolean | null
          business_id: string
          config_type: string
          created_at: string | null
          id: string
          label: string
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          business_id: string
          config_type: string
          created_at?: string | null
          id?: string
          label: string
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          business_id?: string
          config_type?: string
          created_at?: string | null
          id?: string
          label?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_setup_config_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_setup_config_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_comments: {
        Row: {
          content: string
          created_at: string
          employee_id: string
          id: string
          post_id: string
        }
        Insert: {
          content: string
          created_at?: string
          employee_id: string
          id?: string
          post_id: string
        }
        Update: {
          content?: string
          created_at?: string
          employee_id?: string
          id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_comments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_comments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "forum_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_posts: {
        Row: {
          author_id: string | null
          business_id: string | null
          content: string
          created_at: string
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          business_id?: string | null
          content: string
          created_at?: string
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          business_id?: string | null
          content?: string
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_posts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_posts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_reactions: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          post_id: string
          reaction: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          post_id: string
          reaction: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          post_id?: string
          reaction?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_reactions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_reactions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "forum_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          business_id: string
          category: string | null
          created_at: string
          current_count: number
          id: string
          min_count: number
          name: string
          notes: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          category?: string | null
          created_at?: string
          current_count?: number
          id?: string
          min_count?: number
          name: string
          notes?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          category?: string | null
          created_at?: string
          current_count?: number
          id?: string
          min_count?: number
          name?: string
          notes?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_orders: {
        Row: {
          business_id: string
          created_at: string
          id: string
          item_id: string
          notes: string | null
          quantity: number
          requested_by: string
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          item_id: string
          notes?: string | null
          quantity?: number
          requested_by: string
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          item_id?: string
          notes?: string | null
          quantity?: number
          requested_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_orders_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          account_name: string | null
          account_number: string | null
          amount: number
          bsb: string | null
          business_id: string
          created_at: string
          created_by: string | null
          due_date: string
          employee_abn: string | null
          employee_id: string
          employee_name: string
          hourly_rate: number
          id: string
          invoice_code: string
          invoice_number: number
          issue_date: string
          net_hours: number
          updated_at: string
          week_end: string
          week_start: string
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          amount?: number
          bsb?: string | null
          business_id: string
          created_at?: string
          created_by?: string | null
          due_date: string
          employee_abn?: string | null
          employee_id: string
          employee_name: string
          hourly_rate?: number
          id?: string
          invoice_code: string
          invoice_number: number
          issue_date: string
          net_hours?: number
          updated_at?: string
          week_end: string
          week_start: string
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          amount?: number
          bsb?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          due_date?: string
          employee_abn?: string | null
          employee_id?: string
          employee_name?: string
          hourly_rate?: number
          id?: string
          invoice_code?: string
          invoice_number?: number
          issue_date?: string
          net_hours?: number
          updated_at?: string
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_public"
            referencedColumns: ["id"]
          },
        ]
      }
      master_audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          business_id: string
          created_at: string
          employee_id: string | null
          id: string
          message: string
          metadata: Json | null
          read: boolean
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          employee_id?: string | null
          id?: string
          message: string
          metadata?: Json | null
          read?: boolean
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          employee_id?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_public"
            referencedColumns: ["id"]
          },
        ]
      }
      password_reset_otps: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          otp_code: string
          used: boolean
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          otp_code: string
          used?: boolean
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          otp_code?: string
          used?: boolean
        }
        Relationships: []
      }
      payroll_entries: {
        Row: {
          admin_pay: number
          created_at: string
          employee_hours: number
          employee_id: string
          employee_pay: number
          id: string
          paid_at: string | null
          period: string
          status: string
          timesheet_approval_id: string | null
          updated_at: string
        }
        Insert: {
          admin_pay?: number
          created_at?: string
          employee_hours?: number
          employee_id: string
          employee_pay?: number
          id?: string
          paid_at?: string | null
          period: string
          status?: string
          timesheet_approval_id?: string | null
          updated_at?: string
        }
        Update: {
          admin_pay?: number
          created_at?: string
          employee_hours?: number
          employee_id?: string
          employee_pay?: number
          id?: string
          paid_at?: string | null
          period?: string
          status?: string
          timesheet_approval_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_timesheet_approval_id_fkey"
            columns: ["timesheet_approval_id"]
            isOneToOne: false
            referencedRelation: "timesheet_approvals"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approved: boolean
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          approved?: boolean
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          approved?: boolean
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      roster_day_events: {
        Row: {
          adult_guests: number | null
          banquet_tier: string | null
          bev_package: string | null
          business_id: string
          chairs_per_table: number | null
          cold_sparkles: boolean | null
          created_at: string | null
          date: string
          decor_access: boolean | null
          dry_ice: boolean | null
          event_space: string | null
          event_time: string | null
          event_type: string | null
          host_contact_number: string | null
          host_name: string | null
          id: string
          kids_guests: number | null
          live_stall: boolean | null
          live_stall_details: string | null
          notes: string | null
          num_tables: number | null
          red_carpet: boolean | null
          runsheet_url: string | null
          smoke_machine: boolean | null
          tablecloth_color: string | null
          updated_at: string | null
        }
        Insert: {
          adult_guests?: number | null
          banquet_tier?: string | null
          bev_package?: string | null
          business_id: string
          chairs_per_table?: number | null
          cold_sparkles?: boolean | null
          created_at?: string | null
          date: string
          decor_access?: boolean | null
          dry_ice?: boolean | null
          event_space?: string | null
          event_time?: string | null
          event_type?: string | null
          host_contact_number?: string | null
          host_name?: string | null
          id?: string
          kids_guests?: number | null
          live_stall?: boolean | null
          live_stall_details?: string | null
          notes?: string | null
          num_tables?: number | null
          red_carpet?: boolean | null
          runsheet_url?: string | null
          smoke_machine?: boolean | null
          tablecloth_color?: string | null
          updated_at?: string | null
        }
        Update: {
          adult_guests?: number | null
          banquet_tier?: string | null
          bev_package?: string | null
          business_id?: string
          chairs_per_table?: number | null
          cold_sparkles?: boolean | null
          created_at?: string | null
          date?: string
          decor_access?: boolean | null
          dry_ice?: boolean | null
          event_space?: string | null
          event_time?: string | null
          event_type?: string | null
          host_contact_number?: string | null
          host_name?: string | null
          id?: string
          kids_guests?: number | null
          live_stall?: boolean | null
          live_stall_details?: string | null
          notes?: string | null
          num_tables?: number | null
          red_carpet?: boolean | null
          runsheet_url?: string | null
          smoke_machine?: boolean | null
          tablecloth_color?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roster_day_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_day_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
        ]
      }
      service_maintenance_tasks: {
        Row: {
          active: boolean
          business_id: string
          created_at: string
          description: string | null
          frequency_days: number
          id: string
          last_service_date: string | null
          name: string
          next_service_date: string | null
          reminder_email: string | null
          reminder_sent: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          business_id: string
          created_at?: string
          description?: string | null
          frequency_days?: number
          id?: string
          last_service_date?: string | null
          name: string
          next_service_date?: string | null
          reminder_email?: string | null
          reminder_sent?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          business_id?: string
          created_at?: string
          description?: string | null
          frequency_days?: number
          id?: string
          last_service_date?: string | null
          name?: string
          next_service_date?: string | null
          reminder_email?: string | null
          reminder_sent?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_maintenance_tasks_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_maintenance_tasks_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          break_minutes: number
          created_at: string
          date: string
          day_of_week: string
          employee_id: string
          end_time: string
          hours_worked: number | null
          id: string
          notes: string | null
          source: string
          start_time: string
          status: string
          updated_at: string
          week_start_date: string
        }
        Insert: {
          break_minutes?: number
          created_at?: string
          date: string
          day_of_week: string
          employee_id: string
          end_time: string
          hours_worked?: number | null
          id?: string
          notes?: string | null
          source?: string
          start_time: string
          status?: string
          updated_at?: string
          week_start_date: string
        }
        Update: {
          break_minutes?: number
          created_at?: string
          date?: string
          day_of_week?: string
          employee_id?: string
          end_time?: string
          hours_worked?: number | null
          id?: string
          notes?: string | null
          source?: string
          start_time?: string
          status?: string
          updated_at?: string
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_public"
            referencedColumns: ["id"]
          },
        ]
      }
      timesheet_approvals: {
        Row: {
          approved: boolean
          approved_at: string | null
          approved_by: string | null
          created_at: string
          date: string
          employee_id: string
          id: string
          updated_at: string
        }
        Insert: {
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          date: string
          employee_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          date?: string
          employee_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "timesheet_approvals_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheet_approvals_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          business_id: string | null
          created_at: string
          departments: string[] | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          departments?: string[] | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
          departments?: string[] | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      businesses_public: {
        Row: {
          business_code: string | null
          id: string | null
          logo_url: string | null
          name: string | null
          status: string | null
          theme: Json | null
        }
        Insert: {
          business_code?: string | null
          id?: string | null
          logo_url?: string | null
          name?: string | null
          status?: string | null
          theme?: Json | null
        }
        Update: {
          business_code?: string | null
          id?: string | null
          logo_url?: string | null
          name?: string | null
          status?: string | null
          theme?: Json | null
        }
        Relationships: []
      }
      employees_public: {
        Row: {
          active: boolean | null
          business_id: string | null
          department: string | null
          employee_code: string | null
          id: string | null
          job_title: string | null
          name: string | null
        }
        Insert: {
          active?: boolean | null
          business_id?: string | null
          department?: string | null
          employee_code?: string | null
          id?: string | null
          job_title?: string | null
          name?: string | null
        }
        Update: {
          active?: boolean | null
          business_id?: string | null
          department?: string | null
          employee_code?: string | null
          id?: string | null
          job_title?: string | null
          name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_invitation: { Args: { _token: string }; Returns: boolean }
      accept_pending_invitations_for_user: { Args: never; Returns: number }
      add_forum_comment: {
        Args: {
          _business_code?: string
          _content: string
          _employee_code: string
          _post_id: string
        }
        Returns: boolean
      }
      admin_set_document_status: {
        Args: { _doc_id: string; _note: string; _status: string }
        Returns: boolean
      }
      can_access_crm: { Args: { _business_id: string }; Returns: boolean }
      delete_employee: { Args: { _employee_id: string }; Returns: boolean }
      delete_employee_request: {
        Args: {
          _business_code?: string
          _employee_code: string
          _request_id: string
        }
        Returns: boolean
      }
      delete_my_employee_document: {
        Args: {
          _business_code: string
          _doc_id: string
          _employee_code: string
        }
        Returns: string
      }
      get_employee_business_id: {
        Args: { _employee_id: string }
        Returns: string
      }
      get_employee_clock_history: {
        Args: { _business_code?: string; _employee_code: string }
        Returns: {
          event_timestamp: string
          event_type: string
          id: string
          photo_url: string
        }[]
      }
      get_employee_day_events: {
        Args: { _business_code?: string; _employee_code: string }
        Returns: {
          adult_guests: number
          banquet_tier: string
          bev_package: string
          chairs_per_table: number
          cold_sparkles: boolean
          date: string
          decor_access: boolean
          dry_ice: boolean
          event_space: string
          event_time: string
          event_type: string
          host_contact_number: string
          host_name: string
          id: string
          kids_guests: number
          live_stall: boolean
          live_stall_details: string
          notes: string
          num_tables: number
          red_carpet: boolean
          runsheet_url: string
          smoke_machine: boolean
          tablecloth_color: string
        }[]
      }
      get_employee_deliveries: {
        Args: { _business_code?: string; _employee_code: string }
        Returns: {
          contact_number: string
          contact_person: string
          cost_excl_gst: number
          cost_incl_gst: number
          delivery_address: string
          delivery_created_at: string
          delivery_date: string
          delivery_id: string
          delivery_notes: string
          delivery_status: string
          delivery_time: string
          number_of_guests: number
        }[]
      }
      get_employee_invoices: {
        Args: { _business_code: string; _employee_code: string }
        Returns: {
          account_name: string
          account_number: string
          amount: number
          bsb: string
          business_code: string
          business_name: string
          created_at: string
          due_date: string
          employee_abn: string
          employee_name: string
          hourly_rate: number
          id: string
          invoice_code: string
          invoice_number: number
          issue_date: string
          net_hours: number
          week_end: string
          week_start: string
        }[]
      }
      get_employee_notifications: {
        Args: { _business_code?: string; _employee_code: string }
        Returns: {
          created_at: string
          id: string
          message: string
          metadata: Json
          read: boolean
          title: string
          type: string
        }[]
      }
      get_employee_requests: {
        Args: { _business_code?: string; _employee_code: string }
        Returns: {
          admin_note: string
          created_at: string
          end_date: string
          end_time: string
          id: string
          is_recurring: boolean
          reason: string
          recurring_days: string[]
          recurring_end_date: string
          recurring_start_date: string
          request_type: string
          start_date: string
          start_time: string
          status: string
        }[]
      }
      get_employee_shifts: {
        Args: { _business_code?: string; _employee_code: string }
        Returns: {
          break_minutes: number
          date: string
          day_of_week: string
          end_time: string
          hours_worked: number
          id: string
          notes: string
          start_time: string
          week_start_date: string
        }[]
      }
      get_employee_status: {
        Args: { _business_code?: string; _employee_code: string }
        Returns: {
          current_status: string
          employee_id: string
          employee_name: string
          last_event_time: string
        }[]
      }
      get_employee_timesheet_approvals: {
        Args: { _business_code?: string; _employee_code: string }
        Returns: {
          approval_date: string
          is_approved: boolean
        }[]
      }
      get_employee_timesheet_history: {
        Args: { _business_code?: string; _date: string; _employee_code: string }
        Returns: {
          log_action: string
          log_details: Json
          log_timestamp: string
        }[]
      }
      get_employee_timesheets: {
        Args: { _business_code?: string; _employee_code: string }
        Returns: {
          break_end: string
          break_minutes: number
          break_start: string
          clock_in: string
          clock_out: string
          crossed_midnight: boolean
          net_hours: number
          total_hours: number
          work_date: string
        }[]
      }
      get_forum_comments: {
        Args: {
          _business_code?: string
          _employee_code: string
          _post_id: string
        }
        Returns: {
          content: string
          created_at: string
          employee_name: string
          id: string
        }[]
      }
      get_forum_posts: {
        Args: { _business_code?: string; _employee_code: string }
        Returns: {
          comment_count: number
          content: string
          created_at: string
          id: string
          reaction_counts: Json
          title: string
        }[]
      }
      get_my_employee_documents: {
        Args: { _business_code: string; _employee_code: string }
        Returns: {
          admin_note: string
          category: string
          created_at: string
          custom_label: string
          expiry_date: string
          file_name: string
          file_path: string
          file_size: number
          id: string
          mime_type: string
          status: string
          verified_at: string
        }[]
      }
      get_my_payment_details: {
        Args: { _business_code: string; _employee_code: string }
        Returns: {
          abn: string
          account_name: string
          account_number: string
          bsb: string
        }[]
      }
      get_my_reactions: {
        Args: {
          _business_code?: string
          _employee_code: string
          _post_id: string
        }
        Returns: {
          reaction: string
        }[]
      }
      get_roster_admin_departments: {
        Args: { _business_id: string }
        Returns: string[]
      }
      has_business_access: { Args: { _business_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      insert_my_employee_document: {
        Args: {
          _business_code: string
          _category: string
          _custom_label: string
          _employee_code: string
          _expiry_date: string
          _file_name: string
          _file_path: string
          _file_size: number
          _mime_type: string
        }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_of_business: { Args: { _business_id: string }; Returns: boolean }
      is_approved: { Args: { _user_id: string }; Returns: boolean }
      is_master: { Args: never; Returns: boolean }
      is_roster_admin_of_business: {
        Args: { _business_id: string }
        Returns: boolean
      }
      is_sales_marketing_manager_of_business: {
        Args: { _business_id: string }
        Returns: boolean
      }
      is_super_admin_of_business: {
        Args: { _business_id: string }
        Returns: boolean
      }
      is_viewer_of_business: {
        Args: { _business_id: string }
        Returns: boolean
      }
      log_audit_entry: {
        Args: { _action: string; _business_id: string; _details: Json }
        Returns: boolean
      }
      mark_all_employee_notifications_read: {
        Args: { _business_code?: string; _employee_code: string }
        Returns: boolean
      }
      mark_employee_notification_read: {
        Args: {
          _business_code?: string
          _employee_code: string
          _notification_id: string
        }
        Returns: boolean
      }
      next_employee_invoice_number: {
        Args: { _employee_id: string }
        Returns: number
      }
      register_business: {
        Args: { _business_code: string; _business_name: string }
        Returns: string
      }
      submit_employee_request: {
        Args: {
          _business_code?: string
          _employee_code: string
          _end_date?: string
          _end_time?: string
          _is_recurring?: boolean
          _reason?: string
          _recurring_days?: string[]
          _recurring_end_date?: string
          _recurring_start_date?: string
          _request_type: string
          _start_date?: string
          _start_time?: string
        }
        Returns: boolean
      }
      toggle_forum_reaction: {
        Args: {
          _business_code?: string
          _employee_code: string
          _post_id: string
          _reaction: string
        }
        Returns: boolean
      }
      update_delivery_status: {
        Args: {
          _business_code?: string
          _delivery_id: string
          _employee_code: string
          _notes?: string
          _status: string
        }
        Returns: boolean
      }
      update_employee_request: {
        Args: {
          _business_code?: string
          _employee_code: string
          _end_date?: string
          _end_time?: string
          _is_recurring?: boolean
          _reason?: string
          _recurring_days?: string[]
          _recurring_end_date?: string
          _recurring_start_date?: string
          _request_id: string
          _request_type: string
          _start_date?: string
          _start_time?: string
        }
        Returns: boolean
      }
      update_my_payment_details: {
        Args: {
          _abn: string
          _account_name: string
          _account_number: string
          _bsb: string
          _business_code: string
          _employee_code: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "user"
        | "viewer"
        | "master"
        | "roster_admin"
        | "super_admin"
        | "sales_marketing_manager"
      clock_event_type: "clock_in" | "clock_out" | "break_start" | "break_end"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "user",
        "viewer",
        "master",
        "roster_admin",
        "super_admin",
        "sales_marketing_manager",
      ],
      clock_event_type: ["clock_in", "clock_out", "break_start", "break_end"],
    },
  },
} as const
