# Lissajous Brand System

A brand creation instrument where a single Lissajous curve generates the
editorial grid, typography rules, glyph fields, and material of the output.
The curve itself stays hidden during composition — it appears only as faint
construction geometry in **Lissajous Setup** mode.

Built from `lissajous_brand_system_prd_v3.md`.

## Stack

Next.js (App Router) · TypeScript · React · Zustand · WebGL2 (custom minimal
wrapper) · lz-string share URLs · vitest.

## Develop

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # core math + determinism tests
```

Everything is client-side: no server, no accounts, no uploads leaving the
browser. State is deterministic from seed + recipe; share links encode the
whole project as `#s=<lz-string>` in the URL hash.

A scripting hook is exposed at `window.__lbs` (state get/set, undo/redo,
debug counters) for automation and verification.

## Deploy (GitHub + Vercel)

The repo is local-only until you publish it:

1. Create an empty repo at https://github.com/new (e.g. `lissajous-brand-system`, no README).
2. ```bash
   git remote add origin https://github.com/<you>/lissajous-brand-system.git
   git push -u origin main
   ```
3. In the Vercel dashboard: **Add New → Project → Import** the GitHub repo.
   No configuration needed — defaults build Next.js correctly.
