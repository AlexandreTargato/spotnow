import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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

