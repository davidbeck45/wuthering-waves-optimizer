<template>
  <!-- Wuthering Tools+: the first-visit card on the calculator (welcome.ts decides when; PlusShell mounts it) -->
  <aside ref="card" class="wt-welcome wt-plus-bar" role="region" aria-labelledby="wt-welcome-title" data-test-welcome>
    <div class="wt-welcome__body">
      <h2 id="wt-welcome-title" class="wt-welcome__title">New here? Bring your account in</h2>
      <p class="wt-welcome__text">These numbers are a default character's. Load your own characters and echoes to see your real ones on every page.</p>
      <div class="wt-welcome__actions">
        <RouterLink to="/account" class="btn btn-primary btn-sm" data-test-welcome-start @click="dismiss">Get started</RouterLink>
        <RouterLink to="/settings?section=backup-restore" class="btn btn-ghost btn-sm px-2" data-test-welcome-restore @click="dismiss">Restore a backup</RouterLink>
      </div>
    </div>
    <button type="button" class="wt-welcome__close btn btn-ghost btn-sm btn-square" aria-label="Not now" title="Not now" data-test-welcome-close @click="dismiss">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  </aside>
</template>

<script setup lang="ts">
// Wuthering Tools+ — "New here?": a dismissible card over the calculator for a browser with nothing of its own yet.
// "Get started" opens My account, whose empty state lists the three ways in (an export, screenshots, a build by hand);
// "Restore a backup" opens Settings › Backup & Restore. Either, or the ×, hides it for good on this device.
import { ref } from "vue";
import { usePlusBar } from "./plusBar";

const emit = defineEmits<{ dismiss: [] }>();
const card = ref<HTMLElement | null>(null);
// a fixed card at the bottom: the Ask button sits above it (plusBar.ts)
usePlusBar(card);

function dismiss(): void {
  emit("dismiss");
}
</script>

<style scoped>
.wt-welcome {
  position: fixed;
  z-index: 45;
  left: max(1.25rem, calc(var(--nav-rail-w, 0px) + 1.25rem));
  bottom: calc(1.25rem + var(--nav-bottom-h));
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  width: min(26rem, calc(100vw - 2.5rem));
  padding: 0.75rem 0.9rem;
  border-radius: 1rem;
  background: oklch(var(--b2));
  color: oklch(var(--bc));
  box-shadow:
    0 16px 40px -12px rgb(0 0 0 / 0.45),
    inset 0 0 0 1px oklch(var(--p) / 0.35);
  animation: wt-welcome-in 0.2s ease-out;
}
.wt-welcome__body {
  min-width: 0;
  flex: 1;
}
.wt-welcome__title {
  padding-right: 2rem;
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1.3;
}
.wt-welcome__text {
  margin-top: 0.25rem;
  font-size: 0.8rem;
  line-height: 1.45;
  color: oklch(var(--bc) / 0.7);
}
.wt-welcome__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.6rem;
}
.wt-welcome__close {
  position: absolute;
  top: 0.4rem;
  right: 0.4rem;
}
.wt-welcome__close svg {
  width: 1rem;
  height: 1rem;
}
/* a transform-only entrance: headless Electron never advances frames, and nothing may start hidden */
@keyframes wt-welcome-in {
  from {
    transform: translateY(6px);
  }
}
@media (max-width: 767px) {
  .wt-welcome {
    left: 0.75rem;
    right: 0.75rem;
    bottom: calc(0.75rem + var(--nav-bottom-h));
    width: auto;
  }
}
@media (prefers-reduced-motion: reduce) {
  .wt-welcome {
    animation: none;
  }
}
</style>
