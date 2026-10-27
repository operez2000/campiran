'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { type Profile } from '@/lib/types'
import { registerWebAuthnCredential, isWebAuthnAvailable } from '@/lib/webauthn'
import { FaceCameraModal } from '@/components/biometrics/face-camera-modal'
import { getUserBiometricsAction, saveUserBiometricsAction } from '@/app/(dashboard)/admin/usuarios/actions'
import { toast } from 'sonner'
import {
  Fingerprint, ScanFace, KeyRound, ShieldCheck, CheckCircle2,
  Trash2, Camera, RefreshCw, X
} from 'lucide-react'

interface BiometricsEnrollmentModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: Profile | null
  onSuccess?: () => void
}

export function BiometricsEnrollmentModal({
  open,
  onOpenChange,
  user,
  onSuccess,
}: BiometricsEnrollmentModalProps) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Biometric fields
  const [cashierNumber, setCashierNumber] = useState('')
  const [cashierPin, setCashierPin] = useState('')
  const [hasWebAuthn, setHasWebAuthn] = useState(false)
  const [webauthnCredential, setWebauthnCredential] = useState<Record<string, unknown> | null>(null)
  const [hasFace, setHasFace] = useState(false)
  const [facePhotoUrl, setFacePhotoUrl] = useState<string | null>(null)

  // Camera modal state
  const [faceCameraOpen, setFaceCameraOpen] = useState(false)
  const [webAuthnSupported, setWebAuthnSupported] = useState(false)
  const [enrollingWebAuthn, setEnrollingWebAuthn] = useState(false)

  // Check WebAuthn platform support
  useEffect(() => {
    isWebAuthnAvailable().then(setWebAuthnSupported)
  }, [])

  // Load existing biometrics for selected user
  useEffect(() => {
    if (!open || !user) return

    setLoading(true)
    getUserBiometricsAction(user.id)
      .then((data) => {
        if (data) {
          setCashierNumber(data.cashier_number || '')
          setCashierPin(data.cashier_pin || '')
          setHasWebAuthn(Boolean(data.has_webauthn))
          setWebauthnCredential(data.webauthn_credential)
          setHasFace(Boolean(data.has_face))
          setFacePhotoUrl(data.face_photo_url || null)
        } else {
          setCashierNumber('')
          setCashierPin('')
          setHasWebAuthn(false)
          setWebauthnCredential(null)
          setHasFace(false)
          setFacePhotoUrl(null)
        }
      })
      .catch((err) => {
        console.error('Error cargando biometría:', err)
      })
      .finally(() => setLoading(false))
  }, [open, user])

  // Handle WebAuthn Enrollment (Touch ID / Face ID / Windows Hello)
  const handleEnrollWebAuthn = async () => {
    if (!user) return
    setEnrollingWebAuthn(true)

    try {
      const cred = await registerWebAuthnCredential({
        userId: user.id,
        userName: user.full_name || 'Cajero',
        userEmail: user.email || 'cajero@campiran.com',
      })

      setWebauthnCredential(cred as unknown as Record<string, unknown>)
      setHasWebAuthn(true)
      toast.success(`¡Biometría WebAuthn (${cred.deviceName || 'Face/Touch ID'}) registrada!`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al registrar biometría'
      toast.error(msg)
    } finally {
      setEnrollingWebAuthn(false)
    }
  }

  // Handle Face Capture
  const handleFaceCaptured = (photoDataUrl: string) => {
    setFacePhotoUrl(photoDataUrl)
    setHasFace(true)
    toast.success('Foto facial capturada correctamente')
  }

  // Save all biometric credentials
  const handleSave = async () => {
    if (!user) return

    if (cashierPin && cashierPin.length < 4) {
      toast.error('El PIN de cajero debe tener al menos 4 dígitos')
      return
    }

    setSaving(true)
    try {
      const res = await saveUserBiometricsAction({
        id_user: user.id,
        cashier_number: cashierNumber.trim() || null,
        cashier_pin: cashierPin.trim() || null,
        has_webauthn: hasWebAuthn,
        webauthn_credential: webauthnCredential,
        has_face: hasFace,
        face_photo_url: facePhotoUrl,
      })

      if (res.success) {
        toast.success(`Datos biométricos actualizados para ${user.full_name || user.email}`)
        onSuccess?.()
        onOpenChange(false)
      } else {
        toast.error('No se pudieron guardar los datos biométricos')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar datos biométricos'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-md">
            {/* Backdrop click */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
              onClick={() => !saving && onOpenChange(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="glass-card border-border/50 rounded-2xl sm:rounded-3xl max-w-lg w-full relative z-10 overflow-hidden shadow-2xl max-h-[92dvh] sm:max-h-[90vh] flex flex-col"
            >
              {/* Header (Shrink-0) */}
              <div className="flex items-center justify-between gap-3 p-4 sm:p-5 pb-3 border-b border-border/30 bg-card/95 dark:bg-card/90 backdrop-blur-xl z-20 shrink-0">
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 shrink-0">
                    <ShieldCheck size={22} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-lg font-bold text-foreground truncate">
                      Credenciales Biométricas y Acceso
                    </h3>
                    <p className="text-xs text-muted-foreground truncate">
                      Usuario:{' '}
                      <span className="font-semibold text-foreground">
                        {user?.full_name || user?.email}
                      </span>{' '}
                      (Rol: {user?.role})
                    </p>
                  </div>
                </div>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => !saving && onOpenChange(false)}
                  className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors shrink-0"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Scrollable Body */}
              <div className="flex-1 min-h-0 overflow-y-auto scroll-modern p-4 sm:p-6 space-y-4">
                {loading ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-emerald-400" />
                    <p className="text-xs">Cargando credenciales biométricas...</p>
                  </div>
                ) : (
                  <>
                    {/* Sección 1: Datos de Cajero (Número y PIN) */}
                    <GlassCard padding="sm" className="space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                        <KeyRound size={15} className="text-emerald-400" />
                        <span>Identificación de Cajero</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                            No. de Cajero / Caja
                          </label>
                          <GlassInput
                            placeholder="Ej. CAJA-01 o 001"
                            value={cashierNumber}
                            onChange={(e) => setCashierNumber(e.target.value)}
                            className="text-xs"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                            PIN de Seguridad (4-6 dígitos)
                          </label>
                          <GlassInput
                            type="password"
                            maxLength={6}
                            placeholder="••••"
                            value={cashierPin}
                            onChange={(e) => setCashierPin(e.target.value.replace(/\D/g, ''))}
                            className="text-xs tracking-widest font-mono"
                          />
                        </div>
                      </div>
                    </GlassCard>

                    {/* Sección 2: WebAuthn (Touch ID / Face ID nativo) */}
                    <GlassCard padding="sm" className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Fingerprint size={16} className="text-emerald-400" />
                          <div>
                            <h4 className="text-xs font-bold text-foreground">
                              Biometría WebAuthn (Touch ID / Face ID)
                            </h4>
                            <p className="text-[10px] text-muted-foreground">
                              Autenticación instantánea mediante el sensor biométrico del equipo.
                            </p>
                          </div>
                        </div>

                        {hasWebAuthn ? (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                            <CheckCircle2 size={12} /> Activo
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground/60">No registrado</span>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-muted-foreground">
                          {hasWebAuthn
                            ? 'Credencial registrada en este dispositivo.'
                            : webAuthnSupported
                            ? 'Sensor biométrico detectado en este dispositivo.'
                            : 'Sensor disponible solo en hardware compatible.'}
                        </span>

                        <div className="flex items-center gap-1.5">
                          {hasWebAuthn && (
                            <button
                              type="button"
                              onClick={() => {
                                setHasWebAuthn(false)
                                setWebauthnCredential(null)
                                toast.message('Credencial biométrica removida localmente')
                              }}
                              className="text-rose-400 hover:text-rose-300 p-1 text-[11px] flex items-center gap-1"
                              title="Eliminar credencial"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                          <GlassButton
                            variant={hasWebAuthn ? 'secondary' : 'primary'}
                            size="sm"
                            disabled={enrollingWebAuthn}
                            onClick={handleEnrollWebAuthn}
                          >
                            <Fingerprint size={13} className="mr-1" />
                            {hasWebAuthn ? 'Re-enrolar' : 'Enrolar Sensor'}
                          </GlassButton>
                        </div>
                      </div>
                    </GlassCard>

                    {/* Sección 3: Detección Facial (Cámara Web) */}
                    <GlassCard padding="sm" className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ScanFace size={16} className="text-emerald-400" />
                          <div>
                            <h4 className="text-xs font-bold text-foreground">
                              Detección Facial (Cámara Web)
                            </h4>
                            <p className="text-[10px] text-muted-foreground">
                              Reconocimiento visual del rostro del cajero para apertura de turno.
                            </p>
                          </div>
                        </div>

                        {hasFace ? (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                            <CheckCircle2 size={12} /> Registrado
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground/60">Sin foto</span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 pt-1">
                        {facePhotoUrl ? (
                          <div className="relative w-14 h-14 rounded-2xl overflow-hidden border-2 border-emerald-500/40 shrink-0 shadow-md">
                            <img
                              src={facePhotoUrl}
                              alt="Foto facial"
                              className="w-full h-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setFacePhotoUrl(null)
                                setHasFace(false)
                              }}
                              className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 flex items-center justify-center text-rose-400 transition-opacity"
                              title="Eliminar foto"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-border/40 flex items-center justify-center text-muted-foreground/40 shrink-0">
                            <ScanFace size={22} />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-muted-foreground">
                            {hasFace
                              ? 'Rostro biométrico registrado para validación.'
                              : 'Captura una foto de frente con buena iluminación.'}
                          </p>
                          <div className="mt-1.5 flex items-center gap-2">
                            <GlassButton
                              variant={hasFace ? 'secondary' : 'primary'}
                              size="sm"
                              onClick={() => setFaceCameraOpen(true)}
                            >
                              <Camera size={13} className="mr-1" />
                              {hasFace ? 'Actualizar Foto' : 'Capturar con Cámara'}
                            </GlassButton>
                          </div>
                        </div>
                      </div>
                    </GlassCard>
                  </>
                )}
              </div>

              {/* Dialog Footer (Shrink-0, ALWAYS within viewport) */}
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 p-3 sm:p-4 px-4 sm:px-6 border-t border-border/30 bg-card/95 dark:bg-card/90 backdrop-blur-xl z-20 shrink-0">
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  disabled={saving}
                  className="w-full sm:w-auto"
                >
                  Cancelar
                </GlassButton>
                <GlassButton
                  variant="primary"
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || loading}
                  className="w-full sm:w-auto shadow-lg shadow-emerald-500/20"
                >
                  {saving ? (
                    <>
                      <RefreshCw size={13} className="animate-spin mr-1.5" /> Actualizando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={14} className="mr-1.5" /> Actualizar Registro
                    </>
                  )}
                </GlassButton>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sub-Modal de Cámara para Face ID */}
      <FaceCameraModal
        open={faceCameraOpen}
        onOpenChange={setFaceCameraOpen}
        onCapture={handleFaceCaptured}
        title="Captura Biométrica de Rostro"
        description={`Registrando rostro para ${user?.full_name || 'Cajero'}`}
      />
    </>
  )
}
