'use client'

import { cn } from '@/lib/utils'
import { type HTMLMotionProps, motion } from 'framer-motion'
import { forwardRef } from 'react'

type GlassCardVariant = 'default' | 'emerald' | 'indigo' | 'amber' | 'rose'

interface GlassCardProps extends HTMLMotionProps<'div'> {
  variant?: GlassCardVariant
  hover?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const variantClasses: Record<GlassCardVariant, string> = {
  default: '',
  emerald: 'glass-gradient-emerald',
  indigo:  'glass-gradient-indigo',
  amber:   'glass-gradient-amber',
  rose:    'glass-gradient-rose',
}

const paddingClasses = {
  none: '',
  sm:   'p-4',
  md:   'p-6',
  lg:   'p-8',
}

const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, variant = 'default', hover = true, padding = 'md', children, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={cn(
          'glass-card',
          variantClasses[variant],
          paddingClasses[padding],
          className
        )}
        whileHover={hover ? { y: -2 } : undefined}
        transition={{ duration: 0.15 }}
        {...props}
      >
        {children}
      </motion.div>
    )
  }
)

GlassCard.displayName = 'GlassCard'

export { GlassCard }
