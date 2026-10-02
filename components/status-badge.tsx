'use client'

import { cn } from '@/lib/utils'

type StatusType =
  | 'active' | 'inactive' | 'pending'
  | 'A' | 'I'         // legacy char status
  | 'open' | 'closed'
  | 'low' | 'ok' | 'critical'
  | 'ADMIN' | 'MANAGER' | 'CASHIER' | 'ALMACENISTA' | 'PENDING'
  | string

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  // Profile status
  active:      { label: 'Activo',       className: 'badge-active' },
  inactive:    { label: 'Inactivo',     className: 'badge-inactive' },
  pending:     { label: 'Pendiente',    className: 'badge-pending' },
  // Legacy char
  A:           { label: 'Activo',       className: 'badge-active' },
  I:           { label: 'Inactivo',     className: 'badge-inactive' },
  // Session
  open:        { label: 'Abierta',      className: 'badge-info' },
  closed:      { label: 'Cerrada',      className: 'badge-inactive' },
  // Stock level
  ok:          { label: 'Normal',       className: 'badge-active' },
  low:         { label: 'Bajo mínimo',  className: 'badge-warning' },
  critical:    { label: 'Crítico',      className: 'badge-error' },
  // Roles
  ADMIN:       { label: 'Admin',        className: 'badge-info' },
  MANAGER:     { label: 'Gerente',      className: 'badge-info' },
  CASHIER:     { label: 'Cajero',       className: 'badge-active' },
  ALMACENISTA: { label: 'Almacenista',  className: 'badge-active' },
  PENDING:     { label: 'Pendiente',    className: 'badge-pending' },
}

interface StatusBadgeProps {
  status: StatusType
  className?: string
  customLabel?: string
}

export function StatusBadge({ status, className, customLabel }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: 'badge-info' }

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        config.className,
        className
      )}
    >
      {customLabel ?? config.label}
    </span>
  )
}
