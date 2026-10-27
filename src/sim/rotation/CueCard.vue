<template>
  <div class="flex flex-col gap-4" data-test-rotation-cue>
    <!-- loop target + actions -->
    <div class="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-box bg-base-200/70 px-4 py-3">
      <div class="flex items-baseline gap-2" data-test-rotation-loop-target>
        <span class="text-xs uppercase tracking-wider opacity-60">Loop target</span>
        <span class="text-2xl font-bold tabular-nums">{{ plan.loopTarget.toFixed(1) }}<span class="text-base font-semibold opacity-70"> s</span></span>
      </div>
      <div class="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <span v-if="opener"><span class="opacity-60">Opener</span> <b class="tabular-nums">{{ opener.seconds.toFixed(1) }} s</b></span>
        <span><span class="opacity-60">Fight</span> <b class="tabular-nums">{{ durationText(plan.fightSeconds) }}</b> <span class="opacity-60">({{ loopCount }} loops)</span></span>
        <span :title="`Opener + whole loops in two minutes at the engine's pace`"><span class="opacity-60">In 2:00</span> <b class="tabular-nums">opener + {{ budgetLoops }} loops</b></span>
      </div>
      <div class="flex flex-wrap gap-2 ml-auto max-sm:ml-0 max-sm:w-full">
        <button type="button" class="btn btn-sm btn-primary max-sm:flex-1" data-test-rotation-play-open @click="playOpen = true">
          <svg viewBox="0 0 24 24" class="size-4" fill="currentColor" aria-hidden="true"><path d="M7 5l12 7-12 7z" /></svg>
          Play along
        </button>
        <button type="button" class="btn btn-sm max-md:hidden" :title="pip.pipSupported ? 'A small always-on-top window over a borderless game' : 'A small popup window (this browser has no Picture-in-Picture for pages)'" data-test-rotation-pop @click="popOut">
          <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><rect x="12" y="11" width="7" height="6" rx="1" fill="currentColor" /></svg>
          {{ pip.mode.value ? "Popped out" : "Pop out" }}
        </button>
        <button type="button" class="btn btn-sm" title="Copy the cue card as text for Discord" data-test-rotation-copy @click="copyDiscord">
          <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" /></svg>
          <span class="max-sm:hidden">Copy for Discord</span><span class="sm:hidden">Copy</span>
        </button>
      </div>
    </div>
    <div v-if="pip.blocked.value" class="alert alert-warning py-2 text-sm" data-test-rotation-pop-blocked>
      The pop-out window was blocked. Allow popups for this site, or use Play along on a second screen (a phone works).
    </div>

    <!-- the blocks -->
    <section v-for="block in plan.blocks" :key="block.key" class="rounded-box border border-base-300 bg-base-100 overflow-hidden" :data-test-rotation-block="block.key">
      <header class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2 bg-base-200/60 border-b border-base-300">
        <h3 class="font-bold">{{ block.title }}<span v-if="block.repeat > 1" class="opacity-60"> ×{{ block.repeat }}</span></h3>
        <span class="text-sm opacity-70 tabular-nums">{{ block.seconds.toFixed(1) }} s{{ block.repeat > 1 ? " each" : "" }}</span>
        <span v-if="block.varies" class="text-xs opacity-60" title="The folded loops press the same buttons; a cancel or a wait differs between them. This is the last of them.">· cancels and waits vary a little between these loops</span>
        <span class="ml-auto text-xs opacity-60 tabular-nums" :title="'Damage dealt while this block runs, every member'">{{ compact(block.damage) }} dmg</span>
      </header>
      <ol class="divide-y divide-base-300/70">
        <li
          v-for="v in block.visits"
          :key="v.index"
          class="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[9.5rem_1fr_auto] items-start gap-x-3 gap-y-1.5 px-4 py-2.5"
          :data-test-rotation-visit="members[v.member]!.name"
        >
          <div class="flex items-center gap-2 min-w-0 pt-0.5">
            <MemberAvatar :app-key="members[v.member]!.appKey" :name="members[v.member]!.name" :hue="hueOf(v.member)" :size="24" />
            <span class="font-semibold truncate text-sm rv-hue-text" :style="{ '--hue': hueOf(v.member) }">{{ members[v.member]!.name }}</span>
          </div>
          <div class="text-sm max-sm:col-span-3 max-sm:row-start-2">
            <CueChips :visit="v" />
          </div>
          <div class="text-sm tabular-nums text-right pt-0.5 max-sm:col-start-3 max-sm:row-start-1" :title="`${clockOf(v.start)} – ${clockOf(v.end)} on the fight clock`">
            {{ v.seconds.toFixed(1) }} s
          </div>
        </li>
      </ol>
    </section>

    <div class="flex flex-col gap-1 text-xs opacity-70">
      <p v-if="plan.wrap">…then {{ members[plan.wrap.member]!.name }} again: the loop starts over.</p>
      <p>
        <span class="rv-cp rv-cp--energy mr-1">R ready</span>
        <span class="rv-cp rv-cp--concerto mr-1">Outro ready</span>
        <span class="rv-cp rv-cp--tune mr-1">Tune Break</span>
        mark where the gauge fills (read after each press). A dot on a chip = cast in the enhanced (Forte) state; a word after the press (jump, dodge, swap, hold) = the cancel it ends on.
      </p>
      <p>
        Seconds are wuwa_calc's frame-tight timings, every cancel and swap on its earliest frame. Expect to run a little slower:
        the stopwatch in Play along shows the gap, not a pass or fail.
      </p>
    </div>

    <CuePlay
      :open="playOpen"
      :player="player"
      :plan="plan"
      :members="members"
      :hues="hues"
      :prefs="prefs"
      :title="title"
      :can-pop="true"
      @close="playOpen = false"
      @pop="popOut"
    />
    <Teleport v-if="pip.mount.value" :to="pip.mount.value">
      <CueStage compact :player="player" :plan="plan" :members="members" :hues="hues" />
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useToast } from "../../composables/useToast";
import type { RunMember } from "../engine/rileyRun";
import CueChips from "./CueChips.vue";
import CuePlay from "./CuePlay.vue";
import CueStage from "./CueStage.vue";
import { durationText, loopsIn, type CuePlan } from "./cueModel";
import { discordMessage } from "./exportText";
import { clockOf, type RotationModel } from "./extract";
import MemberAvatar from "./MemberAvatar.vue";
import type { RotationPrefs } from "./prefs";
import { usePip } from "./usePip";
import { usePlayer } from "./usePlayer";

const props = defineProps<{ model: RotationModel; plan: CuePlan; hues: Map<string, string>; prefs: RotationPrefs; title: string; spreadLabel: string }>();

const members = computed<RunMember[]>(() => props.model.run.members);
const opener = computed(() => props.plan.blocks.find((b) => b.key === "opener") ?? null);
const loopCount = computed(() => props.plan.sectionSeconds.length - 1);
const budgetLoops = computed(() => loopsIn(120, opener.value?.seconds ?? 0, props.plan.loopTarget));
const hueOf = (i: number): string => props.hues.get(members.value[i]?.name ?? "") ?? "";
const compact = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n)));

const pip = usePip();
const playOpen = ref(false);
const player = usePlayer(
  computed(() => props.plan),
  { beep: computed(() => props.prefs.beep), pace: computed(() => props.prefs.pace), host: pip.win },
);

// the clock runs while either view shows it
watch([playOpen, pip.mount], ([play, mount]) => {
  if (play || mount) player.open();
  else player.close();
});

function onPipKey(e: KeyboardEvent): void {
  if (e.key === " " || e.key === "ArrowRight" || e.key === "Enter" || e.key === "PageDown") {
    e.preventDefault();
    player.advance();
  } else if (e.key === "ArrowLeft" || e.key === "Backspace" || e.key === "PageUp") {
    e.preventDefault();
    player.back();
  } else if (e.key === "p" || e.key === "P") player.togglePause();
}
watch(pip.win, (w, old) => {
  old?.removeEventListener("keydown", onPipKey);
  w?.addEventListener("keydown", onPipKey);
});

async function popOut(): Promise<void> {
  const ok = await pip.open({ width: 340, height: 220, title: `${props.title} — cue` });
  if (ok) playOpen.value = false;
}

const { showToast } = useToast();
async function copyDiscord(): Promise<void> {
  const url = typeof location === "undefined" ? "" : location.href;
  const msg = discordMessage(props.model, props.plan, { url, spreadLabel: props.spreadLabel });
  try {
    await navigator.clipboard.writeText(msg.text);
    showToast(
      msg.fits ? (msg.cancels ? "Cue card copied: paste it into Discord." : "Cue card copied without the cancel marks, to fit one Discord message.") : "Cue card copied. It is longer than one Discord message (2,000 characters).",
      msg.fits ? "success" : "warning",
    );
  } catch {
    showToast("The browser refused the clipboard.", "error");
  }
}
</script>
