'use client'

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
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { ACTIVITY_LABELS } from '@/lib/utils'

type FormData = z.infer<typeof courseSchema>

export function CourseForm() {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

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

      toast.success('Cours publié !', {
        description: 'Votre cours a été publié avec succès',
      })

      router.push('/studio/dashboard')
      router.refresh()
    } catch (error) {
      console.error('Error:', error)
      toast.error('Erreur', {
        description: error instanceof Error ? error.message : 'Une erreur est survenue',
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
                <FormLabel>Prix sur l&apos;app (centimes) *</FormLabel>
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

