'use client'

import { Badge } from '@/components/ui/badge'
import { ACTIVITY_LABELS } from '@/lib/utils'

interface ActivityFilterProps {
  selected: string | null
  onSelect: (activity: string | null) => void
}

export function ActivityFilter({ selected, onSelect }: ActivityFilterProps) {
  const activities = ['yoga', 'pilates', 'hiit', 'barre', 'cycling']

  return (
    <div className="flex flex-wrap gap-2">
      <Badge
        variant={selected === null ? 'default' : 'outline'}
        className="cursor-pointer"
        onClick={() => onSelect(null)}
      >
        Tous
      </Badge>
      {activities.map((activity) => (
        <Badge
          key={activity}
          variant={selected === activity ? 'default' : 'outline'}
          className="cursor-pointer"
          onClick={() => onSelect(activity)}
        >
          {ACTIVITY_LABELS[activity]}
        </Badge>
      ))}
    </div>
  )
}

