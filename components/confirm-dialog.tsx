'use client'

import { GlassButton } from '@/components/glass-button'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, X } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'destructive'
  loading?: boolean
  onConfirm: () => void
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
          />

          {/* Dialog */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              className="glass-card w-full max-w-md p-6 relative"
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {/* Close button */}
              <button
                onClick={() => onOpenChange(false)}
                className="absolute top-4 right-4 p-1.5 rounded-lg btn-ghost text-[var(--muted)]"
              >
                <X size={16} />
              </button>

              {/* Icon */}
              <div className={`mb-4 inline-flex p-3 rounded-2xl ${
                variant === 'destructive'
                  ? 'bg-red-500/10 text-red-500'
                  : 'bg-amber-500/10 text-amber-500'
              }`}>
                <AlertTriangle size={22} />
              </div>

              <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">
                {title}
              </h3>
              <p className="text-sm text-[var(--muted)] mb-6">
                {description}
              </p>

              <div className="flex gap-3 justify-end">
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  disabled={loading}
                >
                  {cancelLabel}
                </GlassButton>
                <GlassButton
                  variant={variant === 'destructive' ? 'danger' : 'primary'}
                  size="sm"
                  loading={loading}
                  onClick={onConfirm}
                >
                  {confirmLabel}
                </GlassButton>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
