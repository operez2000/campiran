'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, Printer } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ConfiguracionTabs() {
  const pathname = usePathname()
  const isEmpresa = pathname.startsWith('/configuracion/empresa')
  const isImpresoras = pathname.startsWith('/configuracion/impresoras')

  return (
    <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md w-fit mb-6">
      <Link
        href="/configuracion/empresa"
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all',
          isEmpresa
            ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
            : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
        )}
      >
        <Building2 size={15} />
        <span>Datos de la Empresa (Global)</span>
      </Link>
      <Link
        href="/configuracion/impresoras"
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all',
          isImpresoras
            ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
            : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
        )}
      >
        <Printer size={15} />
        <span>Impresoras de Recibos (Por Sucursal)</span>
      </Link>
    </div>
  )
}
