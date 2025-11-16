import { createServerSupabaseClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CourseTable } from './course-table'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { PlusCircle } from 'lucide-react'
import type { CourseWithReservations } from '@/lib/supabase/types'

async function getStudioCourses() {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return []
  }

  const { data, error } = await supabase
    .from('courses')
    .select(`
      *,
      reservations (id)
    `)
    .eq('studio_id', user.id)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true })

  if (error) {
    console.error('Error fetching courses:', error)
    return []
  }

  return (data || []).map(course => {
    const courseData = course as unknown as CourseWithReservations
    return {
      ...courseData,
      reservations_count: courseData.reservations?.length || 0
    }
  })
}

async function getStats() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { totalCourses: 0, totalReservations: 0, totalRevenue: 0 }
  }

  // Courses actifs
  const { count: totalCourses } = await supabase
    .from('courses')
    .select('*', { count: 'exact', head: true })
    .eq('studio_id', user.id)
    .eq('status', 'active')

  // Total réservations
  const { data: reservations } = await supabase
    .from('reservations')
    .select('amount_paid, courses!inner(studio_id)')
    .eq('courses.studio_id', user.id)
    .eq('status', 'confirmed')

  const reservationsData = (reservations || []) as Array<{ amount_paid: number }>
  const totalReservations = reservationsData.length
  const totalRevenue = reservationsData.reduce((sum, r) => sum + r.amount_paid, 0)

  return {
    totalCourses: totalCourses || 0,
    totalReservations,
    totalRevenue: Math.round(totalRevenue * 0.7), // 70% pour le studio
  }
}

export default async function DashboardPage() {
  const courses = await getStudioCourses()
  const stats = await getStats()

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Tableau de bord</h1>
          <p className="text-muted-foreground">
            Gérez vos cours et suivez vos réservations
          </p>
        </div>

        <Button asChild>
          <Link href="/studio/nouveau-cours">
            <PlusCircle className="mr-2 h-4 w-4" />
            Publier un cours
          </Link>
        </Button>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Cours actifs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalCourses}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Réservations totales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalReservations}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Revenu généré</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {new Intl.NumberFormat('fr-FR', {
                style: 'currency',
                currency: 'EUR',
              }).format(stats.totalRevenue / 100)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Commission déduite (30%)</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mes cours</CardTitle>
          <CardDescription>
            Liste de tous vos cours publiés
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CourseTable courses={courses} />
        </CardContent>
      </Card>
    </div>
  )
}

