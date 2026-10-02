'use client'

import { cn } from '@/lib/utils'
import { forwardRef, type InputHTMLAttributes } from 'react'

interface GlassInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
  iconRight?: React.ReactNode
}

const GlassInput = forwardRef<HTMLInputElement, GlassInputProps>(
  ({ className, label, error, icon, iconRight, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-[var(--foreground)] opacity-80"
          >
            {label}
          </label>
        )}
        <div className={cn('glass-input flex items-center', error && 'border-red-500/60')}>
          {icon && (
            <span className="pl-3 pr-2 flex-shrink-0 text-[var(--muted)]">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'flex-1 bg-transparent py-2.5 text-sm text-[var(--foreground)]',
              'placeholder:text-[var(--muted)] outline-none',
              icon ? 'pl-1 pr-3' : 'px-3',
              iconRight && 'pr-1',
              className
            )}
            {...props}
          />
          {iconRight && (
            <span className="pr-3 pl-2 flex-shrink-0 text-[var(--muted)]">
              {iconRight}
            </span>
          )}
        </div>
        {error && (
          <p className="text-xs text-red-500 mt-0.5">{error}</p>
        )}
      </div>
    )
  }
)

GlassInput.displayName = 'GlassInput'

export { GlassInput }
