import { describe, expect, it } from "vitest";
import { isPlusStyle, rewriteContrast } from "./vitePlugin";

describe("rewriteContrast: plus CSS gets the theme's muted-text floor and status-text tokens", () => {
  it("floors muted base-content text and keeps an alpha that is already higher", () => {
    expect(rewriteContrast(".a { color: oklch(var(--bc) / 0.5); }")).toBe(".a { color: oklch(var(--bc) / max(0.5, var(--wt-muted, 0))); }");
    expect(rewriteContrast(".a{color:oklch(var(--bc)/.45)}")).toBe(".a{color:oklch(var(--bc) / max(0.45, var(--wt-muted, 0)))}");
    expect(rewriteContrast(".a { color: oklch(var(--bc) / 60%) !important; }")).toBe(
      ".a { color: oklch(var(--bc) / max(0.6, var(--wt-muted, 0))) !important; }",
    );
    expect(rewriteContrast(".a { color: var(--fallback-bc, oklch(var(--bc) / 0.6)); }")).toBe(
      ".a { color: var(--fallback-bc, oklch(var(--bc) / max(0.6, var(--wt-muted, 0)))); }",
    );
  });

  it("leaves borders, fills, backgrounds, near-opaque text and near-invisible decoration alone", () => {
    const untouched = [
      ".a { border-color: oklch(var(--bc) / 0.2); }",
      ".a { background: oklch(var(--bc) / 0.05); }",
      ".a { caret-color: oklch(var(--bc) / 0.5); }",
      ".a { fill: oklch(var(--bc) / 0.5); }",
      ".a { color: oklch(var(--bc) / 0.9); }",
      ".a { color: oklch(var(--bc) / 0.12); }",
      ".a { --line: oklch(var(--bc) / 0.4); }",
    ];
    for (const css of untouched) expect(rewriteContrast(css)).toBe(css);
  });

  it("floors text-ink custom properties", () => {
    expect(rewriteContrast(":root { --en-ink-3: oklch(var(--bc) / 0.55); --dim: oklch(var(--bc) / 0.58); }")).toBe(
      ":root { --en-ink-3: oklch(var(--bc) / max(0.55, var(--wt-muted, 0))); --dim: oklch(var(--bc) / max(0.58, var(--wt-muted, 0))); }",
    );
  });

  it("routes status colours used as text through --wt-text-*, with the old colour as the fallback", () => {
    expect(rewriteContrast(".g { color: oklch(var(--su)); }")).toBe(".g { color: var(--wt-text-su, oklch(var(--su))); }");
    expect(rewriteContrast(".w { color: oklch(var(--wa)) !important; }")).toBe(".w { color: var(--wt-text-wa, oklch(var(--wa))) !important; }");
    // a fill or a background of the same colour stays the theme's own
    expect(rewriteContrast(".g { background: oklch(var(--su)); border-color: oklch(var(--su)); }")).toBe(
      ".g { background: oklch(var(--su)); border-color: oklch(var(--su)); }",
    );
  });

  it("gives plus focus rings the focus token", () => {
    expect(rewriteContrast(".x:focus-visible { outline: 2px solid oklch(var(--p)); outline-offset: 2px; }")).toBe(
      ".x:focus-visible { outline: 2px solid var(--wt-focus, oklch(var(--p))); outline-offset: 2px; }",
    );
  });

  it("floors a dimming opacity, but not in @keyframes, not on a disabled control, not 0 or 1", () => {
    expect(rewriteContrast(".n { font-weight: 600; opacity: 0.6; }")).toBe(".n { font-weight: 600; opacity: max(0.6, var(--wt-muted, 0)); }");
    expect(rewriteContrast(".n { opacity: .42 }")).toBe(".n { opacity: max(0.42, var(--wt-muted, 0)) }");
    const untouched = [
      "@keyframes p { 50% { opacity: 0.4; } }",
      ".b:disabled { opacity: 0.5; }",
      ".b { &:disabled { opacity: 0.45; } }",
      ".b:hover:not(:disabled) { opacity: 0.85; }".replace("0.85", "0.95"),
      ".f { opacity: 0; } .g { opacity: 1; }",
      ".a { transition: opacity 0.2s; }",
    ];
    for (const css of untouched) expect(rewriteContrast(css)).toBe(css);
  });

  it("is not thrown by comments and strings", () => {
    expect(rewriteContrast('/* a { b } */ .a::after { content: "x;{"; opacity: 0.5; }')).toBe(
      '/* a { b } */ .a::after { content: "x;{"; opacity: max(0.5, var(--wt-muted, 0)); }',
    );
    expect(rewriteContrast(".a { /* why */ opacity: 0.5; }")).toBe(".a {  opacity: max(0.5, var(--wt-muted, 0)); }");
  });
});

describe("isPlusStyle: which modules get the rewrite", () => {
  const sim = "/repo/src/sim/";
  it("takes plus .css files and .vue style blocks", () => {
    expect(isPlusStyle("/repo/src/sim/today/today.css", sim)).toBe(true);
    expect(isPlusStyle("/repo/src/sim/today/TodayView.vue?vue&type=style&index=0&scoped=1a2b&lang.css", sim)).toBe(true);
  });
  it("skips Ryan's files, a .vue's script / template, and ?raw / ?url imports", () => {
    expect(isPlusStyle("/repo/src/style.css", sim)).toBe(false);
    expect(isPlusStyle("/repo/src/components/Nav.vue?vue&type=style&index=0&lang.css", sim)).toBe(false);
    expect(isPlusStyle("/repo/src/sim/today/TodayView.vue", sim)).toBe(false);
    expect(isPlusStyle("/repo/src/sim/today/today.css?raw", sim)).toBe(false);
    expect(isPlusStyle("/repo/src/sim/today/today.css?url", sim)).toBe(false);
  });
});
