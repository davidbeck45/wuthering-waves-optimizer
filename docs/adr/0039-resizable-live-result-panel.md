---
status: accepted
date: 2026-10-12
tags: [components, stores]
supersedes: [0018]
---

# 39. Drag-to-resize the Full breakdown panel

## Context

ADR 0018 gave the Full breakdown panel (`CalculatorLiveResultDetail.vue`) three fixed widths (compact/standard/wide → 380/420/480px) to avoid pointer-drag handling. With v3's larger type, three steps weren't enough: users want the panel exactly as wide as their screen and tables need.

## Decision

1. **A drag handle on the panel's left edge replaces the Width preset control.** It shows a grip icon and highlights the edge on hover, focus and while dragging. Double-click resets to the 420px default. It's a `role="separator"` with arrow-key resizing (10px, 50px with Shift) and Home/End for min/max.
2. **Width is stored in px** as `settings.config.liveResultDetailPanelWidth` (a number), clamped to 320–900px and to at most 70% of the window so the main column stays usable. CSS `max-width: 70vw` keeps that true when the window later shrinks.
3. **Old preset strings are read, not migrated.** `"compact"`/`"standard"`/`"wide"` map to 380/420/480px on read, so nobody's panel jumps. The first resize overwrites it with a number. Settings aren't versioned (see `src-stores.md`), and this needs no migration.
4. **Saved on release, not per frame.** Dragging updates a local ref; the store (and so localStorage) is written once on `pointerup`.
5. **Mobile is unchanged.** Below 768px the panel is a full-width bottom sheet and the handle is hidden.

## Consequences

- Pros: any width the user wants, remembered across reloads; keyboard accessible.
- Cons: a little pointer-handling code that 0018 avoided; the three one-click presets are gone (double-click reset covers the common "back to normal" case).

## Guidance

- **Do** read the width through the component's `savedWidth` logic; never assume it's a string preset.
- **Don't** write the setting on every `pointermove`.

## Related

- `src/components/CalculatorLiveResultDetail.vue`
- `cypress/e2e/calculator/liveResultDetailTabs.cy.ts`
- [ADR 0018](./0018-live-result-panel-tabs-redesign.md) decision 4
