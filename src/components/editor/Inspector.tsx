'use client'

import { useStore, type DesignTab } from '@/core/state/store'
import { SystemPanel } from './panels/SystemPanel'
import { FieldPanel } from './panels/FieldPanel'
import { ShapesPanel } from './panels/ShapesPanel'
import { TypePanel } from './panels/TypePanel'
import { MotionPanel } from './panels/MotionPanel'
import { PathPanel } from './panels/PathPanel'
import { ExportPanel } from './panels/ExportPanel'

const SECTION_TITLES: Record<DesignTab, string> = {
  system: 'Curve',
  field: 'Shader',
  layers: 'Properties',
  type: 'Type',
}

// The inspector shows ONE section, chosen from the dock under the
// canvas — no tab strip of its own. MOTION keeps its EASING/PATH pair.
export function Inspector() {
  const mode = useStore((s) => s.ui.mode)
  const setUi = useStore((s) => s.setUi)
  const designTab = useStore((s) => s.ui.designTab)
  const selectionTitle = useStore((s) => {
    const blocks = s.ui.selectedBlockIds.length
    const shapes = s.ui.selectedShapeIds.length
    if (blocks) return blocks > 1 ? `${blocks} text blocks` : 'Text properties'
    if (shapes) return shapes > 1 ? `${shapes} shapes` : 'Shape properties'
    return 'Properties'
  })
  const panelOpen = useStore((s) => s.ui.panelOpen)

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
                Easing
              </button>
              <button
                role="tab"
                aria-selected={mode === 'path'}
                className={mode === 'path' ? 'mode-tab active' : 'mode-tab'}
                onClick={() => setUi({ mode: 'path', activePanel: 'path' })}
              >
                Path
              </button>
            </div>
            {mode === 'motion' ? <MotionPanel /> : <PathPanel />}
            <div className="panel-divider">Export</div>
            <ExportPanel variant="motion" />
          </>
        ) : panelOpen ? (
          <>
            <div className="inspector-title">
              {/* the title names what is selected, so the panel below
                  never repeats it */}
              <span>{designTab === 'layers' ? selectionTitle : SECTION_TITLES[designTab]}</span>
            </div>
            {designTab === 'system' ? (
              <SystemPanel />
            ) : designTab === 'field' ? (
              <FieldPanel />
            ) : designTab === 'layers' ? (
              <ShapesPanel />
            ) : (
              <TypePanel />
            )}
            <div className="panel-divider">Export</div>
            <ExportPanel />
          </>
        ) : (
          // no section selected: the panel stays put and shows export —
          // the canvas never reflows
          <>
            <div className="inspector-title">
              <span>Export</span>
            </div>
            <ExportPanel />
          </>
        )}
      </div>
    </div>
  )
}
