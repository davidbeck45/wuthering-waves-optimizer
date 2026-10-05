---
name: import-echoes
description: Bulk-sync src/echoes/index.ts against the Encore API — run the CLI import and work through its per-echo review notices (new echoes, unknown sets). Use whenever the user asks to import, sync, or update echoes from the API, or add a new echo set.
---

# Importing echoes

```bash
npm run cli -- import echoes                      # prompts: use the Beta API?
npm run cli -- import echoes --no-beta            # live API, no prompt
npm run cli -- import echoes --beta               # beta API (?v=Beta), no prompt
npm run cli -- import echoes --group phantom      # only "Phantom: …" echoes
npm run cli -- import echoes --group phantom nightmare   # several groups (comma-separated works too)
# or: make import-echoes
```

- **Beta:** answering yes (or `--beta`) appends `?v=Beta` to the API call, which can return unreleased echoes. Default is no. Anything unreleased that the import adds must not ship, per `CLAUDE.md`.
- **Groups:** a group is the part of an API name before the first `:` (`Phantom: Crownless` → `phantom`). Matching ignores case and a trailing `:`. With `--group`, only echoes in those groups get added or updated. Every other entry is written back unchanged, with no "not found" notices. An unknown group fails with the list of available groups.

This rewrites `src/echoes/index.ts` (`mainEchoesData`) from the Encore API (internal tooling only — don't surface that source in user-facing UI/copy, per `CLAUDE.md`). It's a merge, not an overwrite:

- Existing entries keep their hand-written `details`, `modifiers`, and `actions` (matched by key, then by name).
- Echoes the API returns but the file doesn't have are added with empty `details`/`modifiers`/`actions` — the CLI does **not** invent buff logic.
- Echoes the file has but the API no longer returns are preserved as-is (dropped-content protection, not silently deleted).
- "Stay Tuned" placeholders and character-named entries (`ECHO_NAME_BLACKLIST`) are always skipped, and dropped from the file if present.
- `Phantom: …` skins are only added through `--group phantom`. A full import does not add new Phantoms, but it keeps the ones already in the file in sync.
- **Images:** new entries hot-link the API's `Icon` URL; nothing is downloaded. Existing entries keep their current `image`, since those are often hand-fixed.

## Work the printed notices

After the summary line (`Added N, Updated N, Kept N missing from API`), each notice needs action:

- `New <Class> echo "<Name>" (<key>) — fill in details, modifiers, and actions` — write the echo's buff text (`details`) and, if it has a combat effect, its `modifiers`/`actions`. Check `docs/src-echoes.md` for the `Echo`/`EchoModifier`/`EchoAction` shapes, and set `alwaysEnabled: true` only if the effect text is an unconditional main-slot bonus with no combat trigger (see `resolveMainEchoBuffStats` in `src/echoes/mainEcho.ts`).
- `Unknown echo set "<Name>" — add it to echoSetLabelMap in stats.ts` — a new set the API returned that isn't mapped yet. Add it to `echoSetLabelMap` in `src/echoes/stats.ts` (and the 2/3/5-set bonus lists there) before its echoes' `sets` arrays will resolve correctly; re-run the import afterward so the new echoes pick up the mapped key.
- `New <Class> echo "Phantom: <Name>" (<key>) — Phantom skin of <BaseKey>; copy its details, modifiers, and actions` — a Phantom is a cosmetic skin that shares its base echo's effect. Copy the base entry's `details`/`modifiers`/`actions`.
- `New echo "<Name>" (<key>) has no Icon in the API response — set its image manually`.
- `Echo "<Name>" (<key>) was not found in API response and was kept` — informational; confirm the echo wasn't legitimately removed/renamed upstream before leaving it as-is.

Common-rarity echoes are not flagged even when new, since they don't carry set bonuses or unique effects worth reviewing.

## After importing

- `npm run build` and `npm run test`.
- Verify any new set's bonus math against `docs/accuracy-verification.md` if you added set-bonus logic in `sets.ts`.
- Follow `docs/conventions.md` for branch naming and commit style.
