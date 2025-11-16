import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { stripe } from '@/lib/stripe/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { reservationSchema } from '@/lib/validations'
import type { CourseWithStudioName } from '@/lib/supabase/types'

const checkoutSchema = reservationSchema.extend({
  courseId: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { courseId, userName, userEmail, userPhone } = checkoutSchema.parse(body)

    const supabase = await createServerSupabaseClient()

    // Vérifier que le cours existe et a des places
    const { data: course, error } = await supabase
      .from('courses')
      .select('*, studios(name)')
      .eq('id', courseId)
      .single()

    if (error || !course) {
      return NextResponse.json(
        { error: 'Cours introuvable' },
        { status: 404 }
      )
    }

    const courseWithStudio = course as unknown as CourseWithStudioName

    if (courseWithStudio.status !== 'active' || courseWithStudio.places_left === 0) {
      return NextResponse.json(
        { error: 'Ce cours n\'est plus disponible' },
        { status: 400 }
      )
    }

    // Créer session Stripe Checkout
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: `${courseWithStudio.activity.toUpperCase()} - ${courseWithStudio.studios.name}`,
              description: `${new Date(courseWithStudio.date).toLocaleDateString('fr-FR')} à ${courseWithStudio.start_time.slice(0, 5)}`,
            },
            unit_amount: courseWithStudio.price_app,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/cours/${courseId}`,
      customer_email: userEmail,
      metadata: {
        courseId,
        userName,
        userEmail,
        userPhone,
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Checkout error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Données invalides', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Erreur lors de la création de la session de paiement' },
      { status: 500 }
    )
  }
}

