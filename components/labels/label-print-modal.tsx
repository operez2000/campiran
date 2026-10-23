'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  type BranchLabelConfig,
  type LabelPrintQueueItem,
  type CompanySettings,
  type LabelUnit,
} from '@/lib/types'
import { getBranchLabelConfigsAction } from '@/app/(dashboard)/configuracion/actions'
import { DEFAULT_LABEL_CONFIG, toMm } from '@/lib/label-presets'
import { generateBarcodeSvg } from '@/lib/barcode-svg'
import { LabelPreview } from './label-preview'
import { GlassButton } from '@/components/glass-button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Printer, FileDown, Plus, Minus, Trash2, Tag, RefreshCw, SlidersHorizontal, Check } from 'lucide-react'
import { toast } from 'sonner'
import jsPDF from 'jspdf'

interface LabelPrintModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  storeId: string
  items: LabelPrintQueueItem[]
  company?: CompanySettings | null
}

export function LabelPrintModal({
  open,
  onOpenChange,
  storeId,
  items: initialItems,
  company,
}: LabelPrintModalProps) {
  // Lista de items con cantidades
  const [queue, setQueue] = useState<LabelPrintQueueItem[]>(initialItems)
  const [configs, setConfigs] = useState<BranchLabelConfig[]>([])
  const [selectedConfigId, setSelectedConfigId] = useState<string>('')
  const [loadingConfigs, setLoadingConfigs] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)

  // Sincronizar items cuando se abre el modal
  useEffect(() => {
    if (open) {
      setQueue(initialItems.map((it) => ({ ...it, quantity: it.quantity || 1 })))
    }
  }, [open, initialItems])

  // Cargar configuraciones de etiquetas de la sucursal activa
  useEffect(() => {
    if (!open || !storeId) return

    let isMounted = true
    setLoadingConfigs(true)

    getBranchLabelConfigsAction(storeId)
      .then((data) => {
        if (!isMounted) return
        setConfigs(data)
        const defaultCfg = data.find((c) => c.is_default) || data[0]
        if (defaultCfg) {
          setSelectedConfigId(defaultCfg.id_config)
        }
      })
      .catch((err) => {
        console.error('Error al cargar configuraciones de etiquetas:', err)
      })
      .finally(() => {
        if (isMounted) setLoadingConfigs(false)
      })

    return () => {
      isMounted = false
    }
  }, [open, storeId])

  // Configuración activa seleccionada (o fallback por defecto)
  const activeConfig = useMemo<Partial<BranchLabelConfig>>(() => {
    const found = configs.find((c) => c.id_config === selectedConfigId)
    if (found) return found
    return {
      ...DEFAULT_LABEL_CONFIG,
      id_config: 'default-fallback',
      id_store: storeId,
      status: 'A',
    }
  }, [configs, selectedConfigId, storeId])

  // Modificar cantidad de un producto
  const updateQuantity = (id_item: string, qty: number) => {
    setQueue((prev) =>
      prev.map((it) => (it.id_item === id_item ? { ...it, quantity: Math.max(1, qty) } : it))
    )
  }

  // Eliminar producto de la cola
  const removeItem = (id_item: string) => {
    setQueue((prev) => prev.filter((it) => it.id_item !== id_item))
  }

  // Multiplicar todas las cantidades
  const setAllQuantities = (qty: number) => {
    setQueue((prev) => prev.map((it) => ({ ...it, quantity: Math.max(1, qty) })))
  }

  // Total de etiquetas a imprimir
  const totalLabels = useMemo(() => {
    return queue.reduce((sum, it) => sum + (it.quantity || 1), 0)
  }, [queue])

  // Expandir cola en etiquetas individuales para imprimir
  const individualLabels = useMemo(() => {
    const list: LabelPrintQueueItem[] = []
    queue.forEach((it) => {
      const q = it.quantity || 1
      for (let i = 0; i < q; i++) {
        list.push(it)
      }
    })
    return list
  }, [queue])

  // Obtener precio correspondiente según la configuración
  const getProductPrice = (item: LabelPrintQueueItem) => {
    const field = activeConfig.price_to_print || 'price1'
    if (field === 'price2') return item.price2 ?? item.price1 ?? 0
    if (field === 'price3') return item.price3 ?? item.price1 ?? 0
    return item.price1 ?? 0
  }

  /**
   * Impresión del Navegador vía iframe invisible con @page exacto
   */
  const handleBrowserPrint = () => {
    if (individualLabels.length === 0) {
      toast.error('No hay etiquetas en la cola para imprimir.')
      return
    }

    setPrinting(true)

    try {
      const unit = activeConfig.unit || 'cm'
      const labelW = Number(activeConfig.label_width) || 5
      const labelH = Number(activeConfig.label_height) || 2.5
      const cols = Number(activeConfig.labels_per_row) || 1
      const gapX = Number(activeConfig.gap_x) || 0
      const gapY = Number(activeConfig.gap_y) || 0
      const companyName = company?.trade_name || 'CAMPIRAN'

      // Ancho total del renglón si son varias columnas
      const totalRowWidth = cols * labelW + (cols - 1) * gapX

      // Crear iframe temporal para imprimir
      let iframe = document.getElementById('label-print-frame') as HTMLIFrameElement
      if (!iframe) {
        iframe = document.createElement('iframe')
        iframe.id = 'label-print-frame'
        iframe.style.position = 'fixed'
        iframe.style.right = '0'
        iframe.style.bottom = '0'
        iframe.style.width = '0'
        iframe.style.height = '0'
        iframe.style.border = 'none'
        document.body.appendChild(iframe)
      }

      const doc = iframe.contentWindow?.document
      if (!doc) {
        throw new Error('No se pudo acceder al marco de impresión.')
      }

      // Generar HTML de cada etiqueta
      const labelsHtml = individualLabels
        .map((item) => {
          const barcodeValue = item.barcode || item.code || '000000'
          const price = getProductPrice(item)
          const barcodeSvg = activeConfig.include_barcode
            ? generateBarcodeSvg(barcodeValue, {
                height: 38,
                showText: true,
                fontSize: 9,
                barWidth: 1.3,
              })
            : ''

          return `
          <div class="label-box">
            <div class="label-header">
              ${activeConfig.include_store_name ? `<span class="company-name">${escapeHtml(companyName)}</span>` : ''}
              ${activeConfig.include_code ? `<span class="item-code">CÓD: ${escapeHtml(item.code || '')}</span>` : ''}
            </div>
            ${activeConfig.include_item_name ? `<div class="item-desc">${escapeHtml(item.description || '')}</div>` : ''}
            ${activeConfig.include_barcode ? `<div class="barcode-container">${barcodeSvg}</div>` : ''}
            ${
              activeConfig.include_price
                ? `<div class="item-price">
                    <span class="price-lbl">PRECIO:</span>
                    <span class="price-val">$${Number(price).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                   </div>`
                : ''
            }
          </div>
        `
        })
        .join('')

      const printHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Impresión de Etiquetas</title>
            <style>
              @page {
                size: ${cols > 1 ? `${totalRowWidth}${unit}` : `${labelW}${unit}`} ${labelH}${unit};
                margin: 0;
              }
              *, *:before, *:after {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
              }
              body {
                background: #fff;
                color: #000;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                margin: 0;
                padding: 0;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .labels-grid {
                display: flex;
                flex-wrap: wrap;
                width: ${cols > 1 ? `${totalRowWidth}${unit}` : `${labelW}${unit}`};
                column-gap: ${gapX}${unit};
                row-gap: ${gapY}${unit};
              }
              .label-box {
                width: ${labelW}${unit};
                height: ${labelH}${unit};
                padding: 2mm;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                overflow: hidden;
                page-break-inside: avoid;
                break-inside: avoid;
                border: 0.2mm solid #ddd;
              }
              @media print {
                .label-box {
                  border: none;
                }
              }
              .label-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 7pt;
                font-weight: 600;
                color: #333;
                border-bottom: 0.2mm solid #eee;
                padding-bottom: 0.5mm;
              }
              .company-name {
                text-transform: uppercase;
                max-width: 65%;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
              }
              .item-code {
                font-family: monospace;
                margin-left: auto;
              }
              .item-desc {
                font-size: 8pt;
                font-weight: 700;
                text-align: center;
                text-transform: uppercase;
                margin: 0.5mm 0;
                line-height: 1.1;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
              }
              .barcode-container {
                display: flex;
                justify-content: center;
                align-items: center;
                margin: 0.5mm 0;
                overflow: hidden;
              }
              .barcode-container svg {
                max-width: 100%;
                max-height: calc(${labelH}${unit} * 0.45);
              }
              .item-price {
                display: flex;
                justify-content: center;
                align-items: baseline;
                gap: 1.5mm;
                border-top: 0.2mm solid #eee;
                padding-top: 0.5mm;
              }
              .price-lbl {
                font-size: 7pt;
                color: #555;
              }
              .price-val {
                font-size: 10pt;
                font-weight: 900;
                color: #000;
              }
            </style>
          </head>
          <body>
            <div class="labels-grid">
              ${labelsHtml}
            </div>
          </body>
        </html>
      `

      doc.open()
      doc.write(printHtml)
      doc.close()

      // Esperar a que rendericen los SVGs y fonts antes de disparar el diálogo
      setTimeout(() => {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
        setPrinting(false)
      }, 350)
    } catch (err: unknown) {
      console.error('Error al imprimir:', err)
      toast.error('Ocurrió un error al abrir el cuadro de impresión.')
      setPrinting(false)
    }
  }

  /**
   * Generación y Descarga de PDF con jsPDF
   */
  const handleDownloadPdf = async () => {
    if (individualLabels.length === 0) {
      toast.error('No hay etiquetas en la cola.')
      return
    }

    setGeneratingPdf(true)

    try {
      const unit = activeConfig.unit || 'cm'
      const labelW = Number(activeConfig.label_width) || 5
      const labelH = Number(activeConfig.label_height) || 2.5
      const widthMm = toMm(labelW, unit)
      const heightMm = toMm(labelH, unit)
      const companyName = company?.trade_name || 'CAMPIRAN'

      const orientation = widthMm > heightMm ? 'l' : 'p'
      const pdf = new jsPDF({
        orientation,
        unit: 'mm',
        format: [widthMm, heightMm],
      })

      for (let i = 0; i < individualLabels.length; i++) {
        if (i > 0) {
          pdf.addPage([widthMm, heightMm], orientation)
        }

        const item = individualLabels[i]
        const barcodeValue = item.barcode || item.code || '000000'
        const price = getProductPrice(item)

        // Cabecera
        pdf.setFontSize(7)
        pdf.setFont('helvetica', 'bold')
        if (activeConfig.include_store_name) {
          pdf.text(companyName.toUpperCase().slice(0, 20), 2, 3.5)
        }
        if (activeConfig.include_code && item.code) {
          pdf.text(`CÓD: ${item.code}`, widthMm - 2, 3.5, { align: 'right' })
        }

        // Descripción
        if (activeConfig.include_item_name && item.description) {
          pdf.setFontSize(8)
          pdf.setFont('helvetica', 'bold')
          const lines = pdf.splitTextToSize(item.description.toUpperCase(), widthMm - 4)
          pdf.text(lines.slice(0, 2), widthMm / 2, 7.5, { align: 'center' })
        }

        // Código de barras (Convertir SVG a DataURL en canvas offscreen)
        if (activeConfig.include_barcode) {
          const barcodeSvg = generateBarcodeSvg(barcodeValue, {
            height: 35,
            showText: true,
            fontSize: 9,
            barWidth: 1.5,
          })

          const imgData = await svgToPngDataUrl(barcodeSvg)
          if (imgData) {
            const barW = Math.min(widthMm - 6, 45)
            const barH = Math.min(heightMm * 0.45, 16)
            const posX = (widthMm - barW) / 2
            const posY = heightMm * 0.38
            pdf.addImage(imgData, 'PNG', posX, posY, barW, barH)
          }
        }

        // Precio
        if (activeConfig.include_price) {
          pdf.setFontSize(9)
          pdf.setFont('helvetica', 'bold')
          pdf.text(
            `PRECIO: $${Number(price).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            widthMm / 2,
            heightMm - 2,
            { align: 'center' }
          )
        }
      }

      pdf.save(`etiquetas-campiran-${new Date().toISOString().slice(0, 10)}.pdf`)
      toast.success('PDF de etiquetas generado exitosamente')
    } catch (err: unknown) {
      console.error('Error al generar PDF:', err)
      toast.error('Error al generar el archivo PDF de etiquetas')
    } finally {
      setGeneratingPdf(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass border-white/20 rounded-3xl max-w-5xl p-6 max-h-[92vh] overflow-y-auto scroll-modern">
        <DialogHeader className="mb-4 pr-8">
          <DialogTitle className="text-xl font-black text-foreground flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Printer className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              Impresión de Etiquetas con Código de Barras
            </span>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
              Total: {totalLabels} {totalLabels === 1 ? 'etiqueta' : 'etiquetas'}
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Ajusta las cantidades por producto, elige la plantilla de tu impresora y envía a imprimir o genera el PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Lado Izquierdo: Lista de Productos en Cola (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Selector de Plantilla */}
            <div className="p-3.5 rounded-2xl bg-muted/30 dark:bg-white/[0.04] border border-border/60 dark:border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  Plantilla de Etiqueta (Formato de Impresión)
                </span>
                <span className="text-[11px] text-muted-foreground font-mono font-semibold">
                  {activeConfig.label_width} x {activeConfig.label_height} {activeConfig.unit}
                </span>
              </div>

              <select
                value={selectedConfigId}
                onChange={(e) => setSelectedConfigId(e.target.value)}
                className="w-full bg-white dark:bg-neutral-900 border-2 border-neutral-300 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs font-bold text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-sm"
              >
                {configs.map((c) => (
                  <option key={c.id_config} value={c.id_config} className="bg-white text-neutral-900 dark:bg-neutral-900 dark:text-white font-medium">
                    {c.name} — {c.printer_brand} ({c.label_width}x{c.label_height} {c.unit} | {c.labels_per_row} col)
                    {c.is_default ? ' ★ (Predeterminada)' : ''}
                  </option>
                ))}
                {configs.length === 0 && (
                  <option value="default-fallback" className="bg-white text-neutral-900 dark:bg-neutral-900 dark:text-white font-medium">
                    Estándar Térmica 50x25mm (1 columna)
                  </option>
                )}
              </select>
            </div>

            {/* Controles Rápidos de Cantidad */}
            <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/40 dark:bg-white/[0.02] p-2.5 rounded-xl border border-border/50 dark:border-white/5">
              <span className="font-semibold text-foreground">Ajustar todas a:</span>
              <div className="flex items-center gap-1.5">
                {[1, 2, 5, 10, 20].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setAllQuantities(num)}
                    className="px-2.5 py-0.5 rounded-md bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 border border-neutral-300 dark:border-neutral-700 text-[11px] font-bold text-neutral-900 dark:text-neutral-100 transition-all shadow-sm cursor-pointer"
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            {/* Tabla / Lista de Productos */}
            <div className="border border-border/60 dark:border-white/10 rounded-2xl overflow-hidden bg-card dark:bg-black/20 max-h-[320px] overflow-y-auto scroll-modern shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-100 dark:bg-neutral-800/80 border-b border-border/60 dark:border-white/10 text-neutral-700 dark:text-neutral-200 sticky top-0 z-10 text-[11px] font-bold uppercase tracking-wider">
                  <tr>
                    <th className="p-2.5">Producto</th>
                    <th className="p-2.5">Código / Barras</th>
                    <th className="p-2.5 text-center">Etiquetas</th>
                    <th className="p-2.5 text-right">Quitar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 dark:divide-white/5">
                  {queue.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-foreground">
                        No hay productos seleccionados.
                      </td>
                    </tr>
                  ) : (
                    queue.map((item) => (
                      <tr key={item.id_item} className="hover:bg-muted/40 dark:hover:bg-white/[0.02] transition-colors">
                        <td className="p-2.5 max-w-[180px]">
                          <p className="font-bold text-foreground truncate">{item.description}</p>
                          <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold">
                            Precio: ${Number(getProductPrice(item)).toFixed(2)}
                          </p>
                        </td>
                        <td className="p-2.5 font-mono text-[11px] text-muted-foreground">
                          <div>CB: {item.barcode || '—'}</div>
                          <div className="opacity-70">CÓD: {item.code || '—'}</div>
                        </td>
                        <td className="p-2.5">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.id_item, (item.quantity || 1) - 1)}
                              disabled={(item.quantity || 1) <= 1}
                              className="p-1 rounded-md bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 disabled:opacity-30 cursor-pointer shadow-sm"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <input
                              type="number"
                              min="1"
                              max="999"
                              value={item.quantity || 1}
                              onChange={(e) => updateQuantity(item.id_item, parseInt(e.target.value, 10) || 1)}
                              className="w-12 text-center bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md py-0.5 text-xs font-bold text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-sm"
                            />
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.id_item, (item.quantity || 1) + 1)}
                              className="p-1 rounded-md bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 cursor-pointer shadow-sm"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                        <td className="p-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => removeItem(item.id_item)}
                            className="p-1 text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-500/10 rounded-md transition-all cursor-pointer"
                            title="Quitar de la lista"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Lado Derecho: Vista Previa y Botones de Acción (5 cols) */}
          <div className="lg:col-span-5 flex flex-col justify-between p-4 rounded-3xl bg-card dark:bg-black/40 border border-border/60 dark:border-white/10 shadow-sm">
            <div>
              <div className="flex items-center justify-between mb-3 text-xs">
                <span className="font-bold text-foreground">Vista Previa de Impresión</span>
                <span className="text-[10px] text-muted-foreground font-mono font-semibold">
                  {activeConfig.labels_per_row || 1} {activeConfig.labels_per_row === 1 ? 'columna' : 'columnas'}
                </span>
              </div>

              {/* Contenedor de Vista Previa */}
              <div className="p-4 bg-muted/50 dark:bg-neutral-950/80 rounded-2xl border border-border/50 dark:border-white/5 flex flex-col items-center justify-center min-h-[220px] max-h-[340px] overflow-auto scroll-modern">
                {queue.length > 0 ? (
                  <LabelPreview
                    config={activeConfig}
                    sampleItem={{
                      description: queue[0]?.description,
                      code: queue[0]?.code,
                      barcode: queue[0]?.barcode,
                      price: getProductPrice(queue[0]),
                    }}
                    companyName={company?.trade_name || 'CAMPIRAN'}
                    scale={0.95}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground italic">No hay productos seleccionados</p>
                )}
              </div>

              <div className="mt-3 text-[11px] text-muted-foreground text-center space-y-1">
                <p>
                  Impresora configurada:{' '}
                  <strong className="text-foreground">
                    {activeConfig.printer_brand} {activeConfig.printer_model ? `(${activeConfig.printer_model})` : ''}
                  </strong>
                </p>
                <p className="text-[10px] opacity-75">
                  El navegador aplicará automáticamente el tamaño de papel de la plantilla seleccionada.
                </p>
              </div>
            </div>

            {/* Botones de Impresión */}
            <div className="space-y-2 pt-4 border-t border-border/60 dark:border-white/10 mt-4">
              <GlassButton
                variant="primary"
                onClick={handleBrowserPrint}
                disabled={printing || queue.length === 0}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 shadow-lg shadow-emerald-600/30"
              >
                {printing ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Abriendo diálogo de impresión...
                  </>
                ) : (
                  <>
                    <Printer className="w-4 h-4 mr-2" />
                    Imprimir {totalLabels} {totalLabels === 1 ? 'Etiqueta' : 'Etiquetas'}
                  </>
                )}
              </GlassButton>

              <GlassButton
                variant="secondary"
                onClick={handleDownloadPdf}
                disabled={generatingPdf || queue.length === 0}
                className="w-full py-2 text-xs"
              >
                {generatingPdf ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />
                    Generando PDF...
                  </>
                ) : (
                  <>
                    <FileDown className="w-3.5 h-3.5 mr-2" />
                    Descargar como PDF
                  </>
                )}
              </GlassButton>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Convierte un SVG string a PNG base64 DataURL usando canvas en memoria
 */
function svgToPngDataUrl(svgString: string): Promise<string> {
  return new Promise((resolve) => {
    try {
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const img = new Image()

      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width * 2
        canvas.height = img.height * 2
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          URL.revokeObjectURL(url)
          resolve(canvas.toDataURL('image/png'))
        } else {
          URL.revokeObjectURL(url)
          resolve('')
        }
      }

      img.onerror = () => {
        URL.revokeObjectURL(url)
        resolve('')
      }

      img.src = url
    } catch {
      resolve('')
    }
  })
}
