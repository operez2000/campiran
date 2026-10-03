'use client'

import React from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface TablePaginationProps {
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  pageSizeOptions?: number[]
  realtimeLabel?: string
  className?: string
}

export function TablePagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  realtimeLabel = 'Tiempo real activo',
  className,
}: TablePaginationProps) {
  if (totalItems === 0) return null

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalItems)

  const canPrev = currentPage > 1
  const canNext = currentPage < totalPages

  // Compute page numbers around current page
  const getPageNumbers = () => {
    const pages: (number | string)[] = []
    const maxVisible = 5

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      if (currentPage <= 3) {
        pages.push(1, 2, 3, 4, '...', totalPages)
      } else if (currentPage >= totalPages - 2) {
        pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages)
      } else {
        pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages)
      }
    }
    return pages
  }

  return (
    <div
      className={cn(
        'px-4 py-3 border-t border-border/20 text-xs text-muted-foreground flex flex-col sm:flex-row items-center justify-between gap-3 bg-card/60 backdrop-blur-md select-none',
        className
      )}
    >
      {/* Left: Records summary & Realtime indicator */}
      <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
        <span>
          Mostrando <strong className="text-foreground">{startItem}</strong> -{' '}
          <strong className="text-foreground">{endItem}</strong> de{' '}
          <strong className="text-foreground">{totalItems}</strong> registros
        </span>

        {realtimeLabel && (
          <span className="hidden md:inline-flex items-center gap-1.5 text-emerald-400 font-medium text-[11px] ml-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {realtimeLabel}
          </span>
        )}
      </div>

      {/* Right: Page Size & Navigation Controls */}
      <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto justify-between sm:justify-end">
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="hidden sm:inline text-muted-foreground">Filas:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value))
                onPageChange(1)
              }}
              className="bg-white/5 border border-border/40 rounded-lg px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt} className="bg-zinc-900 text-white">
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-1">
          {/* First page button */}
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={!canPrev}
            className="p-1.5 rounded-lg border border-border/30 hover:bg-white/10 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
            title="Primera página"
          >
            <ChevronsLeft size={14} />
          </button>

          {/* Previous button */}
          <button
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={!canPrev}
            className="p-1.5 rounded-lg border border-border/30 hover:bg-white/10 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
            title="Página anterior"
          >
            <ChevronLeft size={14} />
          </button>

          {/* Page numbers (desktop) */}
          <div className="hidden sm:flex items-center gap-1">
            {getPageNumbers().map((p, idx) =>
              p === '...' ? (
                <span key={`ellipsis-${idx}`} className="px-1 text-muted-foreground/60">
                  ...
                </span>
              ) : (
                <button
                  key={`page-${p}`}
                  type="button"
                  onClick={() => onPageChange(Number(p))}
                  className={cn(
                    'w-7 h-7 rounded-lg text-xs font-medium transition-all',
                    currentPage === p
                      ? 'bg-emerald-500 text-white shadow-sm font-bold shadow-emerald-500/20'
                      : 'border border-border/30 hover:bg-white/10 text-muted-foreground hover:text-foreground'
                  )}
                >
                  {p}
                </button>
              )
            )}
          </div>

          {/* Mobile page indicator */}
          <span className="sm:hidden text-xs px-2 font-medium text-foreground">
            {currentPage} / {totalPages || 1}
          </span>

          {/* Next button */}
          <button
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={!canNext}
            className="p-1.5 rounded-lg border border-border/30 hover:bg-white/10 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
            title="Página siguiente"
          >
            <ChevronRight size={14} />
          </button>

          {/* Last page button */}
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            disabled={!canNext}
            className="p-1.5 rounded-lg border border-border/30 hover:bg-white/10 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
            title="Última página"
          >
            <ChevronsRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
