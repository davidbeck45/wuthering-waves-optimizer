<template>
  <section class="wt-tboard" data-test-tier-board :data-wt-view="view" aria-labelledby="wt-tboard-title">
    <h2 id="wt-tboard-title" class="wt-tboard__sr">Tier list board</h2>
    <p class="wt-tboard__lead text-sm">
      Riley's tiers at the settings above, T0 best. Tap a portrait for its best team.
    </p>
    <p v-if="state?.solving" class="wt-tboard__status text-sm" role="status" data-test-tier-board-solving>
      Solving the teams for this setting: the board redraws when it is done.
    </p>
    <p v-else-if="!model || empty" class="wt-tboard__status text-sm" role="status" data-test-tier-board-waiting>
      Loading Riley's tier list…
    </p>
    <div v-if="model && !empty" class="wt-tboard__blocks" :aria-busy="!!state?.solving">
      <div v-for="(block, b) in model.blocks" :key="block.title" class="wt-tboard__block" :data-test-tier-board-block="b">
        <h3 class="wt-tboard__title font-semibold">{{ block.title }}</h3>
        <p v-if="ownedLines[b]" class="wt-tboard__owned text-sm" data-test-tier-board-owned>{{ ownedLines[b] }}</p>
        <div
          v-for="band in block.bands"
          :key="band.tier"
          class="wt-tboard__band"
          :style="{ '--tier': TIER_COLORS[band.tier] }"
          :data-test-tier-board-band="band.tier">
          <div class="wt-tboard__tier" :aria-label="`Tier ${band.tier}`">{{ band.tier }}</div>
          <ul class="wt-tboard__row" :aria-label="`${block.title}, tier ${band.tier}`">
            <li v-if="!band.entries.length" class="wt-tboard__none text-xs">nobody</li>
            <li v-for="e in band.entries" :key="e.name">
              <button
                type="button"
                class="wt-tboard__face"
                :class="{ 'is-owned': owned?.has(e.name), 'is-other': owned && !owned.has(e.name) }"
                :aria-label="`${e.name}, ${block.title} ${band.tier}${owned?.has(e.name) ? ', owned' : ''}`"
                :data-test-tier-board-face="e.name"
                :data-tier="band.tier"
                @click="openSheet(e.name, b, $event)">
                <span class="wt-tboard__pic">
                  <img v-if="e.icon" :src="e.icon" alt="" loading="lazy" decoding="async" width="48" height="48">
                  <span v-else class="wt-tboard__initials">{{ initials(e.name) }}</span>
                  <span v-if="owned?.has(e.name)" class="wt-tboard__tick" aria-hidden="true">✓</span>
                </span>
                <span class="wt-tboard__name">{{ e.name }}</span>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div class="wt-tboard__tools" data-export-hide>
      <button type="button" class="btn btn-sm btn-outline" :disabled="!model || empty || !!state?.solving || saving" data-test-tier-board-save @click="save(false)">
        {{ saving ? "Making the picture…" : "Save as image" }}
      </button>
      <button v-if="canShare" type="button" class="btn btn-sm btn-ghost" :disabled="!model || empty || !!state?.solving || saving" data-test-tier-board-share @click="save(true)">
        Share image
      </button>
      <label v-if="owned" class="wt-tboard__mark label cursor-pointer gap-2">
        <input v-model="markInImage" type="checkbox" class="checkbox checkbox-sm" data-test-tier-board-mark-image>
        <span class="label-text">Show my resonators in the picture</span>
      </label>
      <span v-if="saveError" class="text-sm text-error" role="alert">{{ saveError }}</span>
    </div>
    <dialog ref="sheet" class="wt-tboard__sheet" aria-labelledby="wt-tboard-sheet-title" data-test-tier-board-sheet @close="onDialogClose" @keydown.esc.prevent="closeSheet()" @click.self="closeSheet()">
      <div v-if="picked" class="wt-tboard__sheetbody">
        <div class="wt-tboard__sheethead">
          <h3 id="wt-tboard-sheet-title" class="font-semibold text-base">{{ picked.entry.name }}</h3>
          <button type="button" class="btn btn-sm btn-ghost wt-tboard__close" aria-label="Close" data-test-tier-board-close @click="closeSheet()">✕</button>
        </div>
        <p class="text-sm">{{ picked.block }}, tier {{ picked.tier }}</p>
        <p class="text-sm font-semibold mt-2">Best team</p>
        <ul class="wt-tboard__team" data-test-tier-board-team>
          <li v-for="m in picked.members" :key="m">
            <img v-if="iconOf(m)" :src="iconOf(m)" alt="" width="44" height="44">
            <span v-else class="wt-tboard__initials">{{ initials(m) }}</span>
            <span class="text-xs">{{ m }}</span>
          </li>
        </ul>
        <p class="text-sm" data-test-tier-board-figure>
          <span class="font-semibold">{{ picked.entry.figure }}</span> {{ figureLabel(model?.mode ?? "DPR") }}
        </p>
        <p class="wt-tboard__links">
          <RouterLink v-if="picked.teamLink" :to="picked.teamLink" class="btn btn-sm btn-primary" data-test-tier-board-team-link>Open this team on Team rankings</RouterLink>
          <RouterLink v-if="picked.kit" :to="picked.kit" class="btn btn-sm btn-outline" data-test-tier-board-kit-link>{{ picked.entry.name }}'s brief</RouterLink>
        </p>
      </div>
    </dialog>

    <!-- the saved picture: a fixed design width and fixed colours, so it is the same from every screen and theme -->
    <div v-if="exporting && model" ref="card" class="wt-tcard" aria-hidden="true">
      <div class="wt-tcard__head">Wuthering Waves tier list</div>
      <div class="wt-tcard__sub">Each resonator at the {{ figureLabel(model.mode) }} they stand in</div>
      <div class="wt-tcard__blocks">
        <div v-for="block in model.blocks" :key="block.title" class="wt-tcard__block">
          <div class="wt-tcard__title">{{ block.title }}</div>
          <div v-for="band in block.bands" :key="band.tier" class="wt-tcard__band" :style="{ '--tier': TIER_COLORS[band.tier] }">
            <div class="wt-tcard__tier">{{ band.tier }}</div>
            <div class="wt-tcard__row">
              <div v-for="e in band.entries" :key="e.name" class="wt-tcard__face" :class="{ 'is-owned': markInImage && owned?.has(e.name) }">
                <img v-if="e.icon" :src="e.icon" alt="" width="40" height="40">
                <span v-else class="wt-tcard__initials">{{ initials(e.name) }}</span>
                <span class="wt-tcard__name">{{ e.name }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="wt-tcard__foot" data-test-tier-card-footer>{{ footer }}</div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { onTierBoard, teamMembersOf, type TierBoardState } from "./controller";
import { rankingsTargetOf } from "./links";
import { KIT_INDEX_ENTRIES } from "../kits/load";
import { captureCard, downloadBlob, shareFile } from "../share/capture";
import {
  figureLabel, imageFooter, isEmpty, kitPathFor, localDay, ownedLine, TIER_COLORS, type BoardEntry,
} from "./tierBoard";

defineProps<{ view: number }>();

const state = ref<TierBoardState | null>(null);
const model = computed(() => state.value?.model ?? null);
const empty = computed(() => isEmpty(model.value));
const owned = computed(() => (state.value?.owned ? new Set(state.value.owned) : null));
const ownedLines = computed(() => model.value?.blocks.map((b) => ownedLine(b, owned.value)) ?? []);
onMounted(() => onTierBoard((s) => { state.value = s; }));
onBeforeUnmount(() => onTierBoard(null));

const initials = (name: string): string => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const icons = computed(() => {
  const out = new Map<string, string>();
  for (const b of model.value?.blocks ?? []) for (const band of b.bands) for (const e of band.entries) if (e.icon) out.set(e.name, e.icon);
  return out;
});
const iconOf = (name: string): string => icons.value.get(name) ?? "";
const briefs = new Set(KIT_INDEX_ENTRIES.map((k) => k.name));

/* ------------------------------------------------------------------ the sheet: its resonator in the address */
const route = useRoute();
const router = useRouter();
const sheet = ref<HTMLDialogElement | null>(null);
let pushed = false;
let opener: string | null = null;
const picked = computed(() => {
  const who = typeof route.query.who === "string" ? route.query.who : null;
  const b = Number(route.query.in ?? 0);
  const block = model.value?.blocks[b];
  if (!who || !block) return null;
  for (const band of block.bands) {
    const entry: BoardEntry | undefined = band.entries.find((e) => e.name === who);
    if (!entry) continue;
    const members = entry.href ? teamMembersOf(entry.href) : [];
    return {
      entry, block: block.title, tier: band.tier, members,
      teamLink: entry.href ? rankingsTargetOf(entry.href) : null,
      kit: kitPathFor(entry.name, briefs),
    };
  }
  return null;
});
function openSheet(name: string, block: number, e: MouseEvent): void {
  opener = name;
  (e.currentTarget as HTMLElement).blur?.();
  pushed = true;
  void router.push({ query: { ...route.query, who: name, in: String(block) }, hash: location.hash });
}
function closeSheet(): void {
  if (!route.query.who) return;
  if (pushed) {
    pushed = false;
    router.back();
  } else {
    const { who: _w, in: _i, ...rest } = route.query;
    void router.replace({ query: rest, hash: location.hash });
  }
}
/** Escape closes the dialog itself: the address follows */
function onDialogClose(): void {
  if (route.query.who) closeSheet();
}
watch(picked, async (p) => {
  await nextTick();
  const d = sheet.value;
  if (!d) return;
  if (p && !d.open) d.showModal();
  else if (!p && d.open) {
    d.close();
    const back = opener ? document.querySelector<HTMLElement>(`[data-test-tier-board-face="${CSS.escape(opener)}"]`) : null;
    back?.focus();
  }
});
// a Back that left the page while the sheet was open: nothing pushed is ours any more
watch(() => route.query.who, (who) => { if (!who) pushed = false; });

/* ------------------------------------------------------------------------------- Save as image */
const CARD_WIDTH = 1080;
const exporting = ref(false);
const saving = ref(false);
const saveError = ref("");
const markInImage = ref(false);
const card = ref<HTMLElement | null>(null);
const canShare = typeof navigator !== "undefined" && typeof navigator.canShare === "function";
const footer = computed(() => imageFooter(state.value?.cost ?? "s0r1", !!state.value?.matrix, localDay(new Date())));
async function save(share: boolean): Promise<void> {
  saving.value = true;
  saveError.value = "";
  exporting.value = true;
  try {
    await nextTick();
    const node = card.value;
    if (!node) throw new Error("The picture could not be laid out.");
    await Promise.all([...node.querySelectorAll("img")].map((img) => img.decode().catch(() => undefined)));
    const blob = await captureCard(node, { width: CARD_WIDTH, height: node.scrollHeight });
    const name = `tier-list-${state.value?.cost ?? "s0r1"}-${localDay(new Date())}-wtplus.png`;
    if (share) {
      const file = new File([blob], name, { type: "image/png" });
      const out = await shareFile(file, "Wuthering Waves tier list");
      if (out === "needs-tap") downloadBlob(blob, name);
    } else {
      downloadBlob(blob, name);
    }
  } catch (err) {
    saveError.value = `The picture could not be made: ${(err as Error).message}`;
  } finally {
    exporting.value = false;
    saving.value = false;
  }
}
</script>

<style scoped>
.wt-tboard {
  padding: 0 0.75rem 1rem;
}
.wt-tboard__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.wt-tboard__lead,
.wt-tboard__status {
  padding: 0.25rem 0;
}
.wt-tboard__status {
  font-weight: 600;
}
.wt-tboard__tools {
  margin-top: 0.5rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.75rem;
  padding: 0.25rem 0 0.5rem;
}
.wt-tboard__tools .btn,
.wt-tboard__mark {
  min-height: 44px;
}
.wt-tboard__blocks {
  display: grid;
  gap: 1rem;
}
@media (min-width: 1280px) {
  .wt-tboard__blocks {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
/* a phone shows the block picked with the buttons over the page (RileyPageHost's views) */
@media (max-width: 767px) {
  /* the block buttons over the page name the block: its heading stays for a screen reader */
  .wt-tboard__title {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .wt-tboard[data-wt-view="0"] .wt-tboard__block:not([data-test-tier-board-block="0"]),
  .wt-tboard[data-wt-view="1"] .wt-tboard__block:not([data-test-tier-board-block="1"]),
  .wt-tboard[data-wt-view="2"] .wt-tboard__block:not([data-test-tier-board-block="2"]) {
    display: none;
  }
}
.wt-tboard__title {
  font-size: 1rem;
  padding-bottom: 0.25rem;
}
.wt-tboard__owned {
  padding-bottom: 0.25rem;
}
.wt-tboard__band {
  display: flex;
  align-items: stretch;
  border-left: 4px solid var(--tier);
  background: oklch(var(--b2));
  margin-bottom: 4px;
  border-radius: 0 6px 6px 0;
}
.wt-tboard__tier {
  flex: none;
  width: 2.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  /* his tier colour kept as the hue, mixed toward the text colour so it reads at AA on every theme (rileyPages.css) */
  color: color-mix(in oklab, var(--tier) 40%, oklch(var(--bc)));
}
.wt-tboard__row {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px;
  list-style: none;
  margin: 0;
}
.wt-tboard__none {
  align-self: center;
  opacity: 0.8;
  padding: 0 0.25rem;
}
.wt-tboard__face {
  width: 4.5rem;
  min-height: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px 2px;
  border-radius: 6px;
  background: transparent;
  color: oklch(var(--bc));
}
.wt-tboard__face:hover {
  background: oklch(var(--b3));
}
.wt-tboard__face:focus-visible {
  outline: 2px solid oklch(var(--p));
  outline-offset: 1px;
}
.wt-tboard__pic {
  position: relative;
  width: 48px;
  height: 48px;
  border-radius: 999px;
  overflow: visible;
  display: block;
}
.wt-tboard__pic img,
.wt-tboard__pic .wt-tboard__initials {
  width: 48px;
  height: 48px;
  border-radius: 999px;
  object-fit: cover;
  background: oklch(var(--b3));
}
.wt-tboard__initials {
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.8rem;
}
.wt-tboard__face.is-owned .wt-tboard__pic img,
.wt-tboard__face.is-owned .wt-tboard__pic .wt-tboard__initials {
  box-shadow: 0 0 0 3px oklch(var(--su));
}
.wt-tboard__face.is-other .wt-tboard__pic img,
.wt-tboard__face.is-other .wt-tboard__pic .wt-tboard__initials {
  opacity: 0.55;
  filter: grayscale(0.6);
}
.wt-tboard__tick {
  position: absolute;
  right: -4px;
  bottom: -4px;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: oklch(var(--su));
  color: oklch(var(--suc));
  font-size: 11px;
  line-height: 18px;
  text-align: center;
  font-weight: 700;
}
.wt-tboard__name {
  font-size: 0.7rem;
  line-height: 1.15;
  text-align: center;
  max-width: 100%;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
@media (max-width: 400px) {
  .wt-tboard__face {
    width: 4rem;
  }
}

/* the sheet: a bottom sheet on a phone, a centred card on a wider screen */
.wt-tboard__sheet {
  padding: 0;
  border-radius: 12px;
  background: oklch(var(--b1));
  color: oklch(var(--bc));
  width: min(26rem, calc(100vw - 2rem));
  max-height: 85dvh;
}
.wt-tboard__sheet::backdrop {
  background: rgb(0 0 0 / 0.45);
}
@media (max-width: 767px) {
  .wt-tboard__sheet {
    margin: auto 0 0;
    width: 100%;
    max-width: 100%;
    border-radius: 12px 12px 0 0;
  }
}
.wt-tboard__sheetbody {
  padding: 0.75rem 1rem 1rem;
}
.wt-tboard__sheethead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.wt-tboard__close {
  min-width: 44px;
  min-height: 44px;
}
.wt-tboard__team {
  display: flex;
  gap: 0.75rem;
  list-style: none;
  padding: 0.25rem 0 0.5rem;
  margin: 0;
}
.wt-tboard__team li {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 4.5rem;
  text-align: center;
}
.wt-tboard__team img,
.wt-tboard__team .wt-tboard__initials {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  background: oklch(var(--b3));
}
.wt-tboard__links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding-top: 0.5rem;
}
.wt-tboard__links .btn {
  min-height: 44px;
  height: auto;
  white-space: normal;
}
@media (prefers-reduced-motion: no-preference) {
  .wt-tboard__face {
    transition: background-color 120ms;
  }
}

/* the saved picture: fixed colours (the one exception to theme colours, as the share cards) */
.wt-tcard {
  position: fixed;
  left: -20000px;
  top: 0;
  width: 1080px;
  padding: 32px;
  background: #15171d;
  color: #f1f2f4;
  font-family: system-ui, sans-serif;
}
.wt-tcard__head {
  font-size: 34px;
  font-weight: 700;
}
.wt-tcard__sub {
  font-size: 18px;
  color: #c3c7cf;
  padding-bottom: 16px;
}
.wt-tcard__blocks {
  display: grid;
  gap: 20px;
}
.wt-tcard__title {
  font-size: 22px;
  font-weight: 700;
  padding-bottom: 6px;
}
.wt-tcard__band {
  display: flex;
  border-left: 6px solid var(--tier);
  background: #22252e;
  margin-bottom: 4px;
}
.wt-tcard__tier {
  width: 56px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 800;
  color: var(--tier);
}
.wt-tcard__row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px;
  min-height: 52px;
}
.wt-tcard__face {
  width: 76px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.wt-tcard__face img,
.wt-tcard__initials {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  background: #343846;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}
.wt-tcard__face.is-owned img,
.wt-tcard__face.is-owned .wt-tcard__initials {
  box-shadow: 0 0 0 3px #3ccf7a;
}
.wt-tcard__name {
  font-size: 13px;
  text-align: center;
  line-height: 1.15;
}
.wt-tcard__foot {
  padding-top: 18px;
  font-size: 15px;
  color: #c3c7cf;
}
</style>
