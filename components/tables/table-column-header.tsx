'use client'

import React from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SortDirection = 'asc' | 'desc'

interface TableColumnHeaderProps
  extends Omit<React.ThHTMLAttributes<HTMLTableCellElement>, 'title'> {
  title?: React.ReactNode
  sortKey?: string
  currentSortKey?: string | null
  sortDirection?: SortDirection
  onSort?: (key: string) => void
  align?: 'left' | 'center' | 'right'
  className?: string
}

export function TableColumnHeader({
  title,
  sortKey,
  currentSortKey,
  sortDirection = 'asc',
  onSort,
  align = 'left',
  className,
  children,
  ...props
}: TableColumnHeaderProps) {
  const isSorted = !!(sortKey && currentSortKey === sortKey)
  const isClickable = !!(sortKey && onSort)

  const alignClass =
    align === 'center'
      ? 'text-center justify-center'
      : align === 'right'
      ? 'text-right justify-end'
      : 'text-left justify-start'

  return (
    <th
      className={cn(
        'px-4 py-3.5 select-none transition-colors sticky top-0 z-20 bg-card/95 backdrop-blur-md',
        isClickable && 'cursor-pointer group hover:bg-white/[0.04]',
        align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left',
        className
      )}
      onClick={isClickable ? () => onSort(sortKey) : undefined}
      {...props}
    >
      <div className={cn('inline-flex items-center gap-1.5 font-semibold', alignClass)}>
        <span
          className={cn(
            'transition-colors',
            isSorted ? 'text-emerald-400 font-bold' : 'group-hover:text-foreground'
          )}
        >
          {title || children}
        </span>

        {isClickable && (
          <span
            className={cn(
              'shrink-0 transition-all rounded p-0.5',
              isSorted
                ? 'text-emerald-400 bg-emerald-500/10'
                : 'text-muted-foreground/40 group-hover:text-muted-foreground'
            )}
            title={
              isSorted
                ? `Ordenado ${sortDirection === 'asc' ? 'ascendente' : 'descendente'}`
                : 'Ordenar columna'
            }
          >
            {isSorted ? (
              sortDirection === 'asc' ? (
                <ArrowUp size={13} className="stroke-[2.5]" />
              ) : (
                <ArrowDown size={13} className="stroke-[2.5]" />
              )
            ) : (
              <ArrowUpDown size={13} />
            )}
          </span>
        )}
      </div>
    </th>
  )
}
