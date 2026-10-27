'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Crop,
  RotateCw,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Check,
  X,
  Sparkles,
} from 'lucide-react'
import { GlassButton } from '@/components/glass-button'

export interface ImageCropModalProps {
  open: boolean
  imageSource: string | File | Blob | null
  fileName?: string
  queueIndex?: number
  queueTotal?: number
  onConfirm: (result: { blob: Blob; dataUrl: string }) => void
  onCancel: () => void
  onSkip?: () => void
  onCancelAll?: () => void
}

const CANVAS_SIZE = 360 // Base coordinate system for 1:1 preview

export function ImageCropModal({
  open,
  imageSource,
  fileName = 'foto.jpg',
  queueIndex = 1,
  queueTotal = 1,
  onConfirm,
  onCancel,
  onSkip,
  onCancelAll,
}: ImageCropModalProps) {
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null)
  const [loading, setLoading] = useState(true)
  const [rotation, setRotation] = useState<number>(0) // 0, 90, 180, 270
  const [zoom, setZoom] = useState<number>(1) // 1.0 to 3.0
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isProcessing, setIsProcessing] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDraggingRef = useRef(false)
  const lastPointerPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const initialPinchDistRef = useRef<number | null>(null)
  const initialPinchZoomRef = useRef<number>(1)

  // Cargar imagen en memoria de forma segura
  useEffect(() => {
    if (!open || !imageSource) {
      setImageObj(null)
      return
    }

    setLoading(true)
    setRotation(0)
    setZoom(1)
    setPan({ x: 0, y: 0 })

    let objectUrlToRevoke: string | null = null
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      setImageObj(img)
      setLoading(false)
    }

    img.onerror = () => {
      setLoading(false)
      console.error('Error al cargar imagen en modal de recorte')
    }

    if (imageSource instanceof File || imageSource instanceof Blob) {
      objectUrlToRevoke = URL.createObjectURL(imageSource)
      img.src = objectUrlToRevoke
    } else if (typeof imageSource === 'string') {
      img.src = imageSource
    }

    return () => {
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke)
      }
    }
  }, [open, imageSource])

  // Calcular límites de paneo para no dejar bordes vacíos
  const getClampedPan = useCallback(
    (currentPan: { x: number; y: number }, currentZoom: number, currentRotation: number, img: HTMLImageElement) => {
      const W0 = img.naturalWidth || CANVAS_SIZE
      const H0 = img.naturalHeight || CANVAS_SIZE
      const scaleBase = CANVAS_SIZE / Math.min(W0, H0)
      const currentScale = scaleBase * currentZoom

      const isRotated90 = currentRotation === 90 || currentRotation === 270
      const visualW = (isRotated90 ? H0 : W0) * currentScale
      const visualH = (isRotated90 ? W0 : H0) * currentScale

      const maxPanX = Math.max(0, (visualW - CANVAS_SIZE) / 2)
      const maxPanY = Math.max(0, (visualH - CANVAS_SIZE) / 2)

      return {
        x: Math.min(maxPanX, Math.max(-maxPanX, currentPan.x)),
        y: Math.min(maxPanY, Math.max(-maxPanY, currentPan.y)),
      }
    },
    []
  )

  // Redibujar el preview en el canvas 1:1
  const drawPreview = useCallback(() => {
    if (!canvasRef.current || !imageObj) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W0 = imageObj.naturalWidth || CANVAS_SIZE
    const H0 = imageObj.naturalHeight || CANVAS_SIZE

    const scaleBase = CANVAS_SIZE / Math.min(W0, H0)
    const currentScale = scaleBase * zoom

    const clamped = getClampedPan(pan, zoom, rotation, imageObj)

    ctx.save()
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

    // Fondo oscuro por si acaso
    ctx.fillStyle = '#09090b'
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

    // Aplicar transformación centrada
    ctx.translate(CANVAS_SIZE / 2 + clamped.x, CANVAS_SIZE / 2 + clamped.y)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.scale(currentScale, currentScale)

    // Calidad alta de interpolación
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    ctx.drawImage(imageObj, -W0 / 2, -H0 / 2, W0, H0)
    ctx.restore()
  }, [imageObj, rotation, zoom, pan, getClampedPan])

  useEffect(() => {
    drawPreview()
  }, [drawPreview])

  // Girar 90 grados
  const handleRotate = (direction: 'cw' | 'ccw') => {
    if (!imageObj) return
    const delta = direction === 'cw' ? 90 : -90
    const nextRot = (rotation + delta + 360) % 360
    setRotation(nextRot)
    setPan((prev) => getClampedPan(prev, zoom, nextRot, imageObj))
  }

  // Modificar Zoom con slider o botones
  const handleZoomChange = (nextZoom: number) => {
    if (!imageObj) return
    const clampedZoom = Math.min(3, Math.max(1, Number(nextZoom.toFixed(2))))
    setZoom(clampedZoom)
    setPan((prev) => getClampedPan(prev, clampedZoom, rotation, imageObj))
  }

  // Reset / Centrar
  const handleReset = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setRotation(0)
  }

  // Pointer Events para arrastrar (Touch + Mouse)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    isDraggingRef.current = true
    lastPointerPosRef.current = { x: e.clientX, y: e.clientY }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current || !imageObj || !canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const coordRatio = CANVAS_SIZE / (rect.width || CANVAS_SIZE)

    const dx = (e.clientX - lastPointerPosRef.current.x) * coordRatio
    const dy = (e.clientY - lastPointerPosRef.current.y) * coordRatio

    lastPointerPosRef.current = { x: e.clientX, y: e.clientY }

    setPan((prev) =>
      getClampedPan({ x: prev.x + dx, y: prev.y + dy }, zoom, rotation, imageObj)
    )
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = false
    try {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      // Ignorar si no estaba capturado
    }
  }

  // Soporte de zoom con rueda de ratón
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    if (!imageObj) return
    const delta = e.deltaY < 0 ? 0.08 : -0.08
    handleZoomChange(zoom + delta)
  }

  // Soporte de pellizco táctil (Pinch to zoom) en móviles
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2) {
      const t1 = e.touches[0]
      const t2 = e.touches[1]
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
      initialPinchDistRef.current = dist
      initialPinchZoomRef.current = zoom
    }
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2 && initialPinchDistRef.current !== null && imageObj) {
      const t1 = e.touches[0]
      const t2 = e.touches[1]
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
      const factor = dist / initialPinchDistRef.current
      handleZoomChange(initialPinchZoomRef.current * factor)
    }
  }

  const handleTouchEnd = () => {
    initialPinchDistRef.current = null
  }

  // Exportar recorte a Blob de alta resolución (cuadrado 1:1, max 720px)
  const handleConfirm = async () => {
    if (!imageObj) return
    setIsProcessing(true)

    try {
      const W0 = imageObj.naturalWidth || CANVAS_SIZE
      const H0 = imageObj.naturalHeight || CANVAS_SIZE
      const naturalMin = Math.min(W0, H0)
      // Generar tamaño óptimo para el canvas de salida (hasta 720px, respetando dimensiones naturales)
      const outputSize = Math.min(720, Math.max(360, Math.round(naturalMin * zoom)))

      const outCanvas = document.createElement('canvas')
      outCanvas.width = outputSize
      outCanvas.height = outputSize

      const outCtx = outCanvas.getContext('2d')
      if (!outCtx) throw new Error('No se pudo inicializar canvas de salida')

      const scaleBase = CANVAS_SIZE / naturalMin
      const currentScale = scaleBase * zoom
      const ratio = outputSize / CANVAS_SIZE

      const clamped = getClampedPan(pan, zoom, rotation, imageObj)

      outCtx.save()
      outCtx.fillStyle = '#ffffff'
      outCtx.fillRect(0, 0, outputSize, outputSize)

      outCtx.translate(outputSize / 2 + clamped.x * ratio, outputSize / 2 + clamped.y * ratio)
      outCtx.rotate((rotation * Math.PI) / 180)
      outCtx.scale(currentScale * ratio, currentScale * ratio)

      outCtx.imageSmoothingEnabled = true
      outCtx.imageSmoothingQuality = 'high'

      outCtx.drawImage(imageObj, -W0 / 2, -H0 / 2, W0, H0)
      outCtx.restore()

      outCanvas.toBlob(
        (blob) => {
          if (!blob) {
            setIsProcessing(false)
            return
          }
          const dataUrl = outCanvas.toDataURL('image/webp', 0.9)
          setIsProcessing(false)
          onConfirm({ blob, dataUrl })
        },
        'image/webp',
        0.9
      )
    } catch (err) {
      console.error('Error al exportar recorte:', err)
      setIsProcessing(false)
    }
  }

  if (!open) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-70 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md select-none overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="glass-card max-w-md w-full p-4 sm:p-5 flex flex-col items-center gap-3.5 my-auto"
        >
          {/* Header */}
          <div className="w-full flex items-center justify-between border-b border-border/40 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
                <Crop size={17} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                  Ajustar Fotografía
                  {queueTotal > 1 && (
                    <span className="text-[11px] font-normal text-muted-foreground">
                      ({queueIndex} de {queueTotal})
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-muted-foreground line-clamp-1">{fileName}</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold tracking-wider uppercase">
                1:1 Cuadrado
              </span>
              <button
                type="button"
                onClick={onCancel}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                title="Cerrar"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Viewport / Crop Box */}
          <div className="relative w-full max-w-[320px] aspect-square rounded-2xl overflow-hidden bg-black border-2 border-emerald-500/40 shadow-2xl flex items-center justify-center">
            {loading ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground text-xs">
                <Sparkles size={20} className="animate-spin text-emerald-400" />
                <span>Cargando imagen...</span>
              </div>
            ) : (
              <>
                <canvas
                  ref={canvasRef}
                  width={CANVAS_SIZE}
                  height={CANVAS_SIZE}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  onWheel={handleWheel}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  className="w-full h-full object-contain cursor-grab active:cursor-grabbing touch-none"
                />

                {/* Guías de Regla de Tercios (Rule of thirds) */}
                <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 border border-white/10 rounded-2xl">
                  <div className="border-r border-b border-white/15" />
                  <div className="border-r border-b border-white/15" />
                  <div className="border-b border-white/15" />
                  <div className="border-r border-b border-white/15" />
                  <div className="border-r border-b border-white/15" />
                  <div className="border-b border-white/15" />
                  <div className="border-r border-white/15" />
                  <div className="border-r border-white/15" />
                  <div />
                </div>

                {/* Esquinas decorativas de visor fotográfico */}
                <div className="absolute top-2 left-2 w-3.5 h-3.5 border-t-2 border-l-2 border-emerald-400 rounded-tl pointer-events-none" />
                <div className="absolute top-2 right-2 w-3.5 h-3.5 border-t-2 border-r-2 border-emerald-400 rounded-tr pointer-events-none" />
                <div className="absolute bottom-2 left-2 w-3.5 h-3.5 border-b-2 border-l-2 border-emerald-400 rounded-bl pointer-events-none" />
                <div className="absolute bottom-2 right-2 w-3.5 h-3.5 border-b-2 border-r-2 border-emerald-400 rounded-br pointer-events-none" />
              </>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground text-center">
            Arrastra para encuadrar · Pellizca o usa la rueda para zoom
          </p>

          {/* Controles de Zoom */}
          <div className="w-full space-y-2 bg-white/[0.03] border border-white/10 rounded-2xl p-2.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleZoomChange(zoom - 0.1)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                title="Alejar"
              >
                <ZoomOut size={15} />
              </button>

              <input
                type="range"
                min="1"
                max="3"
                step="0.02"
                value={zoom}
                onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />

              <button
                type="button"
                onClick={() => handleZoomChange(zoom + 0.1)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                title="Acercar"
              >
                <ZoomIn size={15} />
              </button>

              <span className="text-[10px] font-mono text-muted-foreground w-9 text-right">
                {(zoom * 100).toFixed(0)}%
              </span>
            </div>

            {/* Controles de Rotación y Centrado */}
            <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-white/5">
              <button
                type="button"
                onClick={() => handleRotate('ccw')}
                className="flex-1 py-1 px-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-medium text-foreground flex items-center justify-center gap-1.5 transition-all active:scale-95"
                title="Girar 90° a la izquierda"
              >
                <RotateCcw size={13} />
                <span>Girar -90°</span>
              </button>

              <button
                type="button"
                onClick={() => handleRotate('cw')}
                className="flex-1 py-1 px-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-medium text-foreground flex items-center justify-center gap-1.5 transition-all active:scale-95"
                title="Girar 90° a la derecha"
              >
                <RotateCw size={13} />
                <span>Girar +90°</span>
              </button>

              <button
                type="button"
                onClick={handleReset}
                className="py-1 px-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-medium text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 transition-all active:scale-95"
                title="Centrar y reiniciar zoom"
              >
                <Maximize2 size={13} />
                <span>Centrar</span>
              </button>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="w-full flex items-center justify-between gap-2 pt-1 border-t border-border/40">
            <div className="flex items-center gap-1.5">
              {queueTotal > 1 && onSkip ? (
                <>
                  <GlassButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onSkip}
                    title="Omitir esta fotografía sin recortar"
                  >
                    Omitir
                  </GlassButton>
                  {onCancelAll && (
                    <button
                      type="button"
                      onClick={onCancelAll}
                      className="text-[11px] text-rose-400 hover:underline px-1 py-1"
                    >
                      Cancelar todo
                    </button>
                  )}
                </>
              ) : (
                <GlassButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onCancel}
                >
                  Cancelar
                </GlassButton>
              )}
            </div>

            <GlassButton
              type="button"
              variant="primary"
              size="sm"
              onClick={handleConfirm}
              disabled={loading || isProcessing}
              className="gap-1.5"
            >
              {isProcessing ? (
                <>
                  <Sparkles size={14} className="animate-spin" />
                  <span>Procesando...</span>
                </>
              ) : (
                <>
                  <Check size={14} />
                  <span>
                    {queueTotal > 1 && queueIndex < queueTotal
                      ? 'Aplicar y Siguiente'
                      : 'Listo'}
                  </span>
                </>
              )}
            </GlassButton>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
