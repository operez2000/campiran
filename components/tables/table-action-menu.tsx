'use client'

import React from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { MoreVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TableActionItem {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  variant?: 'default' | 'danger' | 'warning' | 'primary' | 'indigo'
  disabled?: boolean
  separatorBefore?: boolean
}

interface TableActionMenuProps {
  items: TableActionItem[]
  align?: 'start' | 'center' | 'end'
  triggerAriaLabel?: string
}

export function TableActionMenu({
  items,
  align = 'end',
  triggerAriaLabel = 'Abrir menú de acciones',
}: TableActionMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={triggerAriaLabel}
          className="w-8 h-8 inline-flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/10 dark:hover:bg-white/10 border border-transparent hover:border-border/50 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        >
          <MoreVertical size={16} />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          className="z-50 min-w-[170px] overflow-hidden rounded-2xl border border-border/60 bg-card/95 p-1.5 text-foreground shadow-2xl backdrop-blur-2xl animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 duration-150"
        >
          {items.map((item, index) => {
            const isDanger = item.variant === 'danger'
            const isPrimary = item.variant === 'primary'
            const isIndigo = item.variant === 'indigo'
            const isWarning = item.variant === 'warning'

            return (
              <React.Fragment key={index}>
                {item.separatorBefore && (
                  <DropdownMenu.Separator className="my-1 h-px bg-border/40" />
                )}
                <DropdownMenu.Item
                  disabled={item.disabled}
                  onSelect={(e) => {
                    e.preventDefault()
                    item.onClick()
                  }}
                  className={cn(
                    'relative flex cursor-pointer select-none items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
                    !item.variant || item.variant === 'default'
                      ? 'text-foreground hover:bg-white/10 dark:hover:bg-white/10 hover:text-emerald-400 focus:bg-white/10 focus:text-emerald-400'
                      : '',
                    isPrimary
                      ? 'text-emerald-400 hover:bg-emerald-500/15 focus:bg-emerald-500/15'
                      : '',
                    isIndigo
                      ? 'text-indigo-400 hover:bg-indigo-500/15 focus:bg-indigo-500/15'
                      : '',
                    isWarning
                      ? 'text-amber-400 hover:bg-amber-500/15 focus:bg-amber-500/15'
                      : '',
                    isDanger
                      ? 'text-rose-400 hover:bg-rose-500/15 focus:bg-rose-500/15'
                      : ''
                  )}
                >
                  {item.icon && (
                    <span className="shrink-0 text-current [&>svg]:size-4">
                      {item.icon}
                    </span>
                  )}
                  <span>{item.label}</span>
                </DropdownMenu.Item>
              </React.Fragment>
            )
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
