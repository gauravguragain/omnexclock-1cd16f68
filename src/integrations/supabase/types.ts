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
      clock_events: {
        Row: {
          created_at: string
          device_info: Json | null
          employee_id: string
          event_type: Database["public"]["Enums"]["clock_event_type"]
          geolocation: Json | null
          id: string
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
        ]
      }
      employees: {
        Row: {
          active: boolean
          admin_hourly_rate: number
          business_id: string | null
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
          business_id?: string | null
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
          business_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "employees_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
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
            foreignKeyName: "forum_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "forum_posts"
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
            foreignKeyName: "notifications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
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
          business_id: string
          chairs_per_table: number | null
          cold_sparkles: boolean | null
          created_at: string | null
          date: string
          decor_access: boolean | null
          dry_ice: boolean | null
          event_space: string | null
          event_type: string | null
          id: string
          notes: string | null
          num_tables: number | null
          red_carpet: boolean | null
          tablecloth_color: string | null
          updated_at: string | null
        }
        Insert: {
          business_id: string
          chairs_per_table?: number | null
          cold_sparkles?: boolean | null
          created_at?: string | null
          date: string
          decor_access?: boolean | null
          dry_ice?: boolean | null
          event_space?: string | null
          event_type?: string | null
          id?: string
          notes?: string | null
          num_tables?: number | null
          red_carpet?: boolean | null
          tablecloth_color?: string | null
          updated_at?: string | null
        }
        Update: {
          business_id?: string
          chairs_per_table?: number | null
          cold_sparkles?: boolean | null
          created_at?: string | null
          date?: string
          decor_access?: boolean | null
          dry_ice?: boolean | null
          event_space?: string | null
          event_type?: string | null
          id?: string
          notes?: string | null
          num_tables?: number | null
          red_carpet?: boolean | null
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
          business_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
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
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_forum_comment:
        | {
            Args: { _content: string; _employee_code: string; _post_id: string }
            Returns: boolean
          }
        | {
            Args: {
              _business_code?: string
              _content: string
              _employee_code: string
              _post_id: string
            }
            Returns: boolean
          }
      delete_employee_request:
        | {
            Args: { _employee_code: string; _request_id: string }
            Returns: boolean
          }
        | {
            Args: {
              _business_code?: string
              _employee_code: string
              _request_id: string
            }
            Returns: boolean
          }
      get_employee_business_id: {
        Args: { _employee_id: string }
        Returns: string
      }
      get_employee_clock_history:
        | {
            Args: { _employee_code: string }
            Returns: {
              event_timestamp: string
              event_type: string
              id: string
              photo_url: string
            }[]
          }
        | {
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
          chairs_per_table: number
          cold_sparkles: boolean
          date: string
          decor_access: boolean
          dry_ice: boolean
          event_space: string
          event_type: string
          id: string
          notes: string
          num_tables: number
          red_carpet: boolean
          tablecloth_color: string
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
      get_employee_requests:
        | {
            Args: { _employee_code: string }
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
        | {
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
      get_employee_shifts:
        | {
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
        | {
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
      get_employee_status:
        | {
            Args: { _employee_code: string }
            Returns: {
              current_status: string
              employee_id: string
              employee_name: string
              last_event_time: string
            }[]
          }
        | {
            Args: { _business_code?: string; _employee_code: string }
            Returns: {
              current_status: string
              employee_id: string
              employee_name: string
              last_event_time: string
            }[]
          }
      get_employee_timesheet_approvals:
        | {
            Args: { _employee_code: string }
            Returns: {
              approval_date: string
              is_approved: boolean
            }[]
          }
        | {
            Args: { _business_code?: string; _employee_code: string }
            Returns: {
              approval_date: string
              is_approved: boolean
            }[]
          }
      get_employee_timesheet_history:
        | {
            Args: { _date: string; _employee_code: string }
            Returns: {
              log_action: string
              log_details: Json
              log_timestamp: string
            }[]
          }
        | {
            Args: {
              _business_code?: string
              _date: string
              _employee_code: string
            }
            Returns: {
              log_action: string
              log_details: Json
              log_timestamp: string
            }[]
          }
      get_employee_timesheets:
        | {
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
        | {
            Args: { _business_code?: string; _employee_code: string }
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
      get_forum_comments:
        | {
            Args: { _employee_code: string; _post_id: string }
            Returns: {
              content: string
              created_at: string
              employee_name: string
              id: string
            }[]
          }
        | {
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
      get_forum_posts:
        | {
            Args: { _employee_code: string }
            Returns: {
              comment_count: number
              content: string
              created_at: string
              id: string
              reaction_counts: Json
              title: string
            }[]
          }
        | {
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
      get_my_reactions:
        | {
            Args: { _employee_code: string; _post_id: string }
            Returns: {
              reaction: string
            }[]
          }
        | {
            Args: {
              _business_code?: string
              _employee_code: string
              _post_id: string
            }
            Returns: {
              reaction: string
            }[]
          }
      has_business_access: { Args: { _business_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_of_business: { Args: { _business_id: string }; Returns: boolean }
      is_approved: { Args: { _user_id: string }; Returns: boolean }
      is_master: { Args: never; Returns: boolean }
      is_viewer_of_business: {
        Args: { _business_id: string }
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
      register_business: {
        Args: { _business_code: string; _business_name: string }
        Returns: string
      }
      submit_employee_request:
        | {
            Args: {
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
        | {
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
      toggle_forum_reaction:
        | {
            Args: {
              _employee_code: string
              _post_id: string
              _reaction: string
            }
            Returns: boolean
          }
        | {
            Args: {
              _business_code?: string
              _employee_code: string
              _post_id: string
              _reaction: string
            }
            Returns: boolean
          }
      update_employee_request:
        | {
            Args: {
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
        | {
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
    }
    Enums: {
      app_role: "admin" | "user" | "viewer" | "master"
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
      app_role: ["admin", "user", "viewer", "master"],
      clock_event_type: ["clock_in", "clock_out", "break_start", "break_end"],
    },
  },
} as const
