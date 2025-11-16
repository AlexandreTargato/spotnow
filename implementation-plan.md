Plan d'Implémentation Technique - SpotNow MVP
Vue d'Ensemble
Application web de réservation de cours de sport dernière minute avec réductions. Marketplace bidirectionnelle connectant studios et utilisateurs finaux.
Stack :

Frontend/Backend : Next.js 14 (App Router) + TypeScript
UI : Tailwind CSS + shadcn/ui
Database : Supabase (PostgreSQL)
Auth : Supabase Auth
Paiements : Stripe Checkout + Webhooks
Emails : Resend + React Email
Hosting : Vercel

Timeline estimée : 25-30h développement

Architecture Globale
┌─────────────────────────────────────────────────────────┐
│ Next.js App │
│ ┌──────────────────┐ ┌──────────────────┐ │
│ │ Public Routes │ │ Studio Routes │ │
│ │ (/, /cours/_) │ │ (/studio/_) │ │
│ └────────┬─────────┘ └────────┬─────────┘ │
│ │ │ │
│ └──────────┬──────────────────┘ │
│ │ │
│ ┌──────────▼──────────┐ │
│ │ API Routes │ │
│ │ /api/webhooks/\* │ │
│ │ /api/checkout │ │
│ └──────────┬──────────┘ │
└────────────────────┬─┴──────────────────────────────────┘
│
┌────────────┼────────────┐
│ │ │
┌────▼───┐ ┌───▼────┐ ┌───▼─────┐
│Supabase│ │ Stripe │ │ Resend │
│ │ │ │ │ │
│DB+Auth │ │Payments│ │ Emails │
└────────┘ └────────┘ └─────────┘

Phase 1 : Setup Infrastructure (3-4h)
1.1 Initialisation Projet
bash# Créer projet Next.js
npx create-next-app@latest spotnow \
 --typescript \
 --tailwind \
 --app \
 --eslint \
 --no-src-dir

cd spotnow

# Installer shadcn/ui

npx shadcn@latest init -d

# Installer composants UI de base

npx shadcn@latest add button card form input label select \
 badge dialog toast calendar popover table

# Installer dépendances

npm install @supabase/supabase-js @supabase/ssr stripe zod \
 react-hook-form @hookform/resolvers date-fns resend \
 @react-email/components

npm install -D @types/node
1.2 Configuration Environnement
.env.local :
bash# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxx

# Stripe

STRIPE_SECRET_KEY=sk_test_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Resend

RESEND_API_KEY=re_xxx

# App

NEXT_PUBLIC_APP_URL=http://localhost:3000
1.3 Setup Supabase Database
supabase/schema.sql :
sql-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Studios table
CREATE TABLE studios (
id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
email TEXT UNIQUE NOT NULL,
name TEXT NOT NULL,
address TEXT,
phone TEXT,
description TEXT,
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Courses table
CREATE TABLE courses (
id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
activity TEXT NOT NULL CHECK (activity IN ('yoga', 'pilates', 'hiit', 'barre', 'cycling')),
date DATE NOT NULL,
start_time TIME NOT NULL,
duration_minutes INTEGER NOT NULL DEFAULT 60,
places_total INTEGER NOT NULL CHECK (places_total > 0),
places_left INTEGER NOT NULL CHECK (places_left >= 0),
price_normal INTEGER NOT NULL CHECK (price_normal > 0), -- en centimes
price_app INTEGER NOT NULL CHECK (price_app > 0), -- en centimes
status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'completed', 'full')),
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW(),

-- Contraintes métier
CONSTRAINT valid_prices CHECK (price_app < price_normal),
CONSTRAINT valid_places CHECK (places_left <= places_total),
CONSTRAINT future_course CHECK (date >= CURRENT_DATE)
);

-- Reservations table
CREATE TABLE reservations (
id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
user_name TEXT NOT NULL,
user_email TEXT NOT NULL,
user_phone TEXT NOT NULL,
stripe_payment_id TEXT UNIQUE NOT NULL,
stripe_checkout_session_id TEXT UNIQUE,
amount_paid INTEGER NOT NULL, -- en centimes
status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed', 'no_show')),
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour performance
CREATE INDEX idx_courses_date ON courses(date);
CREATE INDEX idx_courses_studio_id ON courses(studio_id);
CREATE INDEX idx_courses_status ON courses(status);
CREATE INDEX idx_courses_date_status ON courses(date, status) WHERE status = 'active';
CREATE INDEX idx_reservations_course_id ON reservations(course_id);
CREATE INDEX idx_reservations_email ON reservations(user_email);
CREATE INDEX idx_reservations_stripe_payment ON reservations(stripe_payment_id);

-- Trigger pour updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
NEW.updated_at = NOW();
RETURN NEW;
END;

$$
LANGUAGE plpgsql;

CREATE TRIGGER update_studios_updated_at
  BEFORE UPDATE ON studios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_courses_updated_at
  BEFORE UPDATE ON courses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reservations_updated_at
  BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function pour décrémenter places atomiquement
CREATE OR REPLACE FUNCTION decrement_course_places(course_uuid UUID)
RETURNS TABLE(success BOOLEAN, places_remaining INTEGER) AS
$$

DECLARE
current_places INTEGER;
BEGIN
-- Lock la ligne pour éviter race conditions
SELECT places_left INTO current_places
FROM courses
WHERE id = course_uuid
FOR UPDATE;

IF current_places IS NULL THEN
RETURN QUERY SELECT FALSE, 0;
RETURN;
END IF;

IF current_places > 0 THEN
UPDATE courses
SET places_left = places_left - 1,
status = CASE WHEN places_left - 1 = 0 THEN 'full' ELSE status END
WHERE id = course_uuid;

    RETURN QUERY SELECT TRUE, current_places - 1;

ELSE
RETURN QUERY SELECT FALSE, 0;
END IF;
END;

$$
LANGUAGE plpgsql;

-- Row Level Security (RLS)
ALTER TABLE studios ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- Policies Studios
CREATE POLICY "Studios can view own data"
  ON studios FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Studios can update own data"
  ON studios FOR UPDATE
  USING (auth.uid() = id);

-- Policies Courses
CREATE POLICY "Public can view active courses"
  ON courses FOR SELECT
  USING (status = 'active' AND places_left > 0 AND date >= CURRENT_DATE);

CREATE POLICY "Studios can view own courses"
  ON courses FOR SELECT
  USING (auth.uid() = studio_id);

CREATE POLICY "Studios can insert own courses"
  ON courses FOR INSERT
  WITH CHECK (auth.uid() = studio_id);

CREATE POLICY "Studios can update own courses"
  ON courses FOR UPDATE
  USING (auth.uid() = studio_id);

CREATE POLICY "Studios can delete own courses"
  ON courses FOR DELETE
  USING (auth.uid() = studio_id);

-- Policies Reservations
CREATE POLICY "Studios can view reservations for their courses"
  ON reservations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = reservations.course_id
      AND courses.studio_id = auth.uid()
    )
  );

CREATE POLICY "Users can view own reservations"
  ON reservations FOR SELECT
  USING (user_email = auth.jwt() ->> 'email');

-- Service role peut tout faire (pour webhooks)
CREATE POLICY "Service role full access studios"
  ON studios FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access courses"
  ON courses FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access reservations"
  ON reservations FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
1.4 Types TypeScript (générer depuis Supabase)
lib/database.types.ts :
bash# Générer types depuis Supabase CLI
npx supabase gen types typescript --project-id "xxx" > lib/database.types.ts
Ou manuellement :
typescriptexport type Json =
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

Phase 2 : Configuration Libs & Utils (2-3h)
2.1 Supabase Client
lib/supabase/client.ts :
typescriptimport { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/lib/database.types'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
lib/supabase/server.ts :
typescriptimport { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from '@/lib/database.types'

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // Server Component - can't set cookies
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (error) {
            // Server Component - can't remove cookies
          }
        },
      },
    }
  )
}

export async function createServiceSupabaseClient() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get() { return undefined },
        set() {},
        remove() {},
      },
    }
  )
}
lib/supabase/middleware.ts :
typescriptimport { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  await supabase.auth.getUser()

  return response
}
2.2 Stripe Client
lib/stripe/client.ts :
typescriptimport { loadStripe, Stripe } from '@stripe/stripe-js'

let stripePromise: Promise<Stripe | null>

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = loadStripe(
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
    )
  }
  return stripePromise
}
lib/stripe/server.ts :
typescriptimport Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia',
  typescript: true,
})
2.3 Resend Client
lib/resend.ts :
typescriptimport { Resend } from 'resend'

export const resend = new Resend(process.env.RESEND_API_KEY!)
2.4 Utils & Helpers
lib/utils.ts : (déjà créé par shadcn, ajouter tes helpers)
typescriptimport { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format prix en centimes vers euros
export function formatPrice(priceInCents: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(priceInCents / 100)
}

// Calculer % de réduction
export function calculateDiscount(normalPrice: number, appPrice: number): number {
  return Math.round(((normalPrice - appPrice) / normalPrice) * 100)
}

// Format date
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'EEEE d MMMM yyyy', { locale: fr })
}

// Format heure
export function formatTime(time: string): string {
  return time.slice(0, 5) // HH:MM
}

// Combiner date + heure pour comparaison
export function getCourseDateTime(date: string, time: string): Date {
  return parseISO(`${date}T${time}`)
}

// Vérifier si cours commence bientôt (< 6h)
export function isCourseSoon(date: string, time: string): boolean {
  const courseDateTime = getCourseDateTime(date, time)
  const now = new Date()
  const diffHours = (courseDateTime.getTime() - now.getTime()) / (1000 * 60 * 60)
  return diffHours > 0 && diffHours <= 6
}

// Mapper activité vers label FR
export const ACTIVITY_LABELS: Record<string, string> = {
  yoga: 'Yoga',
  pilates: 'Pilates',
  hiit: 'HIIT',
  barre: 'Barre',
  cycling: 'Cycling',
}

// Mapper activité vers couleur badge
export const ACTIVITY_COLORS: Record<string, string> = {
  yoga: 'bg-purple-100 text-purple-800',
  pilates: 'bg-pink-100 text-pink-800',
  hiit: 'bg-orange-100 text-orange-800',
  barre: 'bg-blue-100 text-blue-800',
  cycling: 'bg-green-100 text-green-800',
}
lib/validations.ts :
typescriptimport { z } from 'zod'

// Validation formulaire réservation
export const reservationSchema = z.object({
  userName: z.string().min(2, 'Nom requis (min 2 caractères)'),
  userEmail: z.string().email('Email invalide'),
  userPhone: z.string().regex(/^(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}$/, 'Numéro de téléphone invalide'),
})

// Validation formulaire cours studio
export const courseSchema = z.object({
  activity: z.enum(['yoga', 'pilates', 'hiit', 'barre', 'cycling']),
  date: z.string().refine((date) => {
    const d = new Date(date)
    return d >= new Date(new Date().setHours(0, 0, 0, 0))
  }, 'La date doit être dans le futur'),
  startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Heure invalide (format HH:MM)'),
  durationMinutes: z.number().min(30).max(180),
  placesTotal: z.number().min(1).max(50),
  priceNormal: z.number().min(500).max(10000), // 5€ à 100€
  priceApp: z.number().min(300).max(5000), // 3€ à 50€
}).refine((data) => data.priceApp < data.priceNormal * 0.7, {
  message: 'Le prix app doit être au moins 30% inférieur au prix normal',
  path: ['priceApp'],
})

// Validation formulaire login studio
export const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Mot de passe requis (min 8 caractères)'),
})

// Validation formulaire signup studio
export const signupSchema = loginSchema.extend({
  name: z.string().min(2, 'Nom du studio requis'),
  address: z.string().optional(),
  phone: z.string().optional(),
})

Phase 3 : Composants UI Réutilisables (2-3h)
3.1 Course Card
components/course-card.tsx :
typescriptimport Link from 'next/link'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Clock, MapPin, Users } from 'lucide-react'
import { formatPrice, formatDate, formatTime, calculateDiscount, ACTIVITY_LABELS, ACTIVITY_COLORS } from '@/lib/utils'
import { Database } from '@/lib/database.types'

type Course = Database['public']['Tables']['courses']['Row'] & {
  studios: Pick<Database['public']['Tables']['studios']['Row'], 'name' | 'address'>
}

interface CourseCardProps {
  course: Course
}

export function CourseCard({ course }: CourseCardProps) {
  const discount = calculateDiscount(course.price_normal, course.price_app)

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <Badge className={ACTIVITY_COLORS[course.activity]}>
              {ACTIVITY_LABELS[course.activity]}
            </Badge>
            <h3 className="text-xl font-semibold mt-2">{course.studios.name}</h3>
          </div>
          <Badge variant="destructive" className="text-lg">
            -{discount}%
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        <div className="flex items-center text-sm text-muted-foreground">
          <Clock className="mr-2 h-4 w-4" />
          <span>{formatDate(course.date)} à {formatTime(course.start_time)}</span>
        </div>

        <div className="flex items-center text-sm text-muted-foreground">
          <MapPin className="mr-2 h-4 w-4" />
          <span>{course.studios.address || 'Adresse non renseignée'}</span>
        </div>

        <div className="flex items-center text-sm text-muted-foreground">
          <Users className="mr-2 h-4 w-4" />
          <span>{course.places_left} place{course.places_left > 1 ? 's' : ''} restante{course.places_left > 1 ? 's' : ''}</span>
        </div>

        <div className="pt-2">
          <span className="text-2xl font-bold">{formatPrice(course.price_app)}</span>
          <span className="text-sm text-muted-foreground line-through ml-2">
            {formatPrice(course.price_normal)}
          </span>
        </div>
      </CardContent>

      <CardFooter>
        <Button asChild className="w-full">
          <Link href={`/cours/${course.id}`}>
            Réserver maintenant
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}
3.2 Activity Filter
components/activity-filter.tsx :
typescript'use client'

import { Badge } from '@/components/ui/badge'
import { ACTIVITY_LABELS } from '@/lib/utils'

interface ActivityFilterProps {
  selected: string | null
  onSelect: (activity: string | null) => void
}

export function ActivityFilter({ selected, onSelect }: ActivityFilterProps) {
  const activities = ['yoga', 'pilates', 'hiit', 'barre', 'cycling']

  return (
    <div className="flex flex-wrap gap-2">
      <Badge
        variant={selected === null ? 'default' : 'outline'}
        className="cursor-pointer"
        onClick={() => onSelect(null)}
      >
        Tous
      </Badge>
      {activities.map((activity) => (
        <Badge
          key={activity}
          variant={selected === activity ? 'default' : 'outline'}
          className="cursor-pointer"
          onClick={() => onSelect(activity)}
        >
          {ACTIVITY_LABELS[activity]}
        </Badge>
      ))}
    </div>
  )
}
3.3 Loading Skeleton
components/course-card-skeleton.tsx :
typescriptimport { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function CourseCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-32" />
          </div>
          <Skeleton className="h-6 w-12" />
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-8 w-32 mt-2" />
      </CardContent>

      <CardFooter>
        <Skeleton className="h-10 w-full" />
      </CardFooter>
    </Card>
  </div>
  )
}

Phase 4 : Routes Publiques (4-5h)
4.1 Homepage
app/page.tsx :
typescriptimport { createServerSupabaseClient } from '@/lib/supabase/server'
import { CourseCard } from '@/components/course-card'
import { CourseCardSkeleton } from '@/components/course-card-skeleton'
import { Suspense } from 'react'

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

  return data
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
        <CourseCard key={course.id} course={course} />
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
          Réservez votre cours 2-6h avant et économisez jusqu'à 70%
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
4.2 Page Détail Cours
app/cours/[id]/page.tsx :
typescriptimport { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ReservationForm } from './reservation-form'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Clock, MapPin, Users, Calendar } from 'lucide-react'
import { formatPrice, formatDate, formatTime, calculateDiscount, ACTIVITY_LABELS } from '@/lib/utils'

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

  return data
}

export default async function CoursePage({ params }: { params: { id: string } }) {
  const course = await getCourse(params.id)

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
app/cours/[id]/reservation-form.tsx :
typescript'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { reservationSchema } from '@/lib/validations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { useToast } from '@/hooks/use-toast'
import { Loader2 } from 'lucide-react'

type FormData = z.infer<typeof reservationSchema>

interface ReservationFormProps {
  courseId: string
}

export function ReservationForm({ courseId }: ReservationFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const form = useForm<FormData>({
    resolver: zodResolver(reservationSchema),
    defaultValues: {
      userName: '',
      userEmail: '',
      userPhone: '',
    },
  })

  async function onSubmit(data: FormData) {
    setIsLoading(true)

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId,
          ...data,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Erreur lors de la création de la session')
      }

      // Rediriger vers Stripe Checkout
      window.location.href = result.url
    } catch (error) {
      console.error('Error:', error)
      toast({
        title: 'Erreur',
        description: error instanceof Error ? error.message : 'Une erreur est survenue',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="userName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nom complet</FormLabel>
              <FormControl>
                <Input placeholder="Jean Dupont" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="userEmail"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="jean@exemple.fr" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="userPhone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Téléphone</FormLabel>
              <FormControl>
                <Input type="tel" placeholder="06 12 34 56 78" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Procéder au paiement
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          Paiement sécurisé par Stripe. Vous serez redirigé vers la page de paiement.
        </p>
      </form>
    </Form>
  )
}
4.3 API Checkout
app/api/checkout/route.ts :
typescriptimport { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { stripe } from '@/lib/stripe/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { reservationSchema } from '@/lib/validations'

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

    if (course.status !== 'active' || course.places_left === 0) {
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
              name: `${course.activity.toUpperCase()} - ${course.studios.name}`,
              description: `${new Date(course.date).toLocaleDateString('fr-FR')} à ${course.start_time.slice(0, 5)}`,
            },
            unit_amount: course.price_app,
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
        { error: 'Données invalides', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Erreur lors de la création de la session de paiement' },
      { status: 500 }
    )
  }
}
4.4 Webhook Stripe
app/api/webhooks/stripe/route.ts :
typescriptimport { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe/server'
import { createServiceSupabaseClient } from '@/lib/supabase/server'
import { resend } from '@/lib/resend'
import { ConfirmationEmail } from '@/emails/confirmation'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const headersList = await headers()
  const signature = headersList.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (error) {
    console.error('Webhook signature verification failed:', error)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Handle checkout.session.completed
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session

    try {
      const supabase = await createServiceSupabaseClient()

      const { courseRéessayerPour exécuter du code, activez l'exécution de code et la création de fichiers dans Paramètres > Capacités.AContinuetypescript      const { courseId, userName, userEmail, userPhone } = session.metadata as {
        courseId: string
        userName: string
        userEmail: string
        userPhone: string
      }

      // Décrémenter les places atomiquement
      const { data: result, error: decrementError } = await supabase
        .rpc('decrement_course_places', { course_uuid: courseId })
        .single()

      if (decrementError || !result?.success) {
        console.error('Failed to decrement places:', decrementError)
        // TODO: Gérer le remboursement Stripe ici
        return NextResponse.json(
          { error: 'Failed to reserve spot' },
          { status: 500 }
        )
      }

      // Créer la réservation
      const { data: reservation, error: reservationError } = await supabase
        .from('reservations')
        .insert({
          course_id: courseId,
          user_name: userName,
          user_email: userEmail,
          user_phone: userPhone,
          stripe_payment_id: session.payment_intent as string,
          stripe_checkout_session_id: session.id,
          amount_paid: session.amount_total!,
          status: 'confirmed',
        })
        .select()
        .single()

      if (reservationError) {
        console.error('Failed to create reservation:', reservationError)
        return NextResponse.json(
          { error: 'Failed to create reservation' },
          { status: 500 }
        )
      }

      // Récupérer les détails du cours pour l'email
      const { data: course } = await supabase
        .from('courses')
        .select('*, studios(name, address, phone)')
        .eq('id', courseId)
        .single()

      if (course) {
        // Envoyer email de confirmation
        await resend.emails.send({
          from: 'SpotNow <noreply@spotnow.fr>',
          to: userEmail,
          subject: 'Confirmation de réservation - SpotNow',
          react: ConfirmationEmail({
            userName,
            course,
            reservation,
          }),
        })
      }

      return NextResponse.json({ received: true })
    } catch (error) {
      console.error('Error processing webhook:', error)
      return NextResponse.json(
        { error: 'Webhook processing failed' },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ received: true })
}
4.5 Page Confirmation
app/confirmation/page.tsx :
typescriptimport { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { formatPrice, formatDate, formatTime, ACTIVITY_LABELS } from '@/lib/utils'

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

  return data
}

async function ConfirmationContent({ sessionId }: { sessionId: string }) {
  const reservation = await getReservation(sessionId)

  if (!reservation) {
    notFound()
  }

  const { courses: course } = reservation

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
              <li>Apportez votre tenue de sport et une bouteille d'eau</li>
              <li>Montrez votre email de confirmation à l'accueil</li>
            </ul>
          </div>

          <div className="flex gap-4">
            <Button asChild className="flex-1">
              <Link href="/">Retour à l'accueil</Link>
            </Button>
            <Button asChild variant="outline" className="flex-1">
              <Link href="/mes-reservations">Mes réservations</Link>
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
4.6 Email Template
emails/confirmation.tsx :
typescriptimport {
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
              • Apportez votre tenue de sport et une bouteille d'eau<br />
              • Montrez cet email à l'accueil
            </Text>
          </Section>

          {course.studios.phone && (
            <Text style={text}>
              <strong>Contact du studio :</strong> {course.studios.phone}
            </Text>
          )}

          <Button style={button} href={`${process.env.NEXT_PUBLIC_APP_URL}/mes-reservations`}>
            Voir mes réservations
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

Phase 5 : Routes Studio (Dashboard) (5-6h)
5.1 Middleware & Auth
middleware.ts :
typescriptimport { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
app/studio/layout.tsx :
typescriptimport { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { StudioNav } from '@/components/studio-nav'

export default async function StudioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/studio/login')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <StudioNav />
      <main className="flex-1">
        {children}
      </main>
    </div>
  )
}
components/studio-nav.tsx :
typescript'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

export function StudioNav() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/studio/login')
    router.refresh()
  }

  const links = [
    { href: '/studio/dashboard', label: 'Mes cours' },
    { href: '/studio/nouveau-cours', label: 'Publier un cours' },
    { href: '/studio/stats', label: 'Statistiques' },
  ]

  return (
    <nav className="border-b bg-white">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href="/studio/dashboard" className="font-bold text-xl">
              SpotNow Studio
            </Link>

            <div className="flex gap-4">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "text-sm font-medium transition-colors hover:text-primary",
                    pathname === link.href
                      ? "text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <Button variant="ghost" onClick={handleSignOut}>
            Déconnexion
          </Button>
        </div>
      </div>
    </nav>
  )
}
5.2 Login Studio
app/studio/login/page.tsx :
typescriptimport { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { LoginForm } from './login-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function LoginPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    redirect('/studio/dashboard')
  }

  return (
    <div className="container mx-auto px-4 py-16 max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Connexion Studio</CardTitle>
          <CardDescription>
            Connectez-vous pour gérer vos cours
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  )
}
app/studio/login/login-form.tsx :
typescript'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { loginSchema } from '@/lib/validations'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { useToast } from '@/hooks/use-toast'
import { Loader2 } from 'lucide-react'

type FormData = z.infer<typeof loginSchema>

export function LoginForm() {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  const form = useForm<FormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  async function onSubmit(data: FormData) {
    setIsLoading(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })

      if (error) {
        throw error
      }

      router.push('/studio/dashboard')
      router.refresh()
    } catch (error) {
      console.error('Login error:', error)
      toast({
        title: 'Erreur de connexion',
        description: 'Email ou mot de passe incorrect',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="studio@exemple.fr" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mot de passe</FormLabel>
              <FormControl>
                <Input type="password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Se connecter
        </Button>
      </form>
    </Form>
  )
}
5.3 Dashboard Studio
app/studio/dashboard/page.tsx :
typescriptimport { createServerSupabaseClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CourseTable } from './course-table'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { PlusCircle } from 'lucide-react'

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

  return data.map(course => ({
    ...course,
    reservations_count: course.reservations.length
  }))
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

  const totalReservations = reservations?.length || 0
  const totalRevenue = reservations?.reduce((sum, r) => sum + r.amount_paid, 0) || 0

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
app/studio/dashboard/course-table.tsx :
typescript'use client'

import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Eye, XCircle } from 'lucide-react'
import { formatDate, formatTime, ACTIVITY_LABELS } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useRouter } from 'next/navigation'

interface Course {
  id: string
  activity: string
  date: string
  start_time: string
  places_total: number
  places_left: number
  status: string
  reservations_count: number
}

interface CourseTableProps {
  courses: Course[]
}

export function CourseTable({ courses }: CourseTableProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)

  async function cancelCourse(courseId: string) {
    setLoading(courseId)

    try {
      const response = await fetch(`/api/studio/courses/${courseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })

      if (!response.ok) {
        throw new Error('Erreur lors de l\'annulation')
      }

      toast({
        title: 'Cours annulé',
        description: 'Le cours a été annulé avec succès',
      })

      router.refresh()
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible d\'annuler le cours',
        variant: 'destructive',
      })
    } finally {
      setLoading(null)
    }
  }

  if (courses.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Aucun cours publié. Commencez par publier votre premier cours !
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Activité</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Heure</TableHead>
          <TableHead>Places</TableHead>
          <TableHead>Réservations</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {courses.map((course) => (
          <TableRow key={course.id}>
            <TableCell className="font-medium">
              {ACTIVITY_LABELS[course.activity]}
            </TableCell>
            <TableCell>{formatDate(course.date)}</TableCell>
            <TableCell>{formatTime(course.start_time)}</TableCell>
            <TableCell>
              {course.places_left} / {course.places_total}
            </TableCell>
            <TableCell>
              <Badge variant="secondary">{course.reservations_count}</Badge>
            </TableCell>
            <TableCell>
              <Badge
                variant={
                  course.status === 'active'
                    ? 'default'
                    : course.status === 'full'
                    ? 'secondary'
                    : 'destructive'
                }
              >
                {course.status === 'active' && 'Actif'}
                {course.status === 'full' && 'Complet'}
                {course.status === 'cancelled' && 'Annulé'}
                {course.status === 'completed' && 'Terminé'}
              </Badge>
            </TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-8 w-8 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => router.push(`/studio/cours/${course.id}`)}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Voir les réservations
                  </DropdownMenuItem>
                  {course.status === 'active' && (
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => cancelCourse(course.id)}
                      disabled={loading === course.id}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Annuler le cours
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
5.4 Publier un cours
app/studio/nouveau-cours/page.tsx :
typescriptimport { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CourseForm } from './course-form'

export default function NewCoursePage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Publier un nouveau cours</CardTitle>
          <CardDescription>
            Remplissez les informations pour publier votre cours
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CourseForm />
        </CardContent>
      </Card>
    </div>
  )
}
app/studio/nouveau-cours/course-form.tsx :
typescript'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { courseSchema } from '@/lib/validations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { useToast } from '@/hooks/use-toast'
import { Loader2 } from 'lucide-react'
import { ACTIVITY_LABELS } from '@/lib/utils'

type FormData = z.infer<typeof courseSchema>

export function CourseForm() {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  const form = useForm<FormData>({
    resolver: zodResolver(courseSchema),
    defaultValues: {
      activity: 'yoga',
      date: '',
      startTime: '',
      durationMinutes: 60,
      placesTotal: 10,
      priceNormal: 2500, // 25€
      priceApp: 1000, // 10€
    },
  })

  async function onSubmit(data: FormData) {
    setIsLoading(true)

    try {
      const response = await fetch('/api/studio/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Erreur lors de la création du cours')
      }

      toast({
        title: 'Cours publié !',
        description: 'Votre cours a été publié avec succès',
      })

      router.push('/studio/dashboard')
      router.refresh()
    } catch (error) {
      console.error('Error:', error)
      toast({
        title: 'Erreur',
        description: error instanceof Error ? error.message : 'Une erreur est survenue',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="activity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Activité *</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner une activité" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {Object.entries(ACTIVITY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date *</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="startTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Heure de début *</FormLabel>
                <FormControl>
                  <Input type="time" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="durationMinutes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Durée (minutes) *</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                  />
                </FormControl>
                <FormDescription>Entre 30 et 180 minutes</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="placesTotal"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre de places *</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                  />
                </FormControl>
                <FormDescription>Entre 1 et 50 places</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="priceNormal"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Prix normal (centimes) *</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="2500 (= 25€)"
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                  />
                </FormControl>
                <FormDescription>
                  Prix habituel en centimes (ex: 2500 = 25€)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="priceApp"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Prix sur l'app (centimes) *</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="1000 (= 10€)"
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                  />
                </FormControl>
                <FormDescription>
                  Prix réduit (-60% minimum recommandé)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Publier le cours
        </Button>
      </form>
    </Form>
  )
}
5.5 API Studio Courses
app/api/studio/courses/route.ts :
typescriptimport { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { courseSchema } from '@/lib/validations'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const validatedData = courseSchema.parse(body)

    const { data, error } = await supabase
      .from('courses')
      .insert({
        studio_id: user.id,
        activity: validatedData.activity,
        date: validatedData.date,
        start_time: validatedData.startTime,
        duration_minutes: validatedData.durationMinutes,
        places_total: validatedData.placesTotal,
        places_left: validatedData.placesTotal,
        price_normal: validatedData.priceNormal,
        price_app: validatedData.priceApp,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating course:', error)
      return NextResponse.json(
        { error: 'Erreur lors de la création du cours' },
        { status: 500 }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('API error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Données invalides', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
app/api/studio/courses/[id]/route.ts :
typescriptimport { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const { status } = body

    // Vérifier que le cours appartient bien au studio
    const { data: course } = await supabase
      .from('courses')
      .select('studio_id')
      .eq('id', params.id)
      .single()

    if (!course || course.studio_id !== user.id) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 403 }
      )
    }

    const { error } = await supabase
      .from('courses')
      .update({ status })
      .eq('id', params.id)

    if (error) {
      return NextResponse.json(
        { error: 'Erreur lors de la mise à jour' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

Phase 6 : Déploiement & Tests (2-3h)
6.1 Configuration Vercel
vercel.json :
json{
  "framework": "nextjs",
  "buildCommand": "next build",
  "devCommand": "next dev",
  "installCommand": "npm install",
  "regions": ["cdg1"]
}
6.2 Configuration Stripe Webhooks

Aller sur Stripe Dashboard → Developers → Webhooks
Ajouter endpoint : https://ton-domaine.vercel.app/api/webhooks/stripe
Sélectionner événement : checkout.session.completed
Copier le webhook secret dans .env.local et Vercel

6.3 Tests Critiques
Checklist pré-déploiement :
markdown## Flow Utilisateur
- [ ] Homepage charge et affiche les cours
- [ ] Filtres activités fonctionnent
- [ ] Page détail cours affiche toutes les infos
- [ ] Formulaire réservation valide correctement
- [ ] Redirection Stripe fonctionne
- [ ] Webhook Stripe crée la réservation
- [ ] Email confirmation envoyé
- [ ] Page confirmation affiche les bonnes infos
- [ ] Places décrémentes correctement

## Flow Studio
- [ ] Login/logout fonctionne
- [ ] Dashboard affiche les cours
- [ ] Stats correctes
- [ ] Formulaire création cours valide
- [ ] Cours créé apparaît dans la liste
- [ ] Annulation cours fonctionne
- [ ] RLS empêche accès cours autres studios

## Edge Cases
- [ ] Course complet ne peut plus être réservé
- [ ] Paiement échoué ne crée pas de réservation
- [ ] Double-clic ne crée pas 2 réservations
- [ ] Cours passé n'apparaît pas homepage
- [ ] Studio ne peut pas modifier cours autre studio
6.4 Scripts Utiles
package.json scripts :
json{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit",
    "test": "jest",
    "db:types": "npx supabase gen types typescript --project-id xxx > lib/database.types.ts"
  }
}

Bonnes Pratiques & Patterns
Architecture

Server Components par défaut : Fetch data côté serveur quand possible
Client Components : Seulement pour interactivité (forms, state)
Separation of Concerns : Libs, components, utils bien séparés
Type Safety : TypeScript strict, types générés depuis DB

Sécurité

RLS Supabase : Toutes les tables protégées
Auth vérifiée : Middleware + checks serveur
Validation : Zod schemas pour toutes les entrées
Env vars : Jamais de secrets dans le code
Webhook signature : Toujours vérifier Stripe

Performance

Server Components : Pas de JS client inutile
Images optimisées : Next Image component
Lazy loading : Suspense pour composants lourds
Index DB : Sur colonnes fréquemment requêtées
Edge Functions : Stripe webhooks près des users

UX

Loading states : Skeletons + spinners
Error handling : Toast notifications
Validation temps réel : React Hook Form
Responsive : Mobile-first Tailwind
Accessibility : shadcn composants accessibles


Livrables Attendus

Repository Git structuré avec :

Code source complet
README.md avec instructions setup
.env.example avec toutes les variables


App déployée sur Vercel :

URL production fonctionnelle
Variables d'environnement configurées
Webhooks Stripe connectés


Documentation technique :

Architecture overview
Schema database
API endpoints documentation
Guide déploiement


Tests manuels effectués :

Checklist complétée
Screenshots des flows principaux
Liste bugs connus (si applicable)
$$
