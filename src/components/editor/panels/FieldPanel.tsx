'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/core/state/store'
import { Slider } from '@/components/controls/Slider'
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { Toggle } from '@/components/controls/Toggle'
import {
  BACKGROUND_EXPRESSIONS_STORAGE_KEY,
  CURATED_BACKGROUND_EXPRESSIONS,
  type BackgroundExpression,
} from '@/core/background/expressions'
import { renderToCanvas as renderBackgroundToCanvas } from '@/render/backgroundGL'
import type { BackgroundState } from '@/core/state/types'

const pct = (v: number) => `${Math.round(v * 100)}`
const int = (v: number) => String(Math.round(v))
const contrast = (v: number) => `${Math.round(v * 100)}%`
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
      ground: 'blue',
      lockedRoles: [],
    },
  },
  {
    id: 'paper-halo',
    label: 'PAPER HALO',
    note: 'Neutral Fangor-style halo with green, violet, and warm center light.',
    values: {
      roles: ['neutral', 'green', 'violet', 'orange', 'yellow', 'cyan', 'magenta', 'blue', 'ink'],
      ground: 'blue',
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
      ground: 'blue',
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

// The FIELD panel: everything about the generated gradient — color
// direction, the shape of the field, seeds, and saved expressions.
export function FieldPanel() {
  const project = useStore((s) => s.project)
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

  const background = (patch: Partial<typeof project.background>) => {
    touch()
    setT({ background: patch })
  }

  const shuffleBackground = () => {
    background({ seed: randomSeed(project.background.seed), mode: 'field', presetId: undefined })
    settle()
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

  return (
    <div className="panel">
      <div className="panel-section">
        <div className="panel-heading">COLOR</div>
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
          label="SCALE"
          value={project.background.fieldScale}
          min={0.5}
          max={4}
          format={pct}
          onChange={(v) => background({ fieldScale: v })}
          onCommit={settle}
        />
        <Slider
          label="FORM"
          value={project.background.form}
          min={0}
          max={1}
          format={pct}
          onChange={(v) => background({ form: v })}
          onCommit={settle}
        />
        <Slider
          label="PAN X"
          value={project.background.fieldOffsetX}
          min={-1}
          max={1}
          step={0.01}
          format={pct}
          defaultValue={0}
          onChange={(v) => background({ fieldOffsetX: v })}
          onCommit={settle}
        />
        <Slider
          label="PAN Y"
          value={project.background.fieldOffsetY}
          min={-1}
          max={1}
          step={0.01}
          format={pct}
          defaultValue={0}
          onChange={(v) => background({ fieldOffsetY: v })}
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
          max={10}
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
        <Toggle
          label="TYPE CALM"
          value={project.background.typeCalm}
          onChange={(typeCalm) => {
            apply({ background: { typeCalm } })
          }}
        />
        <div className="panel-note">
          TYPE CALM thins the field&apos;s color where text sits, so copy
          stays readable — it couples the gradient to the text layout, so
          moving blocks re-shapes the field while it&apos;s on.
        </div>
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
    </div>
  )
}
