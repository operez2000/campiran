# 📌 Seguimiento del Proyecto — CAMPIRAN POS & Inventario

## ✅ Fase 1: Fundación y Arquitectura Base
- [x] Inicialización con Next.js 16 (App Router), TailwindCSS v4, TypeScript y Framer Motion
- [x] Sistema de diseño Apple Glassmorphism completo (`.glass`, `.glass-card`, `.glass-input`, `.dashboard-bg`, etc.)
- [x] Componentes base: `<GlassCard />`, `<GlassButton />`, `<GlassInput />`, `<StatusBadge />`, `<ConfirmDialog />`
- [x] Providers y Contextos globales: `StoreProvider` (multi-tienda), `UserStatusGuard` (Realtime), `ClientProviders`
- [x] Layout maestro `DashboardLayout`: Sidebar responsive con submenús colapsables + Header con selector de sucursal y dark mode
- [x] Clientes Supabase: browser (`utils/supabase/client.ts`), server (`utils/supabase/server.ts`), admin (`utils/supabase/admin.ts`)
- [x] Middleware / Proxy (`proxy.ts`) con protección estricta por roles (`ADMIN`, `MANAGER`, `CASHIER`, `ALMACENISTA`, `PENDING`)
- [x] Flujos de autenticación: Login (Google + Email), Signup, Forgot Password, Reset Password, Callback y `/pending`
- [x] Migraciones SQL: `001`, `002`, `003_profiles.sql`, `004_realtime.sql`, `005_fix_foreign_keys_profiles.sql`

## ✅ Fase 2: Módulos Core Operativos
- [x] **Dashboard de Stock (`/inventario`)**:
  - KPIs en tiempo real (artículos totales, bajo mínimo, unidades, valuación en $)
  - Filtro por sucursal y ubicación
  - Filtro toggle de stock bajo mínimo
  - Búsqueda en vivo por código, código de barras o descripción
  - Ajuste rápido de umbrales mínimos/máximos
  - Sincronización en vivo vía Supabase Realtime
- [x] **Captura de Inventario Físico (`/inventario/fisico`)**:
  - Cumplimiento del 100% de `docs/captura_inventario_fisico.txt`
  - Escaneo con pistola de código de barras con autofocus permanente
  - Contador de cantidades (con soporte de números negativos para correcciones)
  - Modal de búsqueda por descripción con catálogo completo
  - Selector de ubicación de escaneo
  - Banner en tiempo real con último producto escaneado (Stock Sistema vs Stock Físico vs Diferencia)
  - Gestión de sesiones: abrir sesión, capturar lecturas en vivo, cerrar sesión y actualizar inventario en BD
  - Auditoría automática en `transactions` (tipo `I`)
  - Exportación de reporte PDF firmado digitalmente con datos del responsable
  - Historial de inventarios cerrados
- [x] **Movimientos de Inventario (`/inventario/movimientos`)**:
  - Tabla de auditoría en tiempo real para todos los movimientos
  - Filtros por tipo (Entrada, Salida, Venta, Inventario, Ajuste)
  - Búsqueda por artículo, referencia y concepto
- [x] **Punto de Venta POS (`/pos`)**:
  - Escáner rápido y catálogo visual interactivo
  - Selector de clientes con asignación de listas de precios dinámica (`price1`, `price2`, `price3`)
  - Carrito de compras con cálculo de subtotales, IVA y total
  - Modal de cobro con métodos de pago (Efectivo con cambio en vivo, Tarjeta, Transferencia)
  - Generación de órdenes (`orders`), detalle (`order_items`), descuento de stock y registro en `transactions`
  - Ticket térmico con vista previa e impresión (`window.print()`)

## ✅ Fase 3: Catálogos y Maestros
- [x] **Artículos & Catálogo (`/catalogo/items`)**:
  - CRUD completo de productos y servicios
  - Precios múltiples (`price1`, `price2`, `price3`), costos, comisión e IVA
  - Datos fiscales SAT (clave de producto y unidad SAT)
  - Clasificación por categoría, área y departamento
  - Eliminación lógica (`status = 'I'`) y reactivación
  - Píldoras de navegación rápida `CatalogoTabs`
- [x] **Catálogos Simples**:
  - Categorías (`/catalogo/categorias`)
  - Áreas (`/catalogo/areas`)
  - Departamentos (`/catalogo/departamentos`)
  - Ubicaciones por sucursal (`/catalogo/ubicaciones`)
- [x] **Clientes (`/clientes`)**:
  - Directorio completo con RFC y datos de contacto
  - Asignación de lista de precios personalizada
  - Modal de historial de compras por cliente
  - Eliminación lógica y reactivación
- [x] **Proveedores (`/proveedores`)**:
  - Directorio completo con datos fiscales y contacto
  - Condiciones comerciales: días de crédito y límite de crédito
  - Eliminación lógica y reactivación

## ✅ Fase 4: Reportes y Administración
- [x] **Reportes & Rendimiento (`/reportes`)**:
  - Gráfica interactiva de evolución de ventas con Recharts
  - KPIs financieros: Ventas totales, Órdenes, Ticket promedio, Utilidad bruta estimada
  - Ranking de Top Productos más vendidos por ingreso
  - Alerta de artículos bajo mínimos
  - Tabla de detalle de ventas con filtros de período (Hoy, 7 días, 30 días, Año)
  - Exportación de reportes a PDF (jsPDF) y Excel (XLSX)
- [x] **Administración de Sucursales (`/admin/tiendas`)**:
  - CRUD de tiendas/sucursales con activación/desactivación
- [x] **Usuarios y Roles (`/admin/usuarios`)**:
  - Gestión de perfiles `profiles`
  - Asignación de roles (`ADMIN`, `MANAGER`, `CASHIER`, `ALMACENISTA`, `PENDING`)
  - Asignación de sucursal por usuario
  - Suspensión y activación en tiempo real (con expulsión automática vía `UserStatusGuard`)

## ✅ Fase 5: PWA y Polish
- [x] `public/manifest.json` configurado para PWA instalable
- [x] Página 404 personalizada en español (`app/not-found.tsx`) con diseño Glassmorphism
- [x] Verificación de compilación: 22/22 rutas operativas, 0 errores, 0 advertencias
