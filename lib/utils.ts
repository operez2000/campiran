import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format currency in MXN */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(amount)
}

/** Format date in Spanish */
export function formatDate(date: string | Date): string {
  return format(new Date(date), 'dd/MM/yyyy', { locale: es })
}

/** Format date+time in Spanish */
export function formatDateTime(date: string | Date): string {
  return format(new Date(date), "dd/MM/yyyy 'a las' HH:mm", { locale: es })
}

/** Format relative time in Spanish ("hace 5 minutos") */
export function formatRelative(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: es })
}

/** Get initials from full name */
export function getInitials(name: string | null | undefined): string {
  if (!name) return '?'
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
}

/** Truncate text */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

/** Calculate tax amount */
export function calcTax(price: number, taxRate: number): number {
  return price * (taxRate / 100)
}

/** Get item price by price list number */
export function getItemPrice(
  item: { price1?: number | null; price2?: number | null; price3?: number | null; price?: number | null },
  priceList: 1 | 2 | 3
): number {
  const prices = { 1: item.price1, 2: item.price2, 3: item.price3 }
  return prices[priceList] ?? item.price ?? 0
}

/** Role label in Spanish */
export function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    ADMIN: 'Administrador',
    MANAGER: 'Gerente',
    CASHIER: 'Cajero',
    ALMACENISTA: 'Almacenista',
    PENDING: 'Pendiente',
  }
  return labels[role] ?? role
}
