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
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4">
            <motion.div
              className="glass-card w-full max-w-md flex flex-col max-h-[92dvh] sm:max-h-[90vh] overflow-hidden rounded-2xl sm:rounded-3xl shadow-2xl"
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {/* Header Fijo */}
              <div className="flex items-center justify-between border-b border-border/40 px-4 py-3 sm:px-6 sm:py-4 bg-card/95 dark:bg-card/90 backdrop-blur-xl shrink-0 z-10">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`p-2 rounded-xl shrink-0 ${
                    variant === 'destructive'
                      ? 'bg-red-500/10 text-red-500'
                      : 'bg-amber-500/10 text-amber-500'
                  }`}>
                    <AlertTriangle size={18} />
                  </div>
                  <h3 className="text-base font-bold text-[var(--foreground)] truncate">
                    {title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors shrink-0"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Contenido desplazable */}
              <div className="flex-1 min-h-0 overflow-y-auto scroll-modern p-4 sm:p-6">
                <p className="text-sm text-[var(--muted)] leading-relaxed">
                  {description}
                </p>
              </div>

              {/* Footer Fijo */}
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 border-t border-border/40 p-3 sm:p-4 bg-card/95 dark:bg-card/90 backdrop-blur-xl shrink-0 z-10">
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  disabled={loading}
                  className="w-full sm:w-auto"
                >
                  {cancelLabel}
                </GlassButton>
                <GlassButton
                  variant={variant === 'destructive' ? 'danger' : 'primary'}
                  size="sm"
                  loading={loading}
                  onClick={onConfirm}
                  className="w-full sm:w-auto"
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
