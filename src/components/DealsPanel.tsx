import { Link } from '@tanstack/react-router'
import type { listDeals } from '#/features/deals/server'
import { Card, CardHeader } from './Card'
import { EmptyState } from './EmptyState'
import { Money } from './Money'
import { TagChip } from './TagChip'

import { IconBriefcase } from './icons-invoice'

type DealRows = Awaited<ReturnType<typeof listDeals>>['rows']

/** Deals linked to a contact or company, newest first. */
export function DealsPanel({ deals, total }: { deals: DealRows; total: number }) {
  return (
    <Card>
      <CardHeader title="Deals" description={total ? `${total} ${total === 1 ? 'deal' : 'deals'}` : undefined} />
      {deals.length === 0 ? (
        <EmptyState icon={<IconBriefcase size={18} />} title="No deals yet" />
      ) : (
        <ul className="divide-y divide-border">
          {deals.map((d) => (
            <li key={d.id} className="relative px-4 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <Link to="/app/deals/$dealId" params={{ dealId: d.id }} className="min-w-0 text-sm font-medium break-words after:absolute after:inset-0 hover:underline">
                  {d.title}
                </Link>
                <Money minor={d.valueMinor} currency={d.currency} className="shrink-0 text-sm" />
              </div>
              <div className="mt-1">
                <TagChip tag={{ id: d.stageId, name: d.stageName, color: d.stageColor }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
