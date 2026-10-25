/**
 * Generador nativo y vectorial de Código de Barras Code 128 (SVG)
 * No requiere librerías externas. 100% compatible con SSR y Navegador.
 */

// Patrones de codificación Code 128 (107 símbolos: cada patrón indica el ancho de barras y espacios)
// Formato: 6 dígitos que alternan barra-espacio-barra-espacio-barra-espacio
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', // 0-9
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', // 10-19
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', // 20-29
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', // 30-39
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', // 40-49
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', // 50-59
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', // 60-69
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', // 70-79
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', // 80-89
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', // 90-99
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112' // 100-106 (106 es STOP con 7 dígitos)
]

const START_CODE_B = 104 // Start B para caracteres ASCII estándar
const STOP_CODE = 106

/**
 * Codifica una cadena de texto en Code 128 (Subset B)
 */
export function encodeCode128B(text: string): { modules: number[]; checksum: number } {
  const codes: number[] = [START_CODE_B]

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i)
    // En Subset B, el valor es charCode - 32 para ASCII 32..126
    if (charCode >= 32 && charCode <= 126) {
      codes.push(charCode - 32)
    } else {
      // Reemplazo para caracteres fuera de rango
      codes.push(63 - 32) // '?'
    }
  }

  // Calcular Checksum: (START + SUM(index * value)) % 103
  let sum = codes[0]
  for (let i = 1; i < codes.length; i++) {
    sum += i * codes[i]
  }
  const checksum = sum % 103
  codes.push(checksum)
  codes.push(STOP_CODE)

  // Convertir códigos a array de módulos (1 = barra, 0 = espacio)
  const modules: number[] = []
  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code] || CODE128_PATTERNS[0]
    let isBar = true
    for (let p = 0; p < pattern.length; p++) {
      const width = parseInt(pattern[p], 10)
      for (let w = 0; w < width; w++) {
        modules.push(isBar ? 1 : 0)
      }
      isBar = !isBar
    }
  }

  return { modules, checksum }
}

export interface BarcodeSvgOptions {
  width?: number | string
  height?: number
  barWidth?: number // Ancho de módulo en px
  showText?: boolean
  fontSize?: number
  textMargin?: number
  color?: string
  background?: string
  quietZone?: number // Módulos de margen lateral
}

/**
 * Genera el SVG completo en formato string para el código de barras
 */
export function generateBarcodeSvg(data: string, options?: BarcodeSvgOptions): string {
  const cleanData = (data || '000000').trim()
  const { modules } = encodeCode128B(cleanData)

  const barWidth = options?.barWidth ?? 1
  const barHeight = options?.height ?? 50
  const showText = options?.showText ?? false
  const fontSize = options?.fontSize ?? 12
  const textMargin = options?.textMargin ?? 4
  const color = options?.color ?? '#000000'
  const background = options?.background ?? 'transparent'
  const quietZone = options?.quietZone ?? 5

  const totalModules = modules.length + quietZone * 2
  const svgWidth = totalModules * barWidth
  const totalHeight = barHeight + (showText ? fontSize + textMargin + 2 : 0)

  // Agrupar barras contiguas para optimizar tamaño del SVG
  const rects: string[] = []
  let currentStart: number | null = null

  for (let i = 0; i < modules.length; i++) {
    const isBar = modules[i] === 1
    if (isBar && currentStart === null) {
      currentStart = i
    } else if (!isBar && currentStart !== null) {
      const rectX = (currentStart + quietZone) * barWidth
      const rectW = (i - currentStart) * barWidth
      rects.push(`<rect x="${rectX}" y="0" width="${rectW}" height="${barHeight}" fill="${color}" shape-rendering="crispEdges" />`)
      currentStart = null
    }
  }
  if (currentStart !== null) {
    const rectX = (currentStart + quietZone) * barWidth
    const rectW = (modules.length - currentStart) * barWidth
    rects.push(`<rect x="${rectX}" y="0" width="${rectW}" height="${barHeight}" fill="${color}" shape-rendering="crispEdges" />`)
  }

  const textElement = showText
    ? `<text x="${svgWidth / 2}" y="${barHeight + fontSize + textMargin}" text-anchor="middle" font-family="monospace, monospace" font-size="${fontSize}" font-weight="600" fill="${color}">${escapeXml(cleanData)}</text>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${totalHeight}" width="${options?.width || '100%'}" height="${options?.height ? `${totalHeight}px` : '100%'}" shape-rendering="crispEdges" style="background-color: ${background}; display: block; margin: 0 auto; shape-rendering: crispEdges;">
  ${rects.join('\n  ')}
  ${textElement}
</svg>`
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '&': return '&amp;'
      case '\'': return '&apos;'
      case '"': return '&quot;'
      default: return c
    }
  })
}
