export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      studios: {
        Row: {
          id: string
          email: string
          name: string
          address: string | null
          phone: string | null
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          email: string
          name: string
          address?: string | null
          phone?: string | null
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          name?: string
          address?: string | null
          phone?: string | null
          description?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      courses: {
        Row: {
          id: string
          studio_id: string
          activity: 'yoga' | 'pilates' | 'hiit' | 'barre' | 'cycling'
          date: string
          start_time: string
          duration_minutes: number
          places_total: number
          places_left: number
          price_normal: number
          price_app: number
          status: 'active' | 'cancelled' | 'completed' | 'full'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          studio_id: string
          activity: 'yoga' | 'pilates' | 'hiit' | 'barre' | 'cycling'
          date: string
          start_time: string
          duration_minutes?: number
          places_total: number
          places_left: number
          price_normal: number
          price_app: number
          status?: 'active' | 'cancelled' | 'completed' | 'full'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          studio_id?: string
          activity?: 'yoga' | 'pilates' | 'hiit' | 'barre' | 'cycling'
          date?: string
          start_time?: string
          duration_minutes?: number
          places_total?: number
          places_left?: number
          price_normal?: number
          price_app?: number
          status?: 'active' | 'cancelled' | 'completed' | 'full'
          created_at?: string
          updated_at?: string
        }
      }
      reservations: {
        Row: {
          id: string
          course_id: string
          user_name: string
          user_email: string
          user_phone: string
          stripe_payment_id: string
          stripe_checkout_session_id: string | null
          amount_paid: number
          status: 'confirmed' | 'cancelled' | 'completed' | 'no_show'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          course_id: string
          user_name: string
          user_email: string
          user_phone: string
          stripe_payment_id: string
          stripe_checkout_session_id?: string | null
          amount_paid: number
          status?: 'confirmed' | 'cancelled' | 'completed' | 'no_show'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          course_id?: string
          user_name?: string
          user_email?: string
          user_phone?: string
          stripe_payment_id?: string
          stripe_checkout_session_id?: string | null
          amount_paid?: number
          status?: 'confirmed' | 'cancelled' | 'completed' | 'no_show'
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}

