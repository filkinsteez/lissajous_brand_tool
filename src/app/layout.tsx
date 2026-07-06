import type { Metadata } from 'next'
import { Roboto_Flex, Fraunces, IBM_Plex_Mono } from 'next/font/google'
import '@/styles/globals.css'
import '@/styles/editor.css'

// Roboto Flex is the one broadly available variable font with all three
// PRD type axes (wght / wdth / opsz); Fraunces is the editorial serif
// register; IBM Plex Mono is the instrument voice for metadata + UI chrome.
const flex = Roboto_Flex({
  subsets: ['latin'],
  variable: '--font-flex',
  axes: ['wdth', 'opsz'],
})

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  axes: ['opsz', 'SOFT', 'WONK'],
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
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
    <html lang="en" className={`${flex.variable} ${fraunces.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
