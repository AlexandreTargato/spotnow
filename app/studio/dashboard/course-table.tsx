'use client'

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
import { MoreHorizontal, XCircle } from 'lucide-react'
import { formatDate, formatTime, ACTIVITY_LABELS } from '@/lib/utils'
import { toast } from 'sonner'
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

      toast.success('Cours annulé', {
        description: 'Le cours a été annulé avec succès',
      })

      router.refresh()
    } catch {
      toast.error('Erreur', {
        description: 'Impossible d\'annuler le cours',
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

