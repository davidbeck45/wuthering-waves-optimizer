<template>
  <Nav cur-page="share" :disable-mobile-nav="true"></Nav>
  <div
    class="share-page px-4 py-4 mx-auto w-full max-w-6xl"
    data-test-share-page
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave="onDragLeave"
    @drop.prevent="onDrop">
    <header class="mb-4">
      <h1 class="text-2xl font-bold">Share &amp; import builds</h1>
      <p class="text-sm text-base-content/70 mt-1 max-w-3xl" :class="{ 'max-sm:hidden': loaded }">
        Cards from Wuthering Tools+ carry the build itself, hidden in the PNG — drop one here and it loads exactly,
        no screenshot reading. Links do the same in a URL. Nothing goes through a server.
      </p>
    </header>

    <!-- a card or link is loaded: what it is, and what importing it would add -->
    <section v-if="loaded" class="mb-6" data-test-share-import-preview>
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <h2 class="text-lg font-bold">{{ loaded.payload.kind === "team" ? `Shared team · ${loaded.payload.team?.name ?? ""}` : `Shared build · ${memberNames}` }}</h2>
        <span class="badge badge-outline gap-1" data-test-share-origin>{{ originLabel }}</span>
        <span v-if="loaded.payload.detail !== 'full'" class="badge badge-ghost">{{ loaded.payload.detail === "lean" ? "gear + buff settings" : "gear only" }}</span>
        <button type="button" class="btn btn-sm btn-ghost ml-auto" data-test-share-reset @click="reset">Load another</button>
      </div>

      <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div class="min-w-0">
          <div
            v-if="previewNote"
            class="rounded-xl border border-dashed border-base-content/20 bg-base-200/60 flex items-center justify-center px-6 py-12 text-center text-sm text-base-content/70"
            data-test-share-preview-note>
            {{ previewNote }}
          </div>
          <div v-else-if="!loadedView" class="share-page__skeleton rounded-xl bg-base-200 flex items-center justify-center gap-2 text-sm text-base-content/70">
            <span class="loading loading-spinner loading-sm"></span> Rendering the card…
          </div>
          <CardPreview
            v-else
            :view="loadedView"
            :template="loaded.payload.kind === 'team' ? 'team' : 'post'"
            :headline="loaded.payload.headline ?? null"
            :show-numbers="true"
            :owner="loaded.payload.owner ?? null"
            :theme="appThemeStyle"
            :team-name="loaded.payload.team?.name"
            :slots="loaded.payload.team?.characterIds"
            :duration="loaded.payload.team?.duration ?? null"
            :max-height="loaded.payload.kind === 'team' ? 640 : undefined" />
          <p v-if="verifyLine" class="text-xs text-base-content/70 mt-2" data-test-share-verify>{{ verifyLine }}</p>
        </div>

        <aside class="flex flex-col gap-3 min-w-0">
          <div v-if="loaded.readOnly" role="status" class="rounded-box border border-warning/50 bg-warning/10 p-3 text-sm" data-test-share-readonly>
            This card comes from a newer Wuthering Tools+ (format v{{ loaded.newerVersion }}). You can look at it, but importing needs the newer app — reload the page to update.
          </div>

          <template v-if="!applied">
            <div class="rounded-box border border-base-content/10 bg-base-200/50 p-4 flex flex-col gap-3" data-test-share-merge-plan>
              <h3 class="font-semibold">What “Add to my account” does</h3>
              <div v-for="m in plan?.members ?? []" :key="m.charId" class="flex gap-3" :data-test-share-plan-member="m.charId">
                <img v-if="m.status !== 'skip'" :src="headshot(m.charId)" alt="" class="size-11 rounded-lg bg-base-300 shrink-0 object-cover" />
                <div v-else class="size-11 rounded-lg bg-base-300 shrink-0 flex items-center justify-center text-base-content/40" aria-hidden="true">?</div>
                <div class="min-w-0 text-sm">
                  <div class="font-semibold">{{ m.name }}</div>
                  <div v-if="m.status === 'skip'" class="text-error">{{ m.reason }}</div>
                  <div v-else-if="m.status === 'new-character'">New to your account: joins with this build as <b>“{{ m.buildName }}”</b>.</div>
                  <div v-else>
                    Adds build <b>“{{ m.buildName }}”</b>; your active build <span class="whitespace-nowrap">“{{ m.activeBuildName }}”</span> stays as it is.
                  </div>
                  <div v-if="m.status !== 'skip'" class="flex flex-wrap gap-1 mt-1.5" aria-label="Echoes">
                    <span
                      v-for="e in m.echoes"
                      :key="e.slot"
                      class="badge badge-sm gap-1"
                      :class="{ 'badge-success badge-outline': e.status === 'owned', 'badge-info badge-outline': e.status === 'new', 'badge-error badge-outline': e.status === 'skipped', 'badge-ghost': e.status === 'empty' }"
                      :title="e.reason ?? ''"
                      :data-test-share-echo-status="e.status">
                      {{ e.status === "owned" ? "✓ owned" : e.status === "new" ? "+ new" : e.status === "skipped" ? "! skipped" : "empty" }}
                    </span>
                  </div>
                  <ul v-if="m.notes.length" class="mt-1.5 text-xs text-base-content/70 list-disc pl-4">
                    <li v-for="(n, i) in m.notes" :key="i">{{ n }}</li>
                  </ul>
                </div>
              </div>
              <div v-if="planSummary" class="text-sm border-t border-base-content/10 pt-2" data-test-share-plan-summary>{{ planSummary }}</div>
              <ul v-if="loaded.warnings.length" class="text-xs text-warning-content bg-warning/15 rounded-lg p-2 list-disc pl-6" data-test-share-warnings>
                <li v-for="(w, i) in loaded.warnings" :key="i">{{ w }}</li>
              </ul>
              <div v-if="plan?.blockers.length" class="text-sm text-error">{{ plan.blockers[0] }}</div>
              <div class="flex flex-wrap gap-2">
                <button type="button" class="btn btn-primary btn-sm" :disabled="!plan?.canApply || applying" data-test-share-import-confirm @click="confirmImport">
                  <span v-if="applying" class="loading loading-spinner loading-xs"></span>
                  Add to my account
                </button>
                <button type="button" class="btn btn-ghost btn-sm" data-test-share-import-discard @click="reset">Discard</button>
              </div>
            </div>
          </template>

          <div v-else role="status" class="flex flex-col items-start gap-2 rounded-box border border-success/50 bg-success/10 p-4 text-sm" data-test-share-import-done>
            <span class="font-semibold">Added to your account.</span>
            <ul class="list-disc pl-5">
              <li v-for="b in applied.builds" :key="b.buildId">
                {{ nameOf(b.charId) }}: “{{ b.buildName }}”{{ b.newCharacter ? " (new character, active)" : " — switch to it under Builds in the calculator" }}
              </li>
              <li v-if="applied.team">Team “{{ applied.team }}” in Team Rotations</li>
            </ul>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="btn btn-sm" data-test-share-open-calculator @click="openCalculator(applied.builds[0]?.charId)">Open {{ nameOf(applied.builds[0]?.charId) }} in the calculator</button>
              <RouterLink v-if="applied.team" to="/teams" class="btn btn-sm">Open Team Rotations</RouterLink>
            </div>
          </div>
        </aside>
      </div>
    </section>

    <div class="grid gap-4 md:grid-cols-2">
      <section class="rounded-box border border-base-content/10 bg-base-200/40 p-4 flex flex-col gap-3 min-w-0" data-test-share-import-panel>
        <h2 class="font-bold">Load a shared card</h2>
        <label
          class="share-page__drop flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-7 text-center cursor-pointer transition-colors"
          :class="dragging ? 'border-primary bg-primary/10' : 'border-base-content/20 hover:border-primary/60 hover:bg-base-200'"
          data-test-share-dropzone>
          <svg viewBox="0 0 24 24" class="size-8 text-primary" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 16v3h16v-3M12 4v11m0-11l-4 4m4-4l4 4" /></svg>
          <span class="font-semibold">
            <template v-if="reading">Reading…</template>
            <template v-else><span class="max-sm:hidden">Drop a card image here</span><span class="sm:hidden">Choose a card image</span></template>
          </span>
          <span class="text-sm text-base-content/70"><span class="max-sm:hidden">or click to choose a file · paste an image with Ctrl+V</span><span class="sm:hidden">from your photos or files</span></span>
          <input type="file" accept="image/png,image/*" class="sr-only" data-test-share-file-input @change="onFile" />
        </label>
        <form class="join w-full" @submit.prevent="openLink">
          <input
            v-model="linkText"
            type="text"
            inputmode="url"
            class="input input-bordered input-sm join-item flex-1 min-w-0"
            placeholder="…or paste a share link"
            aria-label="Share link"
            data-test-share-link-input />
          <button type="submit" class="btn btn-sm btn-primary join-item" :disabled="!linkText.trim()" data-test-share-link-open>Open</button>
        </form>
        <div v-if="readError" role="alert" class="flex gap-3 rounded-box border border-warning/50 bg-warning/10 p-3 text-sm" data-test-share-read-error>
          <svg viewBox="0 0 24 24" class="size-5 shrink-0 text-warning mt-0.5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 9v4m0 4h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
          <div class="flex flex-col gap-1 min-w-0">
            <span>{{ readError.message }}</span>
            <span v-if="readError.reason === 'no-data' || readError.reason === 'recompressed'" class="text-xs text-base-content/70">
              A Discord build-bot card or a game screenshot? The screenshot reader takes those: <RouterLink to="/inventory" class="link">Inventory</RouterLink> › <b>Import echoes</b> (or the calculator's Echoes tab) reads the echoes with OCR.
            </span>
          </div>
        </div>
      </section>

      <section class="rounded-box border border-base-content/10 bg-base-200/40 p-4 flex flex-col gap-3 min-w-0" data-test-share-export-panel>
        <h2 class="font-bold">Share from your account</h2>
        <p v-if="!roster.length" class="text-sm text-base-content/70" data-test-share-empty>
          No character is set up yet (a weapon equipped). Build one in the calculator, or import your data under Settings, then come back to share it.
        </p>
        <template v-else>
          <div class="flex flex-col gap-1.5">
            <span class="text-xs font-semibold uppercase tracking-wide text-base-content/60">A build</span>
            <div class="flex flex-wrap gap-2">
              <select v-model="pickChar" class="select select-bordered select-sm flex-1 min-w-[9rem]" aria-label="Character" data-test-share-pick-character>
                <option v-for="c in roster" :key="c.key" :value="c.key">{{ c.name }} · S{{ c.sequence }}</option>
              </select>
              <select v-if="builds.length > 1" v-model="pickBuild" class="select select-bordered select-sm flex-1 min-w-[9rem]" aria-label="Build" data-test-share-pick-build>
                <option v-for="b in builds" :key="b.id" :value="b.id">{{ b.name }}{{ b.active ? " (active)" : "" }}</option>
              </select>
              <button type="button" class="btn btn-sm btn-primary" :disabled="!pickChar" data-test-share-open-build @click="openBuild">Share build…</button>
            </div>
          </div>
          <div class="flex flex-col gap-1.5">
            <span class="text-xs font-semibold uppercase tracking-wide text-base-content/60">A team</span>
            <div v-if="teamOptions.length" class="flex flex-wrap gap-2">
              <select v-model="pickTeam" class="select select-bordered select-sm flex-1 min-w-[9rem] max-w-full" aria-label="Team" data-test-share-pick-team>
                <option v-for="t in teamOptions" :key="t.id" :value="t.id">{{ t.name }}</option>
              </select>
              <button type="button" class="btn btn-sm" :disabled="!pickTeam" data-test-share-open-team @click="openTeam">Share team…</button>
            </div>
            <p v-else class="text-sm text-base-content/60">No saved team has a member set up yet.</p>
          </div>
        </template>
      </section>
    </div>

    <details class="mt-5 text-sm text-base-content/75 max-w-3xl">
      <summary class="cursor-pointer font-semibold text-base-content">How share cards work</summary>
      <ul class="list-disc pl-5 mt-2 flex flex-col gap-1">
        <li>A card is a normal PNG with the build (character, weapon, echoes with every substat, buff settings, the rotation behind the number) in a text chunk. Image viewers ignore it; this page reads it.</li>
        <li>Discord attachments, e-mail, cloud drives and AirDrop keep the file as it is. Reddit, X and Imgur re-compress uploads, which drops the data — share the link there.</li>
        <li>Importing only adds: a new build (your active one stays), echoes you don't own yet, and for a team a new saved team. Characters or gear this app doesn't have yet are skipped and named.</li>
        <li>The number on a card is this app's engine on the sharer's build: the best of its rotations against a level-100 enemy with 20 % resistance (the /my-rankings target).</li>
        <li>Cards from <a href="https://github.com/DJ12421/Tacet-Lab" target="_blank" rel="noopener" class="link">Tacet Lab</a> load too (gear only); its card format is read with credit, GPL-3.0.</li>
      </ul>
    </details>

    <div v-if="dragging" class="share-page__overlay pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-base-100/70 backdrop-blur-sm">
      <div class="rounded-2xl border-2 border-dashed border-primary bg-base-100 px-8 py-6 text-lg font-semibold shadow-xl">Drop the card to load it</div>
    </div>

    <ShareSheet ref="sheet" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Nav from "../../components/navigation/Nav.vue";
import { useDocumentTitle } from "../../composables/useDocumentTitle";
import { useToast } from "../../composables/useToast";
import { characterPortraitUrl, getCharacterRosterDisplayName } from "../../characters/characters";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { useSettingsStore } from "../../stores/settings";
import { getThemeStyle } from "../../composables/useTheme";
import { sequenceOf } from "../myRankings/rankRoster";
import CardPreview from "./CardPreview.vue";
import ShareSheet from "./ShareSheet.vue";
import { isKnownCharacter, type SharePayload } from "./buildCodec";
import { cardView, type CardView } from "./cardView";
import { compactNumber, verifyBuildHeadline } from "./headline";
import { readShareLink, fragmentOf } from "./link";
import { applyImport, planImport, type ImportPlan } from "./mergePreview";
import { readCardFile, type CardRead } from "./readCard";

useDocumentTitle(
  "Share & import builds — Wuthering Waves Calculator & Optimizer",
  "Share a Wuthering Waves build or team as a card that carries the build inside the image, or as a link — and load one back exactly, with no screenshot reading.",
);

const route = useRoute();
const router = useRouter();
const { showToast } = useToast();
const characterStore = useCharacterStore();
const inventoryStore = useInventoryStore();
const teamStore = useTeamRotationsStore();
const settingsStore = useSettingsStore();

type Loaded = { payload: SharePayload; readOnly: boolean; newerVersion?: number; warnings: string[] };
const loaded = ref<Loaded | null>(null);
const loadedView = ref<CardView | null>(null);
/** shown in place of the card picture when there is nothing to draw (no character this app has) */
const previewNote = ref<string | null>(null);
const verified = ref<number | null>(null);
const readError = ref<Extract<CardRead, { ok: false }> | null>(null);
const reading = ref(false);
const applying = ref(false);
const applied = ref<{ builds: Array<{ charId: string; buildId: string; buildName: string; newCharacter: boolean }>; team: string | null } | null>(null);
const linkText = ref("");
const sheet = ref<InstanceType<typeof ShareSheet> | null>(null);

const characters = computed(() => (characterStore.characters ?? {}) as Record<string, any>);
const account = computed(() => ({ characters: characters.value, echoes: (inventoryStore.echoes ?? []) as any[], teams: (teamStore.teams ?? []) as any[] }));
const plan = computed<ImportPlan | null>(() => (loaded.value ? planImport(loaded.value.payload, account.value, { readOnly: loaded.value.readOnly }) : null));

// the received card is previewed in the app's own light / dark style, and follows a theme switch while it is open
const appThemeStyle = computed<"dark" | "light">(() => {
  const theme = (settingsStore.config as { theme?: string } | null)?.theme;
  if (theme) return getThemeStyle(theme);
  return document.documentElement.getAttribute("data-theme-style") === "light" ? "light" : "dark";
});

const nameOf = (id: string | undefined): string => (id ? getCharacterRosterDisplayName(id) : "");
const headshot = (id: string): string => characterPortraitUrl(id);
const memberNames = computed(() => loaded.value?.payload.members.map((m) => nameOf(m.charId)).join(", ") ?? "");
const originLabel = computed(() => {
  const p = loaded.value?.payload;
  if (!p) return "";
  if (p.origin === "tacet-lab") return "from Tacet Lab";
  return `from WT+ ${p.app.replace(/^wtplus@/, "")}${p.createdAt ? ` · ${p.createdAt}` : ""}`;
});
const planSummary = computed(() => {
  const p = plan.value;
  // nothing importable: the blocker line under the list says why
  if (!p || p.members.every((m) => m.status === "skip")) return "";
  const total = p.owned + p.added + p.skippedEchoes;
  const parts: string[] = [];
  if (!total) parts.push("The card has no echoes.");
  else if (!p.added) parts.push(`All ${p.owned} echoes are already in your inventory, so none are added.`);
  else if (!p.owned) parts.push(`${p.added} ${p.added === 1 ? "echo goes" : "echoes go"} into your inventory.`);
  else parts.push(`${p.owned} of the echoes are already in your inventory; ${p.added} new ${p.added === 1 ? "one goes" : "ones go"} in.`);
  if (p.skippedEchoes) parts.push(`${p.skippedEchoes} ${p.skippedEchoes === 1 ? "is" : "are"} skipped.`);
  if (p.team) parts.push(`A team “${p.team.name} (shared)” is saved, pinned to these builds.`);
  parts.push("Nothing you have is replaced.");
  return parts.join(" ");
});
const verifyLine = computed(() => {
  const h = loaded.value?.payload.headline;
  if (!h || verified.value === null) return "";
  const same = Math.abs(verified.value - h.value) <= Math.max(1, h.value * 0.0005);
  return same
    ? `Checked here: this app's engine reads ${compactNumber(verified.value)} on the card's own build and rotation — the same as the card.`
    : `Checked here: this app reads ${compactNumber(verified.value)} on the card's build and rotation; the card says ${compactNumber(h.value)}. The app version the card was made with (${loaded.value?.payload.app ?? "unknown"}) or a setting that doesn't travel in the card explains the gap.`;
});

// a newer read wins: a slow render or engine check from an earlier card never lands on a later one
let showToken = 0;

async function show(result: CardRead | { ok: true; payload: SharePayload; readOnly: boolean; newerVersion?: number; warnings: string[] }) {
  const token = ++showToken;
  applied.value = null;
  if (!result.ok) {
    readError.value = result;
    loaded.value = null;
    return;
  }
  readError.value = null;
  loaded.value = { payload: result.payload, readOnly: result.readOnly, newerVersion: result.newerVersion, warnings: result.warnings };
  loadedView.value = null;
  previewNote.value = null;
  verified.value = null;
  const p = result.payload;
  window.scrollTo({ top: 0, behavior: "smooth" });
  // only characters this app ships are rendered (released content only)
  const shown = { ...p, members: p.members.filter((m) => isKnownCharacter(m.charId)) };
  if (!shown.members.length) {
    previewNote.value = "Nothing on this card is in this app yet, so there's no picture to show.";
    return;
  }
  try {
    const v = await cardView(shown);
    if (token !== showToken) return;
    loadedView.value = v;
  } catch {
    if (token === showToken) previewNote.value = "The card's picture couldn't be drawn here; what importing it would add is listed beside it.";
    return;
  }
  const checked = await verifyBuildHeadline(p);
  if (token === showToken) verified.value = checked;
}

async function readFile(file: File | Blob) {
  reading.value = true;
  try {
    await show(await readCardFile(file));
  } catch {
    readError.value = { ok: false, reason: "invalid", message: "That file couldn't be read." };
  } finally {
    reading.value = false;
  }
}

function onFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) void readFile(file);
  input.value = "";
}

async function openLink() {
  const r = await readShareLink(linkText.value);
  if (r.ok) {
    linkText.value = "";
    await show(r.readOnly ? { ok: true, payload: r.payload, readOnly: true, newerVersion: r.newerVersion, warnings: r.warnings } : { ok: true, payload: r.payload, readOnly: false, warnings: r.warnings });
  } else {
    readError.value = { ok: false, reason: "invalid", message: r.error };
  }
}

// a share link opened directly: /share#b=…
async function openHash(hash: string) {
  if (!fragmentOf(hash)) return;
  const r = await readShareLink(hash);
  if (r.ok) await show(r.readOnly ? { ok: true, payload: r.payload, readOnly: true, newerVersion: r.newerVersion, warnings: r.warnings } : { ok: true, payload: r.payload, readOnly: false, warnings: r.warnings });
  else readError.value = { ok: false, reason: "invalid", message: r.error };
}
watch(
  () => route.hash,
  (h) => {
    if (h && h.includes("b=")) void openHash(h);
  },
  { immediate: true },
);

const dragging = ref(false);
let dragDepth = 0;
function onDragEnter(e: DragEvent) {
  if (!e.dataTransfer?.types?.includes("Files")) return;
  dragDepth += 1;
  dragging.value = true;
}
function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) dragging.value = false;
}
function onDrop(e: DragEvent) {
  dragDepth = 0;
  dragging.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (file) void readFile(file);
}

function onPaste(e: ClipboardEvent) {
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
  const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
  if (file) {
    e.preventDefault();
    void readFile(file);
    return;
  }
  const text = e.clipboardData?.getData("text") ?? "";
  if (fragmentOf(text)) {
    e.preventDefault();
    linkText.value = text;
    void openLink();
  }
}
onMounted(() => window.addEventListener("paste", onPaste));
onBeforeUnmount(() => window.removeEventListener("paste", onPaste));

function reset() {
  showToken += 1;
  loaded.value = null;
  loadedView.value = null;
  previewNote.value = null;
  readError.value = null;
  applied.value = null;
  verified.value = null;
  if (route.hash) void router.replace({ hash: "" });
}

async function confirmImport() {
  if (!loaded.value || !plan.value?.canApply) return;
  applying.value = true;
  try {
    const p = loaded.value.payload;
    const acct = { characters: JSON.parse(JSON.stringify(characters.value)), echoes: account.value.echoes, teams: account.value.teams };
    const fresh = planImport(p, acct, { readOnly: loaded.value.readOnly });
    const result = await applyImport(p, fresh, acct);
    inventoryStore.$patch((s: any) => {
      for (const e of result.newEchoes) s.echoes.push(e);
      for (const [id, map] of Object.entries(result.equipped)) s.equipped[id] = { ...(s.equipped[id] ?? {}), ...map };
    });
    characterStore.$patch((s: any) => {
      for (const [id, rec] of Object.entries(result.characters)) s.characters[id] = rec;
    });
    let teamName: string | null = null;
    if (result.team) teamName = (teamStore.importTeam(result.team) as { name?: string } | undefined)?.name ?? String(result.team.name);
    applied.value = { builds: result.builds, team: teamName };
    showToast(`Added ${result.builds.length === 1 ? `“${result.builds[0].buildName}” to ${nameOf(result.builds[0].charId)}` : `${result.builds.length} builds`}${result.newEchoes.length ? ` and ${result.newEchoes.length} echoes` : ""}.`, "success", 6000);
    if (route.hash) void router.replace({ hash: "" });
  } catch (err) {
    showToast(err instanceof Error ? err.message : "The import failed; nothing was changed.", "error", 7000);
  } finally {
    applying.value = false;
  }
}

function openCalculator(charId: string | undefined) {
  if (charId) characterStore.setActiveCharacter(charId);
  void router.push("/");
}

// --- share from the account
const roster = computed(() =>
  Object.entries(characters.value)
    .filter(([id, rec]) => rec?.weapon && isKnownCharacter(id))
    .map(([id, rec]) => ({ key: id, name: nameOf(id), sequence: sequenceOf(rec) }))
    .sort((a, b) => a.name.localeCompare(b.name)),
);
const pickChar = ref("");
const pickBuild = ref<string | null>(null);
const pickTeam = ref("");
const builds = computed(() => {
  const rec = characters.value[pickChar.value];
  return ((rec?.builds ?? []) as Array<{ id: string; name: string }>).map((b) => ({ id: b.id, name: b.name, active: b.id === rec?.activeBuildId }));
});
watch(
  roster,
  (r) => {
    if (!pickChar.value || !r.some((c) => c.key === pickChar.value)) {
      const active = characterStore.activeCharacter as string;
      pickChar.value = r.find((c) => c.key === active)?.key ?? r[0]?.key ?? "";
    }
  },
  { immediate: true },
);
watch(pickChar, () => {
  pickBuild.value = (characters.value[pickChar.value]?.activeBuildId as string | undefined) ?? null;
}, { immediate: true });
const teamOptions = computed(() =>
  ((teamStore.teams ?? []) as Array<{ id: string; name: string; characterIds: Array<string | null> }>).filter((t) => (t.characterIds ?? []).some((id) => id && characters.value[id])),
);
watch(teamOptions, (t) => {
  if (!t.some((x) => x.id === pickTeam.value)) pickTeam.value = t[0]?.id ?? "";
}, { immediate: true });

function openBuild() {
  if (pickChar.value) void sheet.value?.open({ kind: "build", charId: pickChar.value, buildId: pickBuild.value });
}
function openTeam() {
  if (pickTeam.value) void sheet.value?.open({ kind: "team", teamId: pickTeam.value });
}
</script>

<style scoped>
.share-page__skeleton {
  aspect-ratio: 1200 / 630;
}
</style>
