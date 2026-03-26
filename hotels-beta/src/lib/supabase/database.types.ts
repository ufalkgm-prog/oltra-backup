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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      member_family_members: {
        Row: {
          birthday: string | null
          created_at: string
          full_name: string | null
          id: string
          passport_expiry: string | null
          passport_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          birthday?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          passport_expiry?: string | null
          passport_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          birthday?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          passport_expiry?: string | null
          passport_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      member_favorite_hotels: {
        Row: {
          created_at: string
          hotel_directus_id: string
          hotel_name: string | null
          id: string
          location: string | null
          meta: string | null
          thumbnail: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          hotel_directus_id: string
          hotel_name?: string | null
          id?: string
          location?: string | null
          meta?: string | null
          thumbnail?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          hotel_directus_id?: string
          hotel_name?: string | null
          id?: string
          location?: string | null
          meta?: string | null
          thumbnail?: string | null
          user_id?: string
        }
        Relationships: []
      }
      member_favorite_restaurants: {
        Row: {
          created_at: string
          id: string
          location: string | null
          meta: string | null
          restaurant_directus_id: string
          restaurant_name: string | null
          thumbnail: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          location?: string | null
          meta?: string | null
          restaurant_directus_id: string
          restaurant_name?: string | null
          thumbnail?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          location?: string | null
          meta?: string | null
          restaurant_directus_id?: string
          restaurant_name?: string | null
          thumbnail?: string | null
          user_id?: string
        }
        Relationships: []
      }
      member_feedback_suggestions: {
        Row: {
          created_at: string
          id: string
          message: string
          sender_email: string | null
          topic: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          sender_email?: string | null
          topic: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          sender_email?: string | null
          topic?: string
          user_id?: string
        }
        Relationships: []
      }
      member_profiles: {
        Row: {
          created_at: string
          email: string | null
          home_airport: string | null
          member_name: string | null
          phone: string | null
          preferred_airlines: string[]
          preferred_currency: string | null
          preferred_hotel_styles: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          home_airport?: string | null
          member_name?: string | null
          phone?: string | null
          preferred_airlines?: string[]
          preferred_currency?: string | null
          preferred_hotel_styles?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          home_airport?: string | null
          member_name?: string | null
          phone?: string | null
          preferred_airlines?: string[]
          preferred_currency?: string | null
          preferred_hotel_styles?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      member_reviews: {
        Row: {
          comments: string | null
          created_at: string
          design_rating: number | null
          food_rating: number | null
          id: string
          location_rating: number | null
          overall_rating: number | null
          review_type: string
          service_rating: number | null
          target_directus_id: string | null
          target_label: string
          updated_at: string
          user_id: string
          value_rating: number | null
        }
        Insert: {
          comments?: string | null
          created_at?: string
          design_rating?: number | null
          food_rating?: number | null
          id?: string
          location_rating?: number | null
          overall_rating?: number | null
          review_type: string
          service_rating?: number | null
          target_directus_id?: string | null
          target_label: string
          updated_at?: string
          user_id: string
          value_rating?: number | null
        }
        Update: {
          comments?: string | null
          created_at?: string
          design_rating?: number | null
          food_rating?: number | null
          id?: string
          location_rating?: number | null
          overall_rating?: number | null
          review_type?: string
          service_rating?: number | null
          target_directus_id?: string | null
          target_label?: string
          updated_at?: string
          user_id?: string
          value_rating?: number | null
        }
        Relationships: []
      }
      member_trip_flights: {
        Row: {
          arrive_at: string | null
          cabin: string | null
          created_at: string
          depart_at: string | null
          external_flight_id: string | null
          has_overlap_warning: boolean
          id: string
          route: string | null
          status: string | null
          thumbnail: string | null
          timing: string | null
          trip_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          arrive_at?: string | null
          cabin?: string | null
          created_at?: string
          depart_at?: string | null
          external_flight_id?: string | null
          has_overlap_warning?: boolean
          id?: string
          route?: string | null
          status?: string | null
          thumbnail?: string | null
          timing?: string | null
          trip_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          arrive_at?: string | null
          cabin?: string | null
          created_at?: string
          depart_at?: string | null
          external_flight_id?: string | null
          has_overlap_warning?: boolean
          id?: string
          route?: string | null
          status?: string | null
          thumbnail?: string | null
          timing?: string | null
          trip_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_trip_flights_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "member_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      member_trip_hotels: {
        Row: {
          check_in: string | null
          check_out: string | null
          created_at: string
          has_overlap_warning: boolean
          hotel_directus_id: string
          hotel_name: string | null
          id: string
          location: string | null
          status: string | null
          stay_label: string | null
          thumbnail: string | null
          trip_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          has_overlap_warning?: boolean
          hotel_directus_id: string
          hotel_name?: string | null
          id?: string
          location?: string | null
          status?: string | null
          stay_label?: string | null
          thumbnail?: string | null
          trip_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          has_overlap_warning?: boolean
          hotel_directus_id?: string
          hotel_name?: string | null
          id?: string
          location?: string | null
          status?: string | null
          stay_label?: string | null
          thumbnail?: string | null
          trip_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_trip_hotels_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "member_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      member_trip_restaurants: {
        Row: {
          created_at: string
          has_overlap_warning: boolean
          id: string
          location: string | null
          reservation_at: string | null
          reservation_label: string | null
          restaurant_directus_id: string
          restaurant_name: string | null
          status: string | null
          thumbnail: string | null
          trip_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          has_overlap_warning?: boolean
          id?: string
          location?: string | null
          reservation_at?: string | null
          reservation_label?: string | null
          restaurant_directus_id: string
          restaurant_name?: string | null
          status?: string | null
          thumbnail?: string | null
          trip_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          has_overlap_warning?: boolean
          id?: string
          location?: string | null
          reservation_at?: string | null
          reservation_label?: string | null
          restaurant_directus_id?: string
          restaurant_name?: string | null
          status?: string | null
          thumbnail?: string | null
          trip_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_trip_restaurants_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "member_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      member_trips: {
        Row: {
          created_at: string
          destination: string | null
          id: string
          name: string
          period_label: string | null
          status: string | null
          travelers_label: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          destination?: string | null
          id?: string
          name: string
          period_label?: string | null
          status?: string | null
          travelers_label?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          destination?: string | null
          id?: string
          name?: string
          period_label?: string | null
          status?: string | null
          travelers_label?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
