'use client'

import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react'
import { useStore } from '@/core/state/store'
import { Slider } from '@/components/controls/Slider'
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { ColorField } from '@/components/controls/ColorField'
import { Toggle } from '@/components/controls/Toggle'
import { WEIGHT_RANGE, WIDTH_RANGE } from '@/core/typography/fonts'
import { INK, PAPER } from '@/core/state/defaults'
import type { TypeAlign, TypeBlockState } from '@/core/state/types'

const int = (v: number) => String(Math.round(v))
const em = (v: number) => v.toFixed(2)

// `embedded` renders the style controls only — used by the PROPERTIES
// inspector, where the layers rail is already the block picker.
export function TypePanel({ embedded = false }: { embedded?: boolean } = {}) {
  const project = useStore((s) => s.project)
  const selectedBlockId = useStore((s) => s.ui.selectedBlockId)
  const setUi = useStore((s) => s.setUi)
  const setT = useStore((s) => s.setTransient)
  const commit = useStore((s) => s.commitTransient)

  const blocks = project.typeBlocks
  const block = blocks.find((b) => b.id === selectedBlockId) ?? blocks[0]

  // legibility belongs with type, not with the shader: it thins the
  // field where copy sits, so it is a property of the words. It lives
  // outside the per-block controls so it is reachable with nothing
  // selected.
  const calmSection = (
    <div className="panel-section">
      <Toggle
        label="Calm field behind text"
        value={project.background.typeCalm}
        onChange={(typeCalm) => useStore.getState().apply({ background: { typeCalm } })}
      />
      <div className="panel-note">
        Thins the field&apos;s color where text sits so copy stays
        readable. It couples the gradient to the layout, so moving blocks
        re-shapes the field while it is on.
      </div>
    </div>
  )

  if (!block)
    return (
      <div className="panel">
        <div className="panel-empty">
          No text yet — the T tool in the dock places a block on the canvas.
        </div>
        {embedded ? null : calmSection}
      </div>
    )

  const patchBlock = (patch: Partial<TypeBlockState>) => {
    setT({ typeBlocks: blocks.map((b) => (b.id === block.id ? { ...b, ...patch } : b)) })
  }

  return (
    <div className="panel">
      {embedded ? null : (
        <div className="panel-section">
          <SegmentedControl
            value={block.id}
            options={blocks.map((b) => ({ value: b.id, label: b.text.trim().slice(0, 14) || 'Text' }))}
            onChange={(id) => setUi({ selectedBlockId: id, selectedBlockIds: [id] })}
          />
          <div className="panel-note">
            Text is edited on the canvas: double-click a block to type, or
            place a new one with the T tool. This panel styles the
            selected block.
          </div>
        </div>
      )}
      <div className="panel-section">
        {/* Optimistic is the only family, so there is no picker; its
            axes are wght 300..800 and wdth 80..100 — there is no
            optical size axis, so that control is gone too */}
        <Slider label="Size" value={block.size} min={10} max={400} step={1} format={int}
          onChange={(size) => patchBlock({ size })} onCommit={commit} />
        <Slider label="Weight" value={block.weight} min={WEIGHT_RANGE.min} max={WEIGHT_RANGE.max} step={10} format={int}
          onChange={(weight) => patchBlock({ weight })} onCommit={commit} />
        <Slider label="Width" value={block.width} min={WIDTH_RANGE.min} max={WIDTH_RANGE.max} step={1} format={int}
          onChange={(width) => patchBlock({ width })} onCommit={commit} />
        <Slider label="Leading" value={block.lineHeight} min={0.8} max={2} step={0.02} format={em}
          onChange={(lineHeight) => patchBlock({ lineHeight })} onCommit={commit} />
        <Slider label="Tracking" value={block.tracking} min={-0.08} max={0.4} step={0.005} format={em}
          onChange={(tracking) => patchBlock({ tracking })} onCommit={commit} />
      </div>
      <div className="panel-section">
        <SegmentedControl<TypeAlign>
          label="Align"
          value={block.align}
          options={[
            { value: 'left', label: 'Left', icon: AlignLeft },
            { value: 'center', label: 'Center', icon: AlignCenter },
            { value: 'right', label: 'Right', icon: AlignRight },
          ]}
          onChange={(align) => { patchBlock({ align }); commit() }}
        />
      </div>
      <div className="panel-section">
        <div className="panel-heading">Style</div>
        <ColorField label="Color" value={block.color ?? INK}
          onChange={(color) => patchBlock({ color })} onCommit={commit} />
        <Slider label="Stroke" value={block.strokeWidth ?? 0} min={0} max={4} step={0.5}
          format={(v) => `${v.toFixed(1)}px`}
          onChange={(strokeWidth) => patchBlock({ strokeWidth })} onCommit={commit} />
        {(block.strokeWidth ?? 0) > 0 ? (
          <ColorField label="Stroke clr" value={block.strokeColor ?? INK}
            onChange={(strokeColor) => patchBlock({ strokeColor })} onCommit={commit} />
        ) : null}
        <Toggle label="Background" value={block.background != null}
          onChange={(on) => { patchBlock({ background: on ? PAPER : undefined }); commit() }} />
        {block.background != null ? (
          <ColorField label="Bg color" value={block.background}
            onChange={(background) => patchBlock({ background })} onCommit={commit} />
        ) : null}
      </div>
      {calmSection}
    </div>
  )
}
