'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Boxes, ScanLine, ArrowLeftRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { label: 'Stock Actual', href: '/inventario', icon: <Boxes size={15} /> },
  { label: 'Captura (Físico)', href: '/inventario/fisico', icon: <ScanLine size={15} /> },
  { label: 'Movimientos', href: '/inventario/movimientos', icon: <ArrowLeftRight size={15} /> },
]

export function InventarioTabs() {
  const pathname = usePathname()

  return (
    <div className="flex items-center gap-1.5 p-1 glass rounded-2xl w-fit mb-6">
      {TABS.map((tab) => {
        const isActive =
          tab.href === '/inventario'
            ? pathname === '/inventario'
            : pathname.startsWith(tab.href)

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200',
              isActive
                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            )}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </Link>
        )
      })}
    </div>
  )
}
