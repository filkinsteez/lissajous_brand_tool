import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import '@/styles/lab.css'

export const metadata: Metadata = {
  title: 'LBS — Research Lab',
  description: 'Image & graphic relationship studies for the Lissajous Brand System',
}

export default function LabLayout({ children }: { children: ReactNode }) {
  return children
}
