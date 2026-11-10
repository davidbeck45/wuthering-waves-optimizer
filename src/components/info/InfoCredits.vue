<template>
  <div class="flex flex-col gap-8" data-test-info-credits>
    <h1 class="text-3xl sm:text-4xl font-extrabold text-base-content">Built with the community</h1>

    <section class="grid gap-4 md:grid-cols-2">
      <div class="flex flex-col items-start gap-2.5 bg-base-200 rounded-2xl p-5 sm:p-6">
        <h2 class="text-2xl font-bold">Join the Discord</h2>
        <p class="leading-relaxed">Keep up with the latest, share ideas or report a bug.</p>
        <a href="https://discord.gg/pDKjxNjJWW" target="_blank" rel="noopener noreferrer" class="btn btn-primary">
          Join the Discord
        </a>
      </div>
      <div class="flex flex-col items-start gap-2.5 bg-base-200 rounded-2xl p-5 sm:p-6">
        <h2 class="text-2xl font-bold">Browse the source</h2>
        <p class="leading-relaxed">Read the code or file an issue directly on GitHub.</p>
        <a
          href="https://github.com/ryanbenson/wuthering-waves-optimizer"
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn-outline">
          View it on GitHub
        </a>
      </div>
    </section>

    <section class="flex flex-col gap-3">
      <h2 class="text-2xl font-bold">Developers</h2>
      <ul class="flex flex-wrap gap-2.5 list-none m-0 p-0">
        <li v-for="person in DEVELOPERS" :key="person.name" class="credit-person">
          <span class="credit-person__avatar" aria-hidden="true">{{ person.name[1].toUpperCase() }}</span>
          {{ person.name }}, {{ person.role }}
        </li>
      </ul>
    </section>

    <section class="flex flex-col gap-3">
      <h2 class="text-2xl font-bold">The numbers are right because of them</h2>
      <div class="grid gap-4 md:grid-cols-2">
        <div v-for="group in THANKS" :key="group.title" class="flex flex-col gap-3 bg-base-200 rounded-2xl p-4 sm:p-5">
          <h3 class="text-lg font-bold">{{ group.title }}</h3>
          <ul class="flex flex-wrap gap-2.5 list-none m-0 p-0">
            <li v-for="name in group.people" :key="name" class="credit-person bg-base-100">
              <span class="credit-person__avatar" aria-hidden="true">{{ name[0].toUpperCase() }}</span>
              {{ name }}
            </li>
            <li v-if="group.link" class="credit-person bg-base-100" data-test-credits-wuwalab>
              <span class="credit-person__avatar" aria-hidden="true">{{ group.link.name[0].toUpperCase() }}</span>
              <a :href="group.link.href" target="_blank" rel="noopener noreferrer" class="link font-semibold">
                {{ group.link.name }}
              </a>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <!-- Wuthering Tools+: the engine behind the plus pages -->
    <section class="flex flex-col gap-3" data-test-credits-wuwa-calc>
      <h2 class="text-2xl font-bold">Wuthering Tools+ also runs on</h2>
      <p class="bg-base-200 rounded-2xl p-4 sm:p-5 leading-relaxed">
        Riley31415 for
        <a href="https://github.com/Riley31415/wuwa_calc" target="_blank" rel="noopener noreferrer" class="link font-semibold">wuwa_calc</a>
        — the fight engine, S6R5 solves and rotations behind the Team Rankings page and the
        "Riley31415 (wuwa_calc)" presets in Wuthering Tools+
      </p>
    </section>

    <p>
      <RouterLink to="/privacy" class="link link-primary">Privacy Policy</RouterLink>
    </p>
  </div>
</template>

<script setup lang="ts">
import { useDocumentTitle } from "../../composables/useDocumentTitle";

useDocumentTitle(
  "Credits & Community — Wuthering Waves Calculator & Optimizer",
  "Developers, contributors, and community links for the Wuthering Waves Calculator & Optimizer.",
);

const DEVELOPERS = [
  { name: "@LavaSnake", role: "author" },
  { name: "@flysand", role: "contributor" },
];

const THANKS: { title: string; people: string[]; link?: { name: string; href: string } }[] = [
  { title: "Calculations and great ideas", people: ["Jäger", "Bachelor", "Nekuro (NekroLight)", "AlecJohn", "juste"] },
  { title: "Spectro Frazzle formula", people: ["Namelag", "Dustin"] },
  { title: "Tune Break", people: ["F.I.S.H.", "invidia.exe"] },
  { title: "Aero Erosion data", people: ["noyaosu"] },
  {
    title: "Action frame data for rotation timing",
    people: [],
    link: { name: "wuwalab", href: "https://wuwalab.com" },
  },
];
</script>

<style scoped>
.credit-person {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.375rem 0.875rem 0.375rem 0.375rem;
  border-radius: 9999px;
  font-weight: 500;
  color: oklch(var(--bc));
}
.credit-person__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 9999px;
  background: oklch(var(--p) / 0.2);
  font-weight: 700;
}
</style>
