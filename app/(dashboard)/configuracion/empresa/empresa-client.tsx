'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { createClient } from '@/utils/supabase/client'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { ConfiguracionTabs } from '@/components/configuracion/configuracion-tabs'
import { processLogoImage, type ProcessedImageResult } from '@/lib/image-compressor'
import { updateCompanySettingsAction } from '../actions'
import { type CompanySettings, type UserRole } from '@/lib/types'
import { useCompany } from '@/components/providers/company-provider'
import { toast } from 'sonner'
import {
  Building2, UploadCloud, Save, CheckCircle2, ShieldCheck,
  AlertCircle, Globe, Phone, Mail, FileText, Image as ImageIcon,
  KeyRound, ChevronDown, ChevronUp, Sparkles, RefreshCw
} from 'lucide-react'

// Regímenes fiscales comunes del SAT
const SAT_TAX_REGIMES = [
  { code: '601', label: '601 - General de Ley Personas Morales' },
  { code: '603', label: '603 - Personas Morales con Fines no Lucrativos' },
  { code: '605', label: '605 - Sueldos y Salarios e Ingresos Asimilados' },
  { code: '606', label: '606 - Arrendamiento' },
  { code: '612', label: '612 - Personas Físicas con Actividades Empresariales y Profesionales' },
  { code: '621', label: '621 - Incorporación Fiscal' },
  { code: '625', label: '625 - Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas' },
  { code: '626', label: '626 - Régimen Simplificado de Confianza (RESICO)' },
]

interface EmpresaClientProps {
  initialCompany: CompanySettings
  userRole: UserRole
}

export function EmpresaClient({ initialCompany, userRole }: EmpresaClientProps) {
  const supabase = createClient()
  const isAdmin = userRole === 'ADMIN'
  const { setLogoUrl, setTradeName } = useCompany()

  const [company, setCompany] = useState<CompanySettings>(initialCompany)
  const [saving, setSaving] = useState(false)

  // Logo upload state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(initialCompany.logo_url)
  const [processedLogo, setProcessedLogo] = useState<ProcessedImageResult | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // Accordion for advanced QZ Tray certificates
  const [showQzCert, setShowQzCert] = useState(false)

  // Realtime subscription on company_settings
  useEffect(() => {
    const channel = supabase
      .channel('company-settings-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'company_settings' }, (payload) => {
        if (payload.new) {
          const updated = payload.new as CompanySettings
          setCompany(updated)
          if (!processedLogo) {
            setLogoPreview(updated.logo_url)
          }
          if (updated.logo_url !== undefined) {
            setLogoUrl(updated.logo_url)
          }
          if (updated.trade_name) {
            setTradeName(updated.trade_name)
          }
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, processedLogo])

  // Handle Logo selection and automatic compression
  const handleLogoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const result = await processLogoImage(file, 720)
      setProcessedLogo(result)
      setLogoPreview(result.previewUrl)

      if (result.wasResized) {
        toast.info('Imagen optimizada', {
          description: `Se redimensionó a ${result.width}×${result.height}px (máx. 720px) reduciendo su tamaño a ${(result.compressedSize / 1024).toFixed(0)} KB.`,
        })
      } else {
        toast.success('Imagen lista', {
          description: `Dimensiones: ${result.width}×${result.height}px (${(result.compressedSize / 1024).toFixed(0)} KB).`,
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('Error al procesar el logo: ' + msg)
    }
  }

  // Upload logo to Supabase Storage
  const uploadLogoToStorage = async (): Promise<string | null> => {
    if (!processedLogo) return company.logo_url

    setUploadingLogo(true)
    const file = processedLogo.file
    const ext = file.name.split('.').pop() || 'png'
    const fileName = `logo-${Date.now()}.${ext}`

    try {
      // 1. Try uploading to 'company' bucket
      const { error: uploadError } = await supabase.storage
        .from('company')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true,
        })

      if (uploadError) {
        // Fallback to item_images bucket if company bucket wasn't created yet in DB
        const { error: fallbackError } = await supabase.storage
          .from('item_images')
          .upload(`company/${fileName}`, file, {
            cacheControl: '3600',
            upsert: true,
          })

        if (fallbackError) {
          throw new Error(uploadError.message || fallbackError.message)
        }

        const { data: publicData } = supabase.storage
          .from('item_images')
          .getPublicUrl(`company/${fileName}`)

        return publicData.publicUrl
      }

      const { data: publicData } = supabase.storage
        .from('company')
        .getPublicUrl(fileName)

      return publicData.publicUrl
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('No se pudo subir la imagen al almacenamiento: ' + msg)
      return null
    } finally {
      setUploadingLogo(false)
    }
  }

  // Handle Save
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAdmin) {
      toast.error('Solo el Administrador puede modificar los datos de la empresa.')
      return
    }

    setSaving(true)
    try {
      let finalLogoUrl = company.logo_url

      if (processedLogo) {
        const uploadedUrl = await uploadLogoToStorage()
        if (uploadedUrl) {
          finalLogoUrl = uploadedUrl
        }
      }

      const updated = await updateCompanySettingsAction({
        ...company,
        logo_url: finalLogoUrl,
      })

      setCompany(updated)
      setProcessedLogo(null)
      setLogoUrl(updated.logo_url)
      if (updated.trade_name) {
        setTradeName(updated.trade_name)
      }
      toast.success('Datos de la empresa guardados exitosamente')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative min-h-[calc(100vh-5rem)] flex flex-col p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full">
      <div className="dashboard-bg" />

      {/* Header & Tabs */}
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-2xl bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">
                <Building2 size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Configuración del Sistema
                </h1>
                <p className="text-xs text-muted-foreground">
                  Datos fiscales globales de la empresa e infraestructura de impresión
                </p>
              </div>
            </div>
          </div>

          {/* Role Status Badge */}
          <div className="flex items-center gap-2">
            {isAdmin ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm">
                <ShieldCheck size={14} />
                <span>Modo Administrador · Edición Global</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-sm">
                <AlertCircle size={14} />
                <span>Modo Gerente · Solo Lectura</span>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <ConfiguracionTabs />
      </div>

      {/* Notice for Manager */}
      {!isAdmin && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-3">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-200">Información protegida</p>
            <p className="text-amber-300/80 mt-0.5">
              Como Gerente de sucursal, puedes consultar la información fiscal de la empresa pero solo el Administrador general puede realizar modificaciones o cambiar el logotipo.
            </p>
          </div>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSave} className="flex flex-col gap-6">
        {/* Row 1: Logo & Commercial Identity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Logo Card */}
          <GlassCard className="p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ImageIcon size={18} className="text-emerald-500" />
                  <h2 className="text-sm font-bold text-foreground">Logotipo de la Empresa</h2>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-muted-foreground font-mono">
                  Máx. 720px
                </span>
              </div>

              {/* Logo Preview Area */}
              <div className="relative aspect-video rounded-2xl border-2 border-dashed border-white/15 bg-black/20 flex flex-col items-center justify-center overflow-hidden group">
                {logoPreview ? (
                  <>
                    <Image
                      src={logoPreview}
                      alt="Logo de la empresa"
                      fill
                      unoptimized
                      className="object-contain p-4 transition-transform duration-300 group-hover:scale-105"
                    />
                    {processedLogo && (
                      <div className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-emerald-600/90 text-white text-[10px] font-bold flex items-center gap-1 shadow-lg backdrop-blur-md">
                        <Sparkles size={11} />
                        <span>Optimizado</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground p-4 text-center">
                    <UploadCloud size={32} className="stroke-[1.5]" />
                    <p className="text-xs">Sin logotipo configurado</p>
                    <p className="text-[10px] text-muted-foreground/60">
                      PNG o WebP transparente recomendado
                    </p>
                  </div>
                )}
              </div>

              {/* Compression details when selected */}
              {processedLogo && (
                <div className="mt-3 p-2.5 rounded-xl bg-white/5 border border-white/10 text-[11px] text-muted-foreground flex flex-col gap-1">
                  <div className="flex justify-between">
                    <span>Dimensiones:</span>
                    <span className="font-mono text-foreground font-medium">
                      {processedLogo.width} × {processedLogo.height} px
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tamaño:</span>
                    <span className="font-mono text-emerald-400 font-medium">
                      {(processedLogo.compressedSize / 1024).toFixed(0)} KB
                      <span className="text-[10px] text-muted-foreground ml-1 line-through">
                        ({(processedLogo.originalSize / 1024).toFixed(0)} KB)
                      </span>
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Upload Button */}
            {isAdmin && (
              <div className="mt-5 pt-4 border-t border-white/10 flex flex-col gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleLogoSelect}
                  className="hidden"
                />
                <GlassButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full text-xs flex items-center justify-center gap-2"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingLogo}
                >
                  <UploadCloud size={15} />
                  <span>{logoPreview ? 'Cambiar Logotipo' : 'Subir Logotipo'}</span>
                </GlassButton>
                <p className="text-[10px] text-center text-muted-foreground/70">
                  Si excede 720px, se comprime automáticamente en el navegador.
                </p>
              </div>
            )}
          </GlassCard>

          {/* Identity & Basic Info */}
          <GlassCard className="p-6 lg:col-span-2 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Building2 size={18} className="text-emerald-500" />
                <h2 className="text-sm font-bold text-foreground">Identidad Comercial y Fiscal</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Nombre Comercial */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                    Nombre Comercial
                  </label>
                  <GlassInput
                    value={company.trade_name || ''}
                    onChange={(e) => setCompany({ ...company, trade_name: e.target.value })}
                    disabled={!isAdmin}
                    placeholder="Ej. Campiran Alimentos"
                    required
                  />
                </div>

                {/* Razón Social */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                    Razón Social
                  </label>
                  <GlassInput
                    value={company.legal_name || ''}
                    onChange={(e) => setCompany({ ...company, legal_name: e.target.value })}
                    disabled={!isAdmin}
                    placeholder="Ej. Campiran S.A. de C.V."
                    required
                  />
                </div>

                {/* RFC */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                    RFC (Registro Federal de Contribuyentes)
                  </label>
                  <GlassInput
                    value={company.rfc || ''}
                    onChange={(e) => setCompany({ ...company, rfc: e.target.value.toUpperCase() })}
                    disabled={!isAdmin}
                    placeholder="CAM200101XYZ"
                    className="font-mono uppercase tracking-wider"
                    required
                  />
                </div>

                {/* Régimen Fiscal SAT */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                    Régimen Fiscal (SAT)
                  </label>
                  <select
                    value={company.tax_regime_code || '601'}
                    disabled={!isAdmin}
                    onChange={(e) => {
                      const selected = SAT_TAX_REGIMES.find((r) => r.code === e.target.value)
                      setCompany({
                        ...company,
                        tax_regime_code: e.target.value,
                        tax_regime: selected ? selected.label : e.target.value,
                      })
                    }}
                    className="w-full glass-input px-3.5 py-2.5 text-xs text-foreground bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {SAT_TAX_REGIMES.map((regime) => (
                      <option key={regime.code} value={regime.code} className="bg-zinc-900 text-white">
                        {regime.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Mensaje al pie de ticket */}
              <div className="mt-4">
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                  Leyenda / Mensaje al Pie del Ticket de Venta
                </label>
                <GlassInput
                  value={company.ticket_footer_message || ''}
                  onChange={(e) => setCompany({ ...company, ticket_footer_message: e.target.value })}
                  disabled={!isAdmin}
                  placeholder="¡Gracias por su compra! Vuelva pronto."
                />
                <p className="text-[10px] text-muted-foreground/60 mt-1">
                  Este mensaje se imprimirá automáticamente al final de cada ticket térmico por QZ Tray.
                </p>
              </div>
            </div>

            {/* Contact quick preview */}
            <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Globe size={14} className="text-emerald-500" />
                {company.website || 'Sin sitio web'}
              </span>
              <span className="flex items-center gap-1.5">
                <Phone size={14} className="text-emerald-500" />
                {company.phone || 'Sin teléfono'}
              </span>
              <span className="flex items-center gap-1.5">
                <Mail size={14} className="text-emerald-500" />
                {company.email || 'Sin correo'}
              </span>
            </div>
          </GlassCard>
        </div>

        {/* Row 2: Domicilio Fiscal */}
        <GlassCard className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText size={18} className="text-emerald-500" />
            <h2 className="text-sm font-bold text-foreground">Domicilio Fiscal</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Calle */}
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                Calle / Avenida
              </label>
              <GlassInput
                value={company.street || ''}
                onChange={(e) => setCompany({ ...company, street: e.target.value })}
                disabled={!isAdmin}
                placeholder="Av. Hidalgo"
              />
            </div>

            {/* Número exterior e interior */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                  No. Exterior
                </label>
                <GlassInput
                  value={company.exterior_number || ''}
                  onChange={(e) => setCompany({ ...company, exterior_number: e.target.value })}
                  disabled={!isAdmin}
                  placeholder="123"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                  No. Interior
                </label>
                <GlassInput
                  value={company.interior_number || ''}
                  onChange={(e) => setCompany({ ...company, interior_number: e.target.value })}
                  disabled={!isAdmin}
                  placeholder="Piso 2"
                />
              </div>
            </div>

            {/* Colonia */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                Colonia
              </label>
              <GlassInput
                value={company.neighborhood || ''}
                onChange={(e) => setCompany({ ...company, neighborhood: e.target.value })}
                disabled={!isAdmin}
                placeholder="Centro"
              />
            </div>

            {/* Código Postal */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                Código Postal
              </label>
              <GlassInput
                value={company.postal_code || ''}
                onChange={(e) => setCompany({ ...company, postal_code: e.target.value })}
                disabled={!isAdmin}
                placeholder="64000"
                className="font-mono"
              />
            </div>

            {/* Ciudad / Municipio */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                Ciudad / Municipio
              </label>
              <GlassInput
                value={company.city || ''}
                onChange={(e) => setCompany({ ...company, city: e.target.value })}
                disabled={!isAdmin}
                placeholder="Monterrey"
              />
            </div>

            {/* Estado */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                Estado
              </label>
              <GlassInput
                value={company.state || ''}
                onChange={(e) => setCompany({ ...company, state: e.target.value })}
                disabled={!isAdmin}
                placeholder="Nuevo León"
              />
            </div>

            {/* País */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                País
              </label>
              <GlassInput
                value={company.country || 'México'}
                onChange={(e) => setCompany({ ...company, country: e.target.value })}
                disabled={!isAdmin}
                placeholder="México"
              />
            </div>
          </div>
        </GlassCard>

        {/* Row 3: Medios de Contacto */}
        <GlassCard className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Phone size={18} className="text-emerald-500" />
            <h2 className="text-sm font-bold text-foreground">Medios de Contacto</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                Teléfono de Contacto / Atención
              </label>
              <GlassInput
                value={company.phone || ''}
                onChange={(e) => setCompany({ ...company, phone: e.target.value })}
                disabled={!isAdmin}
                placeholder="+52 81 1234 5678"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                Correo Electrónico (Facturación / Contacto)
              </label>
              <GlassInput
                type="email"
                value={company.email || ''}
                onChange={(e) => setCompany({ ...company, email: e.target.value })}
                disabled={!isAdmin}
                placeholder="facturacion@campiran.mx"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                Sitio Web Oficial
              </label>
              <GlassInput
                value={company.website || ''}
                onChange={(e) => setCompany({ ...company, website: e.target.value })}
                disabled={!isAdmin}
                placeholder="https://campiran.mx"
              />
            </div>
          </div>
        </GlassCard>

        {/* Row 4: Certificados Digitales QZ Tray (Avanzado) */}
        <GlassCard className="p-6">
          <button
            type="button"
            onClick={() => setShowQzCert(!showQzCert)}
            className="w-full flex items-center justify-between text-left group"
          >
            <div className="flex items-center gap-2">
              <KeyRound size={18} className="text-indigo-400" />
              <div>
                <h2 className="text-sm font-bold text-foreground group-hover:text-emerald-400 transition-colors">
                  Certificados Digitales para QZ Tray (Modo Silencioso / Producción)
                </h2>
                <p className="text-xs text-muted-foreground">
                  Configura certificados digitales para suprimir avisos de seguridad en terminales de punto de venta
                </p>
              </div>
            </div>
            {showQzCert ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showQzCert && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-4 pt-4 border-t border-white/10 flex flex-col gap-4"
            >
              <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300">
                <p className="font-semibold">Información sobre QZ Tray</p>
                <p className="text-indigo-200/80 mt-1">
                  En modo desarrollo o pruebas no es necesario cargar certificados (el usuario simplemente acepta el aviso en la computadora). En producción con licencia QZ Tray, puedes pegar tu certificado público (.pem / .crt) y clave privada para impresión silenciosa instantánea.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                    Certificado Digital Público (PEM / X.509)
                  </label>
                  <textarea
                    rows={4}
                    value={company.qz_cert || ''}
                    onChange={(e) => setCompany({ ...company, qz_cert: e.target.value })}
                    disabled={!isAdmin}
                    placeholder="-----BEGIN CERTIFICATE----- ... -----END CERTIFICATE-----"
                    className="w-full px-3 py-2 text-xs font-mono bg-white/5 border border-white/10 rounded-xl text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                    Clave Privada (RSA / PEM)
                  </label>
                  <textarea
                    rows={4}
                    value={company.qz_private_key || ''}
                    onChange={(e) => setCompany({ ...company, qz_private_key: e.target.value })}
                    disabled={!isAdmin}
                    placeholder="-----BEGIN RSA PRIVATE KEY----- ... -----END RSA PRIVATE KEY-----"
                    className="w-full px-3 py-2 text-xs font-mono bg-white/5 border border-white/10 rounded-xl text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </GlassCard>

        {/* Action Button for Admin */}
        {isAdmin && (
          <div className="flex items-center justify-end gap-3 pt-2">
            <GlassButton
              type="submit"
              variant="primary"
              size="lg"
              disabled={saving || uploadingLogo}
              className="px-8 shadow-lg shadow-emerald-500/20 flex items-center gap-2"
            >
              {saving || uploadingLogo ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  <span>Guardando Información...</span>
                </>
              ) : (
                <>
                  <Save size={16} />
                  <span>Guardar Datos de la Empresa</span>
                </>
              )}
            </GlassButton>
          </div>
        )}
      </form>
    </div>
  )
}
