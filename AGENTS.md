<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# CAMPIRAN — AGENTS.md

> Guía de contexto completa para agentes de IA trabajando en este repositorio.
> Este archivo es la **fuente de verdad** para convenciones, arquitectura, patrones y reglas del proyecto.
> **NO modifica ninguna lógica de la aplicación.**

---

## ⚠️ REGLAS CRÍTICAS (LEER ANTES DE TOCAR CUALQUIER ARCHIVO)

1. **Next.js 16 tiene breaking changes** — Lee `node_modules/next/dist/docs/` antes de escribir cualquier código de routing, rendering o Server Actions. Las convenciones del App Router pueden diferir de tu training data.
2. **Todo el UI está en español** — Labels, mensajes de error, placeholders, toasts, confirmaciones, comentarios en código orientados al usuario: **100% en español**. Los comentarios técnicos pueden ser en inglés.
3. **Nunca uses `"use client"` innecesariamente** — Favorece Server Components. Solo añade `"use client"` cuando sea estrictamente necesario (interactividad, hooks de estado, Realtime subscriptions, `framer-motion`).
4. **RLS siempre activo** — Nunca hagas queries sin pasar por el cliente de Supabase con la sesión del usuario. El `serviceRole` (admin client) solo se usa en Server Actions que requieren bypass de RLS.
5. **No rompas el diseño glassmorphism** — El lenguaje visual del Login es la referencia de **toda** la app. Ver sección UI/UX.
6. **100% Realtime** — Todas las operaciones críticas (ventas POS, stock, inventario físico, notificaciones) operan en tiempo real. No existe polling; todo fluye por Supabase Realtime.
7. **Eliminación siempre lógica** — Jamás usar `DELETE FROM` en tablas de negocio. Siempre `status = 'I'` y/o `deleted_at` + `deleted_by`.
8. **No hardcodees IDs** — Nunca hardcodear IDs de tienda/sucursal, usuario o cualquier entidad. Siempre obtener el contexto del perfil autenticado.
9. **Sucursal activa siempre en contexto** — Toda operación de negocio (venta, lectura de inventario, stock) debe estar asociada a la `id_store` activa del usuario. Obtenerla siempre del `StoreProvider`.

---

## 🗂️ STACK TECNOLÓGICO

| Tecnología | Versión | Uso |
|---|---|---|
| Next.js | 16.x | Framework principal (App Router) |
| React | 19.x | UI library |
| TypeScript | ^5 | Tipado estático |
| TailwindCSS | ^4.x | Estilos utilitarios (`@utility`, `@theme inline`, `@custom-variant`) |
| ShadCN UI | latest | Componentes base (customizados con glassmorphism) |
| Framer Motion | ^12.x | Animaciones de entrada/salida/transición |
| Lucide React | latest | Iconos SVG |
| Supabase JS | ^2.x | Auth + Realtime + DB (PostgreSQL) |
| Supabase SSR | ^0.x | Cookies y sesión server-side |
| Sonner | ^2.x | Toast notifications |
| Radix UI | latest | Primitivos accesibles (Dialog, DropdownMenu, Select, etc.) |
| date-fns | ^4.x | Manipulación de fechas |
| Recharts | ^2.x | Gráficas de reportes |
| jsPDF + xlsx | latest | Exportación a PDF y Excel (solo ADMIN/MANAGER) |
| next-pwa | latest | Progressive Web App (offline-ready, escáner de cámara) |

---

## 📁 ESTRUCTURA DEL PROYECTO

```
/app
  /(auth)
    /login/page.tsx
    /signup/page.tsx
    /forgot-password/page.tsx
    /auth/callback/route.ts
    /auth/reset-password/page.tsx
  /(dashboard)
    /layout.tsx               ← DashboardLayout (sidebar + header)
    /page.tsx                 ← Redirect automático por rol
    /pos/page.tsx             ← Punto de Venta
    /inventario/
      /page.tsx               ← Dashboard de inventario / stock actual
      /fisico/page.tsx        ← Captura de inventario físico (escáner)
      /movimientos/page.tsx   ← Historial de movimientos/transacciones
    /catalogo/
      /items/page.tsx         ← CRUD de artículos
      /categorias/page.tsx
      /areas/page.tsx
      /departamentos/page.tsx
      /ubicaciones/page.tsx
    /clientes/page.tsx
    /proveedores/page.tsx
    /reportes/page.tsx
    /admin/
      /tiendas/page.tsx       ← CRUD de tiendas/sucursales
      /usuarios/page.tsx      ← CRUD de usuarios/perfiles
  /pending/page.tsx           ← Usuario sin rol asignado
  /api/...                    ← Route Handlers

/components
  /glass-card.tsx
  /glass-button.tsx
  /glass-input.tsx
  /status-badge.tsx
  /confirm-dialog.tsx
  /layouts/
    /dashboard-layout.tsx
    /sidebar.tsx
    /header.tsx
  /providers/
    /client-providers.tsx
    /store-provider.tsx       ← Contexto de tienda activa

/lib
  /types.ts                   ← Todos los tipos TypeScript
  /utils.ts

/utils/supabase
  /client.ts                  ← Browser client
  /server.ts                  ← Server client
  /admin.ts                   ← Service role client (solo server-side)

/supabase
  /database.sql               ← Schema de referencia (NO ejecutar directamente)
  /001_inventory_sessions_readings.sql
  /002_inventory_stocks.sql
  /003_profiles.sql           ← Nuevas migraciones con prefijo numérico

/middleware.ts                ← Protección de rutas
/public/manifest.json         ← PWA manifest
```

---

## 🗄️ BASE DE DATOS (PostgreSQL + Supabase)

### Tablas principales

| Dominio | Tablas |
|---|---|
| **Auth** | `profiles` (vinculada a `auth.users`, reemplaza a `users`) |
| **Tiendas** | `stores` |
| **Ubicaciones** | `locations` (por tienda), `areas`, `departments`, `categories` |
| **Catálogo** | `items`, `item_images`, `price_history`, `catalog_sat` |
| **Stock** | `stocks`, `transactions` |
| **Inventario Físico** | `inventory_sessions`, `inventory_readings` |
| **Ventas / POS** | `orders`, `order_items`, `carts`, `cart_items` |
| **Clientes** | `clients`, `shipping_addresses` |
| **Proveedores** | `suppliers` |



-- PARA TABLAS CONSULTAS:
-- Todas las tablas deben ser sticky en el header
-- Todas las tablas deben tener un paginador
-- Todas las tablas deben tener un buscador
Todas las tablas de consulta deben ser con encabezado sticky y cada columna deberá ser clickable para ordenar en forma ascendente y descendente cuando aplica. La columna de acciones debe ser con el ícono de 3 puntos verticales y abrirse un menú para mostrar las acciones correspondientes.

### Tabla `profiles` (nueva — reemplaza a `users`)

```sql
CREATE TABLE public.profiles (
  id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  phone text,
  role text NOT NULL DEFAULT 'PENDING', -- ADMIN | MANAGER | CASHIER | ALMACENISTA | PENDING
  id_store uuid REFERENCES public.stores(id_store), -- tienda asignada (null para ADMIN)
  status text NOT NULL DEFAULT 'pending',           -- pending | active | inactive
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id)
);
```

> **Regla:** La tabla `users` original queda **deprecada**. Toda referencia a usuario en código nuevo usa `profiles`.

### Convención de eliminación lógica

El schema existente usa `status character DEFAULT 'A'` con la convención:
- `'A'` = Activo
- `'I'` = Inactivo (eliminación lógica)

```typescript
// ✅ Correcto — para items, proveedores, clientes, ubicaciones, etc.
await supabase.from('items').update({ status: 'I' }).eq('id_item', id)

// ✅ Para profiles (nueva convención con texto)
await supabase.from('profiles').update({
  status: 'inactive',
  updated_at: new Date().toISOString()
}).eq('id', userId)

// ❌ NUNCA
await supabase.from('tabla').delete().eq('id', id)
```

### Queries — SIEMPRE filtrar registros inactivos

```typescript
// Para tablas del schema original con campo `status` char
.eq('status', 'A')

// Para la tabla profiles (texto)
.eq('status', 'active')
```

### Migraciones SQL — Convención

- Guardar en `/supabase/` con prefijo numérico: `003_nombre.sql`, `004_nombre.sql`
- Siempre idempotentes: `CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS`
- Siempre incluir: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, policies, y publicación Realtime si aplica

---

## 🔐 AUTENTICACIÓN Y ROLES

### Métodos de login

- Email + Password
- Google OAuth

### Roles del sistema

```typescript
type UserRole =
  | 'ADMIN'        // Acceso global a todas las tiendas. Selecciona sucursal desde el header.
  | 'MANAGER'      // Acceso completo a su tienda asignada (reports incluidos).
  | 'CASHIER'      // Solo POS de su tienda asignada.
  | 'ALMACENISTA'  // Solo Inventario y Catálogo de su tienda asignada.
  | 'PENDING'      // Sin rol → pantalla /pending (espera de asignación vía Realtime)
```

### Estados de perfil

```typescript
type ProfileStatus = 'pending' | 'active' | 'inactive'
```

- `pending` → Recién registrado, sin rol → `/pending` (pantalla de espera con Realtime)
- `active` → Con rol asignado, puede operar
- `inactive` → Bloqueado. Realtime cierra su sesión automáticamente via `UserStatusGuard`

### Mapa de rutas permitidas por rol (`middleware.ts`)

```typescript
const ROLE_ALLOWED_PREFIXES: Record<string, string[]> = {
  ADMIN: ['/pos', '/inventario', '/catalogo', '/clientes', '/proveedores', '/reportes', '/admin'],
  MANAGER: ['/pos', '/inventario', '/catalogo', '/clientes', '/proveedores', '/reportes'],
  CASHIER: ['/pos'],
  ALMACENISTA: ['/inventario', '/catalogo'],
  PENDING: ['/pending'],
}
```

### Rutas públicas (sin sesión requerida)

```
/login, /signup, /forgot-password, /auth/*, /pending, /auth/reset-password
```

---

## 🏪 GESTIÓN DE TIENDA ACTIVA (MULTI-TIENDA)

### Contexto de tienda (`StoreProvider`)

La tienda activa se persiste en `sessionStorage` bajo la key `campiran_current_store`.

```typescript
// Hook de acceso
const { currentStore, setStore, storeId } = useStore()
```

### Reglas para el ADMIN (multi-tienda)

- El ADMIN puede seleccionar cualquier tienda desde un **selector en el header**.
- Al cambiar de tienda, se muestra un **toast de confirmación** indicando la nueva tienda activa.
- Si el ADMIN no tiene tienda seleccionada, se le fuerza a elegir una antes de operar.
- Toda operación de negocio filtra por `storeId` del contexto.

### Reglas para roles operativos (MANAGER, CASHIER, ALMACENISTA)

- La tienda está fija en `profiles.id_store`.
- No pueden cambiar de tienda desde la UI.
- El `storeId` se obtiene directamente del perfil autenticado.

---

## 🎨 UI/UX — SISTEMA DE DISEÑO GLASSMORPHISM

**Filosofía:** Apple-inspired glassmorphism — limpio, moderno, tipo iPhone/Mac. Gradientes suaves en componentes. Dark + Light mode completo.

### Paleta de colores

Campiran es un sistema POS + Inventario profesional, paleta principal:
- **Primario:** Gradiente **Emerald → Teal** (ventas, POS, acciones de confirmación)
- **Acento:** **Indigo/Violet** (inventario, navigation activa)
- **Advertencia:** Amber (alertas de stock, mínimos)
- **Peligro:** Rose/Red (acciones destructivas)
- **Fondos:** Dark mode con `oklch` profundos; light mode níveo

### Variables CSS (`:root` y `.dark`)

```css
:root {
  --primary: oklch(0.52 0.18 160);       /* Emerald profesional */
  --secondary: oklch(0.52 0.22 264);     /* Indigo */
  --background: oklch(0.985 0 0);        /* Light: casi blanco */
  --card: oklch(1 0 0 / 0.8);
  --border: oklch(0.145 0 0 / 0.15);
  --radius: 1rem;
}
.dark {
  --primary: oklch(0.65 0.18 160);
  --background: oklch(0.08 0.01 264);    /* Dark: profundo */
  --card: oklch(0.12 0.01 264 / 0.8);
}
```

### Componentes Glass del sistema (NO crear duplicados)

| Componente | Ubicación | Uso |
|---|---|---|
| `<GlassCard />` | `components/glass-card.tsx` | Contenedor. Variantes: `default`, `emerald`, `indigo`, `amber`, `rose` |
| `<GlassButton />` | `components/glass-button.tsx` | Botón. Variantes: `primary`, `secondary`, `danger`, `ghost`. Tamaños: `sm`, `md`, `lg` |
| `<GlassInput />` | `components/glass-input.tsx` | Input estilo iOS consistente |
| `<StatusBadge />` | `components/status-badge.tsx` | Badge semántico con labels en español |
| `<ConfirmDialog />` | `components/confirm-dialog.tsx` | Diálogo de confirmación glassmorphism |
| `DashboardLayout` | `components/layouts/dashboard-layout.tsx` | Layout maestro (sidebar + header) |

### Utilidades CSS en `globals.css`

```css
.glass            → bg semitransparente + blur(24px) + saturate(180%) + border luminoso
.glass-card       → blur(30px) + saturate(200%) + border-top luminoso + rounded-[24px]
.glass-input      → blur(16px) + saturate(150%) + rounded-[1rem]
.liquid-glass     → efecto líquido animado (pseudo-elemento rotante)
.dashboard-bg     → fondo animado con gradientes radiales emerald/indigo
.scroll-modern    → scrollbar delgado con gradiente emerald/indigo
.glass-table-header → header de tabla con gradiente sutil
.scrollable-table → tabla con thead sticky + tbody scrollable
```

> Todas estas utilidades tienen variantes `.dark`. No agregar estilos dark manuales.

### Fondo de dashboard

```html
<!-- SIEMPRE dentro de las páginas de dashboard -->
<div className="dashboard-bg" />
```

> Login tiene fondo propio. Todas las demás vistas usan `.dashboard-bg`.

### Animaciones (Framer Motion) — Patrón estándar

```typescript
// Entrada estándar
<motion.div
  initial={{ opacity: 0, y: 30 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.6, ease: 'easeOut' }}
>

// Listas escalonadas
{items.map((item, i) => (
  <motion.div
    key={item.id}
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: i * 0.05 }}
  />
))}
```

### Toasts (Sonner) — siempre en español

```typescript
toast.success('Venta registrada exitosamente')
toast.error('Error al guardar el artículo')
toast.message('Stock bajo mínimo', { description: 'Revisar artículos críticos.' })
```

### Modales glassmorphism

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent className="glass border-border/50 rounded-3xl max-w-md">
    {/* ... */}
  </DialogContent>
</Dialog>
```

### Tablas con scroll moderno

```tsx
<div className="scrollable-table scroll-modern flex-1">
  <table>
    <thead><tr className="glass-table-header">{/* Headers */}</tr></thead>
    <tbody>{/* Rows */}</tbody>
  </table>
</div>
```

---

## ⚡ REALTIME — ARQUITECTURA TIEMPO REAL

### Canales Realtime activos

| Canal | Tabla | Propósito |
|---|---|---|
| `profile-{userId}` | `profiles` | Asignación de rol / cambio de estado |
| `stock-{storeId}` | `stocks` | Stock actualizado en tiempo real |
| `inventory-session-{sessionId}` | `inventory_readings` | Lecturas de inventario físico en vivo |
| `orders-{storeId}` | `orders` | Ventas POS en tiempo real |

### Patrón obligatorio para suscripciones

```typescript
'use client'
import { useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'

function MiComponente({ storeId }: { storeId: string }) {
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase
      .channel(`stock-${storeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stocks', filter: `id_store=eq.${storeId}` },
        (payload) => {
          const updated = payload.new as Stock
          setData(prev => /* merge */)
        }
      )
      .subscribe((status) => console.log('[Stock] Realtime:', status))

    // SIEMPRE limpiar
    return () => { supabase.removeChannel(channel) }
  }, [storeId])
}
```

### Reglas inquebrantables de Realtime

1. **Solo en Client Components** (`'use client'`) con `useEffect`
2. **Siempre** llamar `supabase.removeChannel(channel)` en el cleanup
3. **Nombres de canales únicos** — usar template literals con IDs
4. **No duplicar suscripciones** — verificar re-renders
5. **Fallback con `visibilitychange`** para re-verificar al volver a la pestaña

### Guard de estado del usuario (`UserStatusGuard`)

- Se monta globalmente vía `ClientProviders`
- Escucha Realtime en `profiles` para el usuario autenticado
- Si `status !== 'active'` → `window.location.replace('/pending')`
- Fallback con `visibilitychange`, `focus` y heartbeat cada 60s
- **No corre en rutas públicas**

---

## 🧩 PROVIDERS Y CONTEXTO GLOBAL

### `ClientProviders`

```tsx
<StoreProvider>        {/* Contexto de tienda activa (sessionStorage) */}
  <UserStatusGuard />  {/* Guard Realtime de estado del usuario */}
  {children}
</StoreProvider>
```

### `DashboardLayout`

- **Sidebar** glassmorphism con navegación filtrada por rol
- **Header** con logo Campiran, tienda activa, avatar y menú de usuario
- **Selector de tienda** en el header (visible solo para ADMIN)
- **Dark mode toggle** (Moon/Sun)
- **Responsive** con Sheet (drawer) para mobile

---

## 🛡️ MIDDLEWARE Y PROTECCIÓN DE RUTAS

```
Flujo de decisión:
1. ¿Es ruta de API? → Pasar sin validar
2. ¿Es ruta pública? → Permitir sin sesión
3. ¿No tiene sesión? → Redirect a /login
4. ¿Tiene sesión pero está en ruta pública? → Redirect a /
5. ¿Perfil no existe o status = inactive? → Redirect a /pending
6. ¿role = PENDING? → Redirect a /pending
7. ¿Está en /? → Redirect al dashboard de su rol
8. ¿La ruta NO está en ROLE_ALLOWED_PREFIXES del rol? → Redirect al dashboard
9. ✅ Permitir acceso
```

> ⚠️ No modificar `middleware.ts` sin entender el flujo completo de Auth.

### Al agregar nuevas rutas:

1. Agregar prefix en `ROLE_ALLOWED_PREFIXES` del `middleware.ts`
2. Si es pública, agregarla a `PUBLIC_PATHS`
3. Agregar entrada en `NAV_ITEMS` del `dashboard-layout.tsx`

---

## 🏗️ CONVENCIONES DE CÓDIGO

### Clientes Supabase — 3 variantes

```typescript
// ✅ Client Components (browser) — hooks, Realtime, interactividad
import { createClient } from '@/utils/supabase/client'

// ✅ Server Components, Server Actions, Route Handlers
import { createClient } from '@/utils/supabase/server'

// ✅ Operaciones administrativas server-side (bypass RLS)
import { createAdminClient } from '@/utils/supabase/admin'

// ❌ NUNCA serviceRole en el frontend/client-side
```

> El cliente browser incluye shims para `crypto.subtle` y `crypto.randomUUID` (desarrollo en LAN/HTTP). No eliminar.

### Variables de entorno — renombrar de Vite a Next.js

```bash
# .env (las VITE_* deben renombrarse a NEXT_PUBLIC_*)
NEXT_PUBLIC_SUPABASE_URL=https://qqcvsmtftbxvqbymphru.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
```

### Server Actions — Patrón estándar

```typescript
'use server'
import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function miAction(data: unknown) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  const { data: result, error } = await supabase
    .from('tabla')
    .insert([{ ...(data as Record<string, unknown>) }])
    .select()
    .single()

  if (error) throw new Error(error.message)
  revalidatePath('/ruta')
  return result
}
```

### Tipos TypeScript

- Definir todos los tipos en `/lib/types.ts`
- **No usar `any`** — usar `unknown` + narrow. Excepción: payloads Realtime con casteo explícito
- Orden de imports:
  ```typescript
  // 1. React / Next.js
  // 2. Librerías externas (framer-motion, lucide-react, sonner)
  // 3. Imports internos con alias @/
  // 4. Tipos
  ```

### Patrón CRUD con Realtime

```typescript
// page.tsx — Server Component (fetch inicial)
import { getItems } from './actions'
import { ItemsClient } from './items-client'

export default async function ItemsPage() {
  const items = await getItems()
  return <ItemsClient initialData={items} />
}

// items-client.tsx — Client Component
'use client'
export function ItemsClient({ initialData }: { initialData: Item[] }) {
  const [data, setData] = useState(initialData)
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase
      .channel('items-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' },
        (payload) => { /* merge */ }
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  // render tabla, modales, formularios
}
```

---

## 📋 MÓDULOS DEL SISTEMA

### 1. POS (Punto de Venta) — Ruta: `/pos`

- Búsqueda de artículos por código, código de barras o descripción
- Carrito con cantidades, precios y múltiples listas (`price1`, `price2`, `price3`)
- Asignación de cliente (opcional)
- Métodos de pago
- Impresión de ticket (Web Printing / ventana de impresión)
- Realtime: stock en vivo durante la venta
- Roles: ADMIN, MANAGER, CASHIER

### 2. Inventario Físico — Ruta: `/inventario/fisico`

Ver `/docs/captura_inventario_fisico.txt` para la especificación completa.

- **Sesiones** (`inventory_sessions`): agrupan las lecturas físicas
- **Lecturas** (`inventory_readings`): cada escaneo individual
- Autofocus permanente en input de código de barras (Enter para capturar)
- Búsqueda por código, código de barras o descripción en modal
- Filtro por ubicación (`locations`)
- Muestra en tiempo real: stock actual, stock físico (acumulado), diferencia
- Cantidad default = 1; acepta negativos para correcciones
- Exportación a PDF (firma del usuario) y Excel (solo ADMIN)
- PWA-ready: escáner de cámara desde celular
- Roles: ADMIN, MANAGER, ALMACENISTA

### 3. Stock / Inventario — Ruta: `/inventario`

- Dashboard de stock actual por tienda y ubicación
- Alertas de artículos bajo mínimos (`stocks.current < stocks.minimum`)
- Historial de movimientos (`transactions`)
- Roles: ADMIN, MANAGER, ALMACENISTA

### 4. Catálogos — Rutas: `/catalogo/*`

- **Items**: CRUD completo. Campos: código, código de barras, descripción, unidad, costo, `price1/2/3`, impuesto, imágenes, código SAT, unidad SAT
- **Categorías, Áreas, Departamentos**: CRUDs simples con `status 'A'/'I'`
- **Ubicaciones**: por tienda (`id_store`)
- Roles: ADMIN, MANAGER, ALMACENISTA

### 5. Clientes — Ruta: `/clientes`

- CRUD con datos fiscales (RFC, dirección para CFDI)
- Historial de compras
- Múltiples direcciones de envío (`shipping_addresses`)
- Lista de precios asignada (`price_number`: 1, 2 o 3)
- Roles: ADMIN, MANAGER, CASHIER

### 6. Proveedores — Ruta: `/proveedores`

- CRUD completo con datos de crédito (`credit_days`, `credit_limit`)
- Roles: ADMIN, MANAGER

### 7. Reportes — Ruta: `/reportes`

| Reporte | Descripción | Roles |
|---|---|---|
| Ventas del día/semana/mes | Gráfica Recharts + tabla con totales | ADMIN, MANAGER |
| Top productos | Más vendidos por volumen e ingreso | ADMIN, MANAGER |
| Stock bajo mínimos | Artículos con `current < minimum` | ADMIN, MANAGER, ALMACENISTA |
| Utilidad bruta | `(precio - costo) × cantidad vendida` | ADMIN, MANAGER |
| Movimientos de inventario | Historial completo de `transactions` | ADMIN, MANAGER, ALMACENISTA |
| Historial de inventarios físicos | Sesiones cerradas con detalle | ADMIN, MANAGER |
| Cuentas por pagar | Saldo por proveedor | ADMIN, MANAGER |

> Exportación a PDF y Excel para ADMIN. Solo PDF para MANAGER.

### 8. Administración — Rutas: `/admin/*`

- CRUD de tiendas/sucursales (`stores`)
- CRUD de usuarios/perfiles (asignar roles, activar/desactivar, asignar tienda)
- Roles: solo ADMIN

---

## 📱 PWA

- `public/manifest.json` configurado para instalación en celular
- Service Worker para cache de assets estáticos
- Viewport: `user-scalable=no` para evitar zoom en inputs iOS
- Input de código de barras con `inputMode="text"` y `autoComplete="off"`

---

## 🚀 COMANDOS DE DESARROLLO

```bash
# Iniciar servidor de desarrollo (accesible en LAN para pruebas de escáner)
npm run dev          # next dev -H 0.0.0.0

# Build de producción
npm run build

# Lint
npm run lint
```

> `http://localhost:3000` para desktop.
> `http://<IP_LOCAL>:3000` para dispositivos en LAN (celulares con escáner de cámara).

---

## 📋 ESTADO DEL PROYECTO

### ✅ Preparado

- Schema de base de datos en `supabase/database.sql`
- Migraciones `001` y `002` listas en `supabase/`
- Variables de entorno Supabase configuradas en `.env` (pendiente renombrar a `NEXT_PUBLIC_*`)
- AGENTS.md adaptado al dominio POS + Inventario

### 🔄 Pendiente (orden de implementación por fases)

Ver `plan/PLAN.md` para el roadmap completo.

**Fase 1 — Fundación**
1. Inicializar proyecto Next.js con TailwindCSS v4, ShadCN, Framer Motion
2. Configurar Supabase SSR y renombrar variables `.env`
3. Migración DB: crear tabla `profiles` + RLS
4. Sistema de Auth (Login, Signup, Google OAuth, middleware, `UserStatusGuard`)
5. Layout base glassmorphism (DashboardLayout, Sidebar, Header, StoreProvider)

**Fase 2 — Core Operativo**
6. Módulo POS
7. Módulo Inventario Físico (captura con escáner)
8. Dashboard de Stock / Inventario

**Fase 3 — Catálogos y Maestros**
9. Items (CRUD completo + imágenes)
10. Categorías, Áreas, Departamentos, Ubicaciones
11. Clientes y Proveedores

**Fase 4 — Reportes y Admin**
12. Reportes con Recharts + exportación PDF/Excel
13. Admin: gestión de tiendas y usuarios

**Fase 5 — PWA y Polish**
14. PWA: manifest + service worker
15. Optimización, accesibilidad y performance

---

## 📝 REGLAS FINALES PARA AGENTES

### Antes de crear algo nuevo

1. Verificar si ya existe un componente en `/components/` o `/components/ui/`
2. Verificar si el tipo ya está en `/lib/types.ts`
3. Verificar si la ruta tiene permisos en `middleware.ts`

### Al modificar la BD

1. Guardar migración en `/supabase/` con prefijo numérico
2. SQL siempre idempotente: `IF NOT EXISTS`, `IF EXISTS`, `CREATE OR REPLACE`
3. Agregar RLS policies y publicar en Realtime si aplica
4. Agregar el tipo TypeScript en `/lib/types.ts`

### Lo que NUNCA debes hacer

- ❌ `"use client"` sin necesidad real
- ❌ `DELETE FROM` en tablas de negocio
- ❌ Queries sin filtro de status (`'A'` o `'active'`)
- ❌ Hardcodear IDs de tienda o usuario
- ❌ Canales Realtime sin cleanup
- ❌ Modificar `middleware.ts` sin entender el flujo completo
- ❌ Usar `any` sin casteo explícito
- ❌ Mensajes de UI en inglés
- ❌ Crear componentes duplicados que ya existen en el sistema
