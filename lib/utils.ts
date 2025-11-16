import { type ClassValue, clsx } from "clsx"
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
