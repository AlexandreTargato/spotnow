'use client'

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

