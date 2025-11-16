import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import { formatPrice, formatDate, formatTime, ACTIVITY_LABELS } from '@/lib/utils'

interface ConfirmationEmailProps {
  userName: string
  course: {
    activity: string
    date: string
    start_time: string
    duration_minutes: number
    studios: {
      name: string
      address: string | null
      phone: string | null
    }
  }
  reservation: {
    id: string
    amount_paid: number
  }
}

export function ConfirmationEmail({
  userName,
  course,
  reservation,
}: ConfirmationEmailProps) {
  const previewText = `Confirmation de votre réservation - ${course.studios.name}`

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>✅ Réservation confirmée !</Heading>

          <Text style={text}>Bonjour {userName},</Text>

          <Text style={text}>
            Votre réservation a bien été confirmée. Nous avons hâte de vous voir au cours !
          </Text>

          <Section style={box}>
            <Text style={boxTitle}>Détails de votre cours</Text>

            <Hr style={hr} />

            <Text style={detail}>
              <strong>Activité :</strong> {ACTIVITY_LABELS[course.activity]}
            </Text>
            <Text style={detail}>
              <strong>Studio :</strong> {course.studios.name}
            </Text>
            <Text style={detail}>
              <strong>Date :</strong> {formatDate(course.date)}
            </Text>
            <Text style={detail}>
              <strong>Heure :</strong> {formatTime(course.start_time)} ({course.duration_minutes} min)
            </Text>
            <Text style={detail}>
              <strong>Adresse :</strong> {course.studios.address || 'Non renseignée'}
            </Text>

            <Hr style={hr} />

            <Text style={detail}>
              <strong>Montant payé :</strong> {formatPrice(reservation.amount_paid)}
            </Text>
            <Text style={detail}>
              <strong>Numéro de réservation :</strong> {reservation.id.slice(0, 8).toUpperCase()}
            </Text>
          </Section>

          <Section style={infoBox}>
            <Text style={infoTitle}>📍 Que faire maintenant ?</Text>
            <Text style={infoText}>
              • Présentez-vous au studio 5-10 minutes avant le début<br />
              • Apportez votre tenue de sport et une bouteille d&apos;eau<br />
              • Montrez cet email à l&apos;accueil
            </Text>
          </Section>

          {course.studios.phone && (
            <Text style={text}>
              <strong>Contact du studio :</strong> {course.studios.phone}
            </Text>
          )}

          <Button style={button} href={`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/`}>
            Retour à l&apos;accueil
          </Button>

          <Hr style={hr} />

          <Text style={footer}>
            SpotNow - Cours de sport dernière minute à prix cassés
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

// Styles
const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
}

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
}

const h1 = {
  color: '#333',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '40px 0',
  padding: '0 40px',
}

const text = {
  color: '#333',
  fontSize: '16px',
  lineHeight: '26px',
  padding: '0 40px',
}

const box = {
  backgroundColor: '#f9fafb',
  borderRadius: '8px',
  margin: '24px 40px',
  padding: '24px',
}

const boxTitle = {
  fontSize: '18px',
  fontWeight: 'bold',
  margin: '0 0 16px',
}

const detail = {
  color: '#333',
  fontSize: '14px',
  lineHeight: '24px',
  margin: '8px 0',
}

const infoBox = {
  backgroundColor: '#eff6ff',
  borderRadius: '8px',
  margin: '24px 40px',
  padding: '16px',
}

const infoTitle = {
  fontSize: '16px',
  fontWeight: 'bold',
  margin: '0 0 8px',
}

const infoText = {
  fontSize: '14px',
  lineHeight: '22px',
  margin: 0,
}

const button = {
  backgroundColor: '#000',
  borderRadius: '8px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  width: '200px',
  padding: '12px',
  margin: '24px auto',
}

const hr = {
  borderColor: '#e6ebf1',
  margin: '20px 0',
}

const footer = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  textAlign: 'center' as const,
  padding: '0 40px',
}

