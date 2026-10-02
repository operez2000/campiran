'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/utils/supabase/client'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { StatusBadge } from '@/components/status-badge'
import { type Profile, type Store, type UserRole, type ProfileStatus } from '@/lib/types'
import { getInitials, getRoleLabel } from '@/lib/utils'
import { toast } from 'sonner'
import {
  UserCog, Search, Edit3, Check, X, Shield, Store as StoreIcon,
  RefreshCw, Power, CheckCircle2, AlertCircle
} from 'lucide-react'

const ROLES: { value: UserRole; label: string; desc: string }[] = [
  { value: 'ADMIN', label: 'Administrador', desc: 'Acceso total a todas las sucursales y módulos' },
  { value: 'MANAGER', label: 'Gerente', desc: 'Acceso a sucursal asignada (reportes incluidos)' },
  { value: 'CASHIER', label: 'Cajero', desc: 'Acceso exclusivo al Punto de Venta (POS)' },
  { value: 'ALMACENISTA', label: 'Almacenista', desc: 'Acceso a inventario, físico y catálogo' },
  { value: 'PENDING', label: 'Pendiente', desc: 'Sin acceso, en espera de asignación' },
]

export function UsuariosClient() {
  const supabase = createClient()

  const [profiles, setProfiles] = useState<Profile[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')

  // Edit Role & Store Modal
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null)
  const [selectedRole, setSelectedRole] = useState<UserRole>('PENDING')
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [selectedStatus, setSelectedStatus] = useState<ProfileStatus>('pending')
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [profilesRes, storesRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('stores').select('*').eq('status', 'A').order('description'),
    ])

    if (profilesRes.data) setProfiles(profilesRes.data as Profile[])
    if (storesRes.data) setStores(storesRes.data as Store[])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Realtime subscription on profiles
  useEffect(() => {
    const channel = supabase
      .channel('admin-profiles-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, fetchData])

  const filteredProfiles = useMemo(() => {
    return profiles.filter((p) => {
      if (roleFilter !== 'ALL' && p.role !== roleFilter) return false
      if (statusFilter !== 'ALL' && p.status !== statusFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const name = (p.full_name || '').toLowerCase()
        const email = (p.email || '').toLowerCase()
        const phone = (p.phone || '').toLowerCase()
        if (!name.includes(q) && !email.includes(q) && !phone.includes(q)) return false
      }
      return true
    })
  }, [profiles, roleFilter, statusFilter, search])

  const handleOpenEdit = (profile: Profile) => {
    setEditingProfile(profile)
    setSelectedRole(profile.role || 'PENDING')
    setSelectedStoreId(profile.id_store || '')
    setSelectedStatus(profile.status || 'pending')
  }

  const handleSave = async () => {
    if (!editingProfile) return
    setSaving(true)

    const payload = {
      role: selectedRole,
      id_store: selectedRole === 'ADMIN' ? null : selectedStoreId || null,
      status: selectedStatus,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', editingProfile.id)

    setSaving(false)
    if (error) {
      toast.error('Error al actualizar permisos del usuario: ' + error.message)
    } else {
      toast.success(`Permisos de ${editingProfile.full_name ?? 'usuario'} actualizados`)
      setEditingProfile(null)
      fetchData()
    }
  }

  // Quick toggle active / inactive status
  const handleToggleStatus = async (profile: Profile) => {
    const nextStatus: ProfileStatus = profile.status === 'active' ? 'inactive' : 'active'
    const { error } = await supabase
      .from('profiles')
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profile.id)

    if (error) {
      toast.error('Error al cambiar estado')
    } else {
      toast.success(
        nextStatus === 'active'
          ? `Usuario ${profile.full_name ?? ''} activado`
          : `Usuario ${profile.full_name ?? ''} suspendido`
      )
      fetchData()
    }
  }

  return (
    <div className="space-y-6">
      <div className="dashboard-bg" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <UserCog className="text-emerald-500" size={28} />
            Usuarios y Roles
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Asignación de perfiles, permisos por rol y control de acceso a sucursales
          </p>
        </div>
      </div>

      {/* Filters Bar */}
      <GlassCard padding="sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex-1 max-w-md">
            <GlassInput
              placeholder="Buscar usuario por nombre o correo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<Search size={16} />}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Role Filter */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-input text-xs font-medium">
              <Shield size={14} className="text-muted-foreground" />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="bg-transparent border-none text-foreground text-xs focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-zinc-900 text-white">Todos los roles</option>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value} className="bg-zinc-900 text-white">
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1 p-1 rounded-xl glass">
              <button
                onClick={() => setStatusFilter('active')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === 'active'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Activos
              </button>
              <button
                onClick={() => setStatusFilter('pending')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === 'pending'
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Pendientes
              </button>
              <button
                onClick={() => setStatusFilter('inactive')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === 'inactive'
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Inactivos
              </button>
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === 'ALL'
                    ? 'bg-white/15 text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Todos
              </button>
            </div>

            <GlassButton
              variant="ghost"
              size="sm"
              onClick={fetchData}
              disabled={loading}
              title="Recargar"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </GlassButton>
          </div>
        </div>
      </GlassCard>

      {/* Users Table */}
      <GlassCard padding="none" className="overflow-hidden">
        <div className="overflow-x-auto scroll-modern">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="glass-table-header border-b border-border/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3.5">Usuario</th>
                <th className="px-4 py-3.5">Rol de Sistema</th>
                <th className="px-4 py-3.5">Sucursal Asignada</th>
                <th className="px-4 py-3.5 text-center">Estado</th>
                <th className="px-4 py-3.5 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                    Cargando usuarios...
                  </td>
                </tr>
              ) : filteredProfiles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                    <p className="text-base font-medium">No se encontraron usuarios</p>
                  </td>
                </tr>
              ) : (
                filteredProfiles.map((p) => {
                  const assignedStore = stores.find((s) => s.id_store === p.id_store)

                  return (
                    <tr key={p.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shadow-md">
                            {getInitials(p.full_name)}
                          </div>
                          <div>
                            <span className="font-semibold text-foreground group-hover:text-emerald-400 transition-colors block leading-tight">
                              {p.full_name || 'Sin nombre'}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">
                              {p.email}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <StatusBadge status={p.role} customLabel={getRoleLabel(p.role)} />
                      </td>

                      <td className="px-4 py-3.5 text-xs text-muted-foreground">
                        {p.role === 'ADMIN' ? (
                          <span className="text-emerald-400 font-medium">Todas (Acceso Global)</span>
                        ) : assignedStore ? (
                          <span className="flex items-center gap-1.5 text-foreground font-medium">
                            <StoreIcon size={13} className="text-emerald-500" />
                            {assignedStore.description}
                          </span>
                        ) : (
                          <span className="text-amber-500">Sin sucursal asignada</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <StatusBadge status={p.status} />
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenEdit(p)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                            title="Editar rol y sucursal"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            onClick={() => handleToggleStatus(p)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              p.status === 'active'
                                ? 'text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10'
                                : 'text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10'
                            }`}
                            title={p.status === 'active' ? 'Suspender usuario' : 'Activar usuario'}
                          >
                            <Power size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-border/20 text-xs text-muted-foreground flex items-center justify-between">
          <span>Total: {filteredProfiles.length} usuarios</span>
          <span className="text-emerald-500 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Control de accesos en tiempo real
          </span>
        </div>
      </GlassCard>

      {/* Modal: Edit User Role & Store */}
      <AnimatePresence>
        {editingProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card max-w-md w-full p-6 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <h3 className="text-base font-bold text-foreground">Gestionar Permisos de Usuario</h3>
                <button
                  onClick={() => setEditingProfile(null)}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-1">
                <p className="font-semibold text-foreground text-sm">{editingProfile.full_name}</p>
                <p className="text-xs text-muted-foreground font-mono">{editingProfile.email}</p>
              </div>

              {/* Role Select */}
              <div className="space-y-1.5 pt-2">
                <label className="text-xs font-semibold text-muted-foreground block">
                  Rol en el Sistema
                </label>
                <div className="space-y-1.5">
                  {ROLES.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setSelectedRole(r.value)}
                      className={`w-full p-2.5 rounded-xl border text-left flex items-start justify-between transition-all ${
                        selectedRole === r.value
                          ? 'border-emerald-500 bg-emerald-500/15 text-foreground'
                          : 'border-border/30 hover:bg-white/5 text-muted-foreground'
                      }`}
                    >
                      <div>
                        <p className="text-xs font-bold text-foreground">{r.label}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{r.desc}</p>
                      </div>
                      {selectedRole === r.value && (
                        <CheckCircle2 size={16} className="text-emerald-400 mt-0.5" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Store select (if not ADMIN) */}
              {selectedRole !== 'ADMIN' && selectedRole !== 'PENDING' && (
                <div className="space-y-1.5 pt-2">
                  <label className="text-xs font-semibold text-muted-foreground block">
                    Sucursal Asignada *
                  </label>
                  <select
                    value={selectedStoreId}
                    onChange={(e) => setSelectedStoreId(e.target.value)}
                    className="w-full glass-input px-3 py-2 text-xs text-foreground bg-transparent focus:outline-none"
                  >
                    <option value="" className="bg-zinc-900 text-white">Seleccione una sucursal</option>
                    {stores.map((s) => (
                      <option key={s.id_store} value={s.id_store} className="bg-zinc-900 text-white">
                        {s.description}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Status Select */}
              <div className="space-y-1.5 pt-2">
                <label className="text-xs font-semibold text-muted-foreground block">
                  Estado de la Cuenta
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['active', 'pending', 'inactive'] as ProfileStatus[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setSelectedStatus(st)}
                      className={`p-2 rounded-xl border text-xs font-medium capitalize text-center transition-all ${
                        selectedStatus === st
                          ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
                          : 'border-border/30 glass hover:bg-white/5 text-muted-foreground'
                      }`}
                    >
                      {st === 'active' ? 'Activo' : st === 'pending' ? 'Pendiente' : 'Inactivo'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border/40">
                <GlassButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingProfile(null)}
                >
                  Cancelar
                </GlassButton>
                <GlassButton
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                >
                  <Check size={14} className="mr-1" />
                  {saving ? 'Guardando...' : 'Aplicar Cambios'}
                </GlassButton>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
