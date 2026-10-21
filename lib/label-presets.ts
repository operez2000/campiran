import { type LabelUnit, type BarcodeType, type LabelPriceOption } from '@/lib/types'

export interface LabelSizePreset {
  id: string
  name: string
  unit: LabelUnit
  label_width: number
  label_height: number
  labels_per_row: number
  gap_x: number
  gap_y: number
  margin_top?: number
  margin_left?: number
  page_width?: number
  page_height?: number
  description?: string
}

export interface PrinterModelPreset {
  model: string
  labelSizes: LabelSizePreset[]
}

export interface PrinterBrandPreset {
  brand: string
  models: PrinterModelPreset[]
}

/**
 * Catálogo inteligente de marcas y modelos de impresoras térmicas
 * y de hojas de etiquetas estándar de la industria.
 */
export const PRINTER_PRESETS: PrinterBrandPreset[] = [
  {
    brand: 'Zebra',
    models: [
      {
        model: 'ZD220 / ZD420 / ZD421 (4 pulgadas)',
        labelSizes: [
          {
            id: 'zebra-2x1',
            name: '2" x 1" (Pulgadas - 1 columna)',
            unit: 'in',
            label_width: 2.0,
            label_height: 1.0,
            labels_per_row: 1,
            gap_x: 0,
            gap_y: 0.125,
            description: 'Etiqueta pequeña estándar para joyería o anaquel pequeño'
          },
          {
            id: 'zebra-2.25x1.25',
            name: '2.25" x 1.25" (Pulgadas - 1 columna)',
            unit: 'in',
            label_width: 2.25,
            label_height: 1.25,
            labels_per_row: 1,
            gap_x: 0,
            gap_y: 0.125,
            description: 'Estándar de supermercado / tienda de conveniencia'
          },
          {
            id: 'zebra-3x1',
            name: '3" x 1" (Pulgadas - 1 columna)',
            unit: 'in',
            label_width: 3.0,
            label_height: 1.0,
            labels_per_row: 1,
            gap_x: 0,
            gap_y: 0.125,
            description: 'Etiqueta de anaquel alargada'
          },
          {
            id: 'zebra-3x2',
            name: '3" x 2" (Pulgadas - 1 columna)',
            unit: 'in',
            label_width: 3.0,
            label_height: 2.0,
            labels_per_row: 1,
            gap_x: 0,
            gap_y: 0.125,
            description: 'Etiqueta mediana con descripción amplia y precio'
          },
          {
            id: 'zebra-4x2',
            name: '4" x 2" (Pulgadas - 1 columna)',
            unit: 'in',
            label_width: 4.0,
            label_height: 2.0,
            labels_per_row: 1,
            gap_x: 0,
            gap_y: 0.125,
            description: 'Etiqueta grande para cajas o empaques'
          },
          {
            id: 'zebra-4x6',
            name: '4" x 6" (Pulgadas - Envío / Paquete)',
            unit: 'in',
            label_width: 4.0,
            label_height: 6.0,
            labels_per_row: 1,
            gap_x: 0,
            gap_y: 0.125,
            description: 'Guía de envío o tarima'
          },
          {
            id: 'zebra-50x25-2col',
            name: '50 x 25 mm (2 columnas al paso)',
            unit: 'cm',
            label_width: 5.0,
            label_height: 2.5,
            labels_per_row: 2,
            gap_x: 0.2,
            gap_y: 0.3,
            description: 'Rollo de 2 etiquetas por renglón'
          },
          {
            id: 'zebra-38x25-3col',
            name: '38 x 25 mm (3 columnas al paso)',
            unit: 'cm',
            label_width: 3.8,
            label_height: 2.5,
            labels_per_row: 3,
            gap_x: 0.2,
            gap_y: 0.3,
            description: 'Rollo de 3 etiquetas por renglón'
          }
        ]
      },
      {
        model: 'ZD410 / ZD411 (2 pulgadas)',
        labelSizes: [
          {
            id: 'zebra-zd410-2x1',
            name: '2" x 1" (Pulgadas - 1 columna)',
            unit: 'in',
            label_width: 2.0,
            label_height: 1.0,
            labels_per_row: 1,
            gap_x: 0,
            gap_y: 0.125
          },
          {
            id: 'zebra-zd410-50x25',
            name: '5.0 x 2.5 cm (1 columna)',
            unit: 'cm',
            label_width: 5.0,
            label_height: 2.5,
            labels_per_row: 1,
            gap_x: 0,
            gap_y: 0.3
          },
          {
            id: 'zebra-zd410-50x30',
            name: '5.0 x 3.0 cm (1 columna)',
            unit: 'cm',
            label_width: 5.0,
            label_height: 3.0,
            labels_per_row: 1,
            gap_x: 0,
            gap_y: 0.3
          }
        ]
      }
    ]
  },
  {
    brand: 'Brother',
    models: [
      {
        model: 'QL-800 / QL-820NWB / QL-1100',
        labelSizes: [
          {
            id: 'brother-dk1201',
            name: 'DK-1201: 29 x 90 mm (Estándar de Dirección)',
            unit: 'cm',
            label_width: 9.0,
            label_height: 2.9,
            labels_per_row: 1,
            gap_x: 0,
            gap_y: 0.3,
            description: 'Troquelada estándar Brother DK-1201'
          },
          {
            id: 'brother-dk1202',
            name: 'DK-1202: 62 x 100 mm (Etiqueta Grande de Envío)',
            unit: 'cm',
            label_width: 10.0,
            label_height: 6.2,
            labels_per_row: 1,
            gap_x: 0,
            gap_y: 0.3,
            description: 'Troquelada grande Brother DK-1202'
          },
          {
            id: 'brother-dk1209',
            name: 'DK-1209: 29 x 62 mm (Pequeña de Producto)',
            unit: 'cm',
            label_width: 6.2,
            label_height: 2.9,
            labels_per_row: 1,
            gap_x: 0,
            gap_y: 0.3,
            description: 'Troquelada estándar para productos y códigos de barras'
          },
          {
            id: 'brother-dk1204',
            name: 'DK-1204: 17 x 54 mm (Multiuso Mini)',
            unit: 'cm',
            label_width: 5.4,
            label_height: 1.7,
            labels_per_row: 1,
            gap_x: 0,
            gap_y: 0.3,
            description: 'Etiqueta mini multiuso para artículos pequeños'
          }
        ]
      }
    ]
  },
  {
    brand: 'Xprinter',
    models: [
      {
        model: 'XP-365B / XP-420B / XP-235B',
        labelSizes: [
          {
            id: 'xprinter-40x30',
            name: '4.0 x 3.0 cm (1 columna)',
            unit: 'cm',
            label_width: 4.0,
            label_height: 3.0,
            labels_per_row: 1,
            gap_x: 0,
            gap_y: 0.2
          },
          {
            id: 'xprinter-50x25',
            name: '5.0 x 2.5 cm (1 columna)',
            unit: 'cm',
            label_width: 5.0,
            label_height: 2.5,
            labels_per_row: 1,
            gap_x: 0,
            gap_y: 0.2
          },
          {
            id: 'xprinter-50x30',
            name: '5.0 x 3.0 cm (1 columna)',
            unit: 'cm',
            label_width: 5.0,
            label_height: 3.0,
            labels_per_row: 1,
            gap_x: 0,
            gap_y: 0.2
          },
          {
            id: 'xprinter-60x40',
            name: '6.0 x 4.0 cm (1 columna)',
            unit: 'cm',
            label_width: 6.0,
            label_height: 4.0,
            labels_per_row: 1,
            gap_x: 0,
            gap_y: 0.3
          },
          {
            id: 'xprinter-80x50',
            name: '8.0 x 5.0 cm (1 columna)',
            unit: 'cm',
            label_width: 8.0,
            label_height: 5.0,
            labels_per_row: 1,
            gap_x: 0,
            gap_y: 0.3
          },
          {
            id: 'xprinter-50x25-2col',
            name: '5.0 x 2.5 cm (2 columnas al paso)',
            unit: 'cm',
            label_width: 5.0,
            label_height: 2.5,
            labels_per_row: 2,
            gap_x: 0.2,
            gap_y: 0.2
          }
        ]
      }
    ]
  },
  {
    brand: 'Dymo',
    models: [
      {
        model: 'LabelWriter 450 / 550 / 4XL',
        labelSizes: [
          {
            id: 'dymo-30334',
            name: 'Dymo 30334: 2.25" x 1.25" (Pulgadas)',
            unit: 'in',
            label_width: 2.25,
            label_height: 1.25,
            labels_per_row: 1,
            gap_x: 0,
            gap_y: 0.125
          },
          {
            id: 'dymo-30336',
            name: 'Dymo 30336: 1" x 2.125" (Pulgadas)',
            unit: 'in',
            label_width: 2.125,
            label_height: 1.0,
            labels_per_row: 1,
            gap_x: 0,
            gap_y: 0.125
          },
          {
            id: 'dymo-30252',
            name: 'Dymo 30252: 1.125" x 3.5" (Dirección)',
            unit: 'in',
            label_width: 3.5,
            label_height: 1.125,
            labels_per_row: 1,
            gap_x: 0,
            gap_y: 0.125
          }
        ]
      }
    ]
  },
  {
    brand: 'TSC',
    models: [
      {
        model: 'TTP-244 Pro / TE200 / DA210',
        labelSizes: [
          {
            id: 'tsc-50x25',
            name: '5.0 x 2.5 cm (1 columna)',
            unit: 'cm',
            label_width: 5.0,
            label_height: 2.5,
            labels_per_row: 1,
            gap_x: 0,
            gap_y: 0.2
          },
          {
            id: 'tsc-50x25-2col',
            name: '5.0 x 2.5 cm (2 columnas al paso)',
            unit: 'cm',
            label_width: 5.0,
            label_height: 2.5,
            labels_per_row: 2,
            gap_x: 0.2,
            gap_y: 0.2
          },
          {
            id: 'tsc-76x51',
            name: '3" x 2" (7.6 x 5.1 cm)',
            unit: 'in',
            label_width: 3.0,
            label_height: 2.0,
            labels_per_row: 1,
            gap_x: 0,
            gap_y: 0.125
          }
        ]
      }
    ]
  },
  {
    brand: 'Hojas Estándar (Láser / Inyección Carta)',
    models: [
      {
        model: 'Plantillas Avery (Hoja Carta 8.5" x 11")',
        labelSizes: [
          {
            id: 'avery-5160',
            name: 'Avery 5160: 30 etiquetas (3 cols x 10 filas - 2.625" x 1")',
            unit: 'in',
            label_width: 2.625,
            label_height: 1.0,
            labels_per_row: 3,
            gap_x: 0.125,
            gap_y: 0.0,
            margin_top: 0.5,
            margin_left: 0.188,
            page_width: 8.5,
            page_height: 11.0,
            description: 'La plantilla de 30 etiquetas más común del mundo'
          },
          {
            id: 'avery-5163',
            name: 'Avery 5163: 10 etiquetas (2 cols x 5 filas - 4" x 2")',
            unit: 'in',
            label_width: 4.0,
            label_height: 2.0,
            labels_per_row: 2,
            gap_x: 0.15,
            gap_y: 0.0,
            margin_top: 0.5,
            margin_left: 0.16,
            page_width: 8.5,
            page_height: 11.0,
            description: 'Etiquetas grandes en hoja carta'
          }
        ]
      }
    ]
  }
]

/**
 * Conversiones de unidades
 */
export function inToCm(inches: number): number {
  return Number((inches * 2.54).toFixed(3))
}

export function cmToIn(cm: number): number {
  return Number((cm / 2.54).toFixed(3))
}

export function toMm(val: number, unit: LabelUnit): number {
  if (unit === 'in') {
    return val * 25.4
  }
  return val * 10
}

/**
 * Configuración por defecto para nueva plantilla
 */
export const DEFAULT_LABEL_CONFIG = {
  name: 'Etiqueta Estándar (50 x 25 mm)',
  printer_brand: 'Zebra',
  printer_model: 'ZD220 / ZD420 / ZD421 (4 pulgadas)',
  unit: 'cm' as LabelUnit,
  label_width: 5.0,
  label_height: 2.5,
  labels_per_row: 1,
  gap_x: 0.0,
  gap_y: 0.3,
  margin_top: 0.0,
  margin_left: 0.0,
  include_item_name: true,
  include_price: true,
  price_to_print: 'price1' as LabelPriceOption,
  include_code: true,
  include_barcode: true,
  include_store_name: false,
  barcode_type: 'CODE128' as BarcodeType,
  is_default: true,
}
