import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { DialRoot } from 'dialkit'
import 'dialkit/styles.css'
import '@/styles/globals.css'
import '@/styles/editor.css'

// Optimistic is the whole type system: one variable family carrying
// weight (300..800), width (80..100), italic and DRKM.
const optimistic = localFont({
  src: '../fonts/OptimisticVF.ttf',
  variable: '--font-optimistic',
  display: 'swap',
  weight: '300 800',
})

export const metadata: Metadata = {
  title: 'Lissajous Brand System',
  description:
    'A brand creation instrument where a Lissajous curve generates the grid, typography, glyph fields, and material.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={optimistic.variable}>
      <body>
        {children}
        <DialRoot />
      </body>
    </html>
  )
}
