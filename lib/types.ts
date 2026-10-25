// ============================================================
// CAMPIRAN — TypeScript Types
// All types centralized here. Import from '@/lib/types'
// ============================================================

// ── Auth & Profiles ─────────────────────────────────────────
export type UserRole = 'ADMIN' | 'MANAGER' | 'CASHIER' | 'ALMACENISTA' | 'PENDING'
export type ProfileStatus = 'pending' | 'active' | 'inactive'

export interface Profile {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  role: UserRole
  id_store: string | null
  status: ProfileStatus
  avatar_url: string | null
  created_at: string
  updated_at: string
  biometrics?: UserBiometric | null
}

// ── Stores (Tiendas/Sucursales) ──────────────────────────────
export type StoreStatus = 'A' | 'I'

export interface Store {
  id_store: string
  description: string | null
  location: string | null
  latitude?: number | null
  longitude?: number | null
  geofence_radius?: number | null
  status: StoreStatus
  is_selected: boolean
  created_at: string
}

// ── Locations (Ubicaciones) ──────────────────────────────────
export interface Location {
  id_location: string
  id_store: string | null
  description: string | null
  status: 'A' | 'I'
  is_selected: boolean
  created_at: string
}

export interface LocationLabelSettings {
  id_label_setting: string
  id_location: string | null
  printer_name: string | null
  paper_width: number
  paper_height: number
  margin_top: number
  margin_bottom: number
  margin_left: number
  margin_right: number
  font_size: number
  barcode_height: number
  updated_at: string
  created_at: string
}

// ── Company Settings (Global / Multi-sucursal) ───────────────
export interface CompanySettings {
  id_company: string
  legal_name: string | null
  trade_name: string | null
  rfc: string | null
  tax_regime: string | null
  tax_regime_code: string | null
  street: string | null
  exterior_number: string | null
  interior_number: string | null
  neighborhood: string | null
  postal_code: string | null
  city: string | null
  state: string | null
  country: string | null
  phone: string | null
  email: string | null
  website: string | null
  logo_url: string | null
  ticket_footer_message: string | null
  qz_cert?: string | null
  qz_private_key?: string | null
  created_at?: string
  updated_at?: string
}

// ── Branch Printers (Por Sucursal / QZ Tray) ─────────────────
export type PrinterConnectionType = 'network' | 'bluetooth'

export interface BranchPrinter {
  id_printer: string
  id_store: string
  name: string
  connection_type: PrinterConnectionType
  ip_address: string | null
  ip_port: number
  bluetooth_name: string | null
  paper_width: number
  characters_per_line: number
  cut_paper: boolean
  open_cash_drawer: boolean
  is_default: boolean
  status: 'A' | 'I'
  created_at?: string
  updated_at?: string
}

// ── Branch Label Printers & Configs (Por Sucursal) ───────────
export type LabelUnit = 'cm' | 'in'
export type BarcodeType = 'CODE128' | 'EAN13'
export type LabelPriceOption = 'price1' | 'price2' | 'price3'

export interface BranchLabelConfig {
  id_config: string
  id_store: string
  name: string
  printer_brand: string
  printer_model: string | null
  unit: LabelUnit
  label_width: number
  label_height: number
  labels_per_row: number
  gap_x: number
  gap_y: number
  margin_top: number
  margin_left: number
  page_width: number | null
  page_height: number | null
  include_item_name: boolean
  include_price: boolean
  price_to_print: LabelPriceOption
  include_code: boolean
  include_barcode: boolean
  include_store_name: boolean
  barcode_type: BarcodeType
  is_default: boolean
  status: 'A' | 'I'
  created_at?: string
  updated_at?: string
}

export interface LabelPrintQueueItem {
  id_item: string
  code: string | null
  barcode: string | null
  description: string | null
  price1?: number | null
  price2?: number | null
  price3?: number | null
  quantity: number // cuántas etiquetas imprimir de este producto
}

// ── Catalog ──────────────────────────────────────────────────
export interface Area {
  id_area: string
  description: string | null
  status: 'A' | 'I'
  is_selected: boolean
  created_at: string
}

export interface Department {
  id_department: string
  description: string | null
  status: 'A' | 'I'
  is_selected: boolean
  created_at: string
}

export interface Category {
  id_category: string
  description: string | null
  status: 'A' | 'I'
  is_selected: boolean
  created_at: string
}

export interface CatalogSat {
  id_sat: string
  description: string | null
}

export type ItemType = 'P' | 'S' // Producto | Servicio
export type ItemClassification = 'REGULAR' | 'FICHA_TECNICA'

export interface Item {
  id_item: string
  code: string | null
  barcode: string | null
  description: string | null
  description_short: string | null
  type: ItemType | null
  classification?: ItemClassification | null
  id_area: string | null
  id_department: string | null
  id_category: string | null
  unit: string | null
  cost: number | null
  last_cost: number | null
  price: number | null
  tax: number
  comission: number | null
  status: 'A' | 'I'
  id_sat: string | null
  unit_sat: string | null
  created_at: string
  price1: number | null
  price2: number | null
  price3: number | null
  // Relations (joined)
  area?: Area
  department?: Department
  category?: Category
  item_images?: ItemImage[]
}

export interface ItemImage {
  id_item_image: string
  id_item: string | null
  created_at: string
  image_url: string | null
  image_path: string | null
  is_cover?: boolean
}

export interface PriceHistory {
  id_price_history: string
  id_item: string | null
  price: number
  cost: number | null
  tax: number | null
  price_type: string | null
  valid_from: string
  valid_to: string | null
  changed_by: string | null
  comments: string | null
  created_at: string
}

// ── Stocks & Transactions ────────────────────────────────────
export interface Stock {
  id_stock: string
  id_item: string | null
  id_store: string | null
  id_location: string | null
  initial: number
  previous: number
  current: number
  pre_inventory_stock?: number
  last_inventory_reset_at?: string | null
  last_inventory_reset_by?: string | null
  maximum: number
  minimum: number
  reorder_point: number
  created_at: string
  // Relations (joined)
  item?: Item
  store?: Store
  location?: Location
}

export type MovimType = 'E' | 'S' | 'V' | 'I' | 'A' | 'T' // Entrada|Salida|Venta|Inventario|Ajuste|Traspaso

export interface Transaction {
  id_transaction: string
  id_store: string | null
  id_location: string | null
  id_item: string | null
  id_user: string | null
  date_transaction: string
  movim_type: MovimType | null
  reference: string | null
  amount_enrty: number
  amount_exit: number
  cost: number
  price: number
  concept: string | null
  origin: string | null
  comments: string | null
  stock_before?: number | null
  stock_after?: number | null
  id_purchase?: string | null
  id_supplier?: string | null
  created_at: string
  // Relations
  item?: Item
  store?: Store
  location?: Location
  supplier?: Supplier
}

// ── Inventory (Inventario Físico) ────────────────────────────
export type SessionStatus = 'A' | 'C' // Abierta | Cerrada

export interface InventorySession {
  id_session: string
  id_store: string | null
  id_user: string | null
  status: SessionStatus
  notes: string | null
  created_at: string
  closed_at: string | null
  // Relations
  store?: Store
  user?: Profile
}

export interface InventoryReading {
  id_reading: string
  id_session: string | null
  id_item: string | null
  id_store: string | null
  id_location: string | null
  id_user: string | null
  quantity: number
  stock_before: number
  stock_physical: number
  stock_diff: number
  created_at: string
  // Relations
  item?: Item
  location?: Location
  user?: Profile
}

// ── Orders & POS ─────────────────────────────────────────────
export type OrderStatus = 'pending' | 'completed' | 'cancelled'
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'mixed'

export type SatPaymentCode = '01' | '02' | '03' | '04' | '28' | '99'

export interface SatPaymentMethodInfo {
  code: SatPaymentCode
  label: string
  description: string
  isCredit?: boolean
}

export interface PaymentBreakdownItem {
  method: SatPaymentCode
  amount?: number
  amountMxn: number
  amountUsd?: number
  currency: 'MXN' | 'USD'
  reference?: string
}

export interface CashShift {
  id_shift: string
  id_store: string
  id_user: string
  opened_at: string
  closed_at: string | null
  initial_cash_mxn: number
  initial_cash_usd: number
  exchange_rate: number
  final_cash_mxn: number | null
  final_cash_usd: number | null
  status: 'open' | 'closed'
  notes: string | null
  auth_method?: 'webauthn' | 'face' | 'pin' | 'biometric'
  created_at: string
  updated_at: string
  // Relations
  user?: Profile
  store?: Store
}

export interface UserBiometric {
  id_biometric: string
  id_user: string
  cashier_number: string | null
  cashier_pin: string | null
  has_webauthn: boolean
  webauthn_credential: Record<string, unknown> | null
  has_face: boolean
  face_photo_url: string | null
  face_descriptor: number[] | Record<string, unknown> | null
  created_at: string
  updated_at?: string
}

// ── Employee Attendance (Control de Asistencia / Horas Trabajadas) ──
export type AttendanceStatus = 'open' | 'closed'
export type AttendanceAuthMethod = 'session' | 'pin' | 'webauthn' | 'face' | 'biometric'

export interface EmployeeAttendance {
  id_attendance: string
  id_user: string
  id_store: string
  check_in: string
  check_out: string | null
  total_minutes: number
  notes: string | null
  status: AttendanceStatus
  auth_method?: AttendanceAuthMethod
  created_at: string
  updated_at: string
  // Relations
  user?: Profile
  store?: Store
}

export interface AttendanceDailySummary {
  date: string // YYYY-MM-DD
  userId: string
  userName: string
  userEmail: string | null
  userRole: UserRole
  storeId: string
  storeName: string
  records: EmployeeAttendance[]
  firstCheckIn: string
  lastCheckOut: string | null
  totalMinutes: number
  totalHoursFormatted: string
  hasOpenShift: boolean
}

export interface Order {
  id_order: string
  order_number: number
  id_client: string | null
  id_store: string | null
  id_shift?: string | null
  total_amount: number
  tax_amount: number
  shipping_cost: number
  status: OrderStatus
  payment_method: PaymentMethod | null
  payment_sat_code?: SatPaymentCode | null
  payment_breakdown?: PaymentBreakdownItem[] | null
  exchange_rate?: number
  cash_received_mxn?: number
  cash_received_usd?: number
  change_mxn?: number
  change_usd?: number
  payment_reference: string | null
  notes?: string | null
  shipping_address: Record<string, unknown> | null
  created_at: string
  cancelled_at?: string | null
  cancelled_by?: string | null
  cancelled_by_name?: string | null
  cancellation_reason?: string | null
  cancellation_auth_method?: 'pin' | 'webauthn' | 'face' | 'biometric' | null
  // Relations
  client?: Client
  store?: Store
  shift?: CashShift
  order_items?: OrderItem[]
}

export interface OrderItem {
  id_order_item: string
  id_order: string | null
  id_item: string | null
  quantity: number
  unit_price: number
  total_price: number
  created_at: string
  // Relations
  item?: Item
}

export interface Cart {
  id_cart: string
  id_client: string | null
  session_id: string | null
  status: 'active' | 'checkout' | 'abandoned'
  created_at: string
  updated_at: string
}

export interface CartItem {
  id_cart_item: string
  id_cart: string | null
  id_item: string | null
  quantity: number
  added_at: string
  // Relations
  item?: Item
}

// ── Clients ──────────────────────────────────────────────────
export interface Client {
  id_client: string
  id_auth_user: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  rfc: string | null
  address: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string
  status: 'A' | 'I'
  created_at: string
  price_number: number
  branch?: string | null
  comments?: string | null
  // Relations
  shipping_addresses?: ShippingAddress[]
}

export interface ShippingAddress {
  id_address: string
  id_client: string
  alias: string | null
  recipient_name: string | null
  street: string | null
  exterior_num: string | null
  interior_num: string | null
  neighborhood: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  phone: string | null
  is_default: boolean
  created_at: string
}

// ── Suppliers & Purchases (Compras / Cuentas por Pagar) ──────
export interface Supplier {
  id_supplier: string
  supplier_name: string | null
  rfc: string | null
  address: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  phone: string | null
  email1: string | null
  email2: string | null
  web_page: string | null
  contact: string | null
  credit_days: number
  credit_limit: number
  status: 'A' | 'I'
  is_selected: boolean
  created_at: string
}

export type PurchaseCondition = 'CONTADO' | 'CREDITO'
export type PurchasePaymentStatus = 'PAID' | 'PENDING' | 'PARTIAL'
export type PurchaseStatus = 'DRAFT' | 'RECEIVED' | 'CANCELLED'

export interface PurchaseItem {
  id_purchase_item: string
  id_purchase: string
  id_item: string
  quantity: number
  previous_cost: number
  unit_cost: number
  tax_percent: number
  tax_amount: number
  discount_amount: number
  subtotal: number
  total_cost: number
  stock_before: number
  stock_after: number
  new_price1?: number | null
  created_at?: string
  // Relations
  item?: Item
}

export interface PurchasePayment {
  id_payment: string
  id_purchase: string
  id_store: string
  id_supplier: string | null
  id_user: string | null
  amount: number
  payment_method: string
  reference: string | null
  notes: string | null
  payment_date: string
  status: 'A' | 'I'
  created_at: string
  // Relations
  user?: Profile
  supplier?: Supplier
}

export interface Purchase {
  id_purchase: string
  purchase_number: number
  id_store: string
  id_location: string | null
  id_supplier: string | null
  id_user: string | null
  invoice_number: string | null
  purchase_date: string
  received_at: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  payment_condition: PurchaseCondition
  payment_method: string | null
  payment_status: PurchasePaymentStatus
  credit_days: number
  due_date: string | null
  subtotal: number
  discount_amount: number
  tax_amount: number
  total_amount: number
  paid_amount: number
  balance_due: number
  update_item_cost: boolean
  notes: string | null
  purchase_status: PurchaseStatus
  status: 'A' | 'I'
  created_at: string
  updated_at: string
  // Relations
  supplier?: Supplier
  location?: Location
  store?: Store
  user?: Profile
  purchase_items?: PurchaseItem[]
  purchase_payments?: PurchasePayment[]
}

export interface SupplierAccountSummary {
  supplier: Supplier
  totalPurchasesCount: number
  totalPurchasedAmount: number
  totalPaidAmount: number
  totalBalanceDue: number
  overdueCount: number
  overdueAmount: number
  availableCredit: number
  pendingPurchases: Purchase[]
}

// ── Branch Transfers (Traspasos entre Sucursales) ────────────
export type TransferMode = 'TRANSIT' | 'DIRECT'
export type TransferStatus = 'IN_TRANSIT' | 'RECEIVED' | 'PARTIAL' | 'CANCELLED'
export type TransferDiscrepancyResolution = 'RETURN_TO_ORIGIN' | 'REGISTER_DISCREPANCY'

export interface BranchTransferItem {
  id_transfer_item: string
  id_transfer: string
  id_item: string
  quantity_sent: number
  quantity_received: number
  unit_cost: number
  unit_price: number
  stock_origin_before: number
  stock_dest_before: number
  notes: string | null
  status: 'A' | 'I'
  created_at: string
  // Relations
  item?: Item
}

export interface BranchTransfer {
  id_transfer: string
  folio: number
  id_origin_store: string
  id_origin_location: string | null
  id_dest_store: string
  id_dest_location: string | null
  transfer_mode: TransferMode
  status: TransferStatus
  record_status: 'A' | 'I'
  id_sent_by: string | null
  sent_by_name: string | null
  id_received_by: string | null
  received_by_name: string | null
  id_cancelled_by: string | null
  cancelled_by_name: string | null
  total_items: number
  total_quantity_sent: number
  total_quantity_received: number
  total_cost: number
  notes: string | null
  reception_notes: string | null
  cancellation_reason: string | null
  sent_at: string
  received_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
  // Relations
  origin_store?: Store
  origin_location?: Location
  dest_store?: Store
  dest_location?: Location
  transfer_items?: BranchTransferItem[]
}

// ── POS Cart (local state, not persisted) ────────────────────
export interface CartItemLocal {
  item: Item
  quantity: number
  unitPrice: number
  priceList: 1 | 2 | 3
  totalPrice: number
}

// ── Realtime Payload ─────────────────────────────────────────
export interface RealtimePayload<T> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: T
  old: Partial<T>
  schema: string
  table: string
}


