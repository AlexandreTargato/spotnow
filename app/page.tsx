import { createServerSupabaseClient } from '@/lib/supabase/server'
import { CourseCard } from '@/components/course-card'
import { CourseCardSkeleton } from '@/components/course-card-skeleton'
import { Suspense } from 'react'
import type { CourseWithStudioName } from '@/lib/supabase/types'

async function getCourses() {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('courses')
    .select(`
      *,
      studios (name, address)
    `)
    .eq('status', 'active')
    .gt('places_left', 0)
    .gte('date', new Date().toISOString().split('T')[0])
    .order('date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(12)

  if (error) {
    console.error('Error fetching courses:', error)
    return []
  }

  return (data || []) as CourseWithStudioName[]
}

async function CoursesList() {
  const courses = await getCourses()

  if (courses.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          Aucun cours disponible pour le moment. Revenez bientôt !
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {courses.map((course) => (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <CourseCard key={course.id} course={course as any} />
      ))}
    </div>
  )
}

export default function HomePage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">
          Cours de sport dernière minute à prix cassés
        </h1>
        <p className="text-xl text-muted-foreground">
          Réservez votre cours 2-6h avant et économisez jusqu&apos;à 70%
        </p>
      </div>

      <Suspense fallback={
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <CourseCardSkeleton key={i} />
          ))}
        </div>
      }>
        <CoursesList />
      </Suspense>
    </div>
  )
}
