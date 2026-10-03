'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Camera, Upload, Trash2, Star, Eye, X, ChevronLeft, ChevronRight,
  RefreshCw, Smartphone, Image as ImageIcon
} from 'lucide-react'
import { GlassButton } from '@/components/glass-button'
import { resizeAndCompressImage, formatFileSize, type ProcessedImage } from '@/lib/image-utils'
import { toast } from 'sonner'

export interface ManagedImageItem {
  id: string
  url: string
  storagePath?: string
  blob?: Blob
  isNew?: boolean
  isExisting?: boolean
  width?: number
  height?: number
  fileSize?: number
  originalSize?: number
}

interface ProductImageManagerProps {
  initialImages?: ManagedImageItem[]
  onChange: (images: ManagedImageItem[], deletedImageIds: string[]) => void
}

export function ProductImageManager({
  initialImages = [],
  onChange,
}: ProductImageManagerProps) {
  const [images, setImages] = useState<ManagedImageItem[]>(initialImages)
  const [deletedIds, setDeletedIds] = useState<string[]>([])
  const [processing, setProcessing] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  // Lightbox / Carousel State
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  // Live in-app camera state
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // File Inputs
  const nativeCameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const notifyChange = useCallback((nextImages: ManagedImageItem[], nextDeleted: string[]) => {
    setImages(nextImages)
    setDeletedIds(nextDeleted)
    onChange(nextImages, nextDeleted)
  }, [onChange])

  // Process and add files
  const processFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'))
      if (files.length === 0) {
        toast.error('Por favor seleccione archivos de imagen válidos (JPG, PNG, WebP)')
        return
      }

      setProcessing(true)
      const newItems: ManagedImageItem[] = []

      for (const file of files) {
        try {
          const processed: ProcessedImage = await resizeAndCompressImage(file, 720, 0.85, file.name)
          newItems.push({
            id: `new_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            url: processed.dataUrl,
            blob: processed.blob,
            isNew: true,
            width: processed.width,
            height: processed.height,
            fileSize: processed.optimizedSize,
            originalSize: processed.originalSize,
          })
        } catch (err) {
          console.error('Error processing image:', err)
          toast.error(`Error al procesar "${file.name}"`)
        }
      }

      if (newItems.length > 0) {
        const updated = [...images, ...newItems]
        notifyChange(updated, deletedIds)
        const totalSaved = newItems.reduce((acc, curr) => acc + ((curr.originalSize || 0) - (curr.fileSize || 0)), 0)
        if (totalSaved > 0) {
          toast.success(
            `${newItems.length} imagen(es) optimizada(s) a máx 720px (-${formatFileSize(totalSaved)} ahorrados)`
          )
        } else {
          toast.success(`${newItems.length} imagen(es) agregada(s)`)
        }
      }

      setProcessing(false)
    },
    [images, deletedIds, notifyChange]
  )

  // Drag and Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFiles(e.dataTransfer.files)
    }
  }

  // Clipboard paste support (Ctrl+V / Cmd+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      const files: File[] = []
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile()
          if (file) files.push(file)
        }
      }
      if (files.length > 0) {
        processFiles(files)
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [processFiles])

  // Set as primary/cover image (moves image to index 0)
  const handleSetPrimary = (index: number) => {
    if (index === 0) return
    const updated = [...images]
    const [selected] = updated.splice(index, 1)
    updated.unshift(selected)
    notifyChange(updated, deletedIds)
    toast.info('Se estableció como foto de portada principal')
  }

  // Remove image
  const handleRemoveImage = (index: number) => {
    const target = images[index]
    const updated = images.filter((_, i) => i !== index)
    const nextDeleted = [...deletedIds]

    if (target.isExisting && target.id) {
      nextDeleted.push(target.id)
    }

    notifyChange(updated, nextDeleted)
    toast.message('Imagen removida', { description: 'Los cambios se aplicarán al guardar.' })
  }

  // In-app Camera functions (WebRTC)
  const startCamera = async (facing: 'environment' | 'user' = cameraFacing) => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
      setCameraOpen(true)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
    } catch (err) {
      console.error('Error starting camera:', err)
      toast.error('No se pudo acceder a la cámara. Verifique los permisos del navegador.')
      stopCamera()
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setCameraOpen(false)
  }

  const flipCamera = () => {
    const nextFacing = cameraFacing === 'environment' ? 'user' : 'environment'
    setCameraFacing(nextFacing)
    startCamera(nextFacing)
  }

  const captureCameraFrame = async () => {
    if (!videoRef.current) return
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 720
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(async (blob) => {
      if (!blob) return
      await processFiles([new File([blob], `cam_${Date.now()}.jpg`, { type: 'image/jpeg' })])
    }, 'image/jpeg', 0.9)
  }

  // Lightbox keyboard navigation
  useEffect(() => {
    if (lightboxIndex === null) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIndex(null)
      if (e.key === 'ArrowLeft') {
        setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : images.length - 1))
      }
      if (e.key === 'ArrowRight') {
        setLightboxIndex((prev) => (prev !== null && prev < images.length - 1 ? prev + 1 : 0))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lightboxIndex, images.length])

  return (
    <div className="space-y-4">
      {/* Hidden Native Mobile Camera Input */}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={nativeCameraInputRef}
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            processFiles(e.target.files)
          }
          e.target.value = ''
        }}
      />

      {/* Hidden Multi-file picker input */}
      <input
        type="file"
        accept="image/*"
        multiple
        ref={galleryInputRef}
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            processFiles(e.target.files)
          }
          e.target.value = ''
        }}
      />

      {/* Action Header / Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            <ImageIcon size={14} />
            Fotografías del Producto
            <span className="text-muted-foreground font-normal lowercase">
              ({images.length} {images.length === 1 ? 'imagen' : 'imágenes'})
            </span>
          </label>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Optimización automática a 720px. La primera foto es la portada principal.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Mobile Native Camera Button */}
          <button
            type="button"
            onClick={() => nativeCameraInputRef.current?.click()}
            className="px-2.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
            title="Abre la cámara del celular para tomar foto directamente"
          >
            <Smartphone size={14} />
            <span className="hidden sm:inline">Cámara Celular</span>
            <span className="sm:hidden">Cámara</span>
          </button>

          {/* In-app WebRTC Camera Viewfinder */}
          <button
            type="button"
            onClick={() => startCamera()}
            className="px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/10 text-xs font-medium flex items-center gap-1.5 transition-all active:scale-95"
            title="Abrir visor de cámara web en vivo"
          >
            <Camera size={14} />
            <span className="hidden sm:inline">Visor en Vivo</span>
          </button>

          {/* Gallery / File Picker */}
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            className="px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/10 text-xs font-medium flex items-center gap-1.5 transition-all active:scale-95"
            title="Seleccionar archivos desde la galería o computadora"
          >
            <Upload size={14} />
            <span>Subir Fotos</span>
          </button>
        </div>
      </div>

      {/* Drag & Drop Area / Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => galleryInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-4 sm:p-5 text-center cursor-pointer transition-all duration-200 ${
          dragOver
            ? 'border-emerald-500 bg-emerald-500/10 scale-[1.01]'
            : 'border-border/50 hover:border-emerald-500/40 bg-white/[0.02] hover:bg-white/[0.04]'
        }`}
      >
        <div className="flex flex-col items-center justify-center gap-2">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            {processing ? (
              <RefreshCw size={18} className="animate-spin" />
            ) : (
              <Upload size={18} />
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">
              {processing
                ? 'Comprimiendo y redimensionando a 720px...'
                : 'Arrastra tus fotos aquí o haz clic para explorar'}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              JPG, PNG, WebP · También puedes pegar imágenes desde el portapapeles (Ctrl+V)
            </p>
          </div>
        </div>
      </div>

      {/* Interactive Gallery Grid */}
      {images.length > 0 && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {images.map((img, index) => {
              const isPrimary = index === 0
              return (
                <motion.div
                  key={img.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className={`group relative rounded-xl overflow-hidden border transition-all ${
                    isPrimary
                      ? 'border-emerald-500 ring-2 ring-emerald-500/30 bg-emerald-500/5'
                      : 'border-border/40 hover:border-white/20 bg-black/20'
                  }`}
                >
                  {/* Aspect Ratio Container */}
                  <div className="aspect-square relative flex items-center justify-center bg-black/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={`Foto producto ${index + 1}`}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />

                    {/* Primary Badge */}
                    {isPrimary && (
                      <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full bg-emerald-500 text-black text-[10px] font-bold tracking-wide flex items-center gap-1 shadow-lg shadow-emerald-500/30">
                        <Star size={10} className="fill-black" />
                        PORTADA
                      </div>
                    )}

                    {/* Dimension / Size pill */}
                    {img.width && img.height && (
                      <div className="absolute bottom-2 left-2 z-10 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-xs text-white text-[9px] font-mono border border-white/10 opacity-80 group-hover:opacity-100 transition-opacity">
                        {img.width}×{img.height}
                        {img.fileSize ? ` · ${formatFileSize(img.fileSize)}` : ''}
                      </div>
                    )}

                    {/* Quick Action Overlay */}
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2 p-2">
                      {/* View large */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setLightboxIndex(index)
                        }}
                        className="p-1.5 rounded-lg bg-white/20 text-white hover:bg-white/30 transition-colors"
                        title="Ver en pantalla completa (Carrusel)"
                      >
                        <Eye size={15} />
                      </button>

                      {/* Set as Primary */}
                      {!isPrimary && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleSetPrimary(index)
                          }}
                          className="p-1.5 rounded-lg bg-emerald-500/80 text-black hover:bg-emerald-400 transition-colors"
                          title="Hacer foto de portada"
                        >
                          <Star size={15} />
                        </button>
                      )}

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveImage(index)
                        }}
                        className="p-1.5 rounded-lg bg-rose-500/80 text-white hover:bg-rose-600 transition-colors"
                        title="Eliminar fotografía"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
            <span>
              💡 Haz clic en <Eye size={11} className="inline mx-0.5" /> para ver el carrusel en pantalla completa o en <Star size={11} className="inline mx-0.5 text-emerald-400" /> para cambiar la portada.
            </span>
            <button
              type="button"
              onClick={() => setLightboxIndex(0)}
              className="text-emerald-400 hover:underline flex items-center gap-1 font-medium"
            >
              Abrir Carrusel ({images.length})
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL: LIVE IN-APP CAMERA (WEBRTC) ───────────────────────── */}
      <AnimatePresence>
        {cameraOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card max-w-lg w-full p-5 space-y-4 flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <div className="flex items-center gap-2">
                  <Camera size={18} className="text-emerald-400" />
                  <h3 className="text-sm font-bold text-foreground">Visor de Cámara en Vivo</h3>
                </div>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Viewport */}
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-video flex items-center justify-center border border-border/40 shadow-inner">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />

                {/* Shutter frame guideline */}
                <div className="absolute inset-4 border border-dashed border-white/20 rounded-xl pointer-events-none" />
              </div>

              {/* Camera Controls */}
              <div className="flex items-center justify-between pt-2">
                <GlassButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={flipCamera}
                  title="Cambiar entre cámara frontal y trasera"
                >
                  <RefreshCw size={14} className="mr-1.5" />
                  Girar Cámara
                </GlassButton>

                {/* Shutter Trigger Button */}
                <button
                  type="button"
                  onClick={captureCameraFrame}
                  className="w-14 h-14 rounded-full bg-emerald-500 border-4 border-black/40 shadow-lg shadow-emerald-500/40 flex items-center justify-center text-black hover:scale-105 active:scale-95 transition-all"
                  title="Capturar Foto"
                >
                  <Camera size={24} className="stroke-[2.5]" />
                </button>

                <GlassButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={stopCamera}
                >
                  Cerrar
                </GlassButton>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL: FULLSCREEN LIGHTBOX CAROUSEL ───────────────────────── */}
      <AnimatePresence>
        {lightboxIndex !== null && images[lightboxIndex] && (
          <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 sm:p-6 select-none">
            {/* Top Toolbar */}
            <div className="absolute top-4 left-4 right-4 flex items-center justify-between text-white z-10">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-semibold border border-white/15">
                  Foto {lightboxIndex + 1} de {images.length}
                </span>
                {lightboxIndex === 0 && (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500 text-black text-xs font-bold flex items-center gap-1 shadow-md">
                    <Star size={11} className="fill-black" />
                    Portada
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {lightboxIndex !== 0 && (
                  <button
                    type="button"
                    onClick={() => handleSetPrimary(lightboxIndex)}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-emerald-500 hover:text-black transition-colors text-xs font-medium flex items-center gap-1.5"
                  >
                    <Star size={13} />
                    Hacer Portada
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleRemoveImage(lightboxIndex)}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white transition-colors text-xs font-medium flex items-center gap-1.5"
                >
                  <Trash2 size={13} />
                  Eliminar
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxIndex(null)}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Left Nav Button */}
            {images.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setLightboxIndex((prev) =>
                    prev !== null && prev > 0 ? prev - 1 : images.length - 1
                  )
                }
                className="absolute left-3 sm:left-6 z-10 p-3 rounded-full bg-white/10 hover:bg-white/25 text-white transition-all backdrop-blur-md hover:scale-110 active:scale-95"
                title="Foto anterior"
              >
                <ChevronLeft size={26} />
              </button>
            )}

            {/* Center Slide View */}
            <motion.div
              key={lightboxIndex}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="max-w-3xl max-h-[75vh] w-full flex items-center justify-center relative p-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={images[lightboxIndex].url}
                alt={`Detalle foto ${lightboxIndex + 1}`}
                className="max-w-full max-h-[72vh] object-contain rounded-2xl shadow-2xl border border-white/10"
              />
            </motion.div>

            {/* Right Nav Button */}
            {images.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setLightboxIndex((prev) =>
                    prev !== null && prev < images.length - 1 ? prev + 1 : 0
                  )
                }
                className="absolute right-3 sm:right-6 z-10 p-3 rounded-full bg-white/10 hover:bg-white/25 text-white transition-all backdrop-blur-md hover:scale-110 active:scale-95"
                title="Siguiente foto"
              >
                <ChevronRight size={26} />
              </button>
            )}

            {/* Bottom Thumbnail Strip */}
            {images.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 p-2 rounded-2xl bg-black/60 backdrop-blur-lg border border-white/10 max-w-[90vw] overflow-x-auto scroll-modern">
                {images.map((thumb, idx) => (
                  <button
                    key={thumb.id}
                    type="button"
                    onClick={() => setLightboxIndex(idx)}
                    className={`w-12 h-12 rounded-xl overflow-hidden border-2 transition-all shrink-0 ${
                      idx === lightboxIndex
                        ? 'border-emerald-500 scale-105 shadow-md'
                        : 'border-transparent opacity-50 hover:opacity-100'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumb.url}
                      alt={`Thumb ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
