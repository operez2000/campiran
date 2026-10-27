'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { type CashShift, type Profile } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { authenticateWebAuthn, isWebAuthnAvailable } from '@/lib/webauthn'
import { FaceCameraModal } from '@/components/biometrics/face-camera-modal'
import { getUserBiometricsAction } from '@/app/(dashboard)/admin/usuarios/actions'
import { openShiftAction } from '@/app/(dashboard)/pos/shift-actions'
import { toast } from 'sonner'
import {
  Store, Fingerprint, ScanFace, KeyRound, CheckCircle2,
  AlertCircle, DollarSign, Banknote, RefreshCw, Lock, ShieldCheck
} from 'lucide-react'

interface ShiftOpenModalProps {
  open: boolean
  storeId: string
  storeName: string
  user: Profile | null
  onShiftOpened: (shift: CashShift) => void
}

export function ShiftOpenModal({
  open,
  storeId,
  storeName,
  user,
  onShiftOpened,
}: ShiftOpenModalProps) {
  // Step 1: Biometrics, Step 2: Initial Cash Amounts
  const [step, setStep] = useState<'auth' | 'cash'>('auth')
  const [authSuccess, setAuthSuccess] = useState(false)
  const [authMethodUsed, setAuthMethodUsed] = useState<'webauthn' | 'face' | 'pin'>('webauthn')

  // Amounts
  const [exchangeRate, setExchangeRate] = useState<string>('19.00')
  const [initialCashMxn, setInitialCashMxn] = useState<string>('1000')
  const [initialCashUsd, setInitialCashUsd] = useState<string>('50')
  const [notes, setNotes] = useState<string>('')

  // Sub-modals & Verification
  const [faceCameraOpen, setFaceCameraOpen] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // User credentials from backend
  const [userPin, setUserPin] = useState<string | null>(null)
  const [hasWebAuthn, setHasWebAuthn] = useState(false)
  const [hasFace, setHasFace] = useState(false)
  const [webAuthnSupported, setWebAuthnSupported] = useState(false)

  useEffect(() => {
    isWebAuthnAvailable().then(setWebAuthnSupported)
  }, [])

  useEffect(() => {
    if (!open || !user) return
    setStep('auth')
    setAuthSuccess(false)
    setPinInput('')

    getUserBiometricsAction(user.id).then((bio) => {
      if (bio) {
        setUserPin(bio.cashier_pin)
        setHasWebAuthn(Boolean(bio.has_webauthn))
        setHasFace(Boolean(bio.has_face))
      }
    })
  }, [open, user])

  // Verify via WebAuthn (Touch ID / Face ID)
  const handleVerifyWebAuthn = async () => {
    setVerifying(true)
    try {
      const ok = await authenticateWebAuthn()
      if (ok) {
        setAuthSuccess(true)
        setAuthMethodUsed('webauthn')
        setStep('cash')
        toast.success('¡Identidad verificada con sensor biométrico!')
      } else {
        toast.error('No se pudo verificar la credencial biométrica')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error en autenticación biométrica'
      toast.error(msg)
    } finally {
      setVerifying(false)
    }
  }

  // Verify via Face Camera
  const handleFaceVerified = (_dataUrl: string) => {
    setAuthSuccess(true)
    setAuthMethodUsed('face')
    setStep('cash')
    toast.success('¡Rostro detectado y validado exitosamente!')
  }

  // Verify via PIN
  const handleVerifyPin = () => {
    if (!pinInput.trim()) {
      toast.error('Ingresa tu PIN de cajero')
      return
    }
    // Si el usuario configuró PIN, validarlo; de lo contrario aceptar PIN de 4+ dígitos como fallback
    if (userPin && pinInput !== userPin) {
      toast.error('PIN incorrecto. Intenta nuevamente.')
      return
    }
    setAuthSuccess(true)
    setAuthMethodUsed('pin')
    setStep('cash')
    toast.success('¡PIN validado correctamente!')
  }

  // Calculate total initial value in MXN
  const totalInitialMxn =
    (Number(initialCashMxn) || 0) + (Number(initialCashUsd) || 0) * (Number(exchangeRate) || 19.0)

  // Open Shift Submit
  const handleOpenShift = async () => {
    if (!storeId || !user) {
      toast.error('Falta sucursal o cajero activo')
      return
    }

    setSubmitting(true)
    try {
      const newShift = await openShiftAction({
        storeId,
        userId: user.id,
        initialCashMxn: Number(initialCashMxn) || 0,
        initialCashUsd: Number(initialCashUsd) || 0,
        exchangeRate: Number(exchangeRate) || 19.0,
        authMethod: authMethodUsed,
        notes: notes.trim() || undefined,
      })

      toast.success('¡Caja abierta exitosamente! Buen turno.')
      onShiftOpened(newShift)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al abrir la caja'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 15 }}
              className="glass-card border-border/50 rounded-2xl sm:rounded-3xl max-w-lg w-full relative overflow-hidden shadow-2xl max-h-[92dvh] sm:max-h-[90vh] flex flex-col"
            >
              {/* Header Fijo */}
              <div className="flex items-center gap-3 border-b border-border/40 px-4 py-3 sm:px-6 sm:py-4 bg-card/95 dark:bg-card/90 backdrop-blur-xl shrink-0 z-10">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/25 shrink-0">
                  <Lock size={20} />
                </div>
                <div className="min-w-0 pr-2">
                  <h3 className="text-sm sm:text-base font-bold text-foreground truncate">
                    Apertura de Caja y Jornada
                  </h3>
                  <p className="text-[11px] text-muted-foreground truncate">
                    Sucursal: <span className="font-semibold text-emerald-400">{storeName}</span> · Cajero:{' '}
                    <span className="font-semibold text-foreground">{user?.full_name || user?.email}</span>
                  </p>
                </div>
              </div>

              {/* Cuerpo desplazable */}
              <div className="flex-1 min-h-0 overflow-y-auto scroll-modern p-4 sm:p-6 space-y-4">
                {step === 'auth' ? (
                /* PASO 1: Validación Biométrica */
                <div className="space-y-4">
                  <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-start gap-2.5">
                    <ShieldCheck size={18} className="shrink-0 text-emerald-400 mt-0.5" />
                    <div>
                      <p className="font-bold text-foreground">Verificación Biométrica Requerida</p>
                      <p className="text-muted-foreground mt-0.5 text-[11px]">
                        Para iniciar tu jornada laboral y habilitar el cobro en el POS, valida tu identidad con cualquiera de los siguientes métodos.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Opción 1: WebAuthn Face / Touch ID */}
                    <button
                      type="button"
                      disabled={verifying}
                      onClick={handleVerifyWebAuthn}
                      className="p-4 rounded-2xl glass-card border border-border/40 hover:border-emerald-500/50 hover:bg-emerald-500/10 text-left transition-all flex flex-col justify-between group"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Fingerprint size={22} />
                        </div>
                        {hasWebAuthn && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
                            Enrolado
                          </span>
                        )}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-foreground group-hover:text-emerald-400 transition-colors">
                          Touch ID / Face ID
                        </h4>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Sensor biométrico del hardware
                        </p>
                      </div>
                    </button>

                    {/* Opción 2: Face Detection con Cámara */}
                    <button
                      type="button"
                      disabled={verifying}
                      onClick={() => setFaceCameraOpen(true)}
                      className="p-4 rounded-2xl glass-card border border-border/40 hover:border-emerald-500/50 hover:bg-emerald-500/10 text-left transition-all flex flex-col justify-between group"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <ScanFace size={22} />
                        </div>
                        {hasFace && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
                            Registrado
                          </span>
                        )}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-foreground group-hover:text-emerald-400 transition-colors">
                          Escanear Rostro
                        </h4>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Detección facial con cámara web
                        </p>
                      </div>
                    </button>
                  </div>

                  {/* Opción 3: PIN de respaldo */}
                  <GlassCard padding="sm" className="space-y-2 mt-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                      <KeyRound size={15} className="text-emerald-400" />
                      <span>PIN de Seguridad de Respaldo</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <GlassInput
                        type="password"
                        maxLength={6}
                        placeholder="••••"
                        value={pinInput}
                        onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                        onKeyDown={(e) => e.key === 'Enter' && handleVerifyPin()}
                        className="text-center font-mono tracking-widest text-sm py-2"
                      />
                      <GlassButton
                        variant="secondary"
                        size="sm"
                        onClick={handleVerifyPin}
                        disabled={pinInput.length < 4}
                      >
                        Validar PIN
                      </GlassButton>
                    </div>
                  </GlassCard>
                </div>
              ) : (
                /* PASO 2: Fondo de Caja Bimoneda (Pesos MXN y Dólares USD) */
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                      <CheckCircle2 size={16} />
                      <span>Identidad Validada ({authMethodUsed.toUpperCase()})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep('auth')}
                      className="text-[11px] text-emerald-400/80 hover:text-emerald-300 underline"
                    >
                      Cambiar
                    </button>
                  </div>

                  {/* Tipo de Cambio Configurable */}
                  <div className="p-3 rounded-2xl glass-card flex items-center justify-between gap-3">
                    <div>
                      <span className="text-[11px] font-semibold text-muted-foreground block">
                        Tipo de Cambio Oficial (USD → MXN)
                      </span>
                      <span className="text-[10px] text-muted-foreground/70">
                        Frontera Baja California
                      </span>
                    </div>
                    <div className="w-32">
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          $
                        </span>
                        <input
                          type="number"
                          step="0.05"
                          value={exchangeRate}
                          onChange={(e) => setExchangeRate(e.target.value)}
                          className="glass-input w-full pl-6 pr-2 py-1.5 text-xs font-mono font-bold text-foreground text-right"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Montos Iniciales: MXN y USD */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <GlassCard padding="sm" className="space-y-1.5">
                      <label className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                        <Banknote size={15} className="text-emerald-400" />
                        <span>Fondo Inicial Pesos (MXN)</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          $
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="10"
                          value={initialCashMxn}
                          onChange={(e) => setInitialCashMxn(e.target.value)}
                          placeholder="0.00"
                          className="glass-input w-full pl-6 pr-3 py-2 text-sm font-mono font-bold text-foreground"
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground block text-right">
                        Moneda Nacional
                      </span>
                    </GlassCard>

                    <GlassCard padding="sm" className="space-y-1.5">
                      <label className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                        <DollarSign size={15} className="text-teal-400" />
                        <span>Fondo Inicial Dólares (USD)</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          $
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="5"
                          value={initialCashUsd}
                          onChange={(e) => setInitialCashUsd(e.target.value)}
                          placeholder="0.00"
                          className="glass-input w-full pl-6 pr-3 py-2 text-sm font-mono font-bold text-foreground"
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground block text-right">
                        ≈ {formatCurrency((Number(initialCashUsd) || 0) * (Number(exchangeRate) || 19))} MXN
                      </span>
                    </GlassCard>
                  </div>

                  {/* Resumen Total Fondo */}
                  <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      Total Inicial en Caja (Equiv. MXN):
                    </span>
                    <span className="text-base font-bold text-emerald-400 font-mono">
                      {formatCurrency(totalInitialMxn)}
                    </span>
                  </div>

                  {/* Notas opcionales */}
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                      Observaciones de Apertura (Opcional)
                    </label>
                    <GlassInput
                      placeholder="Ej. Billetes de $200 y $100, morralla en monedas"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer Fijo */}
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 border-t border-border/40 p-3 sm:p-4 bg-card/95 dark:bg-card/90 backdrop-blur-xl shrink-0 z-10">
                {step === 'funds' ? (
                  <>
                    <GlassButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setStep('auth')}
                      disabled={submitting}
                      className="w-full sm:w-auto"
                    >
                      Volver
                    </GlassButton>
                    <GlassButton
                      type="button"
                      variant="primary"
                      size="md"
                      disabled={submitting}
                      onClick={handleOpenShift}
                      className="w-full sm:w-auto font-bold"
                    >
                      {submitting ? (
                        <>
                          <RefreshCw size={15} className="animate-spin mr-2" />
                          Abriendo Caja...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={16} className="mr-2" />
                          Confirmar y Abrir Caja
                        </>
                      )}
                    </GlassButton>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground w-full text-center sm:text-right py-1">
                    Selecciona un método biométrico o ingresa tu PIN para continuar
                  </p>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Cámara para Verificación Face ID */}
      <FaceCameraModal
        open={faceCameraOpen}
        onOpenChange={setFaceCameraOpen}
        onCapture={handleFaceVerified}
        verifyMode
        title="Validación Facial — Apertura de Caja"
        description="Mira fijamente a la cámara para autenticar tu identidad de cajero."
      />
    </>
  )
}
