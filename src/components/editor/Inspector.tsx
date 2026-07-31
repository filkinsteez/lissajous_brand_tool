'use client'

import { useState } from 'react'
import { useStore } from '@/core/state/store'
import { SystemPanel } from './panels/SystemPanel'
import { FieldPanel } from './panels/FieldPanel'
import { ShapesPanel } from './panels/ShapesPanel'
import { TypePanel } from './panels/TypePanel'
import { MotionPanel } from './panels/MotionPanel'
import { PathPanel } from './panels/PathPanel'
import { ExportPanel } from './panels/ExportPanel'

type DesignTab = 'system' | 'field' | 'shapes' | 'type'

const DESIGN_TABS: { id: DesignTab; label: string }[] = [
  { id: 'system', label: 'CURVE' },
  { id: 'field', label: 'SHADER' },
  { id: 'shapes', label: 'SHAPES' },
  { id: 'type', label: 'TYPE' },
]

// DESIGN splits its registers into focused sub-tabs so no single panel
// gets unwieldy; MOTION hosts the easing lab and the path lab.
export function Inspector() {
  const mode = useStore((s) => s.ui.mode)
  const setUi = useStore((s) => s.setUi)
  const [designTab, setDesignTab] = useState<DesignTab>('system')

  const motionSide = mode === 'motion' || mode === 'path'

  return (
    <div className="inspector">
      <div className="inspector-body">
        {motionSide ? (
          <>
            <div className="mode-switcher inspector-subnav" role="tablist" aria-label="Motion lab">
              <button
                role="tab"
                aria-selected={mode === 'motion'}
                className={mode === 'motion' ? 'mode-tab active' : 'mode-tab'}
                onClick={() => setUi({ mode: 'motion', activePanel: 'motion' })}
              >
                EASING
              </button>
              <button
                role="tab"
                aria-selected={mode === 'path'}
                className={mode === 'path' ? 'mode-tab active' : 'mode-tab'}
                onClick={() => setUi({ mode: 'path', activePanel: 'path' })}
              >
                PATH
              </button>
            </div>
            {mode === 'motion' ? <MotionPanel /> : <PathPanel />}
            <div className="panel-divider">EXPORT</div>
            <ExportPanel variant="motion" />
          </>
        ) : (
          <>
            <div className="mode-switcher inspector-subnav" role="tablist" aria-label="Design register">
              {DESIGN_TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={designTab === t.id}
                  className={designTab === t.id ? 'mode-tab active' : 'mode-tab'}
                  onClick={() => setDesignTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {designTab === 'system' ? (
              <SystemPanel />
            ) : designTab === 'field' ? (
              <FieldPanel />
            ) : designTab === 'shapes' ? (
              <ShapesPanel />
            ) : (
              <TypePanel />
            )}
            <div className="panel-divider">EXPORT</div>
            <ExportPanel />
          </>
        )}
      </div>
    </div>
  )
}
