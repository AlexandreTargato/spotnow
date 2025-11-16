import { Database } from '@/lib/database.types'

// Types helper pour les requêtes Supabase avec relations
export type CourseWithStudio = Database['public']['Tables']['courses']['Row'] & {
  studios: Database['public']['Tables']['studios']['Row']
}

export type CourseWithStudioName = Database['public']['Tables']['courses']['Row'] & {
  studios: Pick<Database['public']['Tables']['studios']['Row'], 'name'>
}

export type ReservationWithCourse = Database['public']['Tables']['reservations']['Row'] & {
  courses: CourseWithStudio
}

export type CourseWithReservations = Database['public']['Tables']['courses']['Row'] & {
  reservations: Array<{ id: string }>
}

// Type pour le résultat de decrement_course_places
export type DecrementResult = {
  success: boolean
  places_remaining: number
}

