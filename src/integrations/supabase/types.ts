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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          details: Json | null
          id: string
          timestamp: string
          user_id: string | null
        }
        Insert: {
          action: string
          details?: Json | null
          id?: string
          timestamp?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          details?: Json | null
          id?: string
          timestamp?: string
          user_id?: string | null
        }
        Relationships: []
      }
      clock_events: {
        Row: {
          created_at: string
          device_info: Json | null
          employee_id: string
          event_type: Database["public"]["Enums"]["clock_event_type"]
          id: string
          photo_url: string | null
          timestamp: string
        }
        Insert: {
          created_at?: string
          device_info?: Json | null
          employee_id: string
          event_type: Database["public"]["Enums"]["clock_event_type"]
          id?: string
          photo_url?: string | null
          timestamp?: string
        }
        Update: {
          created_at?: string
          device_info?: Json | null
          employee_id?: string
          event_type?: Database["public"]["Enums"]["clock_event_type"]
          id?: string
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
        ]
      }
      employees: {
        Row: {
          active: boolean
          admin_hourly_rate: number
          created_at: string
          department: string | null
          email: string | null
          employee_code: string
          id: string
          job_title: string | null
          name: string
          pay_rate: number
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          admin_hourly_rate?: number
          created_at?: string
          department?: string | null
          email?: string | null
          employee_code: string
          id?: string
          job_title?: string | null
          name: string
          pay_rate?: number
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          admin_hourly_rate?: number
          created_at?: string
          department?: string | null
          email?: string | null
          employee_code?: string
          id?: string
          job_title?: string | null
          name?: string
          pay_rate?: number
          phone?: string | null
          updated_at?: string
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
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_employee_clock_history: {
        Args: { _employee_code: string }
        Returns: {
          event_timestamp: string
          event_type: string
          id: string
          photo_url: string
        }[]
      }
      get_employee_shifts: {
        Args: { _employee_code: string }
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
        Args: { _employee_code: string }
        Returns: {
          current_status: string
          employee_id: string
          employee_name: string
          last_event_time: string
        }[]
      }
      get_employee_timesheets: {
        Args: { _employee_code: string }
        Returns: {
          break_end: string
          break_minutes: number
          break_start: string
          clock_in: string
          clock_out: string
          net_hours: number
          total_hours: number
          work_date: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_approved: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "user"],
      clock_event_type: ["clock_in", "clock_out", "break_start", "break_end"],
    },
  },
} as const
