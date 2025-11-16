import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { courseSchema } from '@/lib/validations'
import { Database } from '@/lib/database.types'

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

    const courseInsert: Database['public']['Tables']['courses']['Insert'] = {
      studio_id: user.id,
      activity: validatedData.activity,
      date: validatedData.date,
      start_time: validatedData.startTime,
      duration_minutes: validatedData.durationMinutes,
      places_total: validatedData.placesTotal,
      places_left: validatedData.placesTotal,
      price_normal: validatedData.priceNormal,
      price_app: validatedData.priceApp,
    }

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - Supabase types limitation with insert
    const { data, error } = await supabase
      .from('courses')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(courseInsert as any)
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
        { error: 'Données invalides', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

