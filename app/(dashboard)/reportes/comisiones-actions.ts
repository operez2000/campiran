'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { type Order, type Profile, type Store } from '@/lib/types'
import { mapUserToProfile } from '@/lib/auth-profile'

export interface EmployeeCommissionSummary {
  id: string
  full_name: string
  email: string | null
  avatar_url: string | null
  role: string
  // Totales
  sales_count: number
  products_subtotal: number
  sales_commission_amount: number
  services_count: number
  services_subtotal: number
  service_commission_amount: number
  total_commission: number
}

export interface CommissionReportData {
  orders: Order[]
  summaries: EmployeeCommissionSummary[]
  metrics: {
    totalSalesWithoutTax: number
    totalServicesWithoutTax: number
    totalCommissions: number
    totalOrdersWithCommission: number
    topEarner: {
      name: string
      amount: number
    } | null
  }
}

/**
 * Consulta el reporte completo de comisiones por productos y servicios en un rango de fechas.
 * Agrupa los montos por colaborador para liquidación rápida en nómina.
 */
export async function getCommissionsReportAction(params: {
  storeId?: string | null
  startDate: string
  endDate: string
  employeeId?: string | null
}): Promise<CommissionReportData> {
  const adminClient = createAdminClient()

  const startIso = `${params.startDate}T00:00:00.000Z`
  const endIso = `${params.endDate}T23:59:59.999Z`

  // 1. Consultar órdenes dentro del rango de fechas
  let query = adminClient
    .from('orders')
    .select(`
      id_order,
      order_number,
      total_amount,
      tax_amount,
      status,
      created_at,
      id_store,
      id_seller,
      id_technician,
      products_subtotal,
      services_subtotal,
      seller_commission_pct,
      seller_commission_amount,
      technician_commission_pct,
      technician_commission_amount,
      client:clients (
        id_client,
        first_name,
        last_name
      ),
      store:stores (
        id_store,
        description
      )
    `)
    .gte('created_at', startIso)
    .lte('created_at', endIso)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })

  if (params.storeId && params.storeId !== 'ALL') {
    query = query.eq('id_store', params.storeId)
  }

  const { data: rawOrders, error } = await query
  if (error) {
    console.error('Error consultando comisiones en orders:', error.message)
    throw new Error(`Error al consultar comisiones: ${error.message}`)
  }

  const orders = (rawOrders || []) as unknown as Order[]

  // 2. Obtener lista de perfiles involucrados
  const userIds = new Set<string>()
  orders.forEach((o) => {
    if (o.id_seller) userIds.add(o.id_seller)
    if (o.id_technician) userIds.add(o.id_technician)
  })

  const profileMap = new Map<string, Profile>()

  if (userIds.size > 0) {
    try {
      const { data: profilesData } = await adminClient
        .from('profiles')
        .select('*')
        .in('id', Array.from(userIds))

      if (profilesData) {
        profilesData.forEach((p) => {
          profileMap.set(p.id, p as Profile)
        })
      }
    } catch {
      // profiles table might not exist
    }

    // Fallback a users para IDs no encontrados
    const missingIds = Array.from(userIds).filter((id) => !profileMap.has(id))
    if (missingIds.length > 0) {
      try {
        const { data: usersData } = await adminClient
          .from('users')
          .select('*')
          .in('id_user', missingIds)

        if (usersData) {
          usersData.forEach((u) => {
            profileMap.set(u.id_user, mapUserToProfile(u))
          })
        }
      } catch {
        // users query failed
      }
    }
  }

  // 3. Asociar perfiles a las órdenes
  const enrichedOrders = orders.map((o) => ({
    ...o,
    seller: o.id_seller ? profileMap.get(o.id_seller) || null : null,
    technician: o.id_technician ? profileMap.get(o.id_technician) || null : null,
  }))

  // 4. Filtrar por empleado si no es 'ALL'
  const filteredOrders =
    params.employeeId && params.employeeId !== 'ALL'
      ? enrichedOrders.filter(
          (o) => o.id_seller === params.employeeId || o.id_technician === params.employeeId
        )
      : enrichedOrders

  // 5. Generar resumen agrupado por empleado
  const summaryMap = new Map<string, EmployeeCommissionSummary>()

  filteredOrders.forEach((o) => {
    // A) Vendedor
    if (o.id_seller) {
      const sellerProfile = profileMap.get(o.id_seller)
      const empId = o.id_seller
      const existing = summaryMap.get(empId) || {
        id: empId,
        full_name: sellerProfile?.full_name || sellerProfile?.email || 'Vendedor Desconocido',
        email: sellerProfile?.email || null,
        avatar_url: sellerProfile?.avatar_url || null,
        role: sellerProfile?.role || 'CASHIER',
        sales_count: 0,
        products_subtotal: 0,
        sales_commission_amount: 0,
        services_count: 0,
        services_subtotal: 0,
        service_commission_amount: 0,
        total_commission: 0,
      }

      existing.sales_count += 1
      existing.products_subtotal += Number(o.products_subtotal || 0)
      existing.sales_commission_amount += Number(o.seller_commission_amount || 0)
      existing.total_commission += Number(o.seller_commission_amount || 0)

      summaryMap.set(empId, existing)
    }

    // B) Técnico
    if (o.id_technician) {
      const techProfile = profileMap.get(o.id_technician)
      const empId = o.id_technician
      const existing = summaryMap.get(empId) || {
        id: empId,
        full_name: techProfile?.full_name || techProfile?.email || 'Técnico Desconocido',
        email: techProfile?.email || null,
        avatar_url: techProfile?.avatar_url || null,
        role: techProfile?.role || 'ALMACENISTA',
        sales_count: 0,
        products_subtotal: 0,
        sales_commission_amount: 0,
        services_count: 0,
        services_subtotal: 0,
        service_commission_amount: 0,
        total_commission: 0,
      }

      existing.services_count += 1
      existing.services_subtotal += Number(o.services_subtotal || 0)
      existing.service_commission_amount += Number(o.technician_commission_amount || 0)
      existing.total_commission += Number(o.technician_commission_amount || 0)

      summaryMap.set(empId, existing)
    }
  })

  const summaries = Array.from(summaryMap.values()).sort(
    (a, b) => b.total_commission - a.total_commission
  )

  // 6. Métricas globales
  let totalSalesWithoutTax = 0
  let totalServicesWithoutTax = 0
  let totalCommissions = 0
  let totalOrdersWithCommission = 0

  filteredOrders.forEach((o) => {
    const sAmount = Number(o.seller_commission_amount || 0)
    const tAmount = Number(o.technician_commission_amount || 0)
    if (sAmount > 0 || tAmount > 0) {
      totalOrdersWithCommission += 1
    }
    totalSalesWithoutTax += Number(o.products_subtotal || 0)
    totalServicesWithoutTax += Number(o.services_subtotal || 0)
    totalCommissions += sAmount + tAmount
  })

  const topEarner =
    summaries.length > 0
      ? {
          name: summaries[0].full_name,
          amount: summaries[0].total_commission,
        }
      : null

  return {
    orders: filteredOrders,
    summaries,
    metrics: {
      totalSalesWithoutTax: Number(totalSalesWithoutTax.toFixed(2)),
      totalServicesWithoutTax: Number(totalServicesWithoutTax.toFixed(2)),
      totalCommissions: Number(totalCommissions.toFixed(2)),
      totalOrdersWithCommission,
      topEarner,
    },
  }
}
