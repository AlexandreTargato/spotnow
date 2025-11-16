import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ReservationForm } from './reservation-form'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Clock, MapPin, Users, Calendar } from 'lucide-react'
import { formatPrice, formatDate, formatTime, calculateDiscount, ACTIVITY_LABELS } from '@/lib/utils'
import type { CourseWithStudio } from '@/lib/supabase/types'

async function getCourse(id: string) {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('courses')
    .select(`
      *,
      studios (name, address, phone, description)
    `)
    .eq('id', id)
    .single()

  if (error || !data) {
    return null
  }

  return data as unknown as CourseWithStudio
}

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const course = await getCourse(id)

  if (!course) {
    notFound()
  }

  const discount = calculateDiscount(course.price_normal, course.price_app)
  const isAvailable = course.status === 'active' && course.places_left > 0

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <Badge className="text-lg px-4 py-2">
            {ACTIVITY_LABELS[course.activity]}
          </Badge>
          <Badge variant="destructive" className="text-xl px-4 py-2">
            -{discount}%
          </Badge>
        </div>

        <h1 className="text-4xl font-bold mb-2">{course.studios.name}</h1>

        {course.studios.description && (
          <p className="text-muted-foreground">{course.studios.description}</p>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Informations du cours</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center">
                <Calendar className="mr-3 h-5 w-5 text-muted-foreground" />
                <span>{formatDate(course.date)}</span>
              </div>

              <div className="flex items-center">
                <Clock className="mr-3 h-5 w-5 text-muted-foreground" />
                <span>{formatTime(course.start_time)} ({course.duration_minutes} min)</span>
              </div>

              <div className="flex items-center">
                <MapPin className="mr-3 h-5 w-5 text-muted-foreground" />
                <span>{course.studios.address || 'Adresse non renseignée'}</span>
              </div>

              <div className="flex items-center">
                <Users className="mr-3 h-5 w-5 text-muted-foreground" />
                <span>
                  {course.places_left} place{course.places_left > 1 ? 's' : ''} restante{course.places_left > 1 ? 's' : ''}
                  {' '}sur {course.places_total}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tarif</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Prix normal</span>
                  <span className="line-through">{formatPrice(course.price_normal)}</span>
                </div>
                <div className="flex justify-between items-center text-2xl font-bold">
                  <span>Prix dernière minute</span>
                  <span className="text-green-600">{formatPrice(course.price_app)}</span>
                </div>
                <p className="text-sm text-muted-foreground pt-2">
                  Vous économisez {formatPrice(course.price_normal - course.price_app)} ({discount}%)
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Réserver ce cours</CardTitle>
            </CardHeader>
            <CardContent>
              {isAvailable ? (
                <ReservationForm courseId={course.id} />
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-2">
                    {course.status === 'full' ? 'Ce cours est complet' : 'Ce cours n\'est plus disponible'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

