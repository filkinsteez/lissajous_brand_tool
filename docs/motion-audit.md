# Motion curve audit — vs. standard After Effects easing

Audit of the easing generator against the curves motion designers expect
from AE's graph editor, and the changes made to close the gaps while
keeping the Lissajous figure as the generator.

## What the generator is

Every easing is one arc of a Lissajous figure (`ratio X : ratio Y`,
`phase`), read one of two ways:

- **Speed graph** (AE's default editor view): the arc is the velocity
  curve, integrated into position. Time runs at the figure's own trace
  rate — the oscilloscope reading.
- **Value graph**: the figure is read literally as a graph — time is the
  projected x-coordinate. This is what keeps `1:1` exactly linear and
  gives lobed figures their overshoot character.

Two treatments shape the source arc:

- **Strength** — AE keyframe influence: the speed profile raised to a
  power, concentrating travel.
- **Decay** — damping envelope: swings around the target shrink, so lobed
  figures settle instead of returning to the start.

## Findings and fixes

| Finding | Standard behavior (AE/CSS) | Before | Fix |
| --- | --- | --- | --- |
| In-out arch skewed (speed peak at ~75%, midpoint 0.35) | Easy-ease is symmetric: midpoint 0.5 | Time axis used projected x, warping the lobe | Speed read now samples at constant trace rate — the 1:2 arch is exactly `sin(πp)` |
| Ease ramps had nonstandard shape | `sin(πp/2)` / `1 − cos(πp/2)` family | Same x-warp | Same fix — ramps are exact sine-in/out at strength 0 |
| Bounce returned fully to start | Bounces settle with shrinking swings | Raw 1:3 lobe swings to 0 mid-flight | Decay envelope (`1 + (e−1)e^{−kp}`) |
| Motion parked early vs. the time cursor | Eased moves span the full keyframe interval | Spring LUT settled at ~40% of its window | Dead-tail trim on the LUT |
| No ease-in | Trio in / out / in-out | Only out-flavored arcs | `reverse` time-mirror |

**Reference match (verified in tests):** at strength 0,
EASE IN-OUT ≡ `(1 − cos πp)/2`, EASE OUT ≡ `sin(πp/2)`,
EASE IN ≡ `1 − cos(πp/2)` — the classic sinusoidal easing family, which
*is* the Lissajous family read at constant rate. STRENGTH scales these
toward cubic/quintic feel; ratios with more lobes leave the standard set
toward wave/elastic territory that stock AE curves can't express.

## Preset map

| Preset | Figure | Read | Treatment |
| --- | --- | --- | --- |
| LINEAR | 1:1 @ 0° | value | — |
| EASE IN | 1:1 @ 0° | speed | reversed, strength 0.3 |
| EASE OUT | 1:1 @ 0° | speed | strength 0.3 |
| EASE IN-OUT | 1:2 @ 90° | speed | strength 0.35 |
| BOUNCE | 1:3 @ 0° | value | decay 0.55 |
| SPRING | 1:5 @ 0° | value | decay 0.5 |

Motion-system tokens (STANDARD / ENTER / EXIT / EMPHASIS) reuse the same
recipes and export together as CSS custom properties with a duration
scale.

## Display conventions

Everything renders in graph-editor orientation: the source panel plots
the arc as time × value (never the raw figure), ghosts the surrounding
oscillation behind it, and the main plot shows the shaped curve with the
raw source dashed beneath it whenever strength/decay are active.
