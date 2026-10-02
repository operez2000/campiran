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
}

// ── Stores (Tiendas/Sucursales) ──────────────────────────────
export type StoreStatus = 'A' | 'I'

export interface Store {
  id_store: string
  description: string | null
  location: string | null
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

export interface Item {
  id_item: string
  code: string | null
  barcode: string | null
  description: string | null
  description_short: string | null
  type: ItemType | null
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
  maximum: number
  minimum: number
  reorder_point: number
  created_at: string
  // Relations (joined)
  item?: Item
  store?: Store
  location?: Location
}

export type MovimType = 'E' | 'S' | 'V' | 'I' | 'A' // Entrada|Salida|Venta|Inventario|Ajuste

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
  created_at: string
  // Relations
  item?: Item
  store?: Store
  location?: Location
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

export interface Order {
  id_order: string
  order_number: number
  id_client: string | null
  id_store: string | null
  total_amount: number
  tax_amount: number
  shipping_cost: number
  status: OrderStatus
  payment_method: PaymentMethod | null
  payment_reference: string | null
  shipping_address: Record<string, unknown> | null
  created_at: string
  // Relations
  client?: Client
  store?: Store
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

// ── Suppliers ────────────────────────────────────────────────
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
