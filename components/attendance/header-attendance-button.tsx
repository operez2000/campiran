'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/utils/supabase/client'
import { useStore } from '@/components/providers/store-provider'
import { type Profile, type EmployeeAttendance } from '@/lib/types'
import {
  getActiveAttendanceAction,
  checkInAction,
  checkOutAction,
} from '@/app/(dashboard)/reportes/attendance-actions'
import { AttendanceKioskModal } from './attendance-kiosk-modal'
import { toast } from 'sonner'
import { LogIn, LogOut, Clock, KeyRound, Sparkles } from 'lucide-react'

interface HeaderAttendanceButtonProps {
  profile: Profile
}

export function HeaderAttendanceButton({ profile }: HeaderAttendanceButtonProps) {
  const supabase = createClient()
  const { currentStore, storeId } = useStore()

  const [activeAttendance, setActiveAttendance] = useState<EmployeeAttendance | null>(null)
  const [loading, setLoading] = useState(false)
  const [kioskOpen, setKioskOpen] = useState(false)

  // Fetch current open attendance for this user in this store
  const refreshAttendance = useCallback(async () => {
    if (!profile?.id || !storeId) {
      setActiveAttendance(null)
      return
    }

    try {
      const active = await getActiveAttendanceAction(profile.id, storeId)
      setActiveAttendance(active)
    } catch {
      // ignore
    }
  }, [profile?.id, storeId])

  useEffect(() => {
    refreshAttendance()
  }, [refreshAttendance])

  // Realtime subscription for this user's attendance
  useEffect(() => {
    if (!profile?.id) return

    const channel = supabase
      .channel(`attendance-user-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'employee_attendance',
          filter: `id_user=eq.${profile.id}`,
        },
        () => {
          refreshAttendance()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile?.id, supabase, refreshAttendance])

  // Handle Check-In for the authenticated user
  const handleCheckIn = async () => {
    if (!storeId) {
      toast.error('Selecciona una sucursal primero.')
      return
    }

    setLoading(true)
    try {
      const res = await checkInAction({
        userId: profile.id,
        storeId,
        authMethod: 'session',
      })

      if (res.success && res.attendance) {
        setActiveAttendance(res.attendance)
        const checkInTime = new Date(res.attendance.check_in).toLocaleTimeString('es-MX', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
        toast.success(`¡Entrada registrada a las ${checkInTime}! Buen turno.`)
      } else {
        toast.error(res.error || 'Error al registrar entrada')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  // Handle Check-Out for the authenticated user
  const handleCheckOut = async () => {
    if (!activeAttendance) return

    setLoading(true)
    try {
      const res = await checkOutAction({
        attendanceId: activeAttendance.id_attendance,
      })

      if (res.success && res.attendance) {
        setActiveAttendance(null)
        const checkOutTime = new Date(res.attendance.check_out!).toLocaleTimeString('es-MX', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
        toast.success(
          `¡Salida registrada a las ${checkOutTime}! Tiempo trabajado: ${res.durationFormatted || ''}`
        )
      } else {
        toast.error(res.error || 'Error al registrar salida')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        {/* If Active Attendance: Show pulsing badge and Check-Out button */}
        {activeAttendance ? (
          <div className="flex items-center gap-1.5 p-1 rounded-xl glass border-emerald-500/30 bg-emerald-500/5">
            <div className="flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="hidden sm:inline">En Turno</span>
              <span className="font-mono text-[11px] opacity-80">
                {new Date(activeAttendance.check_in).toLocaleTimeString('es-MX', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>

            <button
              onClick={handleCheckOut}
              disabled={loading}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 border border-rose-500/20 transition-all active:scale-95 disabled:opacity-50"
              title="Registrar Salida de Jornada"
            >
              <LogOut size={13} />
              <span>Salida</span>
            </button>
          </div>
        ) : (
          /* If Not Checked In: Show Check-In button */
          <button
            onClick={handleCheckIn}
            disabled={loading || !storeId}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-500/20 hover:opacity-95 active:scale-95 transition-all disabled:opacity-50"
            title="Registrar Entrada a Sucursal"
          >
            <LogIn size={14} />
            <span className="hidden sm:inline">Entrada</span>
            <span className="sm:hidden">CheckIn</span>
          </button>
        )}

        {/* Kiosk Mode Button (for any employee with PIN) */}
        <button
          onClick={() => setKioskOpen(true)}
          className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl glass hover:border-emerald-500/40 hover:bg-emerald-500/10 text-muted-foreground hover:text-foreground text-xs font-medium flex items-center gap-1.5 transition-all"
          title="Abrir Quiosco de Asistencia (Marcaje rápido con PIN)"
          aria-label="Quiosco de Asistencia"
        >
          <Clock size={15} className="text-emerald-500" />
          <span className="hidden md:inline">Quiosco</span>
        </button>
      </div>

      {/* Kiosk Modal */}
      <AttendanceKioskModal
        open={kioskOpen}
        onClose={() => setKioskOpen(false)}
        store={currentStore}
        onAttendanceChanged={refreshAttendance}
      />
    </>
  )
}
