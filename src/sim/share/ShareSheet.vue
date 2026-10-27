<template>
  <Teleport to="body">
    <dialog ref="dialogEl" class="modal share-sheet" data-test-share-sheet @close="onDialogClose">
      <div v-if="isOpen" class="modal-box share-sheet__box max-w-6xl p-0">
        <div class="share-sheet__head flex items-start gap-3 px-5 pt-4 pb-3 border-b border-base-content/10">
          <div class="min-w-0 flex-1">
            <h3 class="text-lg font-bold leading-tight">{{ title }}</h3>
            <p class="text-sm text-base-content/70 max-sm:hidden">A picture that carries the {{ source?.kind === "team" ? "team" : "build" }}: drop it on Wuthering Tools+ to load it back exactly.</p>
          </div>
          <button type="button" class="btn btn-sm btn-ghost btn-square" aria-label="Close" data-test-share-sheet-close @click="close">✕</button>
        </div>

        <div class="share-sheet__body grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div class="min-w-0">
            <div v-if="error" class="alert alert-error text-sm" data-test-share-sheet-error>{{ error }}</div>
            <div v-else-if="!view" class="share-sheet__skeleton rounded-xl bg-base-200 flex items-center justify-center gap-2 text-sm text-base-content/70">
              <span class="loading loading-spinner loading-sm"></span> Building the card…
            </div>
            <CardPreview
              v-else
              ref="previewRef"
              :view="view"
              :template="template"
              :headline="headline"
              :show-numbers="showNumbers"
              :owner="owner"
              :theme="cardTheme"
              :team-name="payload?.team?.name"
              :slots="payload?.team?.characterIds"
              :duration="payload?.team?.duration ?? null"
              :max-height="template === 'team' ? 620 : undefined" />
            <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-base-content/60">
              <span>{{ template === "team" ? "1080 × 1350" : "1200 × 630" }} px · exported at 2×</span>
              <span v-if="scoring" class="inline-flex items-center gap-1" data-test-share-scoring><span class="loading loading-spinner loading-xs"></span>scoring with the engine…</span>
              <span v-else-if="showNumbers && !headline && view" data-test-share-no-headline>No engine number: {{ source?.kind === "team" ? "the team has no rotation with all three members set up" : "no rotation scores for this build" }}.</span>
            </div>
          </div>

          <div class="flex flex-col gap-4 min-w-0">
            <fieldset class="flex flex-col gap-2">
              <legend class="text-xs font-semibold uppercase tracking-wide text-base-content/60 mb-1">On the card</legend>
              <label class="label cursor-pointer justify-start gap-3 py-1">
                <input v-model="showNumbers" type="checkbox" class="toggle toggle-sm toggle-primary" data-test-share-toggle-numbers />
                <span class="label-text">Engine numbers</span>
              </label>
              <label class="label cursor-pointer justify-start gap-3 py-1">
                <input v-model="showUid" type="checkbox" class="toggle toggle-sm" data-test-share-toggle-uid />
                <span class="label-text">Name &amp; UID</span>
              </label>
              <div v-if="showUid" class="grid grid-cols-2 gap-2">
                <input v-model="ownerName" type="text" maxlength="24" class="input input-bordered input-sm w-full" placeholder="Name" data-test-share-owner-name />
                <input v-model="ownerUid" type="text" inputmode="numeric" maxlength="12" class="input input-bordered input-sm w-full" placeholder="UID" data-test-share-owner-uid />
              </div>
              <div class="join w-full" role="group" aria-label="Card theme">
                <button type="button" class="btn btn-sm join-item flex-1" :class="cardTheme === 'dark' ? 'btn-primary' : 'btn-ghost bg-base-200'" :aria-pressed="cardTheme === 'dark'" data-test-share-theme="dark" @click="cardTheme = 'dark'">Dark</button>
                <button type="button" class="btn btn-sm join-item flex-1" :class="cardTheme === 'light' ? 'btn-primary' : 'btn-ghost bg-base-200'" :aria-pressed="cardTheme === 'light'" data-test-share-theme="light" @click="cardTheme = 'light'">Light</button>
              </div>
            </fieldset>

            <div class="flex flex-col gap-2">
              <span class="text-xs font-semibold uppercase tracking-wide text-base-content/60">Share</span>
              <button type="button" class="btn btn-primary btn-sm justify-start" :disabled="!ready || busy !== null" data-test-share-download @click="download">
                <span v-if="busy === 'download'" class="loading loading-spinner loading-xs"></span>
                <svg v-else viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" /></svg>
                Download PNG
              </button>
              <button v-if="fileShareSupported" type="button" class="btn btn-sm justify-start" :disabled="!ready || busy !== null" data-test-share-native @click="nativeShare">
                <span v-if="busy === 'share'" class="loading loading-spinner loading-xs"></span>
                <svg v-else viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 12h.01M12 5l4 4-4 4M16 9H9a4 4 0 00-4 4v6" /></svg>
                Share…
              </button>
              <button type="button" class="btn btn-sm justify-start" :disabled="!link || !ready || busy !== null" data-test-share-copy-link :data-test-share-link-url="link?.url ?? ''" @click="copyLink">
                <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10 14a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1 1M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1-1" /></svg>
                Copy link
                <span v-if="link" class="ml-auto text-xs font-normal text-base-content/60 tabular-nums">{{ link.length.toLocaleString("en-US") }} chars</span>
              </button>
              <button v-if="clipboardImage" type="button" class="btn btn-sm btn-ghost justify-start" :disabled="!ready || busy !== null" data-test-share-copy-image @click="copyPicture">
                <span v-if="busy === 'copy'" class="loading loading-spinner loading-xs"></span>
                <svg v-else viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 8h11v11H8zM5 16V5h11" /></svg>
                Copy picture only
              </button>
            </div>

            <ul class="text-xs text-base-content/70 flex flex-col gap-1.5 list-none p-0 m-0" data-test-share-notes>
              <li v-if="linkNote"><b class="text-base-content">Link:</b> {{ linkNote }}</li>
              <li><b class="text-base-content">Card:</b> the PNG carries the {{ source?.kind === "team" ? "team, its rotation and all three builds" : "whole build, its buff settings and rotation" }}. Discord and file transfers keep it; Reddit, X and Imgur re-compress images and drop it.</li>
              <li v-if="clipboardImage"><b class="text-base-content">Copy picture:</b> the clipboard re-encodes images, so a pasted picture has no data in it.</li>
              <li>Your account key and inventory ids never leave the browser; the UID only appears if you switch it on.</li>
            </ul>
          </div>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button aria-label="Close">close</button></form>
    </dialog>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { useSettingsStore } from "../../stores/settings";
import { useToast } from "../../composables/useToast";
import { autoTeamBuffs } from "../teamContext/autoTeamBuffs";
import CardPreview from "./CardPreview.vue";
import { buildPayload, characterName, teamPayload, type ShareHeadline, type SharePayload, type ShareRotation, type ShareSource } from "./buildCodec";
import { cardView, type CardView } from "./cardView";
import { buildHeadline, teamHeadline } from "./headline";
import { shareLink, type ShareLink } from "./link";
import { canCopyImage, canShareFile, captureCard, cardFilename, copyImage, copyText, downloadBlob, embedPayload, shareFile } from "./capture";
import { readPrefs, writePrefs } from "./prefs";

const characterStore = useCharacterStore();
const inventoryStore = useInventoryStore();
const teamStore = useTeamRotationsStore();
const settingsStore = useSettingsStore();
const { showToast } = useToast();

const dialogEl = ref<HTMLDialogElement | null>(null);
const previewRef = ref<InstanceType<typeof CardPreview> | null>(null);
const isOpen = ref(false);
const source = ref<ShareSource | null>(null);
const payload = ref<SharePayload | null>(null);
const view = ref<CardView | null>(null);
const headline = ref<ShareHeadline | null>(null);
const rotation = ref<ShareRotation | null>(null);
const link = ref<ShareLink | null>(null);
const scoring = ref(false);
const error = ref<string | null>(null);
const busy = ref<null | "download" | "share" | "copy">(null);

const prefs = readPrefs();
const showNumbers = ref(prefs.showNumbers);
const cardTheme = ref<"dark" | "light">(prefs.theme);
const showUid = ref(false); // off every time the sheet opens (privacy)
watch([showNumbers, cardTheme], () => writePrefs({ showNumbers: showNumbers.value, theme: cardTheme.value }));

// the same Username / UID upstream's build card keeps in settings.config.buildCard
const ownerName = computed({
  get: () => String(settingsStore.config?.buildCard?.username ?? ""),
  set: (v: string) => settingsStore.addToConfig({ buildCard: { username: v } }),
});
const ownerUid = computed({
  get: () => String(settingsStore.config?.buildCard?.uid ?? ""),
  set: (v: string) => settingsStore.addToConfig({ buildCard: { uid: v.replace(/\D/g, "") } }),
});
const owner = computed(() => (showUid.value && (ownerName.value || ownerUid.value) ? { name: ownerName.value || undefined, uid: ownerUid.value || undefined } : null));

const template = computed<"post" | "team">(() => (source.value?.kind === "team" ? "team" : "post"));
// an export taken while the engine number is still on its way would leave it off the card (and out of the link)
const ready = computed(() => !!view.value && !(scoring.value && showNumbers.value));
const title = computed(() => {
  if (!source.value) return "Share";
  if (source.value.kind === "team") return `Share team · ${teamStore.getTeamById(source.value.teamId)?.name ?? "Team"}`;
  return `Share ${characterName(source.value.charId)}'s build`;
});
const clipboardImage = canCopyImage();
const fileShareSupported = (() => {
  try {
    return canShareFile(new File([new Uint8Array(1)], "card.png", { type: "image/png" }));
  } catch {
    return false;
  }
})();

/** The payload as it would be exported now: headline + owner applied. */
function currentPayload(): SharePayload | null {
  if (!payload.value) return null;
  const p: SharePayload = { ...payload.value };
  if (showNumbers.value && headline.value) p.headline = headline.value;
  else delete p.headline;
  if (rotation.value && p.detail === "full" && p.kind === "build") p.rotation = rotation.value;
  if (owner.value) p.owner = owner.value;
  else delete p.owner;
  return p;
}

async function refreshLink() {
  const p = currentPayload();
  link.value = p ? await shareLink(p, window.location.origin) : null;
}
watch([showNumbers, owner, headline], () => void refreshLink());

const linkNote = computed(() => {
  if (!payload.value) return "";
  if (!link.value) return "too long for a chat message even as gear only — share the card instead.";
  if (link.value.detail === "full") return "carries everything the card does.";
  if (link.value.detail === "lean") return "gear and buff settings; the rotations and Team Buffs panel only travel in the card (the full link would be " + link.value.fullLength.toLocaleString("en-US") + " characters).";
  return "gear only (character, weapon, sequence, echoes) — buff settings and rotations travel in the card.";
});

// a newer open() wins: compare tokens, not `source.value === src` (the ref hands back a reactive proxy, never `src`)
let loadToken = 0;

async function load(src: ShareSource) {
  const token = ++loadToken;
  rendered = null;
  error.value = null;
  payload.value = null;
  view.value = null;
  headline.value = null;
  rotation.value = null;
  link.value = null;
  const characters = (characterStore.characters ?? {}) as Record<string, any>;
  const echoes = (inventoryStore.echoes ?? []) as any[];
  try {
    if (src.kind === "build") {
      const record = characters[src.charId];
      if (!record) throw new Error(`${characterName(src.charId)} isn't set up in your account.`);
      payload.value = buildPayload(src.charId, record, src.buildId ?? null, echoes);
    } else {
      const team = teamStore.getTeamById(src.teamId);
      if (!team) throw new Error("That team no longer exists.");
      payload.value = teamPayload(team, characters, echoes);
      if (!payload.value.members.length) throw new Error("None of this team's members is set up.");
    }
    const v = await cardView(payload.value);
    if (token !== loadToken) return;
    view.value = v;
    void refreshLink();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    return;
  }
  scoring.value = true;
  try {
    if (src.kind === "build") {
      const best = await buildHeadline(src.charId, characters, echoes, src.buildId ?? null);
      if (token === loadToken) {
        headline.value = best?.headline ?? null;
        rotation.value = best?.rotation ?? null;
      }
    } else {
      const team = teamStore.getTeamById(src.teamId);
      const h = team ? await teamHeadline(team, characters, echoes, { autoTeamBuffs: autoTeamBuffs.value }) : null;
      if (token === loadToken) headline.value = h;
    }
  } finally {
    if (token === loadToken) scoring.value = false;
  }
}

async function open(src: ShareSource) {
  source.value = src;
  showUid.value = false;
  isOpen.value = true;
  await nextTick();
  dialogEl.value?.showModal();
  void load(src);
}

function close() {
  dialogEl.value?.close();
}

function onDialogClose() {
  isOpen.value = false;
  source.value = null;
}

async function renderPng(withData: boolean): Promise<{ blob: Blob; detail?: SharePayload["detail"] }> {
  const node = (previewRef.value?.card as HTMLElement | null)?.firstElementChild as HTMLElement | null;
  const p = currentPayload();
  if (!node || !p || !previewRef.value) throw new Error("The card isn't ready yet.");
  const png = await captureCard(node, previewRef.value.size);
  if (!withData) return { blob: png };
  const { blob, detail } = await embedPayload(png, p);
  return { blob, detail };
}

// The last card rendered with its data, keyed by everything on it: Download then Share (or a second tap on Share
// after the browser asked for one) re-uses it instead of capturing again.
let rendered: { key: string; blob: Blob; detail?: SharePayload["detail"] } | null = null;
const renderKey = (): string => JSON.stringify([currentPayload(), cardTheme.value, showNumbers.value, owner.value, template.value]);
async function renderWithData(): Promise<{ blob: Blob; detail?: SharePayload["detail"] }> {
  const key = renderKey();
  if (rendered?.key === key) return rendered;
  const out = await renderPng(true);
  rendered = { key, ...out };
  return out;
}

async function download() {
  busy.value = "download";
  try {
    const p = currentPayload()!;
    const { blob, detail } = await renderWithData();
    const name = cardFilename(p);
    downloadBlob(blob, name);
    showToast(`Saved ${name}${detail === "full" ? "" : ` (${detail} data inside)`}. Drop it on /share to load it back.`, "success", 6000);
  } catch (err) {
    showToast(err instanceof Error ? err.message : "The card couldn't be saved.", "error", 6000);
  } finally {
    busy.value = null;
  }
}

async function nativeShare() {
  busy.value = "share";
  try {
    const p = currentPayload()!;
    const { blob } = await renderWithData();
    const file = new File([blob], cardFilename(p), { type: "image/png" });
    // a short caption: most apps paste the text beside the picture, and the picture already carries the build
    // (the link is one tap away under Copy link)
    const what = p.kind === "team" ? `Team “${p.team?.name ?? "Team"}”` : `${characterName(p.members[0]?.charId ?? "")}'s build`;
    const outcome = await shareFile(file, `${what} — drop the picture on ${window.location.origin}/share to load it.`);
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
    // the blob goes in as a promise, so the clipboard write starts inside the click (Safari)
    await copyImage(renderPng(false).then((r) => r.blob));
    showToast("Picture copied. The clipboard drops the build data — use Download or Share to keep it.", "info", 6000);
  } catch {
    showToast("Your browser wouldn't copy the picture; use Download instead.", "error", 6000);
  } finally {
    busy.value = null;
  }
}

async function copyLink() {
  if (!link.value) return;
  try {
    await copyText(link.value.url);
    showToast(`Link copied (${link.value.length.toLocaleString("en-US")} characters).`, "success");
  } catch {
    showToast("Couldn't copy the link.", "error");
  }
}

defineExpose({ open, close });
</script>

<style scoped>
.share-sheet__box {
  width: min(72rem, calc(100vw - 2rem));
}
.share-sheet__body {
  max-height: calc(100dvh - 9rem);
  overflow-y: auto;
  overflow-x: hidden;
}
.share-sheet__skeleton {
  aspect-ratio: 1200 / 630;
}
@media (max-width: 767px) {
  .share-sheet__box {
    width: 100%;
  }
  /* phone.css § 6 already pads the bottom-sheet box */
  .share-sheet__head {
    padding: 0 0 0.75rem;
  }
  .share-sheet__body {
    max-height: none;
    padding: 1rem 0 0;
  }
}
</style>
