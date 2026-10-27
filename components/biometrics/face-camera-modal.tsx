'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GlassButton } from '@/components/glass-button'
import { Camera, RefreshCw, CheckCircle2, AlertCircle, ScanFace, X } from 'lucide-react'
import { toast } from 'sonner'

interface FaceCameraModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCapture: (photoDataUrl: string) => void
  title?: string
  description?: string
  verifyMode?: boolean
}

export function FaceCameraModal({
  open,
  onOpenChange,
  onCapture,
  title = 'Detección Facial — Face ID',
  description = 'Ubica tu rostro dentro del marco para autenticar tu identidad.',
  verifyMode = false,
}: FaceCameraModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [cameraActive, setCameraActive] = useState(false)
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [isScanning, setIsScanning] = useState(false)

  // Stop webcam helper (safely stops tracks and clears references)
  const stopWebcam = useCallback(() => {
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => {
          track.stop()
        })
      } catch (e) {
        console.warn('Error deteniendo tracks de cámara:', e)
      }
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setCameraActive(false)
  }, [])

  // Start webcam helper
  const startWebcam = useCallback(async () => {
    // If stream is already active and healthy, reuse it
    if (streamRef.current && streamRef.current.active) {
      if (videoRef.current && videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current
        videoRef.current.play().catch(() => {})
      }
      return
    }

    setIsStarting(true)
    setCameraError(null)

    try {
      if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Este dispositivo o navegador no soporta captura de cámara')
      }

      // Stop any orphan stream before requesting a new one
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      })

      streamRef.current = mediaStream
      setCameraActive(true)

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch((err) => {
            console.warn('Autoplay de video cámara interrumpido:', err)
          })
        }
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'No se pudo iniciar la cámara web. Revisa los permisos de tu navegador.'
      console.error('Error al solicitar cámara web:', err)
      setCameraError(msg)
      setCameraActive(false)
    } finally {
      setIsStarting(false)
    }
  }, [])

  // Start or Stop webcam strictly based on `open` state change
  useEffect(() => {
    if (open) {
      setCapturedPhoto(null)
      startWebcam()
    } else {
      stopWebcam()
      setCapturedPhoto(null)
      setCameraError(null)
      setIsScanning(false)
    }

    return () => {
      stopWebcam()
    }
  }, [open, startWebcam, stopWebcam])

  // Attach active stream when video element renders
  const handleVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el
    if (el && streamRef.current && streamRef.current.active) {
      if (el.srcObject !== streamRef.current) {
        el.srcObject = streamRef.current
        el.play().catch(() => {})
      }
    }
  }, [])

  // Capture current video frame to canvas
  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return
    setIsScanning(true)

    try {
      const video = videoRef.current
      const canvas = canvasRef.current
      const w = video.videoWidth || 640
      const h = video.videoHeight || 480
      const size = Math.min(w, h)

      canvas.width = size
      canvas.height = size

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        setIsScanning(false)
        return
      }

      // Crop center square
      const startX = (w - size) / 2
      const startY = (h - size) / 2
      ctx.drawImage(video, startX, startY, size, size, 0, 0, size, size)

      const dataUrl = canvas.toDataURL('image/jpeg', 0.88)
      setCapturedPhoto(dataUrl)

      if (verifyMode) {
        // En modo validación de cajero, verificar y cerrar inmediatamente
        setTimeout(() => {
          setIsScanning(false)
          stopWebcam()
          onCapture(dataUrl)
          onOpenChange(false)
        }, 400)
      } else {
        setIsScanning(false)
        stopWebcam()
      }
    } catch (e) {
      console.error('Error al capturar frame:', e)
      setIsScanning(false)
    }
  }

  // Retake photo
  const handleRetake = () => {
    setCapturedPhoto(null)
    startWebcam()
  }

  // Confirm photo (en modo registro en admin)
  const handleConfirm = () => {
    if (capturedPhoto) {
      stopWebcam()
      onCapture(capturedPhoto)
      onOpenChange(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md">
          {/* Backdrop click */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0"
            onClick={() => {
              stopWebcam()
              onOpenChange(false)
            }}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            className="glass-card border-border/50 rounded-2xl sm:rounded-3xl max-w-md w-full relative z-10 overflow-hidden shadow-2xl max-h-[92dvh] sm:max-h-[88vh] flex flex-col"
          >
            {/* Header (Shrink-0) */}
            <div className="flex items-center justify-between gap-2.5 p-4 sm:p-5 pb-3 border-b border-border/30 bg-card/95 dark:bg-card/90 backdrop-blur-xl z-20 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                  <ScanFace size={20} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-foreground leading-tight truncate">{title}</h3>
                  <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
                </div>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => {
                  stopWebcam()
                  onOpenChange(false)
                }}
                className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            {/* Camera Viewport (Scrollable body if needed, perfectly centered) */}
            <div className="flex-1 min-h-0 overflow-y-auto scroll-modern p-4 sm:p-5 flex flex-col items-center justify-center">
              {cameraError ? (
                <div className="w-full py-6 px-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-center text-rose-400">
                  <AlertCircle size={32} className="mx-auto mb-2" />
                  <p className="text-sm font-semibold">Cámara no disponible</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                    {cameraError}
                  </p>
                  <div className="mt-3 flex items-center justify-center gap-2">
                    <GlassButton variant="secondary" size="sm" onClick={startWebcam}>
                      <RefreshCw size={13} className="mr-1.5" /> Reintentar
                    </GlassButton>
                  </div>
                </div>
              ) : (
                <div className="relative w-44 h-44 xs:w-52 xs:h-52 sm:w-60 sm:h-60 max-w-[65vw] max-h-[38dvh] aspect-square rounded-full overflow-hidden border-4 border-emerald-500/40 shadow-2xl bg-black/40 flex items-center justify-center shrink-0">
                  {/* Hidden canvas for snapshot */}
                  <canvas ref={canvasRef} className="hidden" />

                  {capturedPhoto ? (
                    // Captured Photo Preview
                    <motion.img
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      src={capturedPhoto}
                      alt="Rostro capturado"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    // Live Video
                    <>
                      <video
                        ref={handleVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover scale-x-[-1]"
                      />

                      {/* Face ID Scanner Overlay */}
                      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                        {/* Outer circular guide */}
                        <div className="w-[82%] h-[82%] rounded-full border-2 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.3)]" />

                        {/* Dashed Reticle */}
                        <div className="absolute w-[70%] h-[70%] rounded-full border-2 border-dashed border-emerald-400/60 animate-pulse" />

                        {/* Laser scan line animation */}
                        <motion.div
                          animate={{
                            y: [-55, 55, -55],
                            opacity: [0.3, 0.9, 0.3],
                          }}
                          transition={{
                            duration: 2.2,
                            repeat: Infinity,
                            ease: 'easeInOut',
                          }}
                          className="absolute w-[70%] h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#10b981]"
                        />
                      </div>
                    </>
                  )}

                  {/* Status pill overlay */}
                  <div className="absolute bottom-2 px-2.5 py-0.5 rounded-full bg-black/75 backdrop-blur-md border border-white/10 text-[10px] sm:text-[11px] font-medium text-emerald-400 flex items-center gap-1.5 shadow-lg">
                    {capturedPhoto ? (
                      <>
                        <CheckCircle2 size={12} />
                        <span>Rostro capturado</span>
                      </>
                    ) : isScanning ? (
                      <>
                        <RefreshCw size={12} className="animate-spin" />
                        <span>Verificando...</span>
                      </>
                    ) : isStarting ? (
                      <>
                        <RefreshCw size={12} className="animate-spin" />
                        <span>Iniciando cámara...</span>
                      </>
                    ) : (
                      <>
                        <ScanFace size={12} />
                        <span>Enfoca tu rostro</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Action Controls (Shrink-0, ALWAYS within viewport) */}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 p-3 sm:p-4 px-4 sm:px-5 border-t border-border/30 bg-card/95 dark:bg-card/90 backdrop-blur-xl z-20 shrink-0">
              <GlassButton
                variant="ghost"
                size="sm"
                onClick={() => {
                  stopWebcam()
                  onOpenChange(false)
                }}
                className="w-full sm:w-auto"
              >
                Cancelar
              </GlassButton>

              {capturedPhoto && !verifyMode ? (
                <div className="flex flex-col-reverse sm:flex-row items-center gap-2 w-full sm:w-auto">
                  <GlassButton variant="secondary" size="sm" onClick={handleRetake} className="w-full sm:w-auto">
                    <RefreshCw size={13} className="mr-1.5" /> Repetir
                  </GlassButton>
                  <GlassButton variant="primary" size="sm" onClick={handleConfirm} className="w-full sm:w-auto shadow-lg shadow-emerald-500/20">
                    <CheckCircle2 size={14} className="mr-1.5" /> Guardar Foto
                  </GlassButton>
                </div>
              ) : (
                <GlassButton
                  variant="primary"
                  size="sm"
                  disabled={!cameraActive || isStarting || !!cameraError || isScanning}
                  onClick={handleCapture}
                  className="w-full sm:w-auto shadow-lg shadow-emerald-500/20"
                >
                  <Camera size={14} className="mr-1.5" />
                  {isScanning
                    ? 'Validando...'
                    : verifyMode
                    ? 'Capturar y Validar'
                    : 'Capturar Rostro'}
                </GlassButton>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
