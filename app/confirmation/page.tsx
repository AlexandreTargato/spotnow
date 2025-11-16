import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { createServiceSupabaseClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { formatPrice, formatDate, formatTime, ACTIVITY_LABELS } from '@/lib/utils'
import type { ReservationWithCourse } from '@/lib/supabase/types'

async function getReservation(sessionId: string) {
  const supabase = await createServiceSupabaseClient()

  const { data, error } = await supabase
    .from('reservations')
    .select(`
      *,
      courses (
        *,
        studios (name, address, phone)
      )
    `)
    .eq('stripe_checkout_session_id', sessionId)
    .single()

  if (error || !data) {
    return null
  }

  return data as unknown as ReservationWithCourse
}

async function ConfirmationContent({ sessionId }: { sessionId: string }) {
  const reservation = await getReservation(sessionId)

  if (!reservation) {
    notFound()
  }

  const course = reservation.courses

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <Card>
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <CheckCircle2 className="h-16 w-16 text-green-600" />
          </div>
          <CardTitle className="text-3xl">Réservation confirmée !</CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <p className="text-sm text-muted-foreground">Numéro de réservation</p>
            <p className="font-mono font-semibold">{reservation.id.slice(0, 8).toUpperCase()}</p>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Détails du cours</h3>

            <div className="grid gap-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Activité</span>
                <span className="font-medium">{ACTIVITY_LABELS[course.activity]}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">Studio</span>
                <span className="font-medium">{course.studios.name}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">{formatDate(course.date)}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">Heure</span>
                <span className="font-medium">{formatTime(course.start_time)}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">Adresse</span>
                <span className="font-medium text-right">{course.studios.address}</span>
              </div>

              <div className="flex justify-between pt-2 border-t">
                <span className="text-muted-foreground">Montant payé</span>
                <span className="font-bold text-lg">{formatPrice(reservation.amount_paid)}</span>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg">
            <p className="text-sm font-medium mb-2">📧 Email de confirmation envoyé</p>
            <p className="text-sm text-muted-foreground">
              Un email de confirmation a été envoyé à <strong>{reservation.user_email}</strong> avec tous les détails.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold">Que faire maintenant ?</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Présentez-vous au studio 5-10 minutes avant le début</li>
              <li>Apportez votre tenue de sport et une bouteille d&apos;eau</li>
              <li>Montrez votre email de confirmation à l&apos;accueil</li>
            </ul>
          </div>

          <div className="flex gap-4">
            <Button asChild className="flex-1">
              <Link href="/">Retour à l&apos;accueil</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function ConfirmationPage({
  searchParams,
}: {
  searchParams: { session_id?: string }
}) {
  const sessionId = searchParams.session_id

  if (!sessionId) {
    notFound()
  }

  return (
    <Suspense fallback={<div className="text-center py-12">Chargement...</div>}>
      <ConfirmationContent sessionId={sessionId} />
    </Suspense>
  )
}

