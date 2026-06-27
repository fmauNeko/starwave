# apps/web AGENTS

## Package Identity

| Aspect  | Details                                                  |
| ------- | -------------------------------------------------------- |
| Type    | Vue 3 SPA (Vite)                                         |
| State   | Pinia 3                                                  |
| Routing | vue-router 5 (`createWebHistory`)                        |
| Testing | Vitest 4 + @vue/test-utils (unit) · Playwright (e2e)     |
| Linting | oxlint + ESLint 10 (Vue/TS/Vitest/Playwright) + Prettier |

**Status: starter scaffold.** `App.vue` is a placeholder (renders "You did it!" + a docs link), `router/index.ts` has an empty `routes` array, and `stores/counter.ts` is the default Pinia example (`count` / `doubleCount` / `increment`). No real features yet. Ships a **placeholder `Dockerfile`** (busybox stub — a real Vite build image is TBD); not Helm-deployed (the chart deploys only `bot`).

## Setup & Run

```bash
cd apps/web
pnpm run start:dev    # Vite dev server (http://localhost:5173)
pnpm run build        # type-check (vue-tsc) + vite build → dist/
pnpm run preview      # serve built output (port 4173)
pnpm run test         # Vitest unit run
pnpm run test:e2e     # Playwright (first run: npx playwright install)
pnpm run lint         # oxlint --fix, then eslint --fix --cache
```

## Structure

```
src/
├── main.ts          # bootstrap: createApp → use(pinia) → use(router) → mount('#app')
├── App.vue          # root SFC (placeholder template, no real routes rendered)
├── router/index.ts  # router factory: createWebHistory(import.meta.env.BASE_URL), routes: []
├── stores/          # Pinia stores (counter.ts = scaffold example)
└── __tests__/       # Vitest unit specs (App.spec.ts)
e2e/                 # Playwright specs (vue.spec.ts) — NOT colocated with src
public/              # static assets served as-is
index.html           # Vite entry, mounts #app
```

## Conventions

- SFCs use `<script setup lang="ts">`.
- `@` aliases to `src/` (Vite + tsconfig `@/*`); import as `@/stores/counter`.
- Unit specs live in `src/__tests__/`; e2e specs live in `e2e/` (unlike the bot, which colocates `*.spec.ts`).
- Prettier here: single quotes, **no semicolons**, 100-char width; `.editorconfig` enforces 2-space indent + LF.
- No CSS framework — scoped `<style>` blocks only (none in use yet).
- `build` runs `type-check` (vue-tsc) and `build-only` in parallel via `npm-run-all2`; **type errors fail the build**.
- oxlint runs before eslint; both must pass.

## How To...

### Add a Route

1. Create the view SFC (e.g. `src/views/Home.vue`).
2. Add `{ path, name, component }` to the `routes` array in `src/router/index.ts`.
3. Lazy-load heavy views: `component: () => import('@/views/Home.vue')`.

### Add a Pinia Store

Follow the setup-store pattern in `stores/counter.ts`: `defineStore('name', () => { ... return { ... } })`.

## Config Files

| File                   | Purpose                                             |
| ---------------------- | --------------------------------------------------- |
| `vite.config.ts`       | Vite + `@vitejs/plugin-vue` + `@` alias             |
| `vitest.config.ts`     | unit runner (jsdom environment)                     |
| `playwright.config.ts` | e2e: Chromium/Firefox/WebKit; dev=5173, CI=4173     |
| `tsconfig.*.json`      | project references: app / node / vitest split       |
| `.oxlintrc.json`       | oxlint rules (runs before eslint)                   |
| `eslint.config.ts`     | Vue + TS + Vitest + Playwright flat config          |
| `Dockerfile`           | **placeholder** stub (busybox); real Vite image TBD |

## Pre-PR Checklist

```bash
cd apps/web
pnpm run lint
pnpm run type-check
pnpm run test
pnpm run build
```
