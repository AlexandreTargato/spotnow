import { z } from 'zod'

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

