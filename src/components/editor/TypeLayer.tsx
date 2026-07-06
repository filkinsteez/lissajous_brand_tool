'use client'

import { useStore } from '@/core/state/store'
import { getDerived } from '@/core/pipeline'
import { layoutTypeBlock } from '@/core/typography/textBlocks'
import { applyCase, FONT_STACKS, nearestStaticWeight, variationSettings } from '@/core/typography/fonts'
import { getPressureMask } from '@/core/typography/pressureMask'
import { lbsDebug } from '@/core/state/debug'
import { INK } from '@/core/state/defaults'

// L4: primary typography as DOM — crisp, selectable, never baked into GL.
export function TypeLayer() {
  const project = useStore((s) => s.project)
  const selectedBlockId = useStore((s) => s.ui.selectedBlockId)
  const setUi = useStore((s) => s.setUi)
  const derived = getDerived(project)

  // keep the pressure mask warm + inspectable as type changes
  const mask = getPressureMask(project, derived.grid)
  lbsDebug('pressureMaskSum', Math.round(mask.data.reduce((a, v) => a + v, 0)))

  return (
    <div className="artboard-layer type-layer">
      {project.typeBlocks.map((block) => {
        const box = layoutTypeBlock(block, derived.grid)
        return (
          <div
            key={block.id}
            data-block-id={block.id}
            className={selectedBlockId === block.id ? 'type-block selected' : 'type-block'}
            onClick={() => setUi({ selectedBlockId: block.id, activePanel: 'type' })}
            style={{
              left: box.x,
              top: box.y,
              width: box.w,
              fontFamily: FONT_STACKS[block.fontFamily],
              fontSize: block.size,
              fontWeight: nearestStaticWeight(block.weight),
              fontVariationSettings: variationSettings(block),
              lineHeight: block.lineHeight,
              letterSpacing: `${block.tracking}em`,
              textAlign: block.align,
              color: INK,
            }}
          >
            {applyCase(block.text, block.textCase)}
          </div>
        )
      })}
    </div>
  )
}
