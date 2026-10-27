'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import {
  type Order,
  type Profile,
} from '@/lib/types'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import {
  ShieldAlert,
  ShieldCheck,
  KeyRound,
  Fingerprint,
  Camera,
  AlertTriangle,
  X,
  CheckCircle2,
  UserCheck,
  RotateCcw,
  PackageCheck,
  ChevronDown
} from 'lucide-react'
import { toast } from 'sonner'
import { authenticateWebAuthn, isWebAuthnAvailable } from '@/lib/webauthn'
import { FaceCameraModal } from '@/components/biometrics/face-camera-modal'
import {
  getAuthorizingManagersAction,
  cancelOrderAction,
  type AuthorizingManager,
} from '@/app/(dashboard)/pos/sales-cancellation-actions'

interface PosCancelSaleModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: Order | null
  storeId: string
  currentUser: Profile | null
  onOrderCancelled: (cancelledOrder: Order) => void
}

type AuthMethod = 'pin' | 'webauthn' | 'face'

const REASON_PRESETS = [
  'Devolución de mercancía por cliente',
  'Error de captura en productos o precios',
  'Cobro o venta duplicada',
  'Cambio de método de pago',
  'Cliente no completó la compra',
  'Producto dañado / defectuoso',
]

export function PosCancelSaleModal({
  open,
  onOpenChange,
  order,
  storeId,
  currentUser,
  onOrderCancelled,
}: PosCancelSaleModalProps) {
  const [managers, setManagers] = useState<AuthorizingManager[]>([])
  const [selectedManagerId, setSelectedManagerId] = useState<string>('')
  const [loadingManagers, setLoadingManagers] = useState(false)

  // Auth Method & States
  const [authMethod, setAuthMethod] = useState<AuthMethod>('pin')
  const [pinInput, setPinInput] = useState('')
  const [webAuthnVerified, setWebAuthnVerified] = useState(false)
  const [faceVerified, setFaceVerified] = useState(false)
  const [faceCameraOpen, setFaceCameraOpen] = useState(false)
  const [webAuthnSupported, setWebAuthnSupported] = useState(false)
  const [verifyingWebAuthn, setVerifyingWebAuthn] = useState(false)

  // Reason & Submission
  const [cancellationReason, setCancellationReason] = useState(REASON_PRESETS[0])
  const [customReason, setCustomReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Check WebAuthn platform support
  useEffect(() => {
    isWebAuthnAvailable().then(setWebAuthnSupported)
  }, [])

  // Load managers on open
  useEffect(() => {
    if (!open) {
      setPinInput('')
      setWebAuthnVerified(false)
      setFaceVerified(false)
      setCustomReason('')
      setCancellationReason(REASON_PRESETS[0])
      return
    }

    setLoadingManagers(true)
    getAuthorizingManagersAction(storeId)
      .then((data) => {
        setManagers(data)
        // If current user is Admin or Manager, select them by default
        const isSelfManager = data.find((m) => m.id === currentUser?.id)
        if (isSelfManager) {
          setSelectedManagerId(isSelfManager.id)
        } else if (data.length > 0) {
          setSelectedManagerId(data[0].id)
        }
      })
      .catch((err) => {
        console.error('Error loading managers:', err)
        toast.error('No se pudo cargar la lista de supervisores')
      })
      .finally(() => {
        setLoadingManagers(false)
      })
  }, [open, storeId, currentUser])

  const selectedManager = managers.find((m) => m.id === selectedManagerId)

  // Handle WebAuthn Verification
  const handleVerifyWebAuthn = async () => {
    if (!selectedManager) {
      toast.error('Selecciona el supervisor autorizador')
      return
    }

    setVerifyingWebAuthn(true)
    try {
      const ok = await authenticateWebAuthn(selectedManager.webauthnCredentialId || undefined)
      if (ok) {
        setWebAuthnVerified(true)
        toast.success(`¡Autorización WebAuthn concedida por ${selectedManager.full_name}!`)
      } else {
        toast.error('No se pudo verificar la credencial biométrica del supervisor')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error en autenticación WebAuthn'
      toast.error(msg)
    } finally {
      setVerifyingWebAuthn(false)
    }
  }

  // Handle Facial Recognition Verification
  const handleFaceCaptured = () => {
    setFaceVerified(true)
    setFaceCameraOpen(false)
    toast.success(`¡Identidad facial validada para ${selectedManager?.full_name}!`)
  }

  // Handle Final Cancellation Submission
  const handleConfirmCancellation = async () => {
    if (!order) return

    if (!selectedManagerId) {
      toast.error('Selecciona al supervisor (Admin o Manager) que autoriza la cancelación')
      return
    }

    // Validar método según selección
    if (authMethod === 'pin') {
      if (!pinInput.trim()) {
        toast.error('Ingresa el PIN de seguridad del supervisor')
        return
      }
    } else if (authMethod === 'webauthn') {
      if (!webAuthnVerified) {
        toast.error('Debes completar la verificación WebAuthn (Touch ID / Face ID) del supervisor')
        return
      }
    } else if (authMethod === 'face') {
      if (!faceVerified) {
        toast.error('Debes completar la verificación de reconocimiento facial')
        return
      }
    }

    const finalReason = customReason.trim()
      ? `${cancellationReason}: ${customReason.trim()}`
      : cancellationReason

    setIsSubmitting(true)
    try {
      const result = await cancelOrderAction({
        orderId: order.id_order,
        storeId,
        authorizingManagerId: selectedManagerId,
        cancellationReason: finalReason,
        authMethod,
        pin: authMethod === 'pin' ? pinInput.trim() : undefined,
      })

      toast.success(
        `¡Venta #${order.order_number} cancelada exitosamente! El stock ha sido reintegrado al inventario.`
      )
      onOrderCancelled(result.cancelledOrder)
      onOpenChange(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cancelar la venta'
      toast.error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!open || !order) return null

  return (
    <>
      <AnimatePresence>
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 15 }}
            className="glass-card border-border/50 rounded-2xl sm:rounded-3xl max-w-xl w-full relative overflow-hidden shadow-2xl max-h-[92dvh] sm:max-h-[90vh] flex flex-col"
          >
            {/* Header Fijo */}
            <div className="flex items-center justify-between border-b border-border/40 px-4 py-3 sm:px-6 sm:py-4 bg-card/95 dark:bg-card/90 backdrop-blur-xl shrink-0 z-10">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-2">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center text-white shadow-lg shadow-rose-500/25 shrink-0">
                  <ShieldAlert size={20} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2 truncate">
                    <span>Cancelación de Venta</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 font-mono">
                      #{order.order_number}
                    </span>
                  </h3>
                  <p className="text-[11px] text-muted-foreground truncate">
                    Autorización por <strong className="text-foreground">ADMIN</strong> o <strong className="text-foreground">MANAGER</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            {/* Cuerpo desplazable */}
            <div className="flex-1 min-h-0 overflow-y-auto scroll-modern p-4 sm:p-6 space-y-4">
              {/* Resumen de la Venta a Cancelar */}
              <div className="p-3.5 rounded-2xl bg-white/5 border border-border/40 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Folio de Venta:</span>
                  <span className="font-bold text-foreground">#{order.order_number}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Cliente:</span>
                  <span className="font-semibold text-foreground">
                    {order.client
                      ? `${order.client.first_name || ''} ${order.client.last_name || ''}`.trim()
                      : 'Público en General'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Fecha y Hora:</span>
                  <span className="text-muted-foreground">{formatDateTime(order.created_at)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border/20 pt-2 text-sm">
                  <span className="font-semibold text-foreground">Total a Revertir:</span>
                  <span className="font-black text-rose-400 text-base">
                    {formatCurrency(order.total_amount)}
                  </span>
                </div>
                <div className="flex items-center gap-2 pt-1 text-[11px] text-emerald-400">
                  <PackageCheck size={14} className="shrink-0" />
                  <span>
                    Se reintegrarán{' '}
                    <strong>
                      {order.order_items?.reduce((acc, curr) => acc + (curr.quantity || 0), 0) || 0}
                    </strong>{' '}
                    artículos al stock físico de esta sucursal.
                  </span>
                </div>
              </div>

              {/* Paso 1: Selección de Supervisor Autorizador */}
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1.5">
                  1. Supervisor que Autoriza (ADMIN o MANAGER)
                </label>
                {loadingManagers ? (
                  <div className="p-3 text-xs text-muted-foreground animate-pulse text-center rounded-xl bg-white/5">
                    Cargando supervisores autorizados...
                  </div>
                ) : managers.length === 0 ? (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-400">
                    No se encontraron usuarios con rol ADMIN o MANAGER activos en esta sucursal.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {managers.map((m) => {
                      const isSelected = m.id === selectedManagerId
                      const isSelf = m.id === currentUser?.id
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setSelectedManagerId(m.id)
                            setWebAuthnVerified(false)
                            setFaceVerified(false)
                            setPinInput('')
                          }}
                          className={`flex items-center gap-3 p-2.5 rounded-2xl text-left transition-all border ${
                            isSelected
                              ? 'bg-rose-500/15 border-rose-500/50 shadow-md shadow-rose-500/10'
                              : 'bg-white/5 border-border/30 hover:border-border/60 hover:bg-white/10'
                          }`}
                        >
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                              isSelected
                                ? 'bg-gradient-to-br from-rose-500 to-red-600 text-white'
                                : 'bg-white/10 text-muted-foreground'
                            }`}
                          >
                            {m.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-xs text-foreground truncate block">
                                {m.full_name}
                              </span>
                              {isSelf && (
                                <span className="text-[9px] px-1 rounded bg-indigo-500/20 text-indigo-300 font-medium">
                                  Tú
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <span
                                className={`font-bold ${
                                  m.role === 'ADMIN' ? 'text-purple-400' : 'text-blue-400'
                                }`}
                              >
                                {m.role}
                              </span>
                              <span>·</span>
                              <span>
                                {[
                                  m.hasPin ? 'PIN' : null,
                                  m.hasWebAuthn ? 'WebAuthn' : null,
                                  m.hasFace ? 'Facial' : null,
                                ]
                                  .filter(Boolean)
                                  .join(' / ') || 'Sin cred.'}
                              </span>
                            </div>
                          </div>
                          {isSelected && <CheckCircle2 size={16} className="text-rose-400 shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Paso 2: Método de Validación de Credenciales */}
              {selectedManager && (
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1.5">
                    2. Método de Validación de Credenciales
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setAuthMethod('pin')}
                      className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all ${
                        authMethod === 'pin'
                          ? 'bg-rose-500/15 border-rose-500/50 text-rose-300'
                          : 'bg-white/5 border-border/30 text-muted-foreground hover:bg-white/10 hover:text-foreground'
                      }`}
                    >
                      <KeyRound size={20} className="mb-1" />
                      <span className="text-xs font-bold block">PIN de Seguridad</span>
                      <span className="text-[10px] opacity-70">
                        {selectedManager.hasPin ? 'Configurado' : 'General'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAuthMethod('webauthn')}
                      className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all ${
                        authMethod === 'webauthn'
                          ? 'bg-rose-500/15 border-rose-500/50 text-rose-300'
                          : 'bg-white/5 border-border/30 text-muted-foreground hover:bg-white/10 hover:text-foreground'
                      }`}
                    >
                      <Fingerprint size={20} className="mb-1" />
                      <span className="text-xs font-bold block">WebAuthn / Touch ID</span>
                      <span className="text-[10px] opacity-70">
                        {webAuthnVerified ? '✅ Validado' : 'Sensor biométrico'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAuthMethod('face')}
                      className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all ${
                        authMethod === 'face'
                          ? 'bg-rose-500/15 border-rose-500/50 text-rose-300'
                          : 'bg-white/5 border-border/30 text-muted-foreground hover:bg-white/10 hover:text-foreground'
                      }`}
                    >
                      <Camera size={20} className="mb-1" />
                      <span className="text-xs font-bold block">Biometría Facial</span>
                      <span className="text-[10px] opacity-70">
                        {faceVerified ? '✅ Validado' : 'Cámara en vivo'}
                      </span>
                    </button>
                  </div>

                  {/* Detalle del método seleccionado */}
                  <div className="mt-3 p-3 rounded-2xl bg-white/5 border border-border/40">
                    {authMethod === 'pin' && (
                      <div className="space-y-2">
                        <label className="text-xs text-muted-foreground block">
                          Ingresa el PIN de seguridad o clave de cajero de{' '}
                          <strong className="text-foreground">{selectedManager.full_name}</strong>:
                        </label>
                        <div className="relative">
                          <input
                            type="password"
                            inputMode="numeric"
                            autoComplete="off"
                            placeholder="••••"
                            value={pinInput}
                            onChange={(e) => setPinInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleConfirmCancellation()
                            }}
                            className="w-full text-center text-2xl tracking-[0.4em] font-mono py-2.5 rounded-xl glass-input text-foreground border border-border/50 focus:border-rose-500/60 focus:outline-none"
                            maxLength={8}
                            autoFocus
                          />
                        </div>
                      </div>
                    )}

                    {authMethod === 'webauthn' && (
                      <div className="text-center py-2 space-y-2">
                        <p className="text-xs text-muted-foreground">
                          {webAuthnVerified
                            ? '✅ Sensor biométrico validado exitosamente.'
                            : 'Solicita al supervisor presionar su Touch ID / Face ID o llave de seguridad.'}
                        </p>
                        <GlassButton
                          type="button"
                          variant={webAuthnVerified ? 'primary' : 'danger'}
                          disabled={verifyingWebAuthn}
                          onClick={handleVerifyWebAuthn}
                          className="w-full justify-center"
                        >
                          <Fingerprint size={16} className="mr-2" />
                          {verifyingWebAuthn
                            ? 'Esperando sensor biométrico...'
                            : webAuthnVerified
                            ? '¡Identidad Biométrica Confirmada!'
                            : 'Activar Sensor Touch ID / Face ID'}
                        </GlassButton>
                      </div>
                    )}

                    {authMethod === 'face' && (
                      <div className="text-center py-2 space-y-2">
                        <p className="text-xs text-muted-foreground">
                          {faceVerified
                            ? '✅ Reconocimiento facial completado exitosamente.'
                            : 'Abre la cámara web para validar los rasgos faciales del supervisor.'}
                        </p>
                        <GlassButton
                          type="button"
                          variant={faceVerified ? 'primary' : 'danger'}
                          onClick={() => setFaceCameraOpen(true)}
                          className="w-full justify-center"
                        >
                          <Camera size={16} className="mr-2" />
                          {faceVerified
                            ? '¡Rostro Validado Exitosamente!'
                            : 'Iniciar Escaneo Facial con Cámara'}
                        </GlassButton>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Paso 3: Motivo de Cancelación */}
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1.5">
                  3. Motivo de Cancelación
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {REASON_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCancellationReason(preset)}
                      className={`text-[11px] px-2.5 py-1 rounded-xl transition-all border ${
                        cancellationReason === preset
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-medium'
                          : 'bg-white/5 text-muted-foreground border-border/20 hover:bg-white/10'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <GlassInput
                  placeholder="Detalles adicionales u observaciones (opcional)..."
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                />
              </div>

              {/* Banner de Advertencia */}
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-2.5 text-xs text-rose-300">
                <AlertTriangle size={17} className="shrink-0 text-rose-400 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold text-foreground">Acción Irreversible y Auditada</p>
                  <p className="text-[11px] text-muted-foreground">
                    Esta venta se marcará como <strong>CANCELADA</strong>, el monto total se deducirá de las
                    ventas efectivas y la mercancía será reintegrada al inventario en el Kardex bajo la
                    autorización de{' '}
                    <strong className="text-foreground">
                      {selectedManager?.full_name || 'Supervisor'}
                    </strong>
                    .
                  </p>
                </div>
              </div>
            </div>

            </div>

            {/* Footer Fijo */}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 border-t border-border/40 p-3 sm:p-4 bg-card/95 dark:bg-card/90 backdrop-blur-xl shrink-0 z-10">
              <GlassButton
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
                className="w-full sm:w-auto"
              >
                Cerrar
              </GlassButton>
              <GlassButton
                type="button"
                variant="danger"
                disabled={isSubmitting || !selectedManagerId}
                onClick={handleConfirmCancellation}
                className="w-full sm:w-auto gap-2"
              >
                <RotateCcw size={16} />
                {isSubmitting ? 'Cancelando Venta...' : 'Autorizar Cancelación y Reintegrar'}
              </GlassButton>
            </div>
          </motion.div>
        </div>
      </AnimatePresence>

      {/* Modal de Reconocimiento Facial */}
      <FaceCameraModal
        open={faceCameraOpen}
        onOpenChange={setFaceCameraOpen}
        onCapture={handleFaceCaptured}
        verifyMode
        title={`Validación Facial — ${selectedManager?.full_name || 'Supervisor'}`}
        description="Mira fijamente a la cámara para verificar la identidad y autorizar la cancelación."
      />
    </>
  )
}
