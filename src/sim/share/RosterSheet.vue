<template>
  <Teleport to="body">
    <dialog ref="dialogEl" class="modal share-sheet" aria-labelledby="roster-sheet-title" data-test-roster-sheet @close="onDialogClose">
      <div v-if="isOpen" class="modal-box roster-sheet__box max-w-6xl p-0">
        <div class="roster-sheet__head flex items-start gap-3 px-5 pt-4 pb-3 border-b border-base-content/10">
          <div class="min-w-0 flex-1">
            <h3 id="roster-sheet-title" class="text-lg font-bold leading-tight">Share my roster</h3>
            <p class="text-sm text-base-content/70" data-test-roster-sheet-picture-only>A picture of every set-up resonator. Unlike a build card it carries no data to load back.</p>
          </div>
          <button type="button" class="btn btn-sm btn-ghost btn-square" aria-label="Close" data-test-roster-sheet-close @click="close">✕</button>
        </div>

        <div class="roster-sheet__body grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div class="min-w-0">
            <p v-if="!model.tiles.length && !hasOwned" class="alert text-sm" data-test-roster-sheet-empty>No resonator is set up yet (a weapon equipped). Build one in the calculator, or import your data under Settings.</p>
            <div ref="box" class="roster-preview" data-test-roster-preview>
              <div class="roster-preview__frame" :style="{ width: `${ROSTER_CARD_WIDTH * scale}px`, height: `${cardHeight * scale}px` }">
                <div ref="cardBox" class="roster-preview__card" :style="{ transform: `scale(${scale})` }" role="img" :aria-label="altText">
                  <RosterCard :model="model" :date="date" />
                </div>
              </div>
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-base-content/60">
              <span data-test-roster-size>{{ ROSTER_CARD_WIDTH }} × {{ cardHeight }} px · exported at 2×</span>
              <span v-if="ranking === undefined" class="inline-flex items-center gap-1"><span class="loading loading-spinner loading-xs"></span>reading the team figures…</span>
            </div>
          </div>

          <div class="flex flex-col gap-4 min-w-0">
            <fieldset class="flex flex-col gap-2">
              <legend class="text-xs font-semibold uppercase tracking-wide text-base-content/60 mb-1">On the card</legend>
              <label class="flex flex-col gap-1">
                <span class="label-text">Title (optional)</span>
                <input v-model="options.title" type="text" maxlength="60" class="input input-bordered input-sm w-full" placeholder="e.g. My account, November" data-test-roster-title />
              </label>
              <label class="label cursor-pointer justify-start gap-3 py-1 min-h-11">
                <input v-model="options.showScores" type="checkbox" role="switch" class="toggle toggle-sm toggle-primary" data-test-roster-toggle-scores />
                <span class="label-text">Build Scores</span>
              </label>
              <label class="label cursor-pointer justify-start gap-3 py-1 min-h-11">
                <input v-model="options.showTeams" type="checkbox" role="switch" class="toggle toggle-sm toggle-primary" data-test-roster-toggle-teams />
                <span class="label-text">Top three teams and their damage</span>
              </label>
              <label class="label cursor-pointer justify-start gap-3 py-1 min-h-11">
                <input v-model="options.includeFourStars" type="checkbox" role="switch" class="toggle toggle-sm toggle-primary" data-test-roster-toggle-four />
                <span class="label-text">4-star resonators</span>
              </label>
            </fieldset>

            <div class="flex flex-col gap-2">
              <span class="text-xs font-semibold uppercase tracking-wide text-base-content/60">Share</span>
              <button type="button" class="btn btn-primary btn-sm justify-start" :disabled="!ready || busy !== null" data-test-roster-download @click="download">
                <span v-if="busy === 'download'" class="loading loading-spinner loading-xs"></span>
                <svg v-else viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" /></svg>
                Download PNG
              </button>
              <button v-if="fileShareSupported" type="button" class="btn btn-sm justify-start" :disabled="!ready || busy !== null" data-test-roster-native @click="nativeShare">
                <span v-if="busy === 'share'" class="loading loading-spinner loading-xs"></span>
                <svg v-else viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 12h.01M12 5l4 4-4 4M16 9H9a4 4 0 00-4 4v6" /></svg>
                Share…
              </button>
              <button v-if="clipboardImage" type="button" class="btn btn-sm btn-ghost justify-start" :disabled="!ready || busy !== null" data-test-roster-copy @click="copyPicture">
                <span v-if="busy === 'copy'" class="loading loading-spinner loading-xs"></span>
                <svg v-else viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 8h11v11H8zM5 16V5h11" /></svg>
                Copy picture
              </button>
              <p v-if="busy" class="text-xs text-base-content/70" role="status" data-test-roster-busy>Drawing the picture…</p>
            </div>
            <p class="text-xs text-base-content/70">The choices here are for this picture only and are forgotten when the sheet closes. Nothing leaves the browser unless you download or share it.</p>
          </div>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button aria-label="Close">close</button></form>
    </dialog>
  </Teleport>
</template>

<script setup lang="ts">
// Wuthering Tools+ share cards: the sheet for the "My roster" card. Its own dialog beside ShareSheet.vue (which is
// built around a build / team payload); the ways out are capture.ts's, the same as the other two cards'.
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, toRaw, watch } from "vue";
import { useRouter } from "vue-router";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { useToast } from "../../composables/useToast";
import { autoTeamBuffs } from "../teamContext/autoTeamBuffs";
import { accountStateOf } from "../account/accountState";
import { rosterCards } from "../account/accountView";
import { rankingFingerprint, readCachedRanking, readSavedRanking } from "../myRankings/rankingCache";
import type { RosterRanking } from "../myRankings/rankRoster";
import { characterShortName } from "../display/names";
import { installSheetBackGuard } from "../shell/askBackGuard";
import RosterCard from "./RosterCard.vue";
import { DEFAULT_ROSTER_OPTIONS, ROSTER_CARD_WIDTH, rosterAltText, rosterCardModel, rosterFilename, type RosterOptions } from "./rosterCard";
import { canCopyImage, canShareFile, captureCard, copyImage, downloadBlob, shareFile } from "./capture";

const characterStore = useCharacterStore();
const inventoryStore = useInventoryStore();
const teamStore = useTeamRotationsStore();
const { showToast } = useToast();

const dialogEl = ref<HTMLDialogElement | null>(null);
const box = ref<HTMLElement | null>(null);
const cardBox = ref<HTMLElement | null>(null);
const isOpen = ref(false);
const busy = ref<null | "download" | "share" | "copy">(null);
const options = reactive<RosterOptions>({ ...DEFAULT_ROSTER_OPTIONS });
/** undefined while it is being read; null when there is none */
const ranking = shallowRef<RosterRanking | null | undefined>(undefined);
const date = ref("");

const characters = computed(() => (characterStore.characters ?? {}) as Record<string, Record<string, any>>);
const cards = computed(() =>
  rosterCards({
    state: accountStateOf(characters.value, { echoes: inventoryStore.echoes ?? [], equipped: inventoryStore.equipped ?? {} }, teamStore.teams ?? []),
    characters: characters.value,
    inventoryEchoes: (inventoryStore.echoes ?? []) as any[],
    ranking: ranking.value ?? null,
    plan: null,
  }),
);
const hasOwned = computed(() => cards.value.some((c) => c.owned));
const model = computed(() => rosterCardModel({ cards: cards.value, characters: characters.value, ranking: ranking.value ?? null }, options));
const altText = computed(() => rosterAltText(model.value, (id) => characterShortName(id)));
const ready = computed(() => ranking.value !== undefined && model.value.tiles.length > 0);

const clipboardImage = canCopyImage();
const fileShareSupported = (() => {
  try {
    return canShareFile(new File([new Uint8Array(1)], "card.png", { type: "image/png" }));
  } catch {
    return false;
  }
})();

// ---- the preview: the card at its design width, scaled to the box; its height is whatever the tiles need
const boxWidth = ref(0);
const cardHeight = ref(800);
const scale = computed(() => (boxWidth.value ? Math.min(1, boxWidth.value / ROSTER_CARD_WIDTH) : 0.3));
let observer: ResizeObserver | null = null;
function observe() {
  observer?.disconnect();
  if (typeof ResizeObserver === "undefined") return;
  observer = new ResizeObserver(() => {
    if (box.value) boxWidth.value = box.value.clientWidth;
    const node = cardNode();
    if (node) cardHeight.value = node.offsetHeight;
  });
  if (box.value) observer.observe(box.value);
  const node = cardNode();
  if (node) observer.observe(node);
}
const cardNode = (): HTMLElement | null => (cardBox.value?.firstElementChild as HTMLElement | null) ?? null;

// ---- the team figures: the ranking My account reads for exactly this data (this tab, else this browser's saved
// copy); never scored here, so the sheet opens at once and the card never shows a figure My account does not
let readToken = 0;
async function readRanking() {
  const token = ++readToken;
  ranking.value = undefined;
  const fp = rankingFingerprint({
    characters: toRaw(characterStore.characters ?? {}),
    echoes: toRaw(inventoryStore.echoes ?? []),
    teams: toRaw(teamStore.teams ?? []),
    investment: true,
    autoTeamBuffs: autoTeamBuffs.value,
  });
  let found: RosterRanking | null = readCachedRanking(fp);
  if (!found) found = (await readSavedRanking(fp).catch(() => null))?.ranking ?? null;
  if (token === readToken) ranking.value = found;
}

const localDate = (d: Date): string => d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

async function open() {
  Object.assign(options, DEFAULT_ROSTER_OPTIONS);
  rendered = null;
  date.value = localDate(new Date());
  isOpen.value = true;
  await nextTick();
  dialogEl.value?.showModal();
  observe();
  void readRanking();
}

function close() {
  dialogEl.value?.close();
}

function onDialogClose() {
  isOpen.value = false;
  observer?.disconnect();
  readToken += 1;
  rendered = null;
}

// ---- the ways out
let rendered: { key: string; blob: Blob } | null = null;
const renderKey = (): string => JSON.stringify([model.value, date.value]);
async function render(): Promise<Blob> {
  const key = renderKey();
  if (rendered?.key === key) return rendered.blob;
  await nextTick();
  const node = cardNode();
  if (!node) throw new Error("The card isn't ready yet.");
  const blob = await captureCard(node, { width: ROSTER_CARD_WIDTH, height: node.offsetHeight });
  rendered = { key, blob };
  return blob;
}

async function download() {
  busy.value = "download";
  try {
    const blob = await render();
    const name = rosterFilename();
    downloadBlob(blob, name);
    showToast(`Saved ${name}.`, "success", 5000);
  } catch (err) {
    showToast(err instanceof Error ? err.message : "The card couldn't be saved.", "error", 6000);
  } finally {
    busy.value = null;
  }
}

async function nativeShare() {
  busy.value = "share";
  try {
    const blob = await render();
    const file = new File([blob], rosterFilename(), { type: "image/png" });
    const outcome = await shareFile(file, "My Wuthering Waves roster");
    if (outcome === "needs-tap") showToast("The card is ready — tap Share… once more to send it.", "info", 6000);
  } catch (err) {
    showToast(err instanceof Error ? err.message : "Sharing failed.", "error", 6000);
  } finally {
    busy.value = null;
  }
}

async function copyPicture() {
  busy.value = "copy";
  try {
    await copyImage(render());
    showToast("Picture copied.", "success", 4000);
  } catch {
    showToast("Your browser wouldn't copy the picture; use Download instead.", "error", 6000);
  } finally {
    busy.value = null;
  }
}

// a change on the card drops the kept picture
watch(model, () => (rendered = null));

// Back on a phone closes the sheet, as the other sheets do
const router = useRouter();
let stopBack: (() => void) | null = null;
onMounted(() => {
  if (router) stopBack = installSheetBackGuard(router, { sheetOpen: () => isOpen.value, close });
});
onBeforeUnmount(() => {
  stopBack?.();
  observer?.disconnect();
});

defineExpose({ open, close });
</script>

<style scoped>
.roster-sheet__box {
  width: min(72rem, calc(100vw - 2rem));
}
.roster-sheet__body {
  max-height: calc(100dvh - 9rem);
  overflow-y: auto;
  overflow-x: hidden;
}
.roster-preview {
  width: 100%;
}
.roster-preview__frame {
  position: relative;
  margin: 0 auto;
  overflow: hidden;
  border-radius: 0.75rem;
  box-shadow: 0 1px 0 oklch(var(--bc) / 0.06), 0 8px 28px -12px rgba(0, 0, 0, 0.45);
}
.roster-preview__card {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: top left;
}
@media (max-width: 767px) {
  .roster-sheet__box {
    width: 100%;
  }
  .roster-sheet__head {
    padding: 0 0 0.75rem;
  }
  .roster-sheet__body {
    max-height: none;
    padding: 1rem 0 0;
  }
}
</style>
