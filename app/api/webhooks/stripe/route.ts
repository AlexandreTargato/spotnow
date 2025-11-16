import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe/server';
import { createServiceSupabaseClient } from '@/lib/supabase/server';
import { resend } from '@/lib/resend';
import { ConfirmationEmail } from '@/emails/confirmation';
import type { DecrementResult, CourseWithStudio } from '@/lib/supabase/types';
import { Database } from '@/lib/database.types';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Handle checkout.session.completed
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    try {
      const supabase = await createServiceSupabaseClient();

      const { courseId, userName, userEmail, userPhone } = session.metadata as {
        courseId: string;
        userName: string;
        userEmail: string;
        userPhone: string;
      };

      // Décrémenter les places atomiquement
      const { data: result, error: decrementError } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .rpc('decrement_course_places', { course_uuid: courseId } as any)
        .single();

      const decrementResult = result as unknown as DecrementResult | null;

      if (decrementError || !decrementResult?.success) {
        console.error('Failed to decrement places:', decrementError);
        // Rembourser automatiquement si pas de place disponible
        if (session.payment_intent) {
          try {
            await stripe.refunds.create({
              payment_intent: session.payment_intent as string,
              reason: 'requested_by_customer',
            });
          } catch (refundError) {
            console.error('Failed to refund:', refundError);
          }
        }
        return NextResponse.json(
          { error: 'Failed to reserve spot' },
          { status: 500 }
        );
      }

      // Créer la réservation
      const reservationInsert: Database['public']['Tables']['reservations']['Insert'] =
        {
          course_id: courseId,
          user_name: userName,
          user_email: userEmail,
          user_phone: userPhone,
          stripe_payment_id: session.payment_intent as string,
          stripe_checkout_session_id: session.id,
          amount_paid: session.amount_total!,
          status: 'confirmed',
        };

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - Supabase types limitation with insert
      const { data: reservation, error: reservationError } = await supabase
        .from('reservations')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(reservationInsert as any)
        .select()
        .single();

      if (reservationError) {
        console.error('Failed to create reservation:', reservationError);
        return NextResponse.json(
          { error: 'Failed to create reservation' },
          { status: 500 }
        );
      }

      // Récupérer les détails du cours pour l'email
      const { data: course } = await supabase
        .from('courses')
        .select('*, studios(name, address, phone)')
        .eq('id', courseId)
        .single();

      const courseWithStudio = course as unknown as CourseWithStudio | null;
      const reservationData = reservation as unknown as
        | Database['public']['Tables']['reservations']['Row']
        | null;

      if (courseWithStudio && reservationData) {
        // Envoyer email de confirmation
        await resend.emails.send({
          from: 'SpotNow <noreply@spotnow.fr>',
          to: userEmail,
          subject: 'Confirmation de réservation - SpotNow',
          react: ConfirmationEmail({
            userName,
            course: courseWithStudio,
            reservation: reservationData,
          }),
        });
      }

      return NextResponse.json({ received: true });
    } catch (error) {
      console.error('Error processing webhook:', error);
      return NextResponse.json(
        { error: 'Webhook processing failed' },
        { status: 500 }
      );
    }
  }

  // Handle payment_intent.payment_failed
  if (event.type === 'payment_intent.payment_failed') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    try {
      const supabase = await createServiceSupabaseClient();

      // Trouver la réservation associée (si elle existe déjà)
      const { data: reservation } = await supabase
        .from('reservations')
        .select('*, courses(id, places_left, places_total)')
        .eq('stripe_payment_id', paymentIntent.id)
        .single();

      const reservationData = reservation as unknown as
        | (Database['public']['Tables']['reservations']['Row'] & {
            courses: {
              id: string;
              places_left: number;
              places_total: number;
            } | null;
          })
        | null;

      if (reservationData) {
        // Marquer la réservation comme annulée
        const reservationUpdate: Database['public']['Tables']['reservations']['Update'] =
          {
            status: 'cancelled',
          };
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - Supabase types limitation with update
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('reservations')
          .update(reservationUpdate)
          .eq('id', reservationData.id);

        // Réincrémenter les places si le cours existe encore
        const course = reservationData.courses;
        if (course && course.places_left < course.places_total) {
          const courseUpdate: Database['public']['Tables']['courses']['Update'] =
            {
              places_left: course.places_left + 1,
              status: course.places_left + 1 > 0 ? 'active' : 'active',
            };
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore - Supabase types limitation with update
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('courses')
            .update(courseUpdate)
            .eq('id', course.id);
        }

        // Envoyer email d'échec de paiement
        await resend.emails.send({
          from: 'SpotNow <noreply@spotnow.fr>',
          to: reservationData.user_email,
          subject: 'Échec du paiement - SpotNow',
          html: `
            <h2>Paiement échoué</h2>
            <p>Bonjour ${reservationData.user_name},</p>
            <p>Votre paiement pour la réservation n'a pas pu être traité.</p>
            <p><strong>Raison :</strong> ${paymentIntent.last_payment_error?.message || 'Paiement refusé'}</p>
            <p>Veuillez réessayer ou utiliser un autre moyen de paiement.</p>
            <p>Cordialement,<br>L'équipe SpotNow</p>
          `,
        });
      }

      return NextResponse.json({ received: true });
    } catch (error) {
      console.error('Error processing payment_failed webhook:', error);
      return NextResponse.json(
        { error: 'Webhook processing failed' },
        { status: 500 }
      );
    }
  }

  // Handle charge.refunded
  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;

    try {
      const supabase = await createServiceSupabaseClient();

      // Trouver la réservation via le payment_intent
      const { data: reservation } = await supabase
        .from('reservations')
        .select('*, courses(id, places_left, places_total)')
        .eq('stripe_payment_id', charge.payment_intent as string)
        .single();

      const reservationData = reservation as unknown as
        | (Database['public']['Tables']['reservations']['Row'] & {
            courses: {
              id: string;
              places_left: number;
              places_total: number;
            } | null;
          })
        | null;

      if (reservationData && reservationData.status !== 'cancelled') {
        // Marquer la réservation comme annulée
        const reservationUpdate: Database['public']['Tables']['reservations']['Update'] =
          {
            status: 'cancelled',
          };
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - Supabase types limitation with update
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('reservations')
          .update(reservationUpdate)
          .eq('id', reservationData.id);

        // Réincrémenter les places
        const course = reservationData.courses;
        if (course && course.places_left < course.places_total) {
          const courseUpdate: Database['public']['Tables']['courses']['Update'] =
            {
              places_left: course.places_left + 1,
              status: course.places_left + 1 > 0 ? 'active' : 'active',
            };
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore - Supabase types limitation with update
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('courses')
            .update(courseUpdate)
            .eq('id', course.id);
        }

        // Envoyer email de confirmation de remboursement
        await resend.emails.send({
          from: 'SpotNow <noreply@spotnow.fr>',
          to: reservationData.user_email,
          subject: 'Remboursement confirmé - SpotNow',
          html: `
            <h2>Remboursement effectué</h2>
            <p>Bonjour ${reservationData.user_name},</p>
            <p>Votre remboursement a été traité avec succès.</p>
            <p><strong>Montant remboursé :</strong> ${(charge.amount_refunded / 100).toFixed(2)}€</p>
            <p>Le remboursement apparaîtra sur votre relevé bancaire dans 5-10 jours ouvrés.</p>
            <p>Votre réservation a été annulée et la place a été libérée.</p>
            <p>Cordialement,<br>L'équipe SpotNow</p>
          `,
        });
      }

      return NextResponse.json({ received: true });
    } catch (error) {
      console.error('Error processing refund webhook:', error);
      return NextResponse.json(
        { error: 'Webhook processing failed' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ received: true });
}
