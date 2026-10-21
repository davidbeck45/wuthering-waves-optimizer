---
status: accepted
date: 2026-10-16
tags: [scanner, data, ci]
supersedes: [41]
---

# 42. CI commits Wavescan's pictures to echo pull requests

## Context

[ADR 0041](./0041-signed-scanner-data-and-assets.md) commits Wavescan's set-icon references and echo pictures in `src/scanner/scanner-icons.json`, made by `npm run scanner:icons`. It relied on remembering to run the script after adding an echo or a set, with a test failing when someone forgot. Echoes and sets arrive with every game patch, so it's an easy step to miss, and a failing PR only says what to do: it doesn't do it.

Everything else Wavescan needs (echoes, sets, characters, weapons) is generated from the app's tables at build time, so it already needs no step.

## Decision

- The `scanner-icons` job in `.github/workflows/ci.yml` runs on pull requests from this repo when they change `src/echoes/`, `src/scanner/` or `scripts/scanner-icons.ts`. It runs `npm run scanner:icons` and, if pictures changed, commits `src/scanner/scanner-icons.json` to the PR branch as `chore: update scanner pictures`.
- A push with the workflow token doesn't start workflows, so the job then starts CI on the branch (`workflow_dispatch`), and the tests run on the new commit. The tests on the old commit are skipped instead of failing on the missing pictures.
- Pictures stay committed and reviewable in the PR, not made at deploy time: a deploy never depends on the assets site being up, and a picture never changes unseen.
- PRs from forks get a read-only token, so they're left alone. Their tests still fail until the script is run, as before.

## Consequences

- Pros: adding echoes, sets or characters needs no Wavescan-specific step. The pictures arrive in the same PR.
- Cons: a bot commit appears on echo PRs, so pull before pushing more to the branch. The job downloads pictures from the assets site, so CI on an echo PR fails if that site is down.

## Guidance

- **Do** pull after the bot commits, or your next push is rejected as out of date.
- **Do** keep the job's path list in step with where `buildScannerData` reads echoes and sets from.
- Running `npm run scanner:icons` yourself still works. The job then finds nothing to commit.

## Related

- `.github/workflows/ci.yml`, `scripts/scanner-icons.ts`, `tests/scanner/scannerAssets.test.ts`
- ADR 0041
