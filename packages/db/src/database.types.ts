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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["app_role"] | null
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          ip_address: unknown
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: never
          ip_address?: unknown
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
          ip_address?: unknown
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chargers: {
        Row: {
          created_at: string
          firmware_version: string | null
          id: string
          label: string
          last_heartbeat_at: string | null
          model: string | null
          ocpp_version: string
          power_kw: number
          provider_charger_id: string | null
          serial_number: string | null
          station_id: string
          status: Database["public"]["Enums"]["charger_status"]
          updated_at: string
          vendor: string | null
        }
        Insert: {
          created_at?: string
          firmware_version?: string | null
          id?: string
          label: string
          last_heartbeat_at?: string | null
          model?: string | null
          ocpp_version?: string
          power_kw: number
          provider_charger_id?: string | null
          serial_number?: string | null
          station_id: string
          status?: Database["public"]["Enums"]["charger_status"]
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          created_at?: string
          firmware_version?: string | null
          id?: string
          label?: string
          last_heartbeat_at?: string | null
          model?: string | null
          ocpp_version?: string
          power_kw?: number
          provider_charger_id?: string | null
          serial_number?: string | null
          station_id?: string
          status?: Database["public"]["Enums"]["charger_status"]
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chargers_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "connector_details"
            referencedColumns: ["station_id"]
          },
          {
            foreignKeyName: "chargers_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      connectors: {
        Row: {
          charger_id: string
          connector_number: number
          created_at: string
          current_type: Database["public"]["Enums"]["current_type"]
          id: string
          last_error_code: string | null
          power_kw: number
          provider_connector_id: string | null
          status: Database["public"]["Enums"]["connector_status"]
          status_changed_at: string
          type: Database["public"]["Enums"]["connector_type"]
          updated_at: string
        }
        Insert: {
          charger_id: string
          connector_number: number
          created_at?: string
          current_type: Database["public"]["Enums"]["current_type"]
          id?: string
          last_error_code?: string | null
          power_kw: number
          provider_connector_id?: string | null
          status?: Database["public"]["Enums"]["connector_status"]
          status_changed_at?: string
          type: Database["public"]["Enums"]["connector_type"]
          updated_at?: string
        }
        Update: {
          charger_id?: string
          connector_number?: number
          created_at?: string
          current_type?: Database["public"]["Enums"]["current_type"]
          id?: string
          last_error_code?: string | null
          power_kw?: number
          provider_connector_id?: string | null
          status?: Database["public"]["Enums"]["connector_status"]
          status_changed_at?: string
          type?: Database["public"]["Enums"]["connector_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connectors_charger_id_fkey"
            columns: ["charger_id"]
            isOneToOne: false
            referencedRelation: "chargers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connectors_charger_id_fkey"
            columns: ["charger_id"]
            isOneToOne: false
            referencedRelation: "connector_details"
            referencedColumns: ["charger_id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          amount_saved: number
          coupon_id: string
          created_at: string
          id: string
          session_id: string | null
          user_id: string
        }
        Insert: {
          amount_saved: number
          coupon_id: string
          created_at?: string
          id?: string
          session_id?: string | null
          user_id: string
        }
        Update: {
          amount_saved?: number
          coupon_id?: string
          created_at?: string
          id?: string
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          id: string
          is_active: boolean
          max_discount: number | null
          max_uses: number | null
          max_uses_per_user: number
          min_order: number
          station_id: string | null
          title: string
          updated_at: string
          used_count: number
          valid_from: string
          valid_to: string
          value: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          id?: string
          is_active?: boolean
          max_discount?: number | null
          max_uses?: number | null
          max_uses_per_user?: number
          min_order?: number
          station_id?: string | null
          title: string
          updated_at?: string
          used_count?: number
          valid_from?: string
          valid_to: string
          value: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_type?: Database["public"]["Enums"]["discount_type"]
          id?: string
          is_active?: boolean
          max_discount?: number | null
          max_uses?: number | null
          max_uses_per_user?: number
          min_order?: number
          station_id?: string | null
          title?: string
          updated_at?: string
          used_count?: number
          valid_from?: string
          valid_to?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "connector_details"
            referencedColumns: ["station_id"]
          },
          {
            foreignKeyName: "coupons_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_platform_stats: {
        Row: {
          active_users: number
          day: string
          energy_kwh: number
          new_users: number
          revenue: number
          sessions_count: number
          updated_at: string
          wallet_recharged: number
        }
        Insert: {
          active_users?: number
          day: string
          energy_kwh?: number
          new_users?: number
          revenue?: number
          sessions_count?: number
          updated_at?: string
          wallet_recharged?: number
        }
        Update: {
          active_users?: number
          day?: string
          energy_kwh?: number
          new_users?: number
          revenue?: number
          sessions_count?: number
          updated_at?: string
          wallet_recharged?: number
        }
        Relationships: []
      }
      daily_station_stats: {
        Row: {
          avg_duration_seconds: number
          day: string
          energy_kwh: number
          failed_count: number
          revenue: number
          sessions_count: number
          station_id: string
          unique_users: number
          updated_at: string
        }
        Insert: {
          avg_duration_seconds?: number
          day: string
          energy_kwh?: number
          failed_count?: number
          revenue?: number
          sessions_count?: number
          station_id: string
          unique_users?: number
          updated_at?: string
        }
        Update: {
          avg_duration_seconds?: number
          day?: string
          energy_kwh?: number
          failed_count?: number
          revenue?: number
          sessions_count?: number
          station_id?: string
          unique_users?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_station_stats_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "connector_details"
            referencedColumns: ["station_id"]
          },
          {
            foreignKeyName: "daily_station_stats_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          station_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          station_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          station_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "connector_details"
            referencedColumns: ["station_id"]
          },
          {
            foreignKeyName: "favorites_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          currency: string
          discount_amount: number
          energy_kwh: number
          id: string
          invoice_number: string
          issued_at: string
          line_items: Json
          pdf_path: string | null
          session_id: string
          station_id: string
          subtotal: number
          tax_amount: number
          total: number
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          discount_amount?: number
          energy_kwh: number
          id?: string
          invoice_number: string
          issued_at?: string
          line_items?: Json
          pdf_path?: string | null
          session_id: string
          station_id: string
          subtotal: number
          tax_amount: number
          total: number
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          discount_amount?: number
          energy_kwh?: number
          id?: string
          invoice_number?: string
          issued_at?: string
          line_items?: Json
          pdf_path?: string | null
          session_id?: string
          station_id?: string
          subtotal?: number
          tax_amount?: number
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "connector_details"
            referencedColumns: ["station_id"]
          },
          {
            foreignKeyName: "invoices_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meter_readings: {
        Row: {
          created_at: string
          current_a: number | null
          energy_kwh: number
          id: number
          power_kw: number | null
          recorded_at: string
          session_id: string
          soc_pct: number | null
          voltage: number | null
        }
        Insert: {
          created_at?: string
          current_a?: number | null
          energy_kwh: number
          id?: never
          power_kw?: number | null
          recorded_at: string
          session_id: string
          soc_pct?: number | null
          voltage?: number | null
        }
        Update: {
          created_at?: string
          current_a?: number | null
          energy_kwh?: number
          id?: never
          power_kw?: number | null
          recorded_at?: string
          session_id?: string
          soc_pct?: number | null
          voltage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meter_readings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          data: Json
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          captured_at: string | null
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          idempotency_key: string
          method: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_order_id: string
          provider_payment_id: string | null
          provider_refund_id: string | null
          purpose: Database["public"]["Enums"]["payment_purpose"]
          raw_payload: Json | null
          refunded_amount: number
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          captured_at?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          idempotency_key: string
          method?: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_order_id: string
          provider_payment_id?: string | null
          provider_refund_id?: string | null
          purpose?: Database["public"]["Enums"]["payment_purpose"]
          raw_payload?: Json | null
          refunded_amount?: number
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          captured_at?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          idempotency_key?: string
          method?: string | null
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_order_id?: string
          provider_payment_id?: string | null
          provider_refund_id?: string | null
          purpose?: Database["public"]["Enums"]["payment_purpose"]
          raw_payload?: Json | null
          refunded_amount?: number
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_provider: Database["public"]["Enums"]["auth_provider"]
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          last_seen_at: string | null
          locale: string
          phone: string | null
          referral_code: string
          referred_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          auth_provider?: Database["public"]["Enums"]["auth_provider"]
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          is_active?: boolean
          last_seen_at?: string | null
          locale?: string
          phone?: string | null
          referral_code: string
          referred_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          auth_provider?: Database["public"]["Enums"]["auth_provider"]
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          locale?: string
          phone?: string | null
          referral_code?: string
          referred_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          bucket: string
          count: number
          identifier: string
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          identifier: string
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          identifier?: string
          window_start?: string
        }
        Relationships: []
      }
      reservations: {
        Row: {
          cancelled_reason: string | null
          connector_id: string
          created_at: string
          expires_at: string
          fee: number
          id: string
          provider_reservation_ref: string | null
          starts_at: string
          status: Database["public"]["Enums"]["reservation_status"]
          updated_at: string
          user_id: string
          vehicle_id: string | null
        }
        Insert: {
          cancelled_reason?: string | null
          connector_id: string
          created_at?: string
          expires_at: string
          fee?: number
          id?: string
          provider_reservation_ref?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
          user_id: string
          vehicle_id?: string | null
        }
        Update: {
          cancelled_reason?: string | null
          connector_id?: string
          created_at?: string
          expires_at?: string
          fee?: number
          id?: string
          provider_reservation_ref?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
          user_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservations_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "connector_details"
            referencedColumns: ["connector_id"]
          },
          {
            foreignKeyName: "reservations_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "connectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          owner_reply: string | null
          rating: number
          replied_at: string | null
          session_id: string | null
          station_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          owner_reply?: string | null
          rating: number
          replied_at?: string | null
          session_id?: string | null
          station_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          owner_reply?: string | null
          rating?: number
          replied_at?: string | null
          session_id?: string | null
          station_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "connector_details"
            referencedColumns: ["station_id"]
          },
          {
            foreignKeyName: "reviews_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          connector_id: string
          coupon_id: string | null
          created_at: string
          discount_amount: number
          duration_seconds: number
          energy_cost: number
          energy_kwh: number
          failure_message: string | null
          id: string
          idempotency_key: string
          idle_cost: number
          idle_fee_per_min: number
          last_meter_at: string | null
          price_per_kwh: number
          provider_session_ref: string | null
          requested_at: string
          reservation_id: string | null
          session_fee: number
          soc_end_pct: number | null
          soc_start_pct: number | null
          started_at: string | null
          station_id: string
          status: Database["public"]["Enums"]["session_status"]
          stop_reason: Database["public"]["Enums"]["session_stop_reason"] | null
          stopped_at: string | null
          subtotal: number
          tariff_id: string | null
          tax_amount: number
          tax_pct: number
          total_cost: number
          updated_at: string
          user_id: string
          vehicle_id: string | null
        }
        Insert: {
          connector_id: string
          coupon_id?: string | null
          created_at?: string
          discount_amount?: number
          duration_seconds?: number
          energy_cost?: number
          energy_kwh?: number
          failure_message?: string | null
          id?: string
          idempotency_key: string
          idle_cost?: number
          idle_fee_per_min?: number
          last_meter_at?: string | null
          price_per_kwh?: number
          provider_session_ref?: string | null
          requested_at?: string
          reservation_id?: string | null
          session_fee?: number
          soc_end_pct?: number | null
          soc_start_pct?: number | null
          started_at?: string | null
          station_id: string
          status?: Database["public"]["Enums"]["session_status"]
          stop_reason?:
            | Database["public"]["Enums"]["session_stop_reason"]
            | null
          stopped_at?: string | null
          subtotal?: number
          tariff_id?: string | null
          tax_amount?: number
          tax_pct?: number
          total_cost?: number
          updated_at?: string
          user_id: string
          vehicle_id?: string | null
        }
        Update: {
          connector_id?: string
          coupon_id?: string | null
          created_at?: string
          discount_amount?: number
          duration_seconds?: number
          energy_cost?: number
          energy_kwh?: number
          failure_message?: string | null
          id?: string
          idempotency_key?: string
          idle_cost?: number
          idle_fee_per_min?: number
          last_meter_at?: string | null
          price_per_kwh?: number
          provider_session_ref?: string | null
          requested_at?: string
          reservation_id?: string | null
          session_fee?: number
          soc_end_pct?: number | null
          soc_start_pct?: number | null
          started_at?: string | null
          station_id?: string
          status?: Database["public"]["Enums"]["session_status"]
          stop_reason?:
            | Database["public"]["Enums"]["session_stop_reason"]
            | null
          stopped_at?: string | null
          subtotal?: number
          tariff_id?: string | null
          tax_amount?: number
          tax_pct?: number
          total_cost?: number
          updated_at?: string
          user_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "connector_details"
            referencedColumns: ["connector_id"]
          },
          {
            foreignKeyName: "sessions_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "connectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_coupon_fk"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "connector_details"
            referencedColumns: ["station_id"]
          },
          {
            foreignKeyName: "sessions_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_tariff_id_fkey"
            columns: ["tariff_id"]
            isOneToOne: false
            referencedRelation: "tariffs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_items: {
        Row: {
          commission_amount: number
          created_at: string
          energy_kwh: number
          gross_amount: number
          id: string
          net_amount: number
          session_id: string
          settlement_id: string
          station_id: string
        }
        Insert: {
          commission_amount: number
          created_at?: string
          energy_kwh: number
          gross_amount: number
          id?: string
          net_amount: number
          session_id: string
          settlement_id: string
          station_id: string
        }
        Update: {
          commission_amount?: number
          created_at?: string
          energy_kwh?: number
          gross_amount?: number
          id?: string
          net_amount?: number
          session_id?: string
          settlement_id?: string
          station_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_items_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_items_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "connector_details"
            referencedColumns: ["station_id"]
          },
          {
            foreignKeyName: "settlement_items_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          commission_amount: number
          commission_pct: number
          created_at: string
          currency: string
          energy_kwh: number
          failure_reason: string | null
          gross_amount: number
          gst_amount: number
          id: string
          net_amount: number
          owner_id: string
          paid_at: string | null
          payout_reference: string | null
          period_end: string
          period_start: string
          sessions_count: number
          status: Database["public"]["Enums"]["settlement_status"]
          tds_amount: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          commission_amount?: number
          commission_pct?: number
          created_at?: string
          currency?: string
          energy_kwh?: number
          failure_reason?: string | null
          gross_amount?: number
          gst_amount?: number
          id?: string
          net_amount?: number
          owner_id: string
          paid_at?: string | null
          payout_reference?: string | null
          period_end: string
          period_start: string
          sessions_count?: number
          status?: Database["public"]["Enums"]["settlement_status"]
          tds_amount?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          commission_amount?: number
          commission_pct?: number
          created_at?: string
          currency?: string
          energy_kwh?: number
          failure_reason?: string | null
          gross_amount?: number
          gst_amount?: number
          id?: string
          net_amount?: number
          owner_id?: string
          paid_at?: string | null
          payout_reference?: string | null
          period_end?: string
          period_start?: string
          sessions_count?: number
          status?: Database["public"]["Enums"]["settlement_status"]
          tds_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlements_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stations: {
        Row: {
          address_line1: string
          address_line2: string | null
          amenities: string[]
          city: string
          close_time: string | null
          commission_pct: number
          country_code: string
          created_at: string
          description: string | null
          geo: unknown
          id: string
          is_24x7: boolean
          lat: number
          lng: number
          name: string
          open_time: string | null
          owner_id: string
          photos: string[]
          postal_code: string | null
          provider_station_id: string | null
          rating_avg: number
          rating_count: number
          settlement_cycle_days: number
          slug: string
          state: string
          status: Database["public"]["Enums"]["station_status"]
          updated_at: string
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          amenities?: string[]
          city: string
          close_time?: string | null
          commission_pct?: number
          country_code?: string
          created_at?: string
          description?: string | null
          geo?: unknown
          id?: string
          is_24x7?: boolean
          lat: number
          lng: number
          name: string
          open_time?: string | null
          owner_id: string
          photos?: string[]
          postal_code?: string | null
          provider_station_id?: string | null
          rating_avg?: number
          rating_count?: number
          settlement_cycle_days?: number
          slug: string
          state: string
          status?: Database["public"]["Enums"]["station_status"]
          updated_at?: string
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          amenities?: string[]
          city?: string
          close_time?: string | null
          commission_pct?: number
          country_code?: string
          created_at?: string
          description?: string | null
          geo?: unknown
          id?: string
          is_24x7?: boolean
          lat?: number
          lng?: number
          name?: string
          open_time?: string | null
          owner_id?: string
          photos?: string[]
          postal_code?: string | null
          provider_station_id?: string | null
          rating_avg?: number
          rating_count?: number
          settlement_cycle_days?: number
          slug?: string
          state?: string
          status?: Database["public"]["Enums"]["station_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tariffs: {
        Row: {
          connector_type: Database["public"]["Enums"]["connector_type"] | null
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          idle_fee_per_min: number
          min_balance_to_start: number
          price_per_kwh: number
          session_fee: number
          station_id: string
          tax_pct: number
        }
        Insert: {
          connector_type?: Database["public"]["Enums"]["connector_type"] | null
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          idle_fee_per_min?: number
          min_balance_to_start?: number
          price_per_kwh: number
          session_fee?: number
          station_id: string
          tax_pct?: number
        }
        Update: {
          connector_type?: Database["public"]["Enums"]["connector_type"] | null
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          idle_fee_per_min?: number
          min_balance_to_start?: number
          price_per_kwh?: number
          session_fee?: number
          station_id?: string
          tax_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "tariffs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tariffs_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "connector_details"
            referencedColumns: ["station_id"]
          },
          {
            foreignKeyName: "tariffs_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          is_internal: boolean
          ticket_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assigned_to: string | null
          created_at: string
          description: string
          id: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          resolved_at: string | null
          session_id: string | null
          station_id: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          description: string
          id?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          resolved_at?: string | null
          session_id?: string | null
          station_id?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          description?: string
          id?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          resolved_at?: string | null
          session_id?: string | null
          station_id?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "connector_details"
            referencedColumns: ["station_id"]
          },
          {
            foreignKeyName: "tickets_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          battery_capacity_kwh: number
          connector_type: Database["public"]["Enums"]["connector_type"]
          created_at: string
          id: string
          is_primary: boolean
          make: string
          max_charge_rate_kw: number | null
          model: string
          nickname: string | null
          plate_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          battery_capacity_kwh: number
          connector_type: Database["public"]["Enums"]["connector_type"]
          created_at?: string
          id?: string
          is_primary?: boolean
          make: string
          max_charge_rate_kw?: number | null
          model: string
          nickname?: string | null
          plate_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          battery_capacity_kwh?: number
          connector_type?: Database["public"]["Enums"]["connector_type"]
          created_at?: string
          id?: string
          is_primary?: boolean
          make?: string
          max_charge_rate_kw?: number | null
          model?: string
          nickname?: string | null
          plate_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_holds: {
        Row: {
          amount: number
          captured_amount: number | null
          created_at: string
          expires_at: string
          id: string
          released_at: string | null
          session_id: string | null
          status: Database["public"]["Enums"]["hold_status"]
          updated_at: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          amount: number
          captured_amount?: number | null
          created_at?: string
          expires_at?: string
          id?: string
          released_at?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["hold_status"]
          updated_at?: string
          user_id: string
          wallet_id: string
        }
        Update: {
          amount?: number
          captured_amount?: number | null
          created_at?: string
          expires_at?: string
          id?: string
          released_at?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["hold_status"]
          updated_at?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_holds_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_holds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_holds_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          direction: Database["public"]["Enums"]["ledger_direction"]
          hold_id: string | null
          id: number
          idempotency_key: string | null
          notes: string | null
          payment_id: string | null
          reason: Database["public"]["Enums"]["ledger_reason"]
          reference: string | null
          session_id: string | null
          user_id: string
          wallet_id: string
        }
        Insert: {
          amount: number
          balance_after?: number
          created_at?: string
          direction: Database["public"]["Enums"]["ledger_direction"]
          hold_id?: string | null
          id?: never
          idempotency_key?: string | null
          notes?: string | null
          payment_id?: string | null
          reason: Database["public"]["Enums"]["ledger_reason"]
          reference?: string | null
          session_id?: string | null
          user_id: string
          wallet_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          direction?: Database["public"]["Enums"]["ledger_direction"]
          hold_id?: string | null
          id?: never
          idempotency_key?: string | null
          notes?: string | null
          payment_id?: string | null
          reason?: Database["public"]["Enums"]["ledger_reason"]
          reference?: string | null
          session_id?: string | null
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_tx_hold_fk"
            columns: ["hold_id"]
            isOneToOne: false
            referencedRelation: "wallet_holds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_tx_payment_fk"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number
          created_at: string
          currency: string
          held_amount: number
          id: string
          is_frozen: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string
          held_amount?: number
          id?: string
          is_frozen?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          held_amount?: number
          id?: string
          is_frozen?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          attempts: number
          event_id: string
          event_type: string
          id: string
          last_error: string | null
          payload: Json
          processed_at: string | null
          received_at: string
          signature: string | null
          source: string
        }
        Insert: {
          attempts?: number
          event_id: string
          event_type: string
          id?: string
          last_error?: string | null
          payload: Json
          processed_at?: string | null
          received_at?: string
          signature?: string | null
          source: string
        }
        Update: {
          attempts?: number
          event_id?: string
          event_type?: string
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          received_at?: string
          signature?: string | null
          source?: string
        }
        Relationships: []
      }
    }
    Views: {
      connector_details: {
        Row: {
          charger_id: string | null
          charger_label: string | null
          charger_status: Database["public"]["Enums"]["charger_status"] | null
          city: string | null
          connector_id: string | null
          connector_number: number | null
          current_type: Database["public"]["Enums"]["current_type"] | null
          lat: number | null
          lng: number | null
          ocpp_version: string | null
          owner_id: string | null
          power_kw: number | null
          station_id: string | null
          station_name: string | null
          station_status: Database["public"]["Enums"]["station_status"] | null
          status: Database["public"]["Enums"]["connector_status"] | null
          status_changed_at: string | null
          type: Database["public"]["Enums"]["connector_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "stations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      activate_session: {
        Args: {
          p_provider_ref?: string
          p_session_id: string
          p_started_at?: string
        }
        Returns: {
          connector_id: string
          coupon_id: string | null
          created_at: string
          discount_amount: number
          duration_seconds: number
          energy_cost: number
          energy_kwh: number
          failure_message: string | null
          id: string
          idempotency_key: string
          idle_cost: number
          idle_fee_per_min: number
          last_meter_at: string | null
          price_per_kwh: number
          provider_session_ref: string | null
          requested_at: string
          reservation_id: string | null
          session_fee: number
          soc_end_pct: number | null
          soc_start_pct: number | null
          started_at: string | null
          station_id: string
          status: Database["public"]["Enums"]["session_status"]
          stop_reason: Database["public"]["Enums"]["session_stop_reason"] | null
          stopped_at: string | null
          subtotal: number
          tariff_id: string | null
          tax_amount: number
          tax_pct: number
          total_cost: number
          updated_at: string
          user_id: string
          vehicle_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_dashboard: { Args: { p_days?: number }; Returns: Json }
      cancel_reservation: {
        Args: { p_reservation_id: string }
        Returns: {
          cancelled_reason: string | null
          connector_id: string
          created_at: string
          expires_at: string
          fee: number
          id: string
          provider_reservation_ref: string | null
          starts_at: string
          status: Database["public"]["Enums"]["reservation_status"]
          updated_at: string
          user_id: string
          vehicle_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      compute_session_cost: {
        Args: {
          p_discount?: number
          p_energy_kwh: number
          p_idle_fee_per_min: number
          p_idle_minutes: number
          p_price_per_kwh: number
          p_session_fee: number
          p_tax_pct: number
        }
        Returns: {
          discount_amount: number
          energy_cost: number
          idle_cost: number
          subtotal: number
          tax_amount: number
          total_cost: number
        }[]
      }
      consume_rate_limit: {
        Args: {
          p_bucket: string
          p_identifier: string
          p_limit: number
          p_window_secs: number
        }
        Returns: boolean
      }
      create_reservation: {
        Args: {
          p_connector_id: string
          p_minutes?: number
          p_vehicle_id?: string
        }
        Returns: {
          cancelled_reason: string | null
          connector_id: string
          created_at: string
          expires_at: string
          fee: number
          id: string
          provider_reservation_ref: string | null
          starts_at: string
          status: Database["public"]["Enums"]["reservation_status"]
          updated_at: string
          user_id: string
          vehicle_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      credit_wallet_from_payment: {
        Args: { p_payment_id: string }
        Returns: {
          amount: number
          balance_after: number
          created_at: string
          direction: Database["public"]["Enums"]["ledger_direction"]
          hold_id: string | null
          id: number
          idempotency_key: string | null
          notes: string | null
          payment_id: string | null
          reason: Database["public"]["Enums"]["ledger_reason"]
          reference: string | null
          session_id: string | null
          user_id: string
          wallet_id: string
        }
        SetofOptions: {
          from: "*"
          to: "wallet_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      evaluate_coupon: {
        Args: { p_amount: number; p_code: string; p_station_id: string }
        Returns: {
          coupon_id: string
          discount: number
          reason: string
        }[]
      }
      expire_stale_records: {
        Args: never
        Returns: {
          holds_expired: number
          reservations_expired: number
        }[]
      }
      fail_session: {
        Args: {
          p_message?: string
          p_reason?: Database["public"]["Enums"]["session_stop_reason"]
          p_session_id: string
        }
        Returns: {
          connector_id: string
          coupon_id: string | null
          created_at: string
          discount_amount: number
          duration_seconds: number
          energy_cost: number
          energy_kwh: number
          failure_message: string | null
          id: string
          idempotency_key: string
          idle_cost: number
          idle_fee_per_min: number
          last_meter_at: string | null
          price_per_kwh: number
          provider_session_ref: string | null
          requested_at: string
          reservation_id: string | null
          session_fee: number
          soc_end_pct: number | null
          soc_start_pct: number | null
          started_at: string | null
          station_id: string
          status: Database["public"]["Enums"]["session_status"]
          stop_reason: Database["public"]["Enums"]["session_stop_reason"] | null
          stopped_at: string | null
          subtotal: number
          tariff_id: string | null
          tax_amount: number
          tax_pct: number
          total_cost: number
          updated_at: string
          user_id: string
          vehicle_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_settlement: {
        Args: {
          p_gst_pct?: number
          p_owner_id: string
          p_period_end: string
          p_period_start: string
          p_tds_pct?: number
        }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          commission_amount: number
          commission_pct: number
          created_at: string
          currency: string
          energy_kwh: number
          failure_reason: string | null
          gross_amount: number
          gst_amount: number
          id: string
          net_amount: number
          owner_id: string
          paid_at: string | null
          payout_reference: string | null
          period_end: string
          period_start: string
          sessions_count: number
          status: Database["public"]["Enums"]["settlement_status"]
          tds_amount: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "settlements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      my_spendable_balance: { Args: never; Returns: number }
      owner_dashboard: { Args: { p_days?: number }; Returns: Json }
      record_meter_reading: {
        Args: {
          p_energy_kwh: number
          p_power_kw?: number
          p_recorded_at: string
          p_session_id: string
          p_soc_pct?: number
        }
        Returns: {
          connector_id: string
          coupon_id: string | null
          created_at: string
          discount_amount: number
          duration_seconds: number
          energy_cost: number
          energy_kwh: number
          failure_message: string | null
          id: string
          idempotency_key: string
          idle_cost: number
          idle_fee_per_min: number
          last_meter_at: string | null
          price_per_kwh: number
          provider_session_ref: string | null
          requested_at: string
          reservation_id: string | null
          session_fee: number
          soc_end_pct: number | null
          soc_start_pct: number | null
          started_at: string | null
          station_id: string
          status: Database["public"]["Enums"]["session_status"]
          stop_reason: Database["public"]["Enums"]["session_stop_reason"] | null
          stopped_at: string | null
          subtotal: number
          tariff_id: string | null
          tax_amount: number
          tax_pct: number
          total_cost: number
          updated_at: string
          user_id: string
          vehicle_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_tariff: {
        Args: { p_at?: string; p_connector_id: string }
        Returns: {
          connector_type: Database["public"]["Enums"]["connector_type"] | null
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          idle_fee_per_min: number
          min_balance_to_start: number
          price_per_kwh: number
          session_fee: number
          station_id: string
          tax_pct: number
        }
        SetofOptions: {
          from: "*"
          to: "tariffs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rollup_daily_stats: { Args: { p_day?: string }; Returns: undefined }
      search_stations: {
        Args: {
          p_connector_types?: Database["public"]["Enums"]["connector_type"][]
          p_lat: number
          p_limit?: number
          p_lng: number
          p_min_power_kw?: number
          p_offset?: number
          p_only_available?: boolean
          p_query?: string
          p_radius_m?: number
        }
        Returns: {
          address_line1: string
          amenities: string[]
          available_connectors: number
          city: string
          connector_types: Database["public"]["Enums"]["connector_type"][]
          distance_m: number
          id: string
          is_24x7: boolean
          lat: number
          lng: number
          max_power_kw: number
          min_price_per_kwh: number
          name: string
          photos: string[]
          rating_avg: number
          rating_count: number
          slug: string
          state: string
          total_connectors: number
        }[]
      }
      start_charging_session: {
        Args: {
          p_connector_id: string
          p_coupon_code?: string
          p_idempotency_key?: string
          p_vehicle_id?: string
        }
        Returns: {
          connector_id: string
          coupon_id: string | null
          created_at: string
          discount_amount: number
          duration_seconds: number
          energy_cost: number
          energy_kwh: number
          failure_message: string | null
          id: string
          idempotency_key: string
          idle_cost: number
          idle_fee_per_min: number
          last_meter_at: string | null
          price_per_kwh: number
          provider_session_ref: string | null
          requested_at: string
          reservation_id: string | null
          session_fee: number
          soc_end_pct: number | null
          soc_start_pct: number | null
          started_at: string | null
          station_id: string
          status: Database["public"]["Enums"]["session_status"]
          stop_reason: Database["public"]["Enums"]["session_stop_reason"] | null
          stopped_at: string | null
          subtotal: number
          tariff_id: string | null
          tax_amount: number
          tax_pct: number
          total_cost: number
          updated_at: string
          user_id: string
          vehicle_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      stop_charging_session: {
        Args: {
          p_final_energy_kwh?: number
          p_reason?: Database["public"]["Enums"]["session_stop_reason"]
          p_session_id: string
          p_stopped_at?: string
        }
        Returns: {
          connector_id: string
          coupon_id: string | null
          created_at: string
          discount_amount: number
          duration_seconds: number
          energy_cost: number
          energy_kwh: number
          failure_message: string | null
          id: string
          idempotency_key: string
          idle_cost: number
          idle_fee_per_min: number
          last_meter_at: string | null
          price_per_kwh: number
          provider_session_ref: string | null
          requested_at: string
          reservation_id: string | null
          session_fee: number
          soc_end_pct: number | null
          soc_start_pct: number | null
          started_at: string | null
          station_id: string
          status: Database["public"]["Enums"]["session_status"]
          stop_reason: Database["public"]["Enums"]["session_stop_reason"] | null
          stopped_at: string | null
          subtotal: number
          tariff_id: string | null
          tax_amount: number
          tax_pct: number
          total_cost: number
          updated_at: string
          user_id: string
          vehicle_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "customer" | "owner" | "admin" | "employee"
      auth_provider: "otp" | "google" | "apple" | "email"
      charger_status: "online" | "offline" | "faulted" | "maintenance"
      connector_status:
        | "available"
        | "occupied"
        | "reserved"
        | "offline"
        | "faulted"
      connector_type: "CCS2" | "TYPE2" | "GBT" | "CHADEMO" | "AC_3PIN"
      current_type: "AC" | "DC"
      discount_type: "flat" | "percent"
      hold_status: "active" | "captured" | "released" | "expired"
      ledger_direction: "credit" | "debit"
      ledger_reason:
        | "wallet_recharge"
        | "session_charge"
        | "session_refund"
        | "hold_placed"
        | "hold_released"
        | "referral_bonus"
        | "coupon_credit"
        | "manual_adjustment"
        | "reservation_fee"
        | "reservation_refund"
      notification_channel: "push" | "in_app" | "sms" | "email"
      payment_provider: "razorpay" | "cashfree"
      payment_purpose: "wallet_recharge" | "session_topup"
      payment_status:
        | "created"
        | "authorized"
        | "captured"
        | "failed"
        | "refunded"
      reservation_status:
        | "pending"
        | "active"
        | "consumed"
        | "cancelled"
        | "expired"
      session_status:
        | "pending"
        | "active"
        | "completed"
        | "failed"
        | "cancelled"
      session_stop_reason:
        | "user_request"
        | "ev_disconnected"
        | "provider_stopped"
        | "insufficient_balance"
        | "fault"
        | "timeout"
        | "admin_action"
      settlement_status:
        | "pending"
        | "approved"
        | "processing"
        | "paid"
        | "failed"
      station_status:
        | "draft"
        | "under_review"
        | "active"
        | "maintenance"
        | "suspended"
      ticket_priority: "low" | "medium" | "high" | "urgent"
      ticket_status: "open" | "in_progress" | "resolved" | "closed"
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
      app_role: ["customer", "owner", "admin", "employee"],
      auth_provider: ["otp", "google", "apple", "email"],
      charger_status: ["online", "offline", "faulted", "maintenance"],
      connector_status: [
        "available",
        "occupied",
        "reserved",
        "offline",
        "faulted",
      ],
      connector_type: ["CCS2", "TYPE2", "GBT", "CHADEMO", "AC_3PIN"],
      current_type: ["AC", "DC"],
      discount_type: ["flat", "percent"],
      hold_status: ["active", "captured", "released", "expired"],
      ledger_direction: ["credit", "debit"],
      ledger_reason: [
        "wallet_recharge",
        "session_charge",
        "session_refund",
        "hold_placed",
        "hold_released",
        "referral_bonus",
        "coupon_credit",
        "manual_adjustment",
        "reservation_fee",
        "reservation_refund",
      ],
      notification_channel: ["push", "in_app", "sms", "email"],
      payment_provider: ["razorpay", "cashfree"],
      payment_purpose: ["wallet_recharge", "session_topup"],
      payment_status: [
        "created",
        "authorized",
        "captured",
        "failed",
        "refunded",
      ],
      reservation_status: [
        "pending",
        "active",
        "consumed",
        "cancelled",
        "expired",
      ],
      session_status: ["pending", "active", "completed", "failed", "cancelled"],
      session_stop_reason: [
        "user_request",
        "ev_disconnected",
        "provider_stopped",
        "insufficient_balance",
        "fault",
        "timeout",
        "admin_action",
      ],
      settlement_status: [
        "pending",
        "approved",
        "processing",
        "paid",
        "failed",
      ],
      station_status: [
        "draft",
        "under_review",
        "active",
        "maintenance",
        "suspended",
      ],
      ticket_priority: ["low", "medium", "high", "urgent"],
      ticket_status: ["open", "in_progress", "resolved", "closed"],
    },
  },
} as const
