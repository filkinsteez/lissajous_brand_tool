'use client'

import { useEffect, useRef } from 'react'
import { useStore } from '@/core/state/store'
import { Slider } from '@/components/controls/Slider'
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { Toggle } from '@/components/controls/Toggle'
import { PresetStrip } from '../PresetStrip'
import { ARTBOARD_PRESETS } from '@/core/state/defaults'
import { getDerived } from '@/core/pipeline'
import { shuffleLayout } from '@/core/typography/layoutShuffle'
import { importImageFile } from '@/core/images'
import { BACKGROUND_IMAGES, builtinBgId } from '@/core/assets'
import { mulberry32, type Rng } from '@/core/math/random'
import type { ArtboardPresetId, ImageItem } from '@/core/state/types'

const deg = (rad: number) => `${Math.round((rad * 180) / Math.PI)}°`
const pct = (v: number) => `${Math.round(v * 100)}`
const int = (v: number) => String(Math.round(v))

// One tool, one idea: the curve IS the grid. Curve parameters and the
// structure extracted from them live in a single SYSTEM panel; while any
// of it is being adjusted, the construction overlay reveals itself.
export function SystemPanel() {
  const project = useStore((s) => s.project)
  const liss = useStore((s) => s.project.lissajous)
  const grid = useStore((s) => s.project.grid)
  const artboardPreset = useStore((s) => s.project.artboard.preset)
  const showGuides = useStore((s) => s.ui.showGuides)
  const mode = useStore((s) => s.ui.mode)
  const setUi = useStore((s) => s.setUi)
  const apply = useStore((s) => s.apply)
  const setT = useStore((s) => s.setTransient)
  const commit = useStore((s) => s.commitTransient)

  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const touch = () => {
    clearTimeout(settleTimer.current)
    if (!useStore.getState().ui.systemAdjusting) setUi({ systemAdjusting: true })
  }
  const settle = () => {
    commit()
    clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => setUi({ systemAdjusting: false }), 800)
  }
  useEffect(() => () => clearTimeout(settleTimer.current), [])

  const curve = (patch: Parameters<typeof setT>[0]) => {
    touch()
    setT(patch)
  }

  // deal an image block onto the grid: 1-3 columns wide, 2-4 rows tall
  const dealAnchor = (rng: Rng, nCols: number, nRows: number) => {
    const colSpan = 1 + Math.floor(rng() * Math.min(3, nCols))
    const col = Math.floor(rng() * Math.max(1, nCols - colSpan + 1))
    const rowSpan = 2 + Math.floor(rng() * 3)
    const row = Math.floor(rng() * Math.max(1, nRows - rowSpan))
    return { col, row, colSpan, rowSpan }
  }

  const shuffle = () => {
    const layoutSeed = project.layoutSeed + 1
    const derivedGrid = getDerived(project).grid
    const rng = mulberry32((project.seed ^ 0x1b3d5f7) + layoutSeed * 911)
    const nCols = derivedGrid.columnBoundaries.length - 1
    const nRows = derivedGrid.rowBoundaries.length - 1
    const images = project.images.map((im) => ({ ...im, anchor: dealAnchor(rng, nCols, nRows) }))
    apply({ layoutSeed, typeBlocks: shuffleLayout(project, derivedGrid, layoutSeed), images })
  }

  const fileRef = useRef<HTMLInputElement>(null)
  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const derivedGrid = getDerived(project).grid
    const nCols = derivedGrid.columnBoundaries.length - 1
    const nRows = derivedGrid.rowBoundaries.length - 1
    const added: ImageItem[] = []
    for (const file of Array.from(files)) {
      try {
        const src = await importImageFile(file)
        const rng = mulberry32(project.seed + project.images.length + added.length * 7919)
        added.push({ id: `img-${Date.now()}-${added.length}`, src, anchor: dealAnchor(rng, nCols, nRows) })
      } catch {
        // unreadable file — skip it
      }
    }
    if (added.length) apply({ images: [...project.images, ...added] })
  }

  // built-in backgrounds live in project.images only while active as the
  // bg (id prefix bgi-); uploads stay put. applyBg keeps that invariant.
  const uploads = project.images.filter((im) => !im.id.startsWith('bgi-'))
  const applyBg = (next: string | null) => {
    if (next && next.startsWith('bgi-')) {
      const path = BACKGROUND_IMAGES.find((p) => builtinBgId(p) === next)
      if (!path) return
      apply({
        images: [...uploads, { id: next, src: path, anchor: { col: 0, row: 0, colSpan: 2, rowSpan: 3 } }],
        bgImageId: next,
      })
    } else {
      apply({ images: uploads, bgImageId: next })
    }
  }

  const shuffleBg = () => {
    const candidates: (string | null)[] = [
      null,
      ...BACKGROUND_IMAGES.map(builtinBgId),
      ...uploads.map((im) => im.id),
    ]
    const idx = candidates.indexOf(project.bgImageId)
    applyBg(candidates[(idx + 1) % candidates.length])
  }

  return (
    <div className="panel">
      <div className="panel-section">
        <SegmentedControl<ArtboardPresetId>
          label="ARTBOARD"
          value={artboardPreset}
          options={(Object.keys(ARTBOARD_PRESETS) as ArtboardPresetId[]).map((id) => ({
            value: id,
            label: ARTBOARD_PRESETS[id].label.toUpperCase(),
          }))}
          onChange={(preset) =>
            apply({
              artboard: {
                preset,
                width: ARTBOARD_PRESETS[preset].width,
                height: ARTBOARD_PRESETS[preset].height,
              },
            })
          }
        />
      </div>
      <div className="panel-section">
        <div className="panel-heading">IMAGES</div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            void addFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <div className="ctl-sub-label">BACKGROUNDS</div>
        <div className="thumb-strip">
          {BACKGROUND_IMAGES.map((path) => {
            const id = builtinBgId(path)
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={id}
                src={path}
                alt=""
                className={project.bgImageId === id ? 'img-thumb bg-active' : 'img-thumb'}
                onClick={() => applyBg(project.bgImageId === id ? null : id)}
              />
            )
          })}
        </div>
        <button className="ctl-action" onClick={() => fileRef.current?.click()}>
          ADD IMAGES
        </button>
        {uploads.length ? (
          <div className="thumb-strip">
            {uploads.map((im) => (
              <div key={im.id} className="thumb-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={im.src}
                  alt=""
                  className={project.bgImageId === im.id ? 'img-thumb bg-active' : 'img-thumb'}
                  onClick={() => applyBg(project.bgImageId === im.id ? null : im.id)}
                />
                <button
                  className="thumb-remove"
                  aria-label="Remove image"
                  onClick={() =>
                    apply({
                      images: project.images.filter((x) => x.id !== im.id),
                      bgImageId: project.bgImageId === im.id ? null : project.bgImageId,
                    })
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <button className="ctl-action" onClick={shuffleBg}>
          SHUFFLE BG IMAGE
        </button>
        <div className="panel-note">
          Click a background or an upload to make it the full bleed; uploads
          also sit on the grid and re-deal with SHUFFLE LAYOUT. Everything
          renders in mono. Uploads stay local — share links carry only the
          built-in backgrounds.
        </div>
      </div>
      <div className="panel-section">
        <div className="panel-heading">RATIO</div>
        <PresetStrip />
        <button className="ctl-action primary" onClick={shuffle}>
          SHUFFLE LAYOUT
        </button>
      </div>
      <div className="panel-section">
        <div className="panel-heading">CURVE</div>
        <Slider label="FREQ X" value={liss.frequencyX} min={1} max={12} step={1}
          onChange={(v) => curve({ lissajous: { frequencyX: v, presetId: undefined } })} onCommit={settle} />
        <Slider label="FREQ Y" value={liss.frequencyY} min={1} max={12} step={1}
          onChange={(v) => curve({ lissajous: { frequencyY: v, presetId: undefined } })} onCommit={settle} />
        <Slider label="PHASE" value={liss.phase} min={0} max={Math.PI} step={Math.PI / 180} format={deg}
          onChange={(v) => curve({ lissajous: { phase: v } })} onCommit={settle} />
        <Slider label="AMP X" value={liss.amplitudeX} min={0.2} max={1} format={pct}
          onChange={(v) => curve({ lissajous: { amplitudeX: v } })} onCommit={settle} />
        <Slider label="AMP Y" value={liss.amplitudeY} min={0.2} max={1} format={pct}
          onChange={(v) => curve({ lissajous: { amplitudeY: v } })} onCommit={settle} />
        <Slider label="ROTATION" value={liss.rotation} min={-Math.PI / 4} max={Math.PI / 4}
          step={Math.PI / 360} format={deg}
          onChange={(v) => curve({ lissajous: { rotation: v } })} onCommit={settle} />
        <Slider label="OFFSET X" value={liss.offsetX} min={-0.4} max={0.4} format={pct}
          onChange={(v) => curve({ lissajous: { offsetX: v } })} onCommit={settle} />
        <Slider label="OFFSET Y" value={liss.offsetY} min={-0.4} max={0.4} format={pct}
          onChange={(v) => curve({ lissajous: { offsetY: v } })} onCommit={settle} />
      </div>
      <div className="panel-section">
        <div className="panel-heading">STRUCTURE</div>
        <div className="panel-note">
          Columns and rows are clustered from the curve&apos;s crossings, then
          evened out to the counts below.
        </div>
        <Slider label="MARGIN" value={grid.marginRestraint} min={0} max={1} format={pct}
          onChange={(v) => curve({ grid: { marginRestraint: v } })} onCommit={settle} />
        <Slider label="COLUMNS" value={grid.columnBias} min={2} max={8} step={1} format={int}
          onChange={(v) => curve({ grid: { columnBias: v } })} onCommit={settle} />
        <Slider label="ROWS" value={grid.rowBias} min={2} max={12} step={1} format={int}
          onChange={(v) => curve({ grid: { rowBias: v } })} onCommit={settle} />
        <Slider label="GUTTER" value={grid.gutterScale} min={0} max={2} format={pct}
          onChange={(v) => curve({ grid: { gutterScale: v } })} onCommit={settle} />
        <Slider label="BASELINE" value={grid.baselineRhythm} min={0.5} max={2} format={pct}
          onChange={(v) => curve({ grid: { baselineRhythm: v } })} onCommit={settle} />
        <Slider label="SNAP" value={grid.snapStrength} min={0} max={1} format={pct}
          onChange={(v) => curve({ grid: { snapStrength: v } })} onCommit={settle} />
        <Toggle label="SHOW GUIDES" value={showGuides} onChange={(v) => setUi({ showGuides: v })} />
        <Toggle
          label="CONSTRUCTION VIEW"
          value={mode === 'setup'}
          onChange={(v) => setUi({ mode: v ? 'setup' : 'compose' })}
        />
        {grid.selectedNodeIds.length > 0 ? (
          <button className="ctl-action" onClick={() => apply({ grid: { selectedNodeIds: [] } })}>
            CLEAR NODE SELECTION ({grid.selectedNodeIds.length})
          </button>
        ) : (
          <div className="panel-note">
            CONSTRUCTION VIEW shows the curve and its crossings on the artboard;
            click crossings to pin the grid to them.
          </div>
        )}
      </div>
    </div>
  )
}
