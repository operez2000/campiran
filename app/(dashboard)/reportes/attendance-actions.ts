'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { mapUserToProfile } from '@/lib/auth-profile'
import {
  type EmployeeAttendance,
  type AttendanceDailySummary,
  type Profile,
  type Store,
  type UserRole,
  type AttendanceAuthMethod
} from '@/lib/types'

function formatMinutesToHours(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/**
 * Helper to fetch a profile by ID supporting both `profiles` and `users` tables
 */
async function fetchUserProfile(adminClient: ReturnType<typeof createAdminClient>, userId: string): Promise<Profile | null> {
  try {
    const { data: profileData, error } = await adminClient
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (!error && profileData) {
      return profileData as Profile
    }
  } catch {
    // profiles table might not exist
  }

  try {
    const { data: userData, error } = await adminClient
      .from('users')
      .select('*')
      .eq('id_user', userId)
      .maybeSingle()

    if (!error && userData) {
      return mapUserToProfile(userData)
    }
  } catch {
    // users query failed
  }

  return null
}

/**
 * Consulta la jornada activa (abierta) del usuario en la sucursal actual
 */
export async function getActiveAttendanceAction(
  userId: string,
  storeId?: string | null
): Promise<EmployeeAttendance | null> {
  const adminClient = createAdminClient()

  let query = adminClient
    .from('employee_attendance')
    .select('*')
    .eq('id_user', userId)
    .eq('status', 'open')
    .order('check_in', { ascending: false })
    .limit(1)

  if (storeId) {
    query = query.eq('id_store', storeId)
  }

  const { data, error } = await query.maybeSingle()
  if (error || !data) return null
  return data as EmployeeAttendance
}

/**
 * Registra Check-In (Entrada) para el usuario autenticado o desde el quiosco
 */
export async function checkInAction({
  userId,
  storeId,
  notes,
  authMethod = 'session',
}: {
  userId: string
  storeId: string
  notes?: string
  authMethod?: AttendanceAuthMethod
}): Promise<{ success: boolean; attendance?: EmployeeAttendance; error?: string }> {
  try {
    const adminClient = createAdminClient()

    // 1. Verificar si ya tiene una jornada abierta en esta sucursal
    const existing = await getActiveAttendanceAction(userId, storeId)
    if (existing) {
      return {
        success: false,
        error: 'El empleado ya cuenta con una jornada activa (Check-In) abierta en esta sucursal.',
      }
    }

    // 2. Insertar nueva entrada
    const { data, error } = await adminClient
      .from('employee_attendance')
      .insert({
        id_user: userId,
        id_store: storeId,
        check_in: new Date().toISOString(),
        status: 'open',
        notes: notes || null,
        auth_method: authMethod,
        total_minutes: 0,
      })
      .select()
      .single()

    if (error) {
      return { success: false, error: 'Error al registrar Entrada: ' + error.message }
    }

    revalidatePath('/reportes')
    return { success: true, attendance: data as EmployeeAttendance }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido al registrar entrada'
    return { success: false, error: msg }
  }
}

/**
 * Registra Check-Out (Salida) calculando las horas/minutos laborados
 */
export async function checkOutAction({
  attendanceId,
  notes,
}: {
  attendanceId: string
  notes?: string
}): Promise<{
  success: boolean
  attendance?: EmployeeAttendance
  durationFormatted?: string
  error?: string
}> {
  try {
    const adminClient = createAdminClient()

    // 1. Obtener registro de asistencia
    const { data: record, error: fetchErr } = await adminClient
      .from('employee_attendance')
      .select('*')
      .eq('id_attendance', attendanceId)
      .single()

    if (fetchErr || !record) {
      return { success: false, error: 'No se encontró la jornada activa para cerrar.' }
    }

    const checkInTime = new Date(record.check_in).getTime()
    const nowTime = new Date().getTime()
    const totalMinutes = Math.max(0, Math.round((nowTime - checkInTime) / (1000 * 60)))
    const checkOutIso = new Date(nowTime).toISOString()

    const { data: updated, error: updateErr } = await adminClient
      .from('employee_attendance')
      .update({
        check_out: checkOutIso,
        total_minutes: totalMinutes,
        status: 'closed',
        notes: notes !== undefined ? notes : record.notes,
        updated_at: checkOutIso,
      })
      .eq('id_attendance', attendanceId)
      .select()
      .single()

    if (updateErr) {
      return { success: false, error: 'Error al registrar Salida: ' + updateErr.message }
    }

    revalidatePath('/reportes')
    return {
      success: true,
      attendance: updated as EmployeeAttendance,
      durationFormatted: formatMinutesToHours(totalMinutes),
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido al registrar salida'
    return { success: false, error: msg }
  }
}

/**
 * Marcaje en Quiosco con PIN (Check-In o Check-Out automático según el estado actual)
 */
export async function kioskCheckInOutAction({
  pin,
  storeId,
  notes,
  userId,
}: {
  pin: string
  storeId: string
  notes?: string
  userId?: string
}): Promise<{
  success: boolean
  type?: 'check_in' | 'check_out'
  user?: Profile
  attendance?: EmployeeAttendance
  durationFormatted?: string
  error?: string
}> {
  try {
    const adminClient = createAdminClient()

    if (!pin || pin.trim().length === 0) {
      return { success: false, error: 'Por favor ingresa tu PIN de empleado.' }
    }

    // 1. Buscar credencial biométrica / PIN
    let bioQuery = adminClient
      .from('user_biometrics')
      .select('*')
      .eq('cashier_pin', pin.trim())

    if (userId) {
      bioQuery = bioQuery.eq('id_user', userId)
    }

    const { data: bioList, error: bioErr } = await bioQuery

    if (bioErr || !bioList || bioList.length === 0) {
      return {
        success: false,
        error: 'PIN no reconocido o incorrecto. Verifica con tu administrador.',
      }
    }

    const targetBio = bioList[0]
    const targetUserId = targetBio.id_user

    // 2. Obtener perfil de empleado (con fallback transparente)
    const profile = await fetchUserProfile(adminClient, targetUserId)

    if (!profile) {
      return { success: false, error: 'Perfil de empleado no encontrado.' }
    }

    if (profile.status === 'inactive') {
      return { success: false, error: 'El usuario se encuentra inactivo en el sistema.' }
    }

    // 3. Revisar si tiene jornada abierta en la sucursal
    const openRecord = await getActiveAttendanceAction(targetUserId, storeId)

    if (openRecord) {
      // Realizar Check-Out
      const outRes = await checkOutAction({
        attendanceId: openRecord.id_attendance,
        notes,
      })

      if (!outRes.success) {
        return { success: false, error: outRes.error }
      }

      return {
        success: true,
        type: 'check_out',
        user: profile,
        attendance: outRes.attendance,
        durationFormatted: outRes.durationFormatted,
      }
    } else {
      // Realizar Check-In
      const inRes = await checkInAction({
        userId: targetUserId,
        storeId,
        notes,
        authMethod: 'pin',
      })

      if (!inRes.success) {
        return { success: false, error: inRes.error }
      }

      return {
        success: true,
        type: 'check_in',
        user: profile,
        attendance: inRes.attendance,
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al procesar marcaje en quiosco'
    return { success: false, error: msg }
  }
}

/**
 * Marcaje biométrico (WebAuthn o Detección Facial) validado en cliente
 */
export async function biometricCheckInOutAction({
  userId,
  storeId,
  authMethod,
  notes,
}: {
  userId: string
  storeId: string
  authMethod: 'webauthn' | 'face' | 'biometric'
  notes?: string
}): Promise<{
  success: boolean
  type?: 'check_in' | 'check_out'
  user?: Profile
  attendance?: EmployeeAttendance
  durationFormatted?: string
  error?: string
}> {
  try {
    const adminClient = createAdminClient()

    if (!userId || !storeId) {
      return { success: false, error: 'Faltan parámetros requeridos para el marcaje biométrico.' }
    }

    // 1. Obtener perfil de empleado
    const profile = await fetchUserProfile(adminClient, userId)

    if (!profile) {
      return { success: false, error: 'Perfil de empleado no encontrado.' }
    }

    if (profile.status === 'inactive') {
      return { success: false, error: 'El usuario se encuentra inactivo en el sistema.' }
    }

    // 2. Revisar si tiene jornada abierta en la sucursal
    const openRecord = await getActiveAttendanceAction(userId, storeId)

    if (openRecord) {
      // Realizar Check-Out
      const outRes = await checkOutAction({
        attendanceId: openRecord.id_attendance,
        notes,
      })

      if (!outRes.success) {
        return { success: false, error: outRes.error }
      }

      return {
        success: true,
        type: 'check_out',
        user: profile,
        attendance: outRes.attendance,
        durationFormatted: outRes.durationFormatted,
      }
    } else {
      // Realizar Check-In
      const inRes = await checkInAction({
        userId,
        storeId,
        notes,
        authMethod,
      })

      if (!inRes.success) {
        return { success: false, error: inRes.error }
      }

      return {
        success: true,
        type: 'check_in',
        user: profile,
        attendance: inRes.attendance,
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al procesar marcaje biométrico'
    return { success: false, error: msg }
  }
}

/**
 * Consulta de Asistencia por Sucursal, Rango de Fechas y Empleado
 */
export async function getAttendanceReportAction({
  storeId,
  startDate,
  endDate,
  userId,
}: {
  storeId: string
  startDate: string // YYYY-MM-DD o ISO
  endDate: string // YYYY-MM-DD o ISO
  userId?: string
}): Promise<{
  success: boolean
  records: EmployeeAttendance[]
  dailySummaries: AttendanceDailySummary[]
  metrics: {
    totalMinutes: number
    totalHoursFormatted: string
    totalDaysWorked: number
    totalEmployees: number
    openShiftsCount: number
    averageHoursPerDayFormatted: string
  }
  error?: string
}> {
  try {
    const adminClient = createAdminClient()

    if (!storeId) {
      return {
        success: false,
        records: [],
        dailySummaries: [],
        metrics: {
          totalMinutes: 0,
          totalHoursFormatted: '0h',
          totalDaysWorked: 0,
          totalEmployees: 0,
          openShiftsCount: 0,
          averageHoursPerDayFormatted: '0h',
        },
        error: 'Debe seleccionar una sucursal para consultar el reporte.',
      }
    }

    // Normalizar inicio y fin del día
    const startIso = new Date(`${startDate.split('T')[0]}T00:00:00.000Z`).toISOString()
    const endIso = new Date(`${endDate.split('T')[0]}T23:59:59.999Z`).toISOString()

    // 1. Consultar registros de asistencia
    let query = adminClient
      .from('employee_attendance')
      .select(`
        *,
        store:stores(id_store, description)
      `)
      .eq('id_store', storeId)
      .gte('check_in', startIso)
      .lte('check_in', endIso)
      .order('check_in', { ascending: true })

    if (userId && userId !== 'ALL') {
      query = query.eq('id_user', userId)
    }

    const { data: attendanceData, error: attErr } = await query

    if (attErr) {
      return {
        success: false,
        records: [],
        dailySummaries: [],
        metrics: {
          totalMinutes: 0,
          totalHoursFormatted: '0h',
          totalDaysWorked: 0,
          totalEmployees: 0,
          openShiftsCount: 0,
          averageHoursPerDayFormatted: '0h',
        },
        error: 'Error al consultar asistencia: ' + attErr.message,
      }
    }

    const rawRecords = (attendanceData || []) as EmployeeAttendance[]

    // 2. Obtener perfiles de los usuarios involucrados (con soporte tanto para profiles como para users)
    const userIds = Array.from(new Set(rawRecords.map((r) => r.id_user)))
    const userMap = new Map<string, Profile>()

    if (userIds.length > 0) {
      try {
        const { data: profilesData } = await adminClient
          .from('profiles')
          .select('*')
          .in('id', userIds)

        if (profilesData && profilesData.length > 0) {
          profilesData.forEach((p) => {
            userMap.set(p.id, p as Profile)
          })
        }
      } catch {
        // profiles might not exist
      }

      // Check which IDs are still missing and fetch from legacy users
      const missingIds = userIds.filter((id) => !userMap.has(id))
      if (missingIds.length > 0) {
        try {
          const { data: legacyUsers } = await adminClient
            .from('users')
            .select('*')
            .in('id_user', missingIds)

          if (legacyUsers) {
            legacyUsers.forEach((u) => {
              userMap.set(u.id_user, mapUserToProfile(u))
            })
          }
        } catch {
          // ignore
        }
      }
    }

    // Unir perfiles a cada registro
    const populatedRecords = rawRecords.map((r) => ({
      ...r,
      user: userMap.get(r.id_user),
    }))

    // 3. Agrupar por Día y por Empleado (soporta múltiples entradas y salidas en el mismo día)
    const summaryMap = new Map<string, AttendanceDailySummary>()
    let totalMinutesAll = 0
    let openCount = 0

    populatedRecords.forEach((rec) => {
      const recDate = new Date(rec.check_in).toISOString().split('T')[0]
      const groupKey = `${recDate}_${rec.id_user}`
      const user = userMap.get(rec.id_user)
      const userName = user?.full_name || user?.email || 'Empleado Desconocido'
      const storeName = rec.store?.description || 'Sucursal'

      // Si el turno aún está abierto, calcular minutos transcurridos hasta ahora
      let recMinutes = Number(rec.total_minutes || 0)
      if (rec.status === 'open') {
        openCount++
        const elapsed = Math.max(
          0,
          Math.round((new Date().getTime() - new Date(rec.check_in).getTime()) / 60000)
        )
        recMinutes = elapsed
      }

      totalMinutesAll += recMinutes

      if (!summaryMap.has(groupKey)) {
        summaryMap.set(groupKey, {
          date: recDate,
          userId: rec.id_user,
          userName,
          userEmail: user?.email || null,
          userRole: user?.role || 'CASHIER',
          storeId: rec.id_store,
          storeName,
          records: [rec],
          firstCheckIn: rec.check_in,
          lastCheckOut: rec.check_out,
          totalMinutes: recMinutes,
          totalHoursFormatted: formatMinutesToHours(recMinutes),
          hasOpenShift: rec.status === 'open',
        })
      } else {
        const item = summaryMap.get(groupKey)!
        item.records.push(rec)
        item.totalMinutes += recMinutes
        item.totalHoursFormatted = formatMinutesToHours(item.totalMinutes)
        if (rec.status === 'open') item.hasOpenShift = true
        if (rec.check_out && (!item.lastCheckOut || new Date(rec.check_out) > new Date(item.lastCheckOut))) {
          item.lastCheckOut = rec.check_out
        }
      }
    })

    const dailySummaries = Array.from(summaryMap.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )

    const uniqueEmployees = new Set(dailySummaries.map((s) => s.userId)).size
    const totalDaysWorked = dailySummaries.length
    const avgMinutes = totalDaysWorked > 0 ? Math.round(totalMinutesAll / totalDaysWorked) : 0

    return {
      success: true,
      records: populatedRecords,
      dailySummaries,
      metrics: {
        totalMinutes: totalMinutesAll,
        totalHoursFormatted: formatMinutesToHours(totalMinutesAll),
        totalDaysWorked,
        totalEmployees: uniqueEmployees,
        openShiftsCount: openCount,
        averageHoursPerDayFormatted: formatMinutesToHours(avgMinutes),
      },
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al procesar reporte'
    return {
      success: false,
      records: [],
      dailySummaries: [],
      metrics: {
        totalMinutes: 0,
        totalHoursFormatted: '0h',
        totalDaysWorked: 0,
        totalEmployees: 0,
        openShiftsCount: 0,
        averageHoursPerDayFormatted: '0h',
      },
      error: msg,
    }
  }
}

/**
 * Obtener lista de sucursales activas
 */
export async function getStoresForAttendanceAction(): Promise<Store[]> {
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('stores')
    .select('*')
    .eq('status', 'A')
    .order('description')
  return (data || []) as Store[]
}

/**
 * Obtener empleados para el filtro (por sucursal), soportando tanto profiles como users
 */
export async function getStoreEmployeesAction(storeId?: string | null): Promise<Profile[]> {
  const adminClient = createAdminClient()
  
  // 1. Intentar con profiles
  try {
    let query = adminClient
      .from('profiles')
      .select('*')
      .eq('status', 'active')
      .order('full_name')

    if (storeId) {
      query = query.or(`id_store.eq.${storeId},role.eq.ADMIN,id_store.is.null`)
    }

    const { data, error } = await query
    if (!error && data && data.length > 0) {
      return data as Profile[]
    }
  } catch {
    // profiles table might not exist
  }

  // 2. Fallback a users
  try {
    const { data: legacyUsers, error } = await adminClient
      .from('users')
      .select('*')
      .eq('status', 'A')
      .order('user_name')

    if (!error && legacyUsers && legacyUsers.length > 0) {
      return legacyUsers.map((u) => mapUserToProfile(u))
    }
  } catch {
    // ignore
  }

  return []
}
