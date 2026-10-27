'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GlassButton } from '@/components/glass-button'
import { type Client } from '@/lib/types'
import { User, Users, Search, CheckCircle2, X, Phone, Mail, FileText, ArrowRight, MapPin, Building } from 'lucide-react'

interface PosClientModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clients: Client[]
  selectedClient: Client | null
  onSelectClient: (client: Client | null) => void
  loading?: boolean
  required?: boolean
}

export function PosClientModal({
  open,
  onOpenChange,
  clients,
  selectedClient,
  onSelectClient,
  loading = false,
  required = false,
}: PosClientModalProps) {
  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setSearch('')
      setSelectedIndex(0)
      setTimeout(() => {
        inputRef.current?.focus()
      }, 120)
    }
  }, [open])

  const isPublicoGeneral = (c?: Client | null) => {
    if (!c) return false
    const full = `${c.first_name || ''} ${c.last_name || ''}`
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
    return full === 'publico en general'
  }

  // Locate the database record for 'Público en General'
  const publicoGeneralClient = useMemo(() => {
    return clients.find((c) => isPublicoGeneral(c)) || null
  }, [clients])

  // Filter clients by search query (excluding Público en General when search is empty since it has the top quick card)
  const filteredClients = useMemo(() => {
    if (!search.trim()) {
      return clients.filter((c) => !isPublicoGeneral(c))
    }
    const q = search.toLowerCase()
    return clients.filter((c) => {
      const name = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase()
      const rfc = (c.rfc || '').toLowerCase()
      const phone = (c.phone || '').toLowerCase()
      const email = (c.email || '').toLowerCase()
      const city = (c.city || '').toLowerCase()
      const branch = (c.branch || '').toLowerCase()
      return (
        name.includes(q) ||
        rfc.includes(q) ||
        phone.includes(q) ||
        email.includes(q) ||
        city.includes(q) ||
        branch.includes(q)
      )
    })
  }, [clients, search])

  // Reset keyboard index on search change
  useEffect(() => {
    setSelectedIndex(0)
  }, [search])

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, filteredClients.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIndex === 0 && !search.trim()) {
        // Default: Público en General (database client record)
        handleSelect(publicoGeneralClient)
      } else {
        const targetIndex = search.trim() ? selectedIndex : selectedIndex - 1
        const target = filteredClients[targetIndex]
        if (target) {
          handleSelect(target)
        } else {
          handleSelect(publicoGeneralClient)
        }
      }
    } else if (e.key === 'Escape' && !required) {
      onOpenChange(false)
    }
  }

  const handleSelect = (client: Client | null) => {
    onSelectClient(client)
    onOpenChange(false)
  }

  const isPublicoCurrentlySelected =
    selectedClient === null || isPublicoGeneral(selectedClient)

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md">
          {/* Backdrop click (disabled if required) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0"
            onClick={() => {
              if (!required) onOpenChange(false)
            }}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="glass-card border-border/50 rounded-2xl sm:rounded-3xl max-w-xl w-full relative z-10 overflow-hidden shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[90vh]"
          >
            {/* Header Fijo */}
            <div className="flex items-center justify-between border-b border-border/40 px-4 py-3 sm:px-6 sm:py-4 bg-card/95 dark:bg-card/90 backdrop-blur-xl shrink-0 z-10">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-2">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/25 shrink-0">
                  <Users size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-bold text-foreground truncate">
                      Seleccionar Cliente
                    </h3>
                    {required && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 font-bold shrink-0">
                        Obligatorio
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    Elige el cliente para aplicar su lista de precios
                  </p>
                </div>
              </div>
              {!required && (
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors shrink-0"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Cuerpo desplazable */}
            <div className="flex-1 min-h-0 overflow-y-auto scroll-modern p-4 sm:p-6 space-y-3">

            {/* Default Quick Option: Público en General */}
            <div className="mb-3">
              <button
                type="button"
                onClick={() => handleSelect(publicoGeneralClient)}
                className={`w-full p-3.5 rounded-2xl border transition-all text-left flex items-center justify-between group ${
                  isPublicoCurrentlySelected && (!search || selectedIndex === 0)
                    ? 'border-emerald-500/70 bg-emerald-500/15 shadow-lg shadow-emerald-500/15'
                    : 'border-border/40 hover:border-emerald-500/40 hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                    <User size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-foreground group-hover:text-emerald-400 transition-colors">
                        {publicoGeneralClient?.first_name || 'Público en General'}
                      </span>
                      <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold">
                        Menudeo · Lista #{publicoGeneralClient?.price_number || 1}
                      </span>
                      <span className="px-1.5 py-0.2 rounded bg-indigo-500/10 dark:bg-indigo-500/15 border border-indigo-500/25 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 font-mono font-semibold text-[10px]">
                        RFC: {publicoGeneralClient?.rfc || 'XAXX010101000'}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground block mt-0.5">
                      Venta estándar de mostrador · Presiona [Enter]
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                  <span className="hidden sm:inline text-[11px] text-muted-foreground/80 font-mono">
                    Atajo: Enter
                  </span>
                  <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            </div>

            {/* Autocomplete Search Bar */}
            <div className="relative mb-2">
              <input
                ref={inputRef}
                type="text"
                placeholder="Buscar por Nombre, RFC, Teléfono, Ciudad..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                className="glass-input w-full pl-10 pr-9 py-2.5 text-xs text-foreground focus:ring-2 focus:ring-emerald-500/50"
              />
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Registered Clients Counter */}
            <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground px-1 mb-1.5">
              <span>Clientes Registrados en Base de Datos</span>
              <span className="text-emerald-400 font-mono">
                {loading ? 'Cargando...' : `${filteredClients.length} disponibles`}
              </span>
            </div>

            {/* Clients List */}
            <div
              ref={listRef}
              className="flex-1 overflow-y-auto scroll-modern space-y-1.5 pr-1 min-h-[180px] max-h-[340px]"
            >
              {loading ? (
                <div className="py-12 text-center text-muted-foreground">
                  <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-xs font-medium">Cargando catálogo completo de clientes...</p>
                </div>
              ) : filteredClients.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">
                  <p className="text-xs font-semibold">No se encontraron clientes con "{search}"</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-1">
                    Puedes continuar con Público en General arriba o revisar el texto
                  </p>
                </div>
              ) : (
                filteredClients.map((client, idx) => {
                  const isHighlighted = search.trim()
                    ? idx === selectedIndex
                    : idx + 1 === selectedIndex
                  const isSelected = selectedClient?.id_client === client.id_client
                  const fullName =
                    `${client.first_name || ''} ${client.last_name || ''}`.trim() || 'Sin nombre'

                  return (
                    <motion.button
                      key={client.id_client}
                      type="button"
                      whileHover={{ scale: 1.005 }}
                      whileTap={{ scale: 0.995 }}
                      onClick={() => handleSelect(client)}
                      className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                        isSelected || isHighlighted
                          ? 'border-emerald-500/60 bg-emerald-500/15 shadow-sm'
                          : 'border-border/30 hover:border-emerald-500/30 hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold shrink-0">
                          {fullName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-foreground truncate">
                              {fullName}
                            </span>
                            <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 text-[9px] font-bold shrink-0">
                              Lista #{client.price_number || 1}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground mt-0.5">
                            {client.rfc && (
                              <span className="flex items-center gap-1 font-mono">
                                <FileText size={10} /> {client.rfc}
                              </span>
                            )}
                            {client.phone && (
                              <span className="flex items-center gap-1">
                                <Phone size={10} /> {client.phone}
                              </span>
                            )}
                            {client.city && (
                              <span className="flex items-center gap-1">
                                <MapPin size={10} /> {client.city}
                              </span>
                            )}
                            {client.branch && (
                              <span className="flex items-center gap-1 text-teal-400/80">
                                <Building size={10} /> {client.branch}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 pl-2">
                        {isSelected ? (
                          <CheckCircle2 size={16} className="text-emerald-400" />
                        ) : (
                          <ArrowRight size={14} className="text-muted-foreground/60" />
                        )}
                      </div>
                    </motion.button>
                  )
                })
              )}
            </div>

            </div>

            {/* Footer Fijo */}
            <div className="flex items-center justify-between gap-2 border-t border-border/40 p-3 sm:p-4 bg-card/95 dark:bg-card/90 backdrop-blur-xl shrink-0 z-10 text-xs text-muted-foreground">
              <span className="hidden sm:inline">Usa las flechas [↑/↓] y [Enter] para seleccionar</span>
              {!required ? (
                <GlassButton variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="w-full sm:w-auto ml-auto">
                  Cerrar
                </GlassButton>
              ) : (
                <span className="text-[11px] text-amber-400">Selección de cliente obligatoria</span>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
