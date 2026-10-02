import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Acceso',
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background */}
      <div className="fixed inset-0 -z-10">
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 100% 80% at 30% -20%, oklch(0.45 0.18 160 / 0.35) 0%, transparent 55%),
              radial-gradient(ellipse 80% 60% at 75% 120%, oklch(0.40 0.22 264 / 0.30) 0%, transparent 55%),
              oklch(0.08 0.012 264)
            `,
          }}
        />
        {/* Floating orbs */}
        <div
          className="absolute w-96 h-96 rounded-full blur-3xl opacity-20 animate-pulse"
          style={{
            background: 'oklch(0.52 0.18 160)',
            top: '-10%', left: '-5%',
            animationDuration: '6s',
          }}
        />
        <div
          className="absolute w-80 h-80 rounded-full blur-3xl opacity-15 animate-pulse"
          style={{
            background: 'oklch(0.52 0.22 264)',
            bottom: '-10%', right: '-5%',
            animationDuration: '8s', animationDelay: '2s',
          }}
        />
      </div>
      {children}
    </div>
  )
}
