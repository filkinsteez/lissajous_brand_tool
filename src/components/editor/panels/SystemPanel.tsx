'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
import type { ColorRole } from '@/core/color/palette'
import {
  BACKGROUND_EXPRESSIONS_STORAGE_KEY,
  CURATED_BACKGROUND_EXPRESSIONS,
  type BackgroundExpression,
} from '@/core/background/expressions'
import { renderToCanvas as renderBackgroundToCanvas } from '@/render/backgroundGL'
import type { ArtboardPresetId, BackgroundState, ImageItem } from '@/core/state/types'

const deg = (rad: number) => `${Math.round((rad * 180) / Math.PI)}°`
const pct = (v: number) => `${Math.round(v * 100)}`
const int = (v: number) => String(Math.round(v))
const contrast = (v: number) => `${Math.round(v * 100)}%`
const groundRole = (role: ColorRole): 'ink' | 'blue' | 'neutral' =>
  role === 'blue' || role === 'neutral' ? role : 'ink'
const variationSize = { w: 188, h: 132 }

type BgVariation = { seed: number; dataUrl: string }

function randomSeed(base: number): number {
  const mixed = ((base * 1664525 + 1013904223) ^ Date.now()) >>> 0
  return mixed % 1_000_000
}

function asNamedExpression(
  id: string,
  name: string,
  background: BackgroundState,
): BackgroundExpression {
  return { id, name, background: { ...background, mode: 'field', presetId: id } }
}

type ColorDirection = {
  id: string
  label: string
  note: string
  values: Pick<BackgroundState, 'roles' | 'ground' | 'lockedRoles'>
}

const COLOR_DIRECTIONS: ColorDirection[] = [
  {
    id: 'mb-transform',
    label: 'MB TRANSFORM',
    note: 'Dark optical field with cyan, magenta, green, and warm spectral bands.',
    values: {
      roles: ['blue', 'cyan', 'magenta', 'orange', 'yellow', 'green', 'violet', 'neutral', 'ink'],
      ground: 'ink',
      lockedRoles: [],
    },
  },
  {
    id: 'paper-halo',
    label: 'PAPER HALO',
    note: 'Neutral Fangor-style halo with green, violet, and warm center light.',
    values: {
      roles: ['neutral', 'green', 'violet', 'orange', 'yellow', 'cyan', 'magenta', 'blue', 'ink'],
      ground: 'neutral',
      lockedRoles: [],
    },
  },
  {
    id: 'warm-smear',
    label: 'WARM SMEAR',
    note: 'Saturated orange/magenta/yellow smear over a deep blue optical base.',
    values: {
      roles: ['magenta', 'orange', 'yellow', 'green', 'cyan', 'blue', 'violet', 'neutral', 'ink'],
      ground: 'blue',
      lockedRoles: [],
    },
  },
  {
    id: 'deep-halo',
    label: 'DEEP HALO',
    note: 'High-contrast dark halo with blue, cyan, violet, and warm edge bloom.',
    values: {
      roles: ['blue', 'cyan', 'violet', 'magenta', 'orange', 'yellow', 'green', 'neutral', 'ink'],
      ground: 'ink',
      lockedRoles: [],
    },
  },
]

function matchesDirection(background: BackgroundState, direction: ColorDirection): boolean {
  return (
    background.ground === direction.values.ground &&
    direction.values.roles.every((role, i) => background.roles[i] === role)
  )
}

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
  const variationCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [variations, setVariations] = useState<BgVariation[]>([])
  const [variationBusy, setVariationBusy] = useState(false)
  const [expressionName, setExpressionName] = useState('')
  const [savedExpressions, setSavedExpressions] = useState<BackgroundExpression[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = localStorage.getItem(BACKGROUND_EXPRESSIONS_STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as BackgroundExpression[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })
  const expressionLibrary = useMemo(
    () => [...CURATED_BACKGROUND_EXPRESSIONS, ...savedExpressions],
    [savedExpressions],
  )
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
  const background = (patch: Partial<typeof project.background>) => {
    touch()
    setT({ background: patch })
  }

  const shuffleBackground = () => {
    background({ seed: randomSeed(project.background.seed), mode: 'field', presetId: undefined })
    settle()
  }

  const makeFieldVisible = () => {
    apply({
      background: {
        mode: 'field',
        ...COLOR_DIRECTIONS[0].values,
        seed: randomSeed(project.background.seed),
        layers: 6,
        width: 0.46,
        softness: 0.96,
        arcSpread: 1.52,
        warp: 0.64,
        drift: 0.18,
        grain: 0.1,
        contrast: 1.56,
        presetId: undefined,
      },
      images: [],
      bgImageId: null,
    })
  }

  const persistExpressions = (next: BackgroundExpression[]) => {
    setSavedExpressions(next)
    try {
      localStorage.setItem(BACKGROUND_EXPRESSIONS_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // localStorage unavailable — keep in-memory list for this session
    }
  }

  const saveExpression = () => {
    const name = expressionName.trim()
    if (!name) return
    const id = `expr-${Date.now().toString(36)}`
    const next = [asNamedExpression(id, name, project.background), ...savedExpressions].slice(0, 18)
    persistExpressions(next)
    setExpressionName('')
  }

  const deleteExpression = (id: string) => {
    persistExpressions(savedExpressions.filter((exp) => exp.id !== id))
  }

  const applyExpression = (expression: BackgroundExpression) => {
    apply({
      background: {
        ...expression.background,
        mode: 'field',
        presetId: expression.id,
      },
    })
  }

  const generateVariations = async () => {
    if (variationBusy) return
    setVariationBusy(true)
    try {
      const canvas = variationCanvasRef.current ?? document.createElement('canvas')
      variationCanvasRef.current = canvas
      const picks: BgVariation[] = []
      for (let i = 0; i < 10; i++) {
        const seed = randomSeed(project.background.seed + i * 997)
        const bg = { ...project.background, mode: 'field' as const, seed, presetId: undefined }
        const rendered = renderBackgroundToCanvas(
          canvas,
          { ...project, background: bg },
          variationSize.w,
          variationSize.h,
          { frozen: true, timeMs: 0 },
        )
        if (rendered) picks.push({ seed, dataUrl: canvas.toDataURL('image/png') })
      }
      setVariations(picks)
    } finally {
      setVariationBusy(false)
    }
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
        <div className="panel-heading">BACKGROUND</div>
        <SegmentedControl<'flat' | 'field'>
          value={project.background.mode}
          options={[
            { value: 'flat', label: 'FLAT' },
            { value: 'field', label: 'FIELD' },
          ]}
          onChange={(value) => {
            background({ mode: value })
            settle()
          }}
        />
        <button className="ctl-action primary" onClick={makeFieldVisible}>
          SHOW GENERATED FIELD
        </button>
        <div className="panel-note">
          FIELD is drawn from the curve: distance makes the blur, arc position
          picks the color, and knots/nodes bloom into the big lobes.
        </div>
        <div className="ctl-sub-label">COLOR DIRECTION</div>
        <div className="preset-strip">
          {COLOR_DIRECTIONS.map((direction) => (
            <button
              key={direction.id}
              className={matchesDirection(project.background, direction) ? 'preset-chip active' : 'preset-chip'}
              title={direction.note}
              onClick={() => {
                background({
                  mode: 'field',
                  ...direction.values,
                  presetId: undefined,
                })
                settle()
              }}
            >
              {direction.label}
            </button>
          ))}
        </div>
        <div className="panel-note">
          Pick a broad color behavior. Curve sliders redraw the gradient shape;
          Shuffle and Explore only vary the field inside that curve.
        </div>
        <SegmentedControl<'ink' | 'blue' | 'neutral'>
          label="GROUND"
          value={groundRole(project.background.ground)}
          options={[
            { value: 'ink', label: 'INK' },
            { value: 'blue', label: 'BLUE' },
            { value: 'neutral', label: 'NEUTRAL' },
          ]}
          onChange={(ground) => {
            background({ ground })
            settle()
          }}
        />
        <Slider
          label="WIDTH"
          value={project.background.width}
          min={0.04}
          max={0.5}
          format={pct}
          onChange={(v) => background({ width: v })}
          onCommit={settle}
        />
        <Slider
          label="GLOW"
          value={project.background.softness}
          min={0}
          max={1}
          format={pct}
          onChange={(v) => background({ softness: v })}
          onCommit={settle}
        />
        <Slider
          label="DENSITY"
          value={project.background.layers}
          min={1}
          max={6}
          step={1}
          format={int}
          onChange={(v) => background({ layers: v })}
          onCommit={settle}
        />
        <Slider
          label="SPREAD"
          value={project.background.arcSpread}
          min={0.3}
          max={2.5}
          format={pct}
          onChange={(v) => background({ arcSpread: v })}
          onCommit={settle}
        />
        <Slider
          label="WARP"
          value={project.background.warp}
          min={0}
          max={1}
          format={pct}
          onChange={(v) => background({ warp: v })}
          onCommit={settle}
        />
        <Slider
          label="DRIFT"
          value={project.background.drift}
          min={0}
          max={1}
          format={pct}
          onChange={(v) => background({ drift: v })}
          onCommit={settle}
        />
        <Slider
          label="GRAIN"
          value={project.background.grain}
          min={0}
          max={0.4}
          format={pct}
          onChange={(v) => background({ grain: v })}
          onCommit={settle}
        />
        <Slider
          label="CONTRAST"
          value={project.background.contrast}
          min={0.5}
          max={1.6}
          format={contrast}
          onChange={(v) => background({ contrast: v })}
          onCommit={settle}
        />
        <button className="ctl-action" onClick={shuffleBackground}>
          SHUFFLE BACKGROUND
        </button>
        <button className="ctl-action" onClick={() => void generateVariations()} disabled={variationBusy}>
          {variationBusy ? 'BUILDING VARIATIONS...' : 'EXPLORE VARIATIONS'}
        </button>
        {variations.length ? (
          <div className="thumb-strip">
            {variations.map((v) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={v.seed}
                src={v.dataUrl}
                alt=""
                className={project.background.seed === v.seed ? 'img-thumb bg-active' : 'img-thumb'}
                onClick={() => {
                  background({ mode: 'field', seed: v.seed, presetId: undefined })
                  settle()
                }}
              />
            ))}
          </div>
        ) : null}
        <div className="ctl-sub-label">BACKGROUND EXPRESSIONS</div>
        <div className="ctl-col">
          <input
            className="text-field"
            value={expressionName}
            placeholder="Name current background expression"
            onChange={(e) => setExpressionName(e.target.value)}
          />
          <button className="ctl-action" onClick={saveExpression} disabled={!expressionName.trim()}>
            SAVE EXPRESSION
          </button>
        </div>
        <div className="preset-strip">
          {expressionLibrary.map((expression) => {
            const isActive = project.background.presetId === expression.id
            return (
              <div key={expression.id} className="thumb-wrap">
                <button
                  className={isActive ? 'preset-chip active' : 'preset-chip'}
                  onClick={() => applyExpression(expression)}
                >
                  {expression.name.toUpperCase()}
                </button>
                {expression.id.startsWith('expr-') ? (
                  <button
                    className="thumb-remove"
                    aria-label={`Delete expression ${expression.name}`}
                    onClick={() => deleteExpression(expression.id)}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
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
        <button
          className="ctl-action"
          onClick={() => apply({ images: [], bgImageId: null })}
          disabled={project.images.length === 0}
        >
          CLEAR ALL IMAGE BLOCKS
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
        <button
          className="ctl-action"
          onClick={() => applyBg(null)}
          disabled={project.bgImageId === null}
        >
          CLEAR BG IMAGE
        </button>
        <button className="ctl-action" onClick={shuffleBg}>
          SHUFFLE BG IMAGE
        </button>
        <div className="panel-note">
          Click a background or an upload to make it the full bleed; uploads
          also sit on the grid and re-deal with SHUFFLE LAYOUT. Uploads stay
          local — share links carry only the built-in backgrounds.
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
