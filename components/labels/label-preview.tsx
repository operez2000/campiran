'use client'

import React, { useMemo } from 'react'
import { generateBarcodeSvg } from '@/lib/barcode-svg'
import { type BranchLabelConfig, type LabelUnit } from '@/lib/types'
import { toMm } from '@/lib/label-presets'

interface LabelPreviewProps {
  config: Partial<BranchLabelConfig>
  sampleItem?: {
    description?: string | null
    code?: string | null
    barcode?: string | null
    price?: number | null
  }
  companyName?: string
  scale?: number
  className?: string
}

export function LabelPreview({
  config,
  sampleItem,
  companyName = 'CAMPIRAN',
  scale = 1,
  className = '',
}: LabelPreviewProps) {
  const unit: LabelUnit = config.unit || 'cm'
  const widthMm = toMm(Number(config.label_width) || 5, unit)
  const heightMm = toMm(Number(config.label_height) || 2.5, unit)

  const barcodeValue = sampleItem?.barcode || '750100012345'
  const itemDescription = sampleItem?.description || 'PRODUCTO DE MUESTRA 500G'
  const itemCode = sampleItem?.code || 'ART-001'
  const itemPrice = sampleItem?.price ?? 149.50

  // Generar SVG del código de barras
  const barcodeSvg = useMemo(() => {
    if (!config.include_barcode) return ''
    // Ajustar altura del código de barras más alta para cubrir el espacio sin texto
    const barHeight = Math.max(26, Math.min(65, Math.round(heightMm * 2.2)))
    return generateBarcodeSvg(barcodeValue, {
      height: barHeight,
      showText: false,
      barWidth: 1,
      quietZone: 4,
    })
  }, [barcodeValue, config.include_barcode, heightMm])

  // Convertimos mm a px aproximados para previsualización en pantalla (1mm ≈ 3.78px a 96DPI)
  const pxWidth = Math.max(120, Math.round(widthMm * 3.78 * scale))
  const pxHeight = Math.max(60, Math.round(heightMm * 3.78 * scale))

  return (
    <div
      style={{
        width: `${pxWidth}px`,
        height: `${pxHeight}px`,
      }}
      className={`relative bg-white text-black rounded-lg border border-neutral-300 shadow-md py-1.5 px-1 flex flex-col justify-between overflow-hidden select-none font-sans ${className}`}
    >
      {/* Header: Empresa o Código */}
      <div className="flex items-center justify-between text-[10px] leading-tight text-neutral-600 font-semibold border-b border-neutral-200 pb-0.5">
        {config.include_store_name && (
          <span className="truncate max-w-[65%] uppercase">{companyName}</span>
        )}
        {config.include_code && (
          <span className="ml-auto font-mono text-[9px] text-neutral-800">
            CÓD: {itemCode}
          </span>
        )}
      </div>

      {/* Body: Descripción del Producto */}
      {config.include_item_name && (
        <div className="my-0.5 text-center">
          <p
            className="text-[11px] font-bold text-neutral-900 leading-tight uppercase line-clamp-2"
            title={itemDescription}
          >
            {itemDescription}
          </p>
        </div>
      )}

      {/* Barcode SVG */}
      {config.include_barcode && barcodeSvg && (
        <div
          className="w-full flex justify-center items-center my-0.5 px-1 overflow-hidden"
          dangerouslySetInnerHTML={{ __html: barcodeSvg }}
        />
      )}

      {/* Footer: Precio */}
      {config.include_price && (
        <div className="flex items-baseline justify-center gap-1 border-t border-neutral-200 pt-0.5 mt-auto">
          <span className="text-[10px] text-neutral-500 font-medium">PRECIO:</span>
          <span className="text-sm font-black text-emerald-800">
            ${Number(itemPrice).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      )}
    </div>
  )
}
