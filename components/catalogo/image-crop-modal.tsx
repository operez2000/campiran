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
  Move,
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

const PREVIEW_MAX_DIM = 330 // Máxima dimensión en píxeles para el contenedor de previsualización
const MIN_CROP_SIZE = 50 // Tamaño mínimo del marco de recorte en px

interface CropBox {
  x: number
  y: number
  size: number
}

type DragMode = 'move' | 'tl' | 'tr' | 'bl' | 'br' | null

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
  const [isProcessing, setIsProcessing] = useState(false)

  // Dimensiones calculadas del contenedor de previsualización
  const [previewDims, setPreviewDims] = useState<{ width: number; height: number }>({
    width: PREVIEW_MAX_DIM,
    height: PREVIEW_MAX_DIM,
  })

  // Marco de recorte 1:1 en coordenadas del preview
  const [crop, setCrop] = useState<CropBox>({ x: 0, y: 0, size: PREVIEW_MAX_DIM })

  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Referencias para el arrastre
  const dragRef = useRef<{
    mode: DragMode
    startX: number
    startY: number
    startCrop: CropBox
  } | null>(null)

  // Cargar imagen de forma segura
  useEffect(() => {
    if (!open || !imageSource) {
      setImageObj(null)
      return
    }

    setLoading(true)
    setRotation(0)

    let objectUrlToRevoke: string | null = null
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      setImageObj(img)
      setLoading(false)
    }

    img.onerror = () => {
      setLoading(false)
      console.error('Error al cargar la imagen en el visor de recorte')
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

  // Recalcular dimensiones y centrar el cuadro de recorte cuando cambia la imagen o rotación
  useEffect(() => {
    if (!imageObj) return

    const W_nat = imageObj.naturalWidth || 800
    const H_nat = imageObj.naturalHeight || 600

    const isRotated90 = rotation === 90 || rotation === 270
    const W_eff = isRotated90 ? H_nat : W_nat
    const H_eff = isRotated90 ? W_nat : H_nat

    const scale = Math.min(PREVIEW_MAX_DIM / W_eff, PREVIEW_MAX_DIM / H_eff)
    const pWidth = Math.max(100, Math.round(W_eff * scale))
    const pHeight = Math.max(100, Math.round(H_eff * scale))

    setPreviewDims({ width: pWidth, height: pHeight })

    // Inicializar marco de recorte como cuadrado máximo centrado
    const initialSize = Math.min(pWidth, pHeight)
    setCrop({
      x: Math.round((pWidth - initialSize) / 2),
      y: Math.round((pHeight - initialSize) / 2),
      size: initialSize,
    })
  }, [imageObj, rotation])

  // Dibujar la imagen rotada en el canvas de previsualización
  useEffect(() => {
    if (!previewCanvasRef.current || !imageObj) return

    const canvas = previewCanvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width: pW, height: pH } = previewDims
    canvas.width = pW
    canvas.height = pH

    ctx.save()
    ctx.clearRect(0, 0, pW, pH)

    // Fondo neutro
    ctx.fillStyle = '#09090b'
    ctx.fillRect(0, 0, pW, pH)

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    // Centrar y rotar
    ctx.translate(pW / 2, pH / 2)
    ctx.rotate((rotation * Math.PI) / 180)

    const isRotated90 = rotation === 90 || rotation === 270
    const drawW = isRotated90 ? pH : pW
    const drawH = isRotated90 ? pW : pH

    ctx.drawImage(imageObj, -drawW / 2, -drawH / 2, drawW, drawH)
    ctx.restore()
  }, [imageObj, rotation, previewDims])

  // Girar 90 grados
  const handleRotate = (direction: 'cw' | 'ccw') => {
    const delta = direction === 'cw' ? 90 : -90
    setRotation((prev) => (prev + delta + 360) % 360)
  }

  // Maximizar / Centrar cuadro de recorte
  const handleMaximizeCrop = () => {
    const maxSize = Math.min(previewDims.width, previewDims.height)
    setCrop({
      x: Math.round((previewDims.width - maxSize) / 2),
      y: Math.round((previewDims.height - maxSize) / 2),
      size: maxSize,
    })
  }

  // Ajustar tamaño del cuadro de recorte con slider manteniendo el centro
  const handleCropSizeChange = (newSize: number) => {
    const maxSize = Math.min(previewDims.width, previewDims.height)
    const clampedSize = Math.max(MIN_CROP_SIZE, Math.min(maxSize, Math.round(newSize)))

    const centerX = crop.x + crop.size / 2
    const centerY = crop.y + crop.size / 2

    let nextX = Math.round(centerX - clampedSize / 2)
    let nextY = Math.round(centerY - clampedSize / 2)

    nextX = Math.max(0, Math.min(previewDims.width - clampedSize, nextX))
    nextY = Math.max(0, Math.min(previewDims.height - clampedSize, nextY))

    setCrop({
      x: nextX,
      y: nextY,
      size: clampedSize,
    })
  }

  // ── GESTIÓN DE ARRASTRE DE MARCAS Y CUADRO DE RECORTE (POINTER EVENTS) ──

  const handlePointerDown = (e: React.PointerEvent, mode: DragMode) => {
    e.preventDefault()
    e.stopPropagation()

    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: { ...crop },
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    e.preventDefault()

    const { mode, startX, startY, startCrop } = dragRef.current
    const dx = e.clientX - startX
    const dy = e.clientY - startY

    const { width: pW, height: pH } = previewDims
    const minSize = Math.min(MIN_CROP_SIZE, Math.min(pW, pH))

    if (mode === 'move') {
      // Arrastrar todo el cuadro de recorte horizontal y verticalmente
      const nextX = Math.max(0, Math.min(pW - startCrop.size, startCrop.x + dx))
      const nextY = Math.max(0, Math.min(pH - startCrop.size, startCrop.y + dy))

      setCrop({
        x: Math.round(nextX),
        y: Math.round(nextY),
        size: startCrop.size,
      })
      return
    }

    // Arrastrar esquinas (Marcas de recorte 1:1)
    if (mode === 'br') {
      // Esquina inferior derecha: anclada en top-left (startCrop.x, startCrop.y)
      const anchorX = startCrop.x
      const anchorY = startCrop.y
      const desiredW = startCrop.size + dx
      const desiredH = startCrop.size + dy
      const nextSize = Math.max(minSize, Math.min(pW - anchorX, pH - anchorY, Math.round((desiredW + desiredH) / 2)))

      setCrop({
        x: anchorX,
        y: anchorY,
        size: nextSize,
      })
    } else if (mode === 'tl') {
      // Esquina superior izquierda: anclada en bottom-right
      const anchorX = startCrop.x + startCrop.size
      const anchorY = startCrop.y + startCrop.size
      const desiredW = anchorX - (startCrop.x + dx)
      const desiredH = anchorY - (startCrop.y + dy)
      const nextSize = Math.max(minSize, Math.min(anchorX, anchorY, Math.round((desiredW + desiredH) / 2)))

      setCrop({
        x: anchorX - nextSize,
        y: anchorY - nextSize,
        size: nextSize,
      })
    } else if (mode === 'tr') {
      // Esquina superior derecha: anclada en bottom-left
      const anchorX = startCrop.x
      const anchorY = startCrop.y + startCrop.size
      const desiredW = startCrop.size + dx
      const desiredH = anchorY - (startCrop.y + dy)
      const nextSize = Math.max(minSize, Math.min(pW - anchorX, anchorY, Math.round((desiredW + desiredH) / 2)))

      setCrop({
        x: anchorX,
        y: anchorY - nextSize,
        size: nextSize,
      })
    } else if (mode === 'bl') {
      // Esquina inferior izquierda: anclada en top-right
      const anchorX = startCrop.x + startCrop.size
      const anchorY = startCrop.y
      const desiredW = anchorX - (startCrop.x + dx)
      const desiredH = startCrop.size + dy
      const nextSize = Math.max(minSize, Math.min(anchorX, pH - anchorY, Math.round((desiredW + desiredH) / 2)))

      setCrop({
        x: anchorX - nextSize,
        y: anchorY,
        size: nextSize,
      })
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      // Ignorar
    }
    dragRef.current = null
  }

  // Tocar fuera del cuadro para reubicarlo directamente en esa posición
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragRef.current) return
    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top

    const { width: pW, height: pH } = previewDims
    const nextX = Math.max(0, Math.min(pW - crop.size, clickX - crop.size / 2))
    const nextY = Math.max(0, Math.min(pH - crop.size, clickY - crop.size / 2))

    setCrop((prev) => ({
      ...prev,
      x: Math.round(nextX),
      y: Math.round(nextY),
    }))
  }

  // Exportar recorte a Blob optimizado (cuadrado 1:1, máx 720px)
  const handleConfirm = async () => {
    if (!imageObj) return
    setIsProcessing(true)

    try {
      const W_nat = imageObj.naturalWidth || 800
      const H_nat = imageObj.naturalHeight || 600

      const isRotated90 = rotation === 90 || rotation === 270
      const W_eff = isRotated90 ? H_nat : W_nat
      const H_eff = isRotated90 ? W_nat : H_nat

      // 1. Crear canvas de la imagen rotada en resolución completa
      const rotCanvas = document.createElement('canvas')
      rotCanvas.width = W_eff
      rotCanvas.height = H_eff
      const rotCtx = rotCanvas.getContext('2d')
      if (!rotCtx) throw new Error('No se pudo inicializar canvas para rotación')

      rotCtx.imageSmoothingEnabled = true
      rotCtx.imageSmoothingQuality = 'high'

      if (rotation === 90) {
        rotCtx.translate(W_eff, 0)
        rotCtx.rotate(Math.PI / 2)
      } else if (rotation === 180) {
        rotCtx.translate(W_eff, H_eff)
        rotCtx.rotate(Math.PI)
      } else if (rotation === 270) {
        rotCtx.translate(0, H_eff)
        rotCtx.rotate(-Math.PI / 2)
      }
      rotCtx.drawImage(imageObj, 0, 0)

      // 2. Calcular coordenadas del recorte sobre la imagen en resolución real
      const scaleToNat = W_eff / previewDims.width
      const cropX_nat = Math.round(crop.x * scaleToNat)
      const cropY_nat = Math.round(crop.y * scaleToNat)
      const cropSize_nat = Math.round(crop.size * scaleToNat)

      // 3. Crear canvas final cuadrado 1:1 limitado a 720px
      const outputSize = Math.min(720, Math.max(100, cropSize_nat))
      const outCanvas = document.createElement('canvas')
      outCanvas.width = outputSize
      outCanvas.height = outputSize

      const outCtx = outCanvas.getContext('2d')
      if (!outCtx) throw new Error('No se pudo inicializar canvas de recorte')

      outCtx.imageSmoothingEnabled = true
      outCtx.imageSmoothingQuality = 'high'

      // Fondo blanco por si acaso
      outCtx.fillStyle = '#ffffff'
      outCtx.fillRect(0, 0, outputSize, outputSize)

      outCtx.drawImage(
        rotCanvas,
        cropX_nat,
        cropY_nat,
        cropSize_nat,
        cropSize_nat,
        0,
        0,
        outputSize,
        outputSize
      )

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
      console.error('Error al exportar recorte de imagen:', err)
      setIsProcessing(false)
    }
  }

  if (!open) return null

  const maxSizePossible = Math.min(previewDims.width, previewDims.height)

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-70 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md select-none overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="glass-card max-w-md w-full p-4 sm:p-5 flex flex-col items-center gap-3 my-auto"
        >
          {/* Header */}
          <div className="w-full flex items-center justify-between border-b border-border/40 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
                <Crop size={17} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                  Recortar y Girar
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

          {/* Área interactiva de recorte con marcas móviles */}
          <div className="w-full flex items-center justify-center py-1">
            {loading ? (
              <div className="w-full h-64 rounded-2xl bg-black/40 border border-white/10 flex flex-col items-center justify-center gap-2 text-muted-foreground text-xs">
                <Sparkles size={20} className="animate-spin text-emerald-400" />
                <span>Cargando imagen...</span>
              </div>
            ) : (
              <div
                ref={containerRef}
                onClick={handleBackdropClick}
                style={{ width: previewDims.width, height: previewDims.height }}
                className="relative rounded-2xl overflow-hidden bg-black shadow-2xl border border-white/15 select-none touch-none"
              >
                {/* Imagen previsualizada */}
                <canvas
                  ref={previewCanvasRef}
                  width={previewDims.width}
                  height={previewDims.height}
                  className="block w-full h-full pointer-events-none"
                />

                {/* ── CUADRO DE RECORTE 1:1 INTERACTIVO (MOVIBLE HORIZONTAL Y VERTICALMENTE) ── */}
                <div
                  style={{
                    left: crop.x,
                    top: crop.y,
                    width: crop.size,
                    height: crop.size,
                  }}
                  onPointerDown={(e) => handlePointerDown(e, 'move')}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className="absolute cursor-move border-2 border-emerald-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.65)] touch-none select-none z-10"
                >
                  {/* Regla de tercios (Líneas guía internas) */}
                  <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3">
                    <div className="border-r border-b border-white/30" />
                    <div className="border-r border-b border-white/30" />
                    <div className="border-b border-white/30" />
                    <div className="border-r border-b border-white/30" />
                    <div className="border-r border-b border-white/30" />
                    <div className="border-b border-white/30" />
                    <div className="border-r border-white/30" />
                    <div className="border-r border-white/30" />
                    <div />
                  </div>

                  {/* Icono central de movimiento */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
                    <Move size={22} className="text-white drop-shadow-md" />
                  </div>

                  {/* ── 4 MARCAS DE LAS ESQUINAS PARA REDIMENSIONAR (INTERACTIVAS) ── */}

                  {/* Esquina Superior Izquierda (TL) */}
                  <div
                    onPointerDown={(e) => handlePointerDown(e, 'tl')}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    className="absolute -top-3 -left-3 w-8 h-8 flex items-center justify-center cursor-nwse-resize touch-none z-30 group"
                    title="Arrastra para redimensionar el recorte"
                  >
                    <div className="w-4 h-4 border-t-[3.5px] border-l-[3.5px] border-emerald-300 drop-shadow-[0_0_4px_rgba(0,0,0,0.9)] transition-transform group-hover:scale-125" />
                  </div>

                  {/* Esquina Superior Derecha (TR) */}
                  <div
                    onPointerDown={(e) => handlePointerDown(e, 'tr')}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    className="absolute -top-3 -right-3 w-8 h-8 flex items-center justify-center cursor-nesw-resize touch-none z-30 group"
                    title="Arrastra para redimensionar el recorte"
                  >
                    <div className="w-4 h-4 border-t-[3.5px] border-r-[3.5px] border-emerald-300 drop-shadow-[0_0_4px_rgba(0,0,0,0.9)] transition-transform group-hover:scale-125" />
                  </div>

                  {/* Esquina Inferior Izquierda (BL) */}
                  <div
                    onPointerDown={(e) => handlePointerDown(e, 'bl')}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    className="absolute -bottom-3 -left-3 w-8 h-8 flex items-center justify-center cursor-nesw-resize touch-none z-30 group"
                    title="Arrastra para redimensionar el recorte"
                  >
                    <div className="w-4 h-4 border-b-[3.5px] border-l-[3.5px] border-emerald-300 drop-shadow-[0_0_4px_rgba(0,0,0,0.9)] transition-transform group-hover:scale-125" />
                  </div>

                  {/* Esquina Inferior Derecha (BR) */}
                  <div
                    onPointerDown={(e) => handlePointerDown(e, 'br')}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    className="absolute -bottom-3 -right-3 w-8 h-8 flex items-center justify-center cursor-nwse-resize touch-none z-30 group"
                    title="Arrastra para redimensionar el recorte"
                  >
                    <div className="w-4 h-4 border-b-[3.5px] border-r-[3.5px] border-emerald-300 drop-shadow-[0_0_4px_rgba(0,0,0,0.9)] transition-transform group-hover:scale-125" />
                  </div>
                </div>
              </div>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground text-center">
            Arrastra el cuadro para moverlo · Arrastra las esquinas verdes para cambiar el tamaño
          </p>

          {/* Controles de Tamaño y Rotación */}
          <div className="w-full space-y-2 bg-white/[0.03] border border-white/10 rounded-2xl p-2.5">
            {/* Control Deslizante de Tamaño del Cuadro de Recorte */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCropSizeChange(crop.size - 20)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                title="Reducir área de recorte"
              >
                <ZoomOut size={15} />
              </button>

              <input
                type="range"
                min={MIN_CROP_SIZE}
                max={maxSizePossible}
                step={2}
                value={crop.size}
                onChange={(e) => handleCropSizeChange(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />

              <button
                type="button"
                onClick={() => handleCropSizeChange(crop.size + 20)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                title="Agrandar área de recorte"
              >
                <ZoomIn size={15} />
              </button>

              <span className="text-[10px] font-mono text-muted-foreground w-12 text-right">
                {Math.round((crop.size / maxSizePossible) * 100)}%
              </span>
            </div>

            {/* Botones de Rotación y Centrado */}
            <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-white/5">
              <button
                type="button"
                onClick={() => handleRotate('ccw')}
                className="flex-1 py-1.5 px-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-medium text-foreground flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                title="Girar 90° en sentido antihorario"
              >
                <RotateCcw size={13} />
                <span>Girar -90°</span>
              </button>

              <button
                type="button"
                onClick={() => handleRotate('cw')}
                className="flex-1 py-1.5 px-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-medium text-foreground flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                title="Girar 90° en sentido horario"
              >
                <RotateCw size={13} />
                <span>Girar +90°</span>
              </button>

              <button
                type="button"
                onClick={handleMaximizeCrop}
                className="py-1.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-medium text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer"
                title="Maximizar y centrar recorte"
              >
                <Maximize2 size={13} />
                <span>Maximizar</span>
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
                  <span>Optimizando...</span>
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
