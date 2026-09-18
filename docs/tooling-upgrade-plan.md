# Frontend tooling security upgrade

This is the implementation record for the approved private-workstation tooling
refresh. It changes development/build tooling only; application dependencies,
React 18, TypeScript, Terser minification, and the Vite build modes remain in
place.

## Selected versions and reasons

| Package | Requested range | Lockfile resolution | Reason |
|---|---:|---:|---|
| `vite` | `^7.3.6` | `7.3.6` | Maintained Vite 7 security-fix line and current Rollup fixes |
| `@vitejs/plugin-react` | `^5.1.4` | `5.2.0` | Vite 7-compatible React plugin |
| `@typescript-eslint/parser` | `^8.70.0` | `8.70.0` | Parser compatible with ESLint 10 |
| `eslint` | `^10.10.0` | `10.10.0` | Current supported lint major |
| `eslint-plugin-react-hooks` | `^7.1.1` | `7.1.1` | ESLint 10-compatible hooks checks |

`@typescript-eslint/eslint-plugin` was removed because the configuration uses
only the parser and has no TypeScript-plugin rules. React, React DOM, Terser,
TypeScript, and all other application dependencies were retained. The Node
engine is `^22.13.0 || >=24.0.0`; CI uses Node 22 and therefore remains on the
supported line. No Vite 6, ESLint 8/9 fallback, audit-force operation, or
package overrides were used.

## Compatibility changes

- Replaced `.eslintrc.cjs` with `eslint.config.js` using the TypeScript parser,
  latest ECMAScript, ES modules, JSX parsing, and only the existing explicit
  correctness and React Hooks rules.
- The lint script is `eslint . --report-unused-disable-directives --max-warnings 0`.
- `vite.config.ts` preserves `base: './'`, mode-specific output directories,
  and `minify: 'terser'`. It explicitly retains Vite 5's prior native-module
  target (`es2020`, Edge 88, Firefox 78, Chrome 87, Safari 14) instead of
  inheriting Vite 7's newer browser baseline.
- The production React compiler recommended rules were not enabled.

## Verification record

- Registry metadata and peer ranges were checked for every selected package.
- A clean temporary `npm ci --ignore-scripts` completed with no peer problems;
  the supported Node 22.20.0 / npm 10.9.3 environment repeated the install and
  peer check successfully.
- `npm audit --json` and `npm audit --omit=dev --json` both reported zero
  vulnerabilities after the lockfile refresh.
- Frontend lint passed with the new flat config.
- `scripts/check.py` under isolated Python 3.11 and supported Node 22.20.0 passed
  **313 Python tests**, all **6 Node regressions**, strict lint, and the normal
  build. The same explicit
  Python paths under Python 3.13 passed **313 tests**. Temporary normal and
  standalone builds passed; the authoritative ComfyUI build passed, with the
  relative index, JS/CSS, movie-frame, `/api/` prefix, and existing aiohttp
  bundle/API checks (**8 tests**) passing. Live providers and ComfyUI render
  nodes were intentionally not used.
