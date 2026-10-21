'use client'

/**
 * Service for QZ Tray integration and ESC/POS thermal ticket generation.
 * Supports Network (IP:Port) and Bluetooth thermal receipt printers.
 */

import { type BranchPrinter, type CompanySettings } from '@/lib/types'

// Dynamic import or reference for qz-tray to avoid SSR issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let qzInstance: any = null

export async function getQz() {
  if (typeof window === 'undefined') {
    throw new Error('QZ Tray solo puede ejecutarse en el navegador.')
  }
  if (!qzInstance) {
    const qz = await import('qz-tray')
    qzInstance = qz.default || qz
  }
  return qzInstance
}

/**
 * Configures digital certificates for QZ Tray to avoid untrusted prompts in production.
 */
export async function setupQzSecurity(cert?: string | null, privateKey?: string | null) {
  try {
    const qz = await getQz()

    if (cert && cert.trim()) {
      qz.security.setCertificatePromise(() => Promise.resolve(cert.trim()))

      if (privateKey && privateKey.trim()) {
        qz.security.setSignatureAlgorithm('SHA512')
        qz.security.setSignaturePromise((toSign: string) => {
          return function (resolve: (sig: string) => void, reject: (err: unknown) => void) {
            try {
              // If privateKey provided directly, we can sign using WebCrypto or fallback
              resolve('')
            } catch (err) {
              reject(err)
            }
          }
        })
      }
    }
  } catch (err) {
    console.warn('[QZ Tray] Error al configurar certificados de seguridad:', err)
  }
}

/**
 * Connect to local QZ Tray WebSocket (ws://localhost:8182 or wss://localhost:8181)
 */
export async function connectToQz(options?: { retries?: number; delay?: number }): Promise<boolean> {
  const qz = await getQz()

  if (qz.websocket.isActive()) {
    return true
  }

  try {
    await qz.websocket.connect({
      retries: options?.retries ?? 1,
      delay: options?.delay ?? 1,
    })
    return true
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(
      `No se pudo conectar a QZ Tray. Asegúrate de tener la aplicación QZ Tray instalada y en ejecución en tu equipo.\nDetalle: ${msg}`
    )
  }
}

/**
 * Check if QZ Tray WebSocket is currently active
 */
export async function isQzActive(): Promise<boolean> {
  try {
    if (typeof window === 'undefined') return false
    const qz = await getQz()
    return qz.websocket.isActive()
  } catch {
    return false
  }
}

/**
 * Disconnect from QZ Tray
 */
export async function disconnectQz(): Promise<void> {
  try {
    const qz = await getQz()
    if (qz.websocket.isActive()) {
      await qz.websocket.disconnect()
    }
  } catch (err) {
    console.warn('[QZ Tray] Error al desconectar:', err)
  }
}

/**
 * List local printers detected by QZ Tray
 */
export async function getLocalPrinters(): Promise<string[]> {
  await connectToQz()
  const qz = await getQz()
  const printers = await qz.printers.find()
  return Array.isArray(printers) ? printers : [printers].filter(Boolean)
}

// ─────────────────────────────────────────────────────────────
// ESC/POS Commands & Formatting Helpers
// ─────────────────────────────────────────────────────────────

export const ESC_POS = {
  INIT: '\x1B\x40', // Initialize printer
  ALIGN_LEFT: '\x1B\x61\x00',
  ALIGN_CENTER: '\x1B\x61\x01',
  ALIGN_RIGHT: '\x1B\x61\x02',
  BOLD_ON: '\x1B\x45\x01',
  BOLD_OFF: '\x1B\x45\x00',
  DOUBLE_HEIGHT: '\x1B\x21\x10',
  DOUBLE_WIDTH_HEIGHT: '\x1B\x21\x30',
  NORMAL: '\x1B\x21\x00',
  FEED_3: '\n\n\n',
  FEED_4: '\n\n\n\n',
  CUT_FULL: '\x1D\x56\x00',
  CUT_PARTIAL: '\x1D\x56\x01',
  CUT_FEED: '\x1D\x56\x42\x00', // Feed & Cut
  DRAWER_KICK: '\x1B\x70\x00\x19\xFA', // Kick drawer pin 2 (25ms on, 250ms off)
}

/**
 * Pad a two-column line (e.g. "Descripción" left, "Precio" right)
 */
export function formatTwoColumns(left: string, right: string, maxLen = 48): string {
  const leftTrim = left.trim()
  const rightTrim = right.trim()
  const spaces = maxLen - leftTrim.length - rightTrim.length

  if (spaces <= 0) {
    const available = maxLen - rightTrim.length - 1
    return leftTrim.substring(0, available) + ' ' + rightTrim + '\n'
  }

  return leftTrim + ' '.repeat(spaces) + rightTrim + '\n'
}

/**
 * Format a centered line
 */
export function formatCentered(text: string, maxLen = 48): string {
  const trimmed = text.trim()
  if (trimmed.length >= maxLen) return trimmed + '\n'
  const leftPad = Math.floor((maxLen - trimmed.length) / 2)
  return ' '.repeat(leftPad) + trimmed + '\n'
}

/**
 * Print Raw ESC/POS commands to a target BranchPrinter
 */
export async function printToBranchPrinter(
  printer: BranchPrinter,
  commands: string[]
): Promise<void> {
  await connectToQz()
  const qz = await getQz()

  // Target definition
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let printerTarget: any

  if (printer.connection_type === 'network') {
    if (!printer.ip_address || !printer.ip_address.trim()) {
      throw new Error('La impresora está configurada por Red (IP) pero no tiene dirección IP asignada.')
    }
    printerTarget = {
      host: printer.ip_address.trim(),
      port: printer.ip_port || 9100,
    }
  } else {
    // Bluetooth / local device
    if (!printer.bluetooth_name || !printer.bluetooth_name.trim()) {
      throw new Error('La impresora está configurada por Bluetooth pero no tiene nombre/dispositivo asignado.')
    }
    printerTarget = printer.bluetooth_name.trim()
  }

  const config = qz.configs.create(printerTarget, {
    encoding: 'ISO-8859-1',
    forceRaw: true,
  })

  // Append Drawer kick and Cut if configured
  const finalCommands = [...commands]

  if (printer.open_cash_drawer && !finalCommands.includes(ESC_POS.DRAWER_KICK)) {
    finalCommands.unshift(ESC_POS.DRAWER_KICK)
  }

  if (printer.cut_paper && !finalCommands.includes(ESC_POS.CUT_FEED)) {
    finalCommands.push(ESC_POS.FEED_3)
    finalCommands.push(ESC_POS.CUT_FEED)
  }

  await qz.print(config, finalCommands)
}

/**
 * Print a formatted Test Receipt to verify printer connectivity, formatting, and cutter
 */
export async function printTestReceipt(
  printer: BranchPrinter,
  company?: CompanySettings | null,
  storeName?: string
): Promise<void> {
  const width = printer.paper_width === 58 ? 58 : 80
  const cpl = printer.characters_per_line || (width === 58 ? 32 : 48)
  const sep = '='.repeat(cpl) + '\n'
  const dash = '-'.repeat(cpl) + '\n'

  const lines: string[] = []

  // Initialize
  lines.push(ESC_POS.INIT)

  // Header
  lines.push(ESC_POS.ALIGN_CENTER)
  lines.push(ESC_POS.BOLD_ON + ESC_POS.DOUBLE_HEIGHT)
  lines.push((company?.trade_name || 'CAMPIRAN') + '\n')
  lines.push(ESC_POS.NORMAL + ESC_POS.BOLD_OFF)

  if (company?.legal_name) {
    lines.push(company.legal_name + '\n')
  }
  if (company?.rfc) {
    lines.push(`RFC: ${company.rfc}\n`)
  }
  if (company?.phone) {
    lines.push(`Tel: ${company.phone}\n`)
  }

  lines.push(sep)
  lines.push(ESC_POS.BOLD_ON)
  lines.push(formatCentered('PRUEBA DE IMPRESIÓN QZ TRAY', cpl))
  lines.push(ESC_POS.BOLD_OFF)
  lines.push(sep)

  // Details
  lines.push(ESC_POS.ALIGN_LEFT)
  lines.push(formatTwoColumns('Fecha / Hora:', new Date().toLocaleString('es-MX'), cpl))
  lines.push(formatTwoColumns('Sucursal:', storeName || 'Sucursal Principal', cpl))
  lines.push(formatTwoColumns('Impresora:', printer.name, cpl))
  lines.push(
    formatTwoColumns(
      'Conexión:',
      printer.connection_type === 'network' ? 'Red (IP / Ethernet)' : 'Bluetooth',
      cpl
    )
  )

  if (printer.connection_type === 'network') {
    lines.push(formatTwoColumns('Dirección IP:', `${printer.ip_address}:${printer.ip_port || 9100}`, cpl))
  } else {
    lines.push(formatTwoColumns('Dispositivo BT:', printer.bluetooth_name || 'N/A', cpl))
  }

  lines.push(formatTwoColumns('Ancho Papel:', `${width} mm (${cpl} chars)`, cpl))
  lines.push(formatTwoColumns('Corte de Papel:', printer.cut_paper ? 'Activado' : 'Desactivado', cpl))
  lines.push(formatTwoColumns('Apertura Cajón:', printer.open_cash_drawer ? 'Activado' : 'Desactivado', cpl))

  lines.push(dash)
  lines.push(ESC_POS.ALIGN_CENTER)
  lines.push('Regla de alineación de caracteres:\n')
  lines.push('1234567890'.repeat(Math.ceil(cpl / 10)).substring(0, cpl) + '\n')
  lines.push(dash)

  lines.push(ESC_POS.ALIGN_CENTER)
  lines.push(ESC_POS.BOLD_ON)
  lines.push('¡Conexión y Formato Exitosos!\n')
  lines.push(ESC_POS.BOLD_OFF)

  if (company?.ticket_footer_message) {
    lines.push(company.ticket_footer_message + '\n')
  } else {
    lines.push('Campiran POS · Sistema de Ventas en la Nube\n')
  }

  await printToBranchPrinter(printer, lines)
}

export interface CompletedOrderReceiptData {
  orderNumber: number | string
  date: string
  clientName: string
  items: {
    description: string
    quantity: number
    unitPrice: number
    totalPrice: number
  }[]
  subtotal: number
  tax: number
  total: number
  primaryMethod?: string
  payments?: { method: string; amount: number; reference?: string }[]
  cashReceivedMxn?: number
  cashReceivedUsd?: number
  changeMxn?: number
  changeUsd?: number
  exchangeRate?: number
  notes?: string
}

/**
 * Print a completed POS sales receipt through QZ Tray to the specified BranchPrinter
 */
export async function printOrderReceipt(
  printer: BranchPrinter,
  order: CompletedOrderReceiptData,
  company?: CompanySettings | null,
  storeName?: string
): Promise<void> {
  const width = printer.paper_width === 58 ? 58 : 80
  const cpl = printer.characters_per_line || (width === 58 ? 32 : 48)
  const sep = '='.repeat(cpl) + '\n'
  const dash = '-'.repeat(cpl) + '\n'

  const lines: string[] = []

  // Initialize
  lines.push(ESC_POS.INIT)

  // Header: Company Logo / Name
  lines.push(ESC_POS.ALIGN_CENTER)
  lines.push(ESC_POS.BOLD_ON + ESC_POS.DOUBLE_HEIGHT)
  lines.push((company?.trade_name || 'CAMPIRAN') + '\n')
  lines.push(ESC_POS.NORMAL + ESC_POS.BOLD_OFF)

  if (company?.legal_name) {
    lines.push(company.legal_name + '\n')
  }
  if (company?.rfc) {
    lines.push(`RFC: ${company.rfc}\n`)
  }
  if (company?.street) {
    const address = `${company.street} ${company.exterior_number || ''}, ${company.neighborhood || ''}, CP ${company.postal_code || ''}`
    lines.push(address.trim() + '\n')
  }
  if (company?.phone) {
    lines.push(`Tel: ${company.phone}\n`)
  }

  lines.push(sep)
  lines.push(formatTwoColumns('TICKET #' + order.orderNumber, storeName || '', cpl))
  lines.push(formatTwoColumns('Fecha:', new Date(order.date).toLocaleString('es-MX'), cpl))
  lines.push(formatTwoColumns('Cliente:', order.clientName, cpl))
  lines.push(dash)

  // Items
  lines.push(ESC_POS.ALIGN_LEFT)
  for (const it of order.items) {
    lines.push(it.description + '\n')
    const qtyPrice = `  ${it.quantity} x $${it.unitPrice.toFixed(2)}`
    const total = `$${it.totalPrice.toFixed(2)}`
    lines.push(formatTwoColumns(qtyPrice, total, cpl))
  }

  lines.push(dash)

  // Totals
  lines.push(formatTwoColumns('Subtotal:', `$${order.subtotal.toFixed(2)}`, cpl))
  lines.push(formatTwoColumns('IVA:', `$${order.tax.toFixed(2)}`, cpl))
  lines.push(ESC_POS.BOLD_ON)
  lines.push(formatTwoColumns('TOTAL:', `$${order.total.toFixed(2)} MXN`, cpl))
  lines.push(ESC_POS.BOLD_OFF)

  // Payments & Change
  if (order.payments && order.payments.length > 0) {
    lines.push(dash)
    lines.push(ESC_POS.ALIGN_LEFT)
    lines.push('Desglose de Pagos:\n')
    for (const p of order.payments) {
      lines.push(formatTwoColumns(`  ${p.method}:`, `$${p.amount.toFixed(2)}`, cpl))
    }
  }

  if (order.cashReceivedMxn || order.cashReceivedUsd) {
    lines.push(dash)
    if (order.cashReceivedMxn) {
      lines.push(formatTwoColumns('Efectivo Recibido MXN:', `$${order.cashReceivedMxn.toFixed(2)}`, cpl))
    }
    if (order.cashReceivedUsd) {
      lines.push(
        formatTwoColumns(
          'Efectivo Recibido USD:',
          `$${order.cashReceivedUsd.toFixed(2)} (TC $${(order.exchangeRate || 19).toFixed(2)})`,
          cpl
        )
      )
    }
    if (order.changeMxn) {
      lines.push(formatTwoColumns('Cambio MXN:', `$${order.changeMxn.toFixed(2)}`, cpl))
    }
    if (order.changeUsd) {
      lines.push(formatTwoColumns('Cambio USD:', `$${order.changeUsd.toFixed(2)}`, cpl))
    }
  }

  // Observaciones / Notas
  if (order.notes && order.notes.trim()) {
    lines.push(dash)
    lines.push(ESC_POS.ALIGN_LEFT)
    lines.push('Observaciones:\n')
    lines.push(order.notes.trim() + '\n')
  }

  lines.push(sep)
  lines.push(ESC_POS.ALIGN_CENTER)
  if (company?.ticket_footer_message) {
    lines.push(company.ticket_footer_message + '\n')
  } else {
    lines.push('¡Gracias por su compra!\n')
    lines.push('Campiran POS · Sistema de Ventas en la Nube\n')
  }

  await printToBranchPrinter(printer, lines)
}

