'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { type UserRole } from '@/lib/types'
import {
  ShoppingCart, Package, Grid3X3, Users, Truck,
  BarChart3, Settings, ChevronRight, ScanLine, ArrowLeftRight,
  Boxes, Store, UserCog, Tags, Layers, Building2, MapPin
} from 'lucide-react'

interface SubNavItem {
  label: string
  href: string
  icon?: React.ReactNode
}

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  roles: UserRole[]
  children?: SubNavItem[]
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Punto de Venta',
    href: '/pos',
    icon: <ShoppingCart size={18} />,
    roles: ['ADMIN', 'MANAGER', 'CASHIER'],
  },
  {
    label: 'Inventario',
    href: '/inventario',
    icon: <Package size={18} />,
    roles: ['ADMIN', 'MANAGER', 'ALMACENISTA'],
    children: [
      { label: 'Stock Actual', href: '/inventario', icon: <Boxes size={15} /> },
      { label: 'Captura (Físico)', href: '/inventario/fisico', icon: <ScanLine size={15} /> },
      { label: 'Movimientos', href: '/inventario/movimientos', icon: <ArrowLeftRight size={15} /> },
    ],
  },
  {
    label: 'Catálogo',
    href: '/catalogo/items',
    icon: <Grid3X3 size={18} />,
    roles: ['ADMIN', 'MANAGER', 'ALMACENISTA'],
    children: [
      { label: 'Artículos', href: '/catalogo/items', icon: <Tags size={15} /> },
      { label: 'Categorías', href: '/catalogo/categorias', icon: <Layers size={15} /> },
      { label: 'Áreas', href: '/catalogo/areas', icon: <Building2 size={15} /> },
      { label: 'Departamentos', href: '/catalogo/departamentos', icon: <Building2 size={15} /> },
      { label: 'Ubicaciones', href: '/catalogo/ubicaciones', icon: <MapPin size={15} /> },
    ],
  },
  {
    label: 'Clientes',
    href: '/clientes',
    icon: <Users size={18} />,
    roles: ['ADMIN', 'MANAGER', 'CASHIER'],
  },
  {
    label: 'Proveedores',
    href: '/proveedores',
    icon: <Truck size={18} />,
    roles: ['ADMIN', 'MANAGER'],
  },
  {
    label: 'Reportes',
    href: '/reportes',
    icon: <BarChart3 size={18} />,
    roles: ['ADMIN', 'MANAGER'],
  },
  {
    label: 'Administración',
    href: '/admin/tiendas',
    icon: <Settings size={18} />,
    roles: ['ADMIN'],
    children: [
      { label: 'Sucursales', href: '/admin/tiendas', icon: <Store size={15} /> },
      { label: 'Usuarios y Roles', href: '/admin/usuarios', icon: <UserCog size={15} /> },
    ],
  },
]

interface SidebarNavProps {
  role: UserRole
  onNavigate?: () => void
}

export function SidebarNav({ role, onNavigate }: SidebarNavProps) {
  const pathname = usePathname()
  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role))

  // Auto-expand sections whose children match the current URL
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    visibleItems.forEach((item) => {
      if (item.children) {
        const matchesChild = item.children.some((c) =>
          c.href === '/inventario' ? pathname === '/inventario' : pathname.startsWith(c.href)
        )
        if (matchesChild || pathname.startsWith(item.href)) {
          initial[item.label] = true
        }
      }
    })
    return initial
  })

  const toggleSection = (label: string) => {
    setOpenSections((prev) => ({ ...prev, [label]: !prev[label] }))
  }

  return (
    <nav className="flex flex-col gap-1 px-3 py-4">
      {visibleItems.map((item, i) => {
        const hasChildren = Boolean(item.children && item.children.length > 0)
        const isSectionActive =
          pathname === item.href ||
          (item.href !== '/' && pathname.startsWith(item.href.split('/').slice(0, 2).join('/')))
        const isOpen = Boolean(openSections[item.label])

        return (
          <motion.div
            key={item.href}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03, duration: 0.2 }}
            className="flex flex-col"
          >
            {hasChildren ? (
              <div>
                <button
                  type="button"
                  onClick={() => toggleSection(item.label)}
                  className={cn(
                    'sidebar-nav-item w-full justify-between group',
                    isSectionActive && 'text-emerald-500 font-semibold'
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    {item.icon}
                    <span>{item.label}</span>
                  </div>
                  <ChevronRight
                    size={14}
                    className={cn(
                      'text-muted-foreground/60 transition-transform duration-200',
                      isOpen && 'rotate-90'
                    )}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                      className="overflow-hidden pl-5 pr-1 py-0.5 flex flex-col gap-0.5 border-l border-white/10 ml-3.5 my-1"
                    >
                      {item.children!.map((sub) => {
                        const isSubActive =
                          sub.href === '/inventario'
                            ? pathname === '/inventario'
                            : pathname.startsWith(sub.href)

                        return (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            onClick={onNavigate}
                            className={cn(
                              'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all text-muted-foreground hover:text-foreground hover:bg-white/5',
                              isSubActive && 'bg-emerald-500/15 text-emerald-500 font-medium'
                            )}
                          >
                            {sub.icon}
                            <span>{sub.label}</span>
                            {isSubActive && (
                              <div className="ml-auto w-1 h-1 rounded-full bg-emerald-500" />
                            )}
                          </Link>
                        )
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <Link
                href={item.href}
                onClick={onNavigate}
                className={cn('sidebar-nav-item', isSectionActive && 'active')}
              >
                {item.icon}
                <span>{item.label}</span>
                {isSectionActive && (
                  <motion.div
                    layoutId="nav-active-dot"
                    className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500"
                  />
                )}
              </Link>
            )}
          </motion.div>
        )
      })}
    </nav>
  )
}
