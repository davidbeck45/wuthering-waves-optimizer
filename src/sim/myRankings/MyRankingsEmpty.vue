<template>
  <section class="mr-empty" data-test-my-rankings-empty>
    <div class="mr-empty__intro">
      <h2 class="mr-empty__title">{{ title }}</h2>
      <p class="mr-empty__text">{{ text }}</p>
    </div>
    <div class="mr-empty__cards">
      <RouterLink v-for="c in CARDS" :key="c.id" :to="c.to" class="mr-cta" :data-test-my-rankings-cta="c.id">
        <span class="mr-cta__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path :d="c.icon" /></svg>
        </span>
        <span class="mr-cta__title">{{ c.title }}</span>
        <span class="mr-cta__text">{{ c.text }}</span>
        <span class="mr-cta__go">
          {{ c.action }}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-3.5" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </span>
      </RouterLink>
    </div>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ — /my-rankings (and /account) with nothing to rank: three ways in instead of a zeroed strip.
withDefaults(defineProps<{ title?: string; text?: string }>(), {
  title: "Rank the characters and teams you have built",
  text: "Nothing to rank yet — no character has a weapon equipped. Bring your account in or build someone, and every character and team is scored on your real builds.",
});
const CARDS = [
  {
    id: "import",
    title: "Import your export",
    text: "Restore a Wuthering Tools export — characters, echoes and teams — under Settings › Backup & Restore.",
    action: "Open Settings",
    to: "/settings",
    icon: "M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2",
  },
  {
    id: "scan",
    title: "Scan echoes from phone screenshots",
    text: "Read a batch of in-game Echo screenshots into your inventory: Inventory › Import echoes › Phone screenshots.",
    action: "Open Inventory",
    to: "/inventory",
    icon: "M8 2h8a2 2 0 012 2v16a2 2 0 01-2 2H8a2 2 0 01-2-2V4a2 2 0 012-2zm3 17h2M9 7h6M9 10.5h6M9 14h3",
  },
  {
    id: "build",
    title: "Build a character",
    text: "Pick a resonator in the calculator and give them a weapon, echoes and sequence nodes.",
    action: "Open the calculator",
    to: "/",
    icon: "M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0M19 3v4m-2-2h4",
  },
] as const;
</script>

<style scoped>
.mr-empty {
  padding: 1.75rem 1.5rem 1.5rem;
  border-radius: 1rem;
  background:
    radial-gradient(60rem 18rem at 10% -20%, oklch(var(--p) / 0.1), transparent 60%),
    oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
}
.mr-empty__title {
  font-size: 1.2rem;
  font-weight: 700;
}
.mr-empty__text {
  margin-top: 0.35rem;
  max-width: 42rem;
  font-size: 0.88rem;
  color: oklch(var(--bc) / 0.7);
}
.mr-empty__cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  margin-top: 1.25rem;
}
.mr-cta {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  color: oklch(var(--bc));
  padding: 1rem 1rem 0.9rem;
  border-radius: 0.85rem;
  background: oklch(var(--b1));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.08);
  transition:
    box-shadow 0.15s ease,
    transform 0.15s ease;
}
.mr-cta:hover,
.mr-cta:focus-visible {
  box-shadow: inset 0 0 0 1px oklch(var(--p) / 0.6);
  transform: translateY(-1px);
}
.mr-cta__icon {
  display: inline-flex;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0.45rem;
  border-radius: 0.6rem;
  color: oklch(var(--p));
  background: oklch(var(--p) / 0.12);
}
.mr-cta__title {
  margin-top: 0.2rem;
  font-weight: 650;
}
.mr-cta__text {
  font-size: 0.8rem;
  color: oklch(var(--bc) / 0.65);
  flex: 1;
}
.mr-cta__go {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin-top: 0.25rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: oklch(var(--p));
}
@media (max-width: 767px) {
  .mr-empty {
    padding: 1.1rem 0.9rem 1rem;
  }
  .mr-empty__cards {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.5rem;
  }
  /* phones: icon beside the words */
  .mr-cta {
    display: grid;
    grid-template-columns: 2.25rem minmax(0, 1fr);
    column-gap: 0.75rem;
    row-gap: 0.15rem;
    padding: 0.75rem 0.8rem;
  }
  .mr-cta__icon {
    grid-row: 1 / span 3;
  }
  .mr-cta__title {
    margin-top: 0;
  }
}
</style>
