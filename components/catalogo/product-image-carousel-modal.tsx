'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronLeft, ChevronRight, Star } from 'lucide-react'
import { type ItemImage } from '@/lib/types'

interface ProductImageCarouselModalProps {
  open: boolean
  onClose: () => void
  productName: string
  images: ItemImage[]
}

function CarouselContent({
  onClose,
  productName,
  images,
}: {
  onClose: () => void
  productName: string
  images: ItemImage[]
}) {
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') {
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1))
      }
      if (e.key === 'ArrowRight') {
        setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [images.length, onClose])

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 select-none">
      {/* Top Header */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between text-white z-10">
        <div>
          <h4 className="text-sm sm:text-base font-bold text-white line-clamp-1">
            {productName}
          </h4>
          <div className="flex items-center gap-2 mt-1">
            <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-xs font-semibold">
              Foto {currentIndex + 1} de {images.length}
            </span>
            {currentIndex === 0 && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-black text-[10px] font-bold flex items-center gap-1 shadow-md">
                <Star size={10} className="fill-black" /> Portada
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Left Nav Button */}
      {images.length > 1 && (
        <button
          type="button"
          onClick={() =>
            setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1))
          }
          className="absolute left-3 sm:left-6 z-10 p-3 rounded-full bg-white/10 hover:bg-white/25 text-white transition-all backdrop-blur-md hover:scale-110 active:scale-95"
          title="Foto anterior"
        >
          <ChevronLeft size={26} />
        </button>
      )}

      {/* Center Image */}
      <motion.div
        key={currentIndex}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="max-w-2xl max-h-[75vh] w-full flex items-center justify-center relative p-2"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[currentIndex]?.image_url || ''}
          alt={`${productName} - foto ${currentIndex + 1}`}
          className="max-w-full max-h-[70vh] object-contain rounded-2xl shadow-2xl border border-white/10"
        />
      </motion.div>

      {/* Right Nav Button */}
      {images.length > 1 && (
        <button
          type="button"
          onClick={() =>
            setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0))
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
          {images.map((img, idx) => (
            <button
              key={img.id_item_image || idx}
              type="button"
              onClick={() => setCurrentIndex(idx)}
              className={`w-12 h-12 rounded-xl overflow-hidden border-2 transition-all shrink-0 ${
                idx === currentIndex
                  ? 'border-emerald-500 scale-105 shadow-md'
                  : 'border-transparent opacity-50 hover:opacity-100'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.image_url || ''}
                alt={`Thumb ${idx + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ProductImageCarouselModal({
  open,
  onClose,
  productName,
  images,
}: ProductImageCarouselModalProps) {
  return (
    <AnimatePresence>
      {open && images.length > 0 && (
        <CarouselContent
          onClose={onClose}
          productName={productName}
          images={images}
        />
      )}
    </AnimatePresence>
  )
}
