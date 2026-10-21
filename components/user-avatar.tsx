'use client'

import { useState, useEffect } from 'react'
import { cn, getInitials } from '@/lib/utils'

export interface UserAvatarProps {
  src?: string | null
  name?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number
  rounded?: 'full' | 'xl' | '2xl' | 'lg'
  className?: string
  imageClassName?: string
  fallbackClassName?: string
  alt?: string
}

const SIZE_MAP = {
  xs: { box: 'w-6 h-6', text: 'text-[10px]' },
  sm: { box: 'w-7 h-7', text: 'text-xs' },
  md: { box: 'w-9 h-9', text: 'text-xs' },
  lg: { box: 'w-11 h-11', text: 'text-sm' },
  xl: { box: 'w-14 h-14', text: 'text-base' },
}

const ROUNDED_MAP = {
  full: 'rounded-full',
  '2xl': 'rounded-2xl',
  xl: 'rounded-xl',
  lg: 'rounded-lg',
}

export function UserAvatar({
  src,
  name,
  size = 'md',
  rounded = 'full',
  className,
  imageClassName,
  fallbackClassName,
  alt,
}: UserAvatarProps) {
  const [hasError, setHasError] = useState(false)

  // Reset error state if image source changes
  useEffect(() => {
    setHasError(false)
  }, [src])

  const sizeConfig = typeof size === 'string' ? SIZE_MAP[size] : null
  const boxClass = sizeConfig ? sizeConfig.box : ''
  const textClass = sizeConfig ? sizeConfig.text : 'text-xs'
  const roundedClass = ROUNDED_MAP[rounded] || 'rounded-full'

  const customStyle =
    typeof size === 'number'
      ? { width: `${size}px`, height: `${size}px`, fontSize: `${Math.max(10, Math.floor(size * 0.38))}px` }
      : undefined

  const initials = getInitials(name)
  const shouldShowImage = Boolean(src && !hasError)

  if (shouldShowImage && src) {
    return (
      <div
        style={customStyle}
        className={cn(
          'relative overflow-hidden flex-shrink-0 select-none shadow-sm border border-white/10 bg-black/10',
          boxClass,
          roundedClass,
          className
        )}
      >
        <img
          src={src}
          alt={alt || name || 'Avatar del usuario'}
          referrerPolicy="no-referrer"
          onError={() => setHasError(true)}
          className={cn('w-full h-full object-cover', roundedClass, imageClassName)}
        />
      </div>
    )
  }

  return (
    <div
      style={customStyle}
      className={cn(
        'flex-shrink-0 flex items-center justify-center font-bold text-white select-none shadow-sm',
        'bg-gradient-to-br from-emerald-400 via-teal-500 to-indigo-500 border border-white/15',
        boxClass,
        textClass,
        roundedClass,
        fallbackClassName,
        className
      )}
      title={name || undefined}
    >
      <span>{initials}</span>
    </div>
  )
}
