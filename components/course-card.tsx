import Link from 'next/link'
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

