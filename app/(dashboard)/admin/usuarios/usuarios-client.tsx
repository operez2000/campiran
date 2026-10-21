'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/utils/supabase/client'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { StatusBadge } from '@/components/status-badge'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { type Profile, type Store, type UserRole, type ProfileStatus } from '@/lib/types'
import { getInitials, getRoleLabel } from '@/lib/utils'
import { toast } from 'sonner'
import {
  UserCog, Search, Edit3, Check, X, Shield, Store as StoreIcon,
  RefreshCw, Power, CheckCircle2, UserPlus, Phone, Mail, Lock, Trash2, Users,
  Fingerprint, ScanFace, KeyRound, ShieldCheck, Eye, EyeOff
} from 'lucide-react'
import { TableActionMenu, TableColumnHeader, TablePagination } from '@/components/tables'
import { BiometricsEnrollmentModal } from '@/components/biometrics/biometrics-enrollment-modal'
import { UserAvatar } from '@/components/user-avatar'
import {
  getUsersAndStoresAction,
  updateUserAction,
  createUserAction,
  toggleUserStatusAction,
  deleteUserAction,
} from './actions'

const ROLES: { value: UserRole; label: string; desc: string }[] = [
  { value: 'ADMIN', label: 'Administrador', desc: 'Acceso total a todas las sucursales y módulos' },
  { value: 'MANAGER', label: 'Gerente', desc: 'Acceso a sucursal asignada (reportes incluidos)' },
  { value: 'CASHIER', label: 'Cajero', desc: 'Acceso exclusivo al Punto de Venta (POS)' },
  { value: 'ALMACENISTA', label: 'Almacenista', desc: 'Acceso a inventario, físico y catálogo' },
  { value: 'PENDING', label: 'Pendiente', desc: 'Sin acceso, en espera de asignación' },
]

interface UsuariosClientProps {
  initialUsers?: Profile[]
  initialStores?: Store[]
}

export function UsuariosClient({ initialUsers = [], initialStores = [] }: UsuariosClientProps) {
  const supabase = createClient()

  const [profiles, setProfiles] = useState<Profile[]>(initialUsers)
  const [stores, setStores] = useState<Store[]>(initialStores)
  const [loading, setLoading] = useState(initialUsers.length === 0)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [biometricsFilter, setBiometricsFilter] = useState<string>('ALL')

  // Edit User Modal state
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [selectedRole, setSelectedRole] = useState<UserRole>('PENDING')
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [selectedStatus, setSelectedStatus] = useState<ProfileStatus>('pending')
  const [editCashierNumber, setEditCashierNumber] = useState('')
  const [editCashierPin, setEditCashierPin] = useState('')
  const [showEditPin, setShowEditPin] = useState(false)
  const [saving, setSaving] = useState(false)

  // Biometrics Enrollment Modal state
  const [biometricsModalUser, setBiometricsModalUser] = useState<Profile | null>(null)
  const [biometricsModalOpen, setBiometricsModalOpen] = useState(false)

  // Create User Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createEmail, setCreateEmail] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createPhone, setCreatePhone] = useState('')
  const [createRole, setCreateRole] = useState<UserRole>('CASHIER')
  const [createStoreId, setCreateStoreId] = useState<string>('')
  const [createStatus, setCreateStatus] = useState<ProfileStatus>('active')
  const [createCashierNumber, setCreateCashierNumber] = useState('')
  const [createCashierPin, setCreateCashierPin] = useState('')
  const [creating, setCreating] = useState(false)

  // Confirm delete / suspend state
  const [userToDelete, setUserToDelete] = useState<Profile | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Fetch data through Server Action (supporting profiles, auth.users and legacy users)
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getUsersAndStoresAction()
      setProfiles(data.users)
      setStores(data.stores)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar usuarios'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (initialUsers.length === 0) {
      fetchData()
    }
  }, [initialUsers.length, fetchData])

  // Realtime subscriptions on profiles, users & user_biometrics
  useEffect(() => {
    const channel = supabase
      .channel('admin-users-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
        fetchData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_biometrics' }, () => {
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

      if (biometricsFilter === 'webauthn' && !p.biometrics?.has_webauthn) return false
      if (biometricsFilter === 'face' && !p.biometrics?.has_face) return false
      if (biometricsFilter === 'pin' && !(p.biometrics?.cashier_pin || p.biometrics?.cashier_number)) return false
      if (
        biometricsFilter === 'none' &&
        (p.biometrics?.has_webauthn ||
          p.biometrics?.has_face ||
          p.biometrics?.cashier_pin ||
          p.biometrics?.cashier_number)
      ) {
        return false
      }

      if (search.trim()) {
        const q = search.toLowerCase()
        const name = (p.full_name || '').toLowerCase()
        const email = (p.email || '').toLowerCase()
        const phone = (p.phone || '').toLowerCase()
        const cashierNum = (p.biometrics?.cashier_number || '').toLowerCase()
        if (!name.includes(q) && !email.includes(q) && !phone.includes(q) && !cashierNum.includes(q)) return false
      }
      return true
    })
  }, [profiles, roleFilter, statusFilter, biometricsFilter, search])

  // Sorting state
  const [sortKey, setSortKey] = useState<string>('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  useEffect(() => {
    setCurrentPage(1)
  }, [search, roleFilter, statusFilter, biometricsFilter])

  const sortedProfiles = useMemo(() => {
    const list = [...filteredProfiles]
    if (!sortKey) return list

    return list.sort((a, b) => {
      let aVal = ''
      let bVal = ''

      switch (sortKey) {
        case 'name':
          aVal = (a.full_name || a.email || '').toLowerCase()
          bVal = (b.full_name || b.email || '').toLowerCase()
          break
        case 'role':
          aVal = a.role || ''
          bVal = b.role || ''
          break
        case 'store': {
          const storeA =
            stores.find((s) => s.id_store === a.id_store)?.description ||
            (a.role === 'ADMIN' ? 'Todas' : 'Sin asignar')
          const storeB =
            stores.find((s) => s.id_store === b.id_store)?.description ||
            (b.role === 'ADMIN' ? 'Todas' : 'Sin asignar')
          aVal = storeA.toLowerCase()
          bVal = storeB.toLowerCase()
          break
        }
        case 'biometrics': {
          const scoreA =
            (a.biometrics?.has_webauthn ? 4 : 0) +
            (a.biometrics?.has_face ? 2 : 0) +
            (a.biometrics?.cashier_pin ? 1 : 0)
          const scoreB =
            (b.biometrics?.has_webauthn ? 4 : 0) +
            (b.biometrics?.has_face ? 2 : 0) +
            (b.biometrics?.cashier_pin ? 1 : 0)
          if (scoreA < scoreB) return sortDirection === 'asc' ? -1 : 1
          if (scoreA > scoreB) return sortDirection === 'asc' ? 1 : -1
          return 0
        }
        case 'status':
          aVal = a.status || ''
          bVal = b.status || ''
          break
        default:
          return 0
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredProfiles, sortKey, sortDirection, stores])

  const totalPages = Math.ceil(sortedProfiles.length / pageSize) || 1
  const paginatedProfiles = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedProfiles.slice(start, start + pageSize)
  }, [sortedProfiles, currentPage, pageSize])

  const handleOpenEdit = (profile: Profile) => {
    setEditingProfile(profile)
    setEditName(profile.full_name || '')
    setEditPhone(profile.phone || '')
    setSelectedRole(profile.role || 'PENDING')
    setSelectedStoreId(profile.id_store || '')
    setSelectedStatus(profile.status || 'pending')
    setEditCashierNumber(profile.biometrics?.cashier_number || '')
    setEditCashierPin(profile.biometrics?.cashier_pin || '')
    setShowEditPin(false)
  }

  const handleSave = async () => {
    if (!editingProfile) return
    setSaving(true)

    try {
      await updateUserAction({
        id: editingProfile.id,
        role: selectedRole,
        id_store: selectedRole === 'ADMIN' ? null : selectedStoreId || null,
        status: selectedStatus,
        full_name: editName.trim() || undefined,
        phone: editPhone.trim() || null,
        cashier_number: editCashierNumber.trim() || null,
        cashier_pin: editCashierPin.trim() || null,
      })

      toast.success(`Usuario ${editName || editingProfile.email} actualizado correctamente`)
      setEditingProfile(null)
      fetchData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al actualizar usuario'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  // Quick toggle active / inactive status
  const handleToggleStatus = async (profile: Profile) => {
    const nextStatus: ProfileStatus = profile.status === 'active' ? 'inactive' : 'active'
    try {
      await toggleUserStatusAction(profile.id, profile.status)
      toast.success(
        nextStatus === 'active'
          ? `Usuario ${profile.full_name || profile.email} activado`
          : `Usuario ${profile.full_name || profile.email} suspendido`
      )
      fetchData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cambiar estado'
      toast.error(msg)
    }
  }

  // Logical delete handler
  const handleConfirmDelete = async () => {
    if (!userToDelete) return
    setDeleting(true)
    try {
      await deleteUserAction(userToDelete.id)
      toast.success(`Usuario ${userToDelete.full_name || userToDelete.email} desactivado correctamente`)
      setUserToDelete(null)
      fetchData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al desactivar usuario'
      toast.error(msg)
    } finally {
      setDeleting(false)
    }
  }

  // Create new user handler
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createName.trim()) {
      toast.error('Ingresa el nombre completo')
      return
    }
    if (!createEmail.trim() || !createEmail.includes('@')) {
      toast.error('Ingresa un correo electrónico válido')
      return
    }
    if (!createPassword || createPassword.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres')
      return
    }

    setCreating(true)
    try {
      const res = await createUserAction({
        full_name: createName.trim(),
        email: createEmail.trim(),
        password: createPassword,
        phone: createPhone.trim() || null,
        role: createRole,
        id_store: createRole === 'ADMIN' ? null : createStoreId || null,
        status: createStatus,
        cashier_number: createCashierNumber.trim() || null,
        cashier_pin: createCashierPin.trim() || null,
      })

      toast.success(`Usuario ${createName} creado exitosamente`)
      setIsCreateOpen(false)
      setCreateName('')
      setCreateEmail('')
      setCreatePassword('')
      setCreatePhone('')
      setCreateRole('CASHIER')
      setCreateStoreId('')
      setCreateStatus('active')
      setCreateCashierNumber('')
      setCreateCashierPin('')
      fetchData()

      // Sugerir enrolar biometría (WebAuthn / Face ID) si es rol operativo
      if (res?.user && (createRole === 'CASHIER' || createRole === 'MANAGER' || createRole === 'ADMIN')) {
        toast('¿Deseas configurar la biometría ahora?', {
          description: 'Puedes enrolar sensor Touch ID / Face ID o capturar el rostro con la cámara.',
          action: {
            label: 'Configurar',
            onClick: () => {
              setBiometricsModalUser(res.user)
              setBiometricsModalOpen(true)
            },
          },
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al crear usuario'
      toast.error(msg)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="h-full flex-1 flex flex-col min-h-0 gap-2.5 sm:gap-3">
      <div className="dashboard-bg" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground flex items-center gap-2 leading-tight">
            <UserCog className="text-emerald-500" size={20} />
            Usuarios y Roles
          </h1>
          <p className="text-xs text-muted-foreground line-clamp-1">
            Administración de cuentas registradas en Supabase, roles del sistema y asignación de sucursales
          </p>
        </div>

        <div className="flex items-center gap-2">
          <GlassButton
            variant="primary"
            size="sm"
            className="text-xs h-8 sm:h-9"
            onClick={() => setIsCreateOpen(true)}
          >
            <UserPlus size={15} className="mr-1.5" />
            Nuevo Usuario
          </GlassButton>
        </div>
      </div>

      {/* Filters Bar */}
      <GlassCard padding="none" className="p-2 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div className="flex-1 max-w-md">
            <GlassInput
              placeholder="Buscar usuario por nombre o correo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<Search size={15} />}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Role Filter */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl glass-input text-xs font-medium">
              <Shield size={13} className="text-muted-foreground" />
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

            {/* Biometrics Filter */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl glass-input text-xs font-medium">
              <Fingerprint size={13} className="text-emerald-400" />
              <select
                value={biometricsFilter}
                onChange={(e) => setBiometricsFilter(e.target.value)}
                className="bg-transparent border-none text-foreground text-xs focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-zinc-900 text-white">Toda Biometría</option>
                <option value="webauthn" className="bg-zinc-900 text-white">Con WebAuthn</option>
                <option value="face" className="bg-zinc-900 text-white">Con Face ID</option>
                <option value="pin" className="bg-zinc-900 text-white">Con PIN / No. Caja</option>
                <option value="none" className="bg-zinc-900 text-white">Sin Biometría</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1 p-0.5 rounded-xl glass border border-border/40">
              <button
                onClick={() => setStatusFilter('active')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === 'active'
                    ? 'bg-emerald-500 text-white shadow-sm font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Activos
              </button>
              <button
                onClick={() => setStatusFilter('pending')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === 'pending'
                    ? 'bg-amber-500 text-white shadow-sm font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Pendientes
              </button>
              <button
                onClick={() => setStatusFilter('inactive')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === 'inactive'
                    ? 'bg-rose-500 text-white shadow-sm font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Inactivos
              </button>
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === 'ALL'
                    ? 'bg-white/15 text-foreground shadow-sm font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Todos ({profiles.length})
              </button>
            </div>

            <GlassButton
              variant="ghost"
              size="sm"
              onClick={fetchData}
              disabled={loading}
              title="Recargar usuarios desde Supabase"
              className="h-8 px-2.5"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin text-emerald-400' : ''} />
            </GlassButton>
          </div>
        </div>
      </GlassCard>

      {/* Users Table */}
      <GlassCard padding="none" className="overflow-hidden shadow-xl flex-1 min-h-0 flex flex-col">
        <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0 scroll-modern">
          <table className="w-full text-left text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-20">
              <tr className="glass-table-header border-b border-border/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="w-20 px-4 py-3.5 text-center sticky top-0 z-20 bg-card/95 backdrop-blur-md">
                  Acciones
                </th>
                <TableColumnHeader
                  title="Usuario"
                  sortKey="name"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <TableColumnHeader
                  title="Rol de Sistema"
                  sortKey="role"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <TableColumnHeader
                  title="Sucursal Asignada"
                  sortKey="store"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <TableColumnHeader
                  title="Biometría y Acceso"
                  sortKey="biometrics"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <TableColumnHeader
                  title="Estado"
                  sortKey="status"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="center"
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {loading && profiles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw size={18} className="animate-spin text-emerald-500" />
                      <span>Cargando usuarios desde Supabase...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedProfiles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    <p className="text-base font-medium">No se encontraron usuarios</p>
                    <p className="text-xs mt-1 text-muted-foreground/80">
                      Modifica los filtros de búsqueda o agrega un nuevo usuario.
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedProfiles.map((p) => {
                  const assignedStore = stores.find((s) => s.id_store === p.id_store)
                  const bio = p.biometrics

                  return (
                    <tr key={p.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="w-20 px-4 py-3.5 text-center">
                        <TableActionMenu
                          items={[
                            {
                              label: 'Editar Usuario y Rol',
                              icon: <Edit3 size={15} />,
                              onClick: () => handleOpenEdit(p),
                              variant: 'primary',
                            },
                            {
                              label: 'Biometría y Cajero (Face ID / WebAuthn)',
                              icon: <Fingerprint size={15} />,
                              onClick: () => {
                                setBiometricsModalUser(p)
                                setBiometricsModalOpen(true)
                              },
                              variant: 'primary',
                            },
                            {
                              label: p.status === 'active' ? 'Suspender Acceso' : 'Reactivar Acceso',
                              icon: <Power size={15} />,
                              onClick: () => handleToggleStatus(p),
                              variant: p.status === 'active' ? 'danger' : 'primary',
                              separatorBefore: true,
                            },
                            {
                              label: 'Desactivar Usuario',
                              icon: <Trash2 size={15} />,
                              onClick: () => setUserToDelete(p),
                              variant: 'danger',
                            },
                          ]}
                        />
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            src={p.avatar_url}
                            name={p.full_name || p.email}
                            size="md"
                            rounded="xl"
                          />
                          <div>
                            <span className="font-semibold text-foreground group-hover:text-emerald-400 transition-colors block leading-tight">
                              {p.full_name || 'Sin nombre'}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">
                              {p.email}
                            </span>
                            {p.phone && (
                              <span className="text-[11px] text-muted-foreground/80 block mt-0.5">
                                📞 {p.phone}
                              </span>
                            )}
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

                      {/* Biometría y Acceso */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col gap-1.5 min-w-[210px]">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {/* WebAuthn / Touch ID / Face ID Badge */}
                            {bio?.has_webauthn ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-xs"
                                title="Biometría WebAuthn (Touch ID / Face ID / Windows Hello) activada"
                              >
                                <Fingerprint size={12} className="text-emerald-400" />
                                <span>WebAuthn</span>
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] text-muted-foreground/60 bg-white/[0.03] border border-border/30"
                                title="Sin sensor biométrico WebAuthn registrado"
                              >
                                <Fingerprint size={11} className="text-muted-foreground/40" />
                                <span>Sin sensor</span>
                              </span>
                            )}

                            {/* Face ID / Foto Facial Badge */}
                            {bio?.has_face ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 shadow-xs"
                                title="Reconocimiento facial y foto de referencia registrados"
                              >
                                <ScanFace size={12} className="text-indigo-400" />
                                <span>Facial</span>
                                {bio.face_photo_url && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                                )}
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] text-muted-foreground/60 bg-white/[0.03] border border-border/30"
                                title="Sin foto facial registrada"
                              >
                                <ScanFace size={11} className="text-muted-foreground/40" />
                                <span>Sin rostro</span>
                              </span>
                            )}

                            {/* Cajero / PIN Badge */}
                            {bio?.cashier_pin ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30"
                                title={`Caja: ${bio.cashier_number || 'S/N'} • PIN configurado`}
                              >
                                <KeyRound size={11} className="text-amber-400" />
                                <span>{bio.cashier_number ? `Caja ${bio.cashier_number}` : 'PIN ✓'}</span>
                              </span>
                            ) : bio?.cashier_number ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-white/[0.05] text-foreground border border-border/40"
                                title={`No. de Cajero: ${bio.cashier_number}`}
                              >
                                <KeyRound size={11} className="text-muted-foreground" />
                                <span>{bio.cashier_number}</span>
                              </span>
                            ) : null}
                          </div>

                          {/* Botón rápido para abrir configuración biométrica */}
                          <div>
                            <button
                              type="button"
                              onClick={() => {
                                setBiometricsModalUser(p)
                                setBiometricsModalOpen(true)
                              }}
                              className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors hover:underline cursor-pointer font-medium"
                            >
                              <Fingerprint size={11} />
                              <span>Configurar biometría</span>
                            </button>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <StatusBadge status={p.status} />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={sortedProfiles.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          realtimeLabel="Control de accesos y perfiles en tiempo real"
        />
      </GlassCard>

      {/* Modal: Edit User Role & Store */}
      <AnimatePresence>
        {editingProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto scroll-modern"
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-3 gap-2">
                <h3 className="text-base font-bold text-foreground">Gestionar Usuario y Permisos</h3>
                <div className="flex items-center gap-2">
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
                  <button
                    type="button"
                    onClick={() => setEditingProfile(null)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* User Avatar & Identity Header */}
              <div className="p-3 rounded-2xl glass border border-white/5 flex items-center gap-3 bg-white/[0.02]">
                <UserAvatar
                  src={editingProfile.avatar_url}
                  name={editingProfile.full_name || editingProfile.email}
                  size="lg"
                  rounded="xl"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">
                    {editingProfile.full_name || 'Usuario'}
                  </p>
                  <p className="text-xs text-muted-foreground truncate font-mono">
                    {editingProfile.email}
                  </p>
                  <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    {getRoleLabel(editingProfile.role)}
                  </span>
                </div>
              </div>

              {/* User Email & Basic Info */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Correo Electrónico (Solo Lectura)
                  </label>
                  <GlassInput
                    value={editingProfile.email || ''}
                    disabled
                    icon={<Mail size={16} />}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Nombre Completo
                  </label>
                  <GlassInput
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Nombre completo"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Teléfono
                  </label>
                  <GlassInput
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="Teléfono de contacto"
                    icon={<Phone size={16} />}
                  />
                </div>
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

              {/* Sección Biometría y Cajero */}
              <div className="pt-2 space-y-3 border-t border-border/30">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Fingerprint size={14} className="text-emerald-400" />
                    <span>Credenciales de Cajero y Biometría</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (editingProfile) {
                        setBiometricsModalUser(editingProfile)
                        setBiometricsModalOpen(true)
                      }
                    }}
                    className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 transition-colors underline cursor-pointer"
                  >
                    Asistente Biométrico Completo
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">
                      No. de Cajero / Caja
                    </label>
                    <GlassInput
                      placeholder="Ej. CAJA-01"
                      value={editCashierNumber}
                      onChange={(e) => setEditCashierNumber(e.target.value)}
                      icon={<KeyRound size={14} />}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">
                      PIN de Seguridad (4-6 dígitos)
                    </label>
                    <div className="relative">
                      <GlassInput
                        type={showEditPin ? 'text' : 'password'}
                        maxLength={6}
                        placeholder="••••"
                        value={editCashierPin}
                        onChange={(e) => setEditCashierPin(e.target.value.replace(/\D/g, ''))}
                        className="tracking-widest font-mono pr-8"
                      />
                      <button
                        type="button"
                        onClick={() => setShowEditPin(!showEditPin)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        {showEditPin ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Status Pills */}
                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-2xl bg-white/[0.02] border border-border/30">
                  <div className="flex items-center gap-2">
                    <Fingerprint
                      size={16}
                      className={editingProfile?.biometrics?.has_webauthn ? 'text-emerald-400' : 'text-muted-foreground/40'}
                    />
                    <div>
                      <p className="text-[11px] font-semibold text-foreground">WebAuthn</p>
                      <p className="text-[10px] text-muted-foreground">
                        {editingProfile?.biometrics?.has_webauthn ? 'Sensor Activo' : 'Sin sensor'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <ScanFace
                      size={16}
                      className={editingProfile?.biometrics?.has_face ? 'text-indigo-400' : 'text-muted-foreground/40'}
                    />
                    <div>
                      <p className="text-[11px] font-semibold text-foreground">Facial</p>
                      <p className="text-[10px] text-muted-foreground">
                        {editingProfile?.biometrics?.has_face ? 'Rostro registrado' : 'Sin foto'}
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (editingProfile) {
                      setBiometricsModalUser(editingProfile)
                      setBiometricsModalOpen(true)
                    }
                  }}
                  className="w-full p-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 flex items-center justify-between transition-colors text-xs font-semibold cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Fingerprint size={16} />
                    <span>Enrolar Huella, Face ID o Capturar Rostro</span>
                  </div>
                  <span className="text-[10px] text-emerald-300 underline">Gestionar</span>
                </button>
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

      {/* Modal: Create User */}
      <AnimatePresence>
        {isCreateOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto scroll-modern"
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-3 gap-2">
                <div className="flex items-center gap-2">
                  <UserPlus className="text-emerald-500" size={20} />
                  <h3 className="text-base font-bold text-foreground">Crear Nuevo Usuario</h3>
                </div>
                <div className="flex items-center gap-2">
                  <GlassButton
                    type="submit"
                    form="create-user-form"
                    variant="primary"
                    size="sm"
                    disabled={creating}
                  >
                    <Check size={14} className="mr-1" />
                    {creating ? 'Creando...' : 'Registrar Usuario'}
                  </GlassButton>
                  <button
                    type="button"
                    onClick={() => setIsCreateOpen(false)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <form id="create-user-form" onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Nombre Completo *
                  </label>
                  <GlassInput
                    required
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="Ej. Juan Pérez"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Correo Electrónico *
                    </label>
                    <GlassInput
                      required
                      type="email"
                      value={createEmail}
                      onChange={(e) => setCreateEmail(e.target.value)}
                      placeholder="usuario@empresa.com"
                      icon={<Mail size={16} />}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Contraseña *
                    </label>
                    <GlassInput
                      required
                      type="password"
                      value={createPassword}
                      onChange={(e) => setCreatePassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      icon={<Lock size={16} />}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Teléfono (Opcional)
                  </label>
                  <GlassInput
                    value={createPhone}
                    onChange={(e) => setCreatePhone(e.target.value)}
                    placeholder="Ej. +52 55 1234 5678"
                    icon={<Phone size={16} />}
                  />
                </div>

                {/* Role Selection */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                    Rol Asignado *
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {ROLES.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setCreateRole(r.value)}
                        className={`p-2.5 rounded-xl border text-left flex items-start justify-between transition-all ${
                          createRole === r.value
                            ? 'border-emerald-500 bg-emerald-500/15 text-foreground'
                            : 'border-border/30 hover:bg-white/5 text-muted-foreground'
                        }`}
                      >
                        <div>
                          <p className="text-xs font-bold text-foreground">{r.label}</p>
                          <p className="text-[11px] text-muted-foreground">{r.desc}</p>
                        </div>
                        {createRole === r.value && (
                          <CheckCircle2 size={16} className="text-emerald-400 mt-0.5" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Store select (if not ADMIN) */}
                {createRole !== 'ADMIN' && createRole !== 'PENDING' && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Sucursal Asignada
                    </label>
                    <select
                      value={createStoreId}
                      onChange={(e) => setCreateStoreId(e.target.value)}
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

                {/* Status Selection */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                    Estado Inicial
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCreateStatus('active')}
                      className={`p-2 rounded-xl border text-xs font-medium text-center transition-all ${
                        createStatus === 'active'
                          ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
                          : 'border-border/30 glass hover:bg-white/5 text-muted-foreground'
                      }`}
                    >
                      Activo (Acceso Inmediato)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateStatus('pending')}
                      className={`p-2 rounded-xl border text-xs font-medium text-center transition-all ${
                        createStatus === 'pending'
                          ? 'border-amber-500 bg-amber-500/15 text-amber-400'
                          : 'border-border/30 glass hover:bg-white/5 text-muted-foreground'
                      }`}
                    >
                      Pendiente de Aprobación
                    </button>
                  </div>
                </div>

                {/* Credenciales de Cajero y Biometría */}
                <div className="pt-2 border-t border-border/30 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Fingerprint size={15} className="text-emerald-400" />
                    <span>Identificación de Cajero y Acceso Biométrico (Opcional)</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-muted-foreground block mb-1">
                        No. de Cajero / Caja
                      </label>
                      <GlassInput
                        placeholder="Ej. CAJA-01 o 001"
                        value={createCashierNumber}
                        onChange={(e) => setCreateCashierNumber(e.target.value)}
                        icon={<KeyRound size={14} />}
                      />
                    </div>

                    <div>
                      <label className="text-[11px] text-muted-foreground block mb-1">
                        PIN de Seguridad (4-6 dígitos)
                      </label>
                      <GlassInput
                        type="password"
                        maxLength={6}
                        placeholder="••••"
                        value={createCashierPin}
                        onChange={(e) => setCreateCashierPin(e.target.value.replace(/\D/g, ''))}
                        className="tracking-widest font-mono"
                        icon={<Lock size={14} />}
                      />
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
                    💡 Podrás enrolar sensores Touch ID / Face ID (WebAuthn) y capturar su rostro con la cámara inmediatamente después de crearlo.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border/40">
                  <GlassButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsCreateOpen(false)}
                  >
                    Cancelar
                  </GlassButton>
                  <GlassButton
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={creating}
                  >
                    <Check size={14} className="mr-1" />
                    {creating ? 'Creando Usuario...' : 'Registrar Usuario'}
                  </GlassButton>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirm Deactivation Dialog */}
      <ConfirmDialog
        open={!!userToDelete}
        onOpenChange={(open) => !open && setUserToDelete(null)}
        title="Desactivar Usuario"
        description={`¿Estás seguro de que deseas desactivar el usuario "${userToDelete?.full_name || userToDelete?.email}"? El usuario no podrá iniciar sesión en el sistema.`}
        confirmLabel="Desactivar"
        cancelLabel="Cancelar"
        variant="destructive"
        loading={deleting}
        onConfirm={handleConfirmDelete}
      />

      {/* Biometrics Enrollment Modal */}
      <BiometricsEnrollmentModal
        open={biometricsModalOpen}
        onOpenChange={setBiometricsModalOpen}
        user={biometricsModalUser}
        onSuccess={fetchData}
      />
    </div>
  )
}
