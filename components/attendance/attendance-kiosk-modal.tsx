'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { type Store, type Profile, type UserBiometric } from '@/lib/types'
import {
  kioskCheckInOutAction,
  biometricCheckInOutAction,
  getStoreEmployeesAction,
} from '@/app/(dashboard)/reportes/attendance-actions'
import { getUserBiometricsAction } from '@/app/(dashboard)/admin/usuarios/actions'
import { authenticateWebAuthn, isWebAuthnAvailable } from '@/lib/webauthn'
import { FaceCameraModal } from '@/components/biometrics/face-camera-modal'
import { getInitials, getRoleLabel } from '@/lib/utils'
import { UserAvatar } from '@/components/user-avatar'
import { toast } from 'sonner'
import {
  Clock, Store as StoreIcon, KeyRound, LogIn, LogOut,
  CheckCircle2, AlertCircle, X, Delete, Sparkles,
  Fingerprint, ScanFace, Users, ShieldCheck, ChevronDown
} from 'lucide-react'

interface AttendanceKioskModalProps {
  open: boolean
  onClose: () => void
  store: Store | null
  onAttendanceChanged?: () => void
}

export function AttendanceKioskModal({
  open,
  onClose,
  store,
  onAttendanceChanged,
}: AttendanceKioskModalProps) {
  // Store Employees & Selected Employee
  const [employees, setEmployees] = useState<Profile[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>('QUICK_PIN')
  const [userBiometrics, setUserBiometrics] = useState<UserBiometric | null>(null)
  const [loadingBio, setLoadingBio] = useState(false)
  const [webAuthnSupported, setWebAuthnSupported] = useState(false)

  // Sub-modal for Face Camera
  const [faceCameraOpen, setFaceCameraOpen] = useState(false)

  // PIN & Notes input
  const [pin, setPin] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [currentTime, setCurrentTime] = useState<Date>(new Date())

  // Check WebAuthn support on mount
  useEffect(() => {
    isWebAuthnAvailable().then(setWebAuthnSupported)
  }, [])

  // Clock ticker
  useEffect(() => {
    if (!open) return
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [open])

  // Load branch employees when open or store changes
  useEffect(() => {
    if (!open || !store?.id_store) return
    getStoreEmployeesAction(store.id_store).then(setEmployees)
  }, [open, store?.id_store])

  // Load biometrics when a specific employee is selected
  useEffect(() => {
    if (selectedUserId === 'QUICK_PIN' || !selectedUserId) {
      setUserBiometrics(null)
      return
    }

    setLoadingBio(true)
    getUserBiometricsAction(selectedUserId)
      .then((bio) => {
        setUserBiometrics(bio)
      })
      .finally(() => {
        setLoadingBio(false)
      })
  }, [selectedUserId])

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setPin('')
      setNotes('')
      setSelectedUserId('QUICK_PIN')
      setUserBiometrics(null)
    }
  }, [open])

  const handleKeyPress = (num: string) => {
    if (pin.length < 8) {
      setPin((prev) => prev + num)
    }
  }

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1))
  }

  const handleClear = () => {
    setPin('')
  }

  // 1. Submit via PIN (General or selected employee)
  const handleSubmitPin = async () => {
    if (!store?.id_store) {
      toast.error('No hay una sucursal activa seleccionada.')
      return
    }

    if (!pin.trim()) {
      toast.error('Por favor ingresa tu PIN de empleado.')
      return
    }

    setSubmitting(true)
    try {
      const res = await kioskCheckInOutAction({
        pin: pin.trim(),
        storeId: store.id_store,
        notes: notes.trim() || undefined,
        userId: selectedUserId !== 'QUICK_PIN' ? selectedUserId : undefined,
      })

      if (!res.success) {
        toast.error(res.error || 'Error al procesar marcaje con PIN')
        setPin('')
        return
      }

      handleSuccessOutcome(res, 'PIN de Empleado')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // 2. Submit via WebAuthn (Touch ID, Face ID, Windows Hello)
  const handleVerifyWebAuthn = async () => {
    if (!store?.id_store) {
      toast.error('No hay sucursal activa.')
      return
    }

    if (selectedUserId === 'QUICK_PIN' || !selectedUserId) {
      toast.error('Selecciona tu nombre de la lista para usar el sensor biométrico.')
      return
    }

    setSubmitting(true)
    try {
      // Credential ID if registered
      const credId = (userBiometrics?.webauthn_credential as Record<string, unknown> | null)
        ?.rawId as string | undefined

      const ok = await authenticateWebAuthn(credId)

      if (!ok) {
        toast.error('No se pudo verificar la credencial biométrica')
        setSubmitting(false)
        return
      }

      // Record biometric attendance
      const res = await biometricCheckInOutAction({
        userId: selectedUserId,
        storeId: store.id_store,
        authMethod: 'webauthn',
        notes: notes.trim() || undefined,
      })

      if (!res.success) {
        toast.error(res.error || 'Error al registrar asistencia biométrica')
        return
      }

      handleSuccessOutcome(res, 'Touch ID / Sensor Biométrico')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error en autenticación biométrica'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // 3. Submit via Face Camera Verification
  const handleFaceCaptured = async (_photoDataUrl: string) => {
    setFaceCameraOpen(false)
    if (!store?.id_store || selectedUserId === 'QUICK_PIN' || !selectedUserId) {
      toast.error('Falta usuario o sucursal.')
      return
    }

    setSubmitting(true)
    try {
      const res = await biometricCheckInOutAction({
        userId: selectedUserId,
        storeId: store.id_store,
        authMethod: 'face',
        notes: notes.trim() || undefined,
      })

      if (!res.success) {
        toast.error(res.error || 'Error al registrar asistencia con Face ID')
        return
      }

      handleSuccessOutcome(res, 'Reconocimiento Facial (Face ID)')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al validar rostro'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // Handle successful check-in or check-out outcome
  const handleSuccessOutcome = (
    res: {
      type?: 'check_in' | 'check_out'
      user?: Profile
      durationFormatted?: string
    },
    methodLabel: string
  ) => {
    const nowStr = new Date().toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })

    const uName = res.user?.full_name || res.user?.email || 'Empleado'

    if (res.type === 'check_in') {
      toast.success(`¡Bienvenido(a) ${uName}! Entrada registrada a las ${nowStr}`)
    } else {
      toast.success(
        `¡Hasta luego ${uName}! Salida registrada. Horas: ${res.durationFormatted || ''}`
      )
    }

    setPin('')
    setNotes('')
    onAttendanceChanged?.()
    onClose()
  }

  const selectedEmployee = employees.find((e) => e.id === selectedUserId)

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="w-full max-w-md relative"
        >
          <GlassCard variant="default" padding="lg" className="border-emerald-500/30 shadow-2xl max-h-[92vh] overflow-y-auto scroll-modern">
            {/* Header & Close */}
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)] shrink-0 sticky -top-6 -mx-6 px-6 pt-2 bg-card/95 dark:bg-card/90 backdrop-blur-xl z-20">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
                  <Clock size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-foreground">Quiosco de Asistencia</h3>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <StoreIcon size={12} className="text-emerald-500" />
                    {store?.description || 'Sucursal no asignada'}
                  </p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-1.5 rounded-lg btn-ghost text-muted-foreground hover:text-foreground"
                aria-label="Cerrar quiosco"
              >
                <X size={18} />
              </button>
            </div>

            {/* Live Digital Clock */}
            <div className="my-4 p-3.5 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/20 text-center">
              <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground font-mono">
                {currentTime.toLocaleTimeString('es-MX', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: true,
                })}
              </div>
              <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium capitalize mt-1">
                {currentTime.toLocaleDateString('es-MX', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </div>
            </div>

            {/* Employee Selector Dropdown */}
            <div className="space-y-3 mb-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Users size={13} className="text-emerald-500" />
                  Identificación de Empleado
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => {
                    setSelectedUserId(e.target.value)
                    setPin('')
                  }}
                  className="w-full h-10 px-3 rounded-xl glass border border-[var(--border)] text-xs font-medium focus:outline-none focus:border-emerald-500/60 bg-[var(--card)] text-foreground"
                >
                  <option value="QUICK_PIN">
                    ⚡ Marcaje Rápido por PIN (Cualquier empleado)
                  </option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name || emp.email} ({getRoleLabel(emp.role)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Biometrics Action Cards when a specific employee is selected */}
              {selectedUserId !== 'QUICK_PIN' && selectedEmployee && (
                <div className="space-y-2.5 p-3 rounded-2xl glass border border-emerald-500/20 bg-emerald-500/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <UserAvatar
                        src={selectedEmployee.avatar_url}
                        name={selectedEmployee.full_name}
                        size="sm"
                      />
                      <div className="text-xs">
                        <div className="font-semibold text-foreground">
                          {selectedEmployee.full_name}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {getRoleLabel(selectedEmployee.role)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {userBiometrics?.has_webauthn && (
                        <span className="p-1 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" title="Touch ID enrolado">
                          <Fingerprint size={13} />
                        </span>
                      )}
                      {userBiometrics?.has_face && (
                        <span className="p-1 rounded-md bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" title="Face ID enrolado">
                          <ScanFace size={13} />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Biometric Buttons Grid */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {/* WebAuthn Button */}
                    <button
                      type="button"
                      onClick={handleVerifyWebAuthn}
                      disabled={submitting}
                      className="p-2.5 rounded-xl glass border border-emerald-500/30 hover:bg-emerald-500/15 active:scale-95 transition-all text-left flex flex-col gap-1 disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                        <Fingerprint size={18} />
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10">
                          {userBiometrics?.has_webauthn ? 'Activo' : 'Touch ID'}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-foreground">Sensor / Huella</div>
                      <div className="text-[10px] text-muted-foreground">Touch ID o Windows Hello</div>
                    </button>

                    {/* Face ID Button */}
                    <button
                      type="button"
                      onClick={() => setFaceCameraOpen(true)}
                      disabled={submitting}
                      className="p-2.5 rounded-xl glass border border-indigo-500/30 hover:bg-indigo-500/15 active:scale-95 transition-all text-left flex flex-col gap-1 disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400">
                        <ScanFace size={18} />
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10">
                          {userBiometrics?.has_face ? 'Activo' : 'Face ID'}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-foreground">Reconocimiento</div>
                      <div className="text-[10px] text-muted-foreground">Validar con cámara facial</div>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* PIN Section & Numeric Keypad */}
            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <KeyRound size={13} className="text-emerald-500" />
                  {selectedUserId === 'QUICK_PIN'
                    ? 'O ingresa tu PIN de empleado'
                    : 'O confirma ingresando tu PIN'}
                </label>

                {/* Masked PIN display */}
                <div className="h-11 px-4 rounded-xl glass border border-emerald-500/30 flex items-center justify-center gap-2.5 text-2xl tracking-widest font-mono font-bold">
                  {pin.length === 0 ? (
                    <span className="text-xs text-muted-foreground font-normal tracking-normal">
                      Toca el teclado numérico o escribe tu PIN
                    </span>
                  ) : (
                    Array.from({ length: pin.length }).map((_, i) => (
                      <motion.span
                        key={i}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="w-3 h-3 rounded-full bg-emerald-500 inline-block shadow-sm shadow-emerald-500/50"
                      />
                    ))
                  )}
                </div>
              </div>

              {/* Numeric Keypad */}
              <div className="grid grid-cols-3 gap-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => handleKeyPress(n)}
                    className="h-11 rounded-xl glass text-base font-bold hover:bg-emerald-500/15 hover:border-emerald-500/40 active:scale-95 transition-all text-foreground"
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleClear}
                  className="h-11 rounded-xl glass text-xs font-semibold text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500 active:scale-95 transition-all"
                >
                  Limpiar
                </button>
                <button
                  type="button"
                  onClick={() => handleKeyPress('0')}
                  className="h-11 rounded-xl glass text-base font-bold hover:bg-emerald-500/15 hover:border-emerald-500/40 active:scale-95 transition-all text-foreground"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="h-11 rounded-xl glass flex items-center justify-center text-muted-foreground hover:bg-amber-500/10 hover:text-amber-500 active:scale-95 transition-all"
                  title="Borrar dígito"
                >
                  <Delete size={18} />
                </button>
              </div>

              {/* Optional notes */}
              <div>
                <GlassInput
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Comentarios u observaciones (opcional)"
                  className="text-xs h-9"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-1">
                <GlassButton
                  variant="ghost"
                  onClick={onClose}
                  className="flex-1"
                  disabled={submitting}
                >
                  Cerrar
                </GlassButton>
                <GlassButton
                  variant="primary"
                  onClick={handleSubmitPin}
                  className="flex-[2] bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20"
                  disabled={submitting || pin.length === 0}
                >
                  {submitting ? 'Procesando...' : 'Registrar con PIN'}
                </GlassButton>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      </div>

      {/* Face Detection Camera Modal */}
      <FaceCameraModal
        open={faceCameraOpen}
        onOpenChange={setFaceCameraOpen}
        onCapture={handleFaceCaptured}
        title="Validación Facial — Quiosco"
        description="Ubica tu rostro frente a la cámara para autenticar tu entrada o salida."
        verifyMode={true}
      />
    </>
  )
}
