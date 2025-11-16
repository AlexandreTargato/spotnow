import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { Database } from '@/lib/database.types'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id } = await params

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
      .eq('id', id)
      .single()

    const courseData = course as unknown as Pick<Database['public']['Tables']['courses']['Row'], 'studio_id'> | null

    if (!courseData || courseData.studio_id !== user.id) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 403 }
      )
    }

    const courseUpdate: Database['public']['Tables']['courses']['Update'] = {
      status: status as Database['public']['Tables']['courses']['Update']['status']
    }

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - Supabase types limitation with update
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('courses')
      .update(courseUpdate)
      .eq('id', id)

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

