import { redirect } from 'next/navigation'
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

