/**
 * Riley31415/wuwa_calc lives in vendor/wuwa_calc (git submodule) and is imported through the
 * `@skittle/*` Vite alias. It is compiled by Vite (esbuild) straight from his TypeScript, but it
 * is NOT type-checked by this project: his tsconfig differs (ES2022 lib, noUncheckedIndexedAccess)
 * and vue-tsc would report false errors against his sources. Everything under `@skittle/*` is
 * therefore `any` here; src/sim/rankings/controller.ts wraps the handful of functions it uses
 * with its own local types.
 */
declare module "@skittle/*";
