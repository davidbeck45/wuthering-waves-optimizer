<template>
  <article class="bt-card bt-result" :class="`bt-result--${outcome.status}`" :data-test-build-team-result="outcome.characterId" :data-status="outcome.status">
    <header class="bt-card__head">
      <span class="bt-prio" :title="`Picked echoes ${ordinal}`">{{ priority }}</span>
      <CharacterAvatar :id="outcome.characterId" :size="44" dot />
      <div class="bt-card__who">
        <div class="bt-card__name">{{ name }}</div>
        <div class="bt-card__role">{{ plan ? roleLine(plan) : "" }}</div>
      </div>
      <label v-if="outcome.status === 'ok' && outcome.draft" class="bt-save" :title="save ? 'Saved as a new build when you press Save' : 'Not saved'">
        <input type="checkbox" class="checkbox checkbox-sm checkbox-primary" :checked="save" :data-test-build-team-save-slot="outcome.characterId" @change="$emit('update:save', ($event.target as HTMLInputElement).checked)" />
        <span>Save</span>
      </label>
    </header>

    <template v-if="outcome.status === 'ok' && outcome.after && outcome.before">
      <div class="bt-nums">
        <div class="bt-num">
          <span class="bt-num__k">Now</span>
          <span class="bt-num__v tabular-nums" :title="fmtInt(outcome.before.value)">{{ compactNum(outcome.before.value) }}</span>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="bt-nums__arrow" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" /></svg>
        <div class="bt-num">
          <span class="bt-num__k">Built</span>
          <span class="bt-num__v bt-num__v--after tabular-nums" :title="fmtInt(outcome.after.value)" data-test-build-team-after>{{ compactNum(outcome.after.value) }}</span>
        </div>
        <span class="bt-delta" :class="`bt-delta--${tone}`" data-test-build-team-delta>{{ delta }}</span>
      </div>
      <p class="bt-nums__unit">
        avg damage on {{ objectiveLabel }}<template v-if="buffPart"> · {{ buffPart }}</template>
      </p>

      <div class="bt-er-line" :class="`bt-er-line--${band}`" data-test-build-team-er-line :data-band="band">
        <svg v-if="band === 'met'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" class="size-4" aria-hidden="true"><path d="M5 12l5 5 9-10" stroke-linecap="round" stroke-linejoin="round" /></svg>
        <svg v-else-if="band === 'short'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" class="size-4" aria-hidden="true"><path d="M12 8v5M12 17h.01" stroke-linecap="round" /></svg>
        <span>
          Energy Regen <b class="tabular-nums">{{ pctText(outcome.after.menuEr) }}</b>
          <template v-if="outcome.erFloor != null"> · need <span class="whitespace-nowrap">{{ pctText(outcome.erFloor) }}</span></template>
          <template v-else> · no floor</template>
        </span>
        <span v-if="outcome.before.menuEr != null && Math.abs((outcome.before.menuEr ?? 0) - (outcome.after.menuEr ?? 0)) > 0.05" class="bt-er-line__was">was {{ pctText(outcome.before.menuEr) }}</span>
      </div>

      <ul v-if="notes.length" class="bt-notes">
        <li v-for="(n, i) in notes" :key="i" :class="`bt-note--${n.tone}`">{{ n.text }}</li>
      </ul>

      <div class="bt-tiles">
        <BuildTeamEchoTile v-for="(p, i) in outcome.after.picks" :key="p.echo.echoId" :echo="p.echo" :slot="i" :source="p.source" :worn-by="p.wornBy" :shared-with="p.sharedWith" :character-id="outcome.characterId" />
      </div>

      <div v-if="buffNames.length" class="bt-buffs">
        <span class="bt-buffs__k">Switched on (was not set)</span>
        <span v-for="b in buffNames" :key="b" class="bt-mini">{{ b }}</span>
      </div>
      <p class="bt-from">
        Starts from {{ outcome.fromBuild.name ? `“${outcome.fromBuild.name}”` : "the active build" }}<template v-if="outcome.fromBuild.source === 'pinned'"> (pinned in this team)</template><template v-else-if="outcome.fromBuild.source === 'named'"> (named for this team)</template>: weapon, sequence and buffs kept, echoes replaced.
      </p>
    </template>

    <template v-else>
      <div class="bt-fail" role="status" :data-test-build-team-fail="outcome.status">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-5 shrink-0" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5h.01" stroke-linecap="round" /></svg>
        <div>
          <p class="font-semibold">{{ failTitle }}</p>
          <p class="text-sm opacity-80">{{ outcome.message }}</p>
          <div v-if="outcome.shortfall?.length" class="bt-short-list">
            <span v-for="s in outcome.shortfall" :key="s.cost" class="bt-mini">{{ s.have }} of {{ s.need }} × {{ shortfallText(s) }}</span>
          </div>
          <p v-if="outcome.status === 'noLoadout' || outcome.status === 'noEchoes'" class="mt-2 text-xs opacity-70">
            Try “Take echoes other characters wear”, or turn off “The plan's sets” in the options, then build again.
          </p>
        </div>
      </div>
    </template>
  </article>
</template>

<script setup lang="ts">
// Wuthering Tools+ "Build it for me" — step 3: one member's result. The numbers are the app's calculator on the
// produced build (avg damage on the objective, character-screen Energy Regen), the five echoes with where each comes
// from, and every caveat in words.
import { computed } from "vue";
import CharacterAvatar from "../display/CharacterAvatar.vue";
import { characterDisplayName } from "../display/names";
import BuildTeamEchoTile from "./BuildTeamEchoTile.vue";
import { shortfallText, type MemberOutcome } from "./buildTeam";
import type { MemberPlan } from "./rileyPlan";
import { parsePresetName } from "../presets/presetName";
import { buffDefaultNames, compactNum, deltaText, deltaTone, erBand, fmtInt, pctText, resultNotes, roleLine } from "./buildTeamView";

const props = defineProps<{ outcome: MemberOutcome; plan: MemberPlan | undefined; priority: number; save: boolean }>();
defineEmits<{ "update:save": [value: boolean] }>();

const name = computed(() => characterDisplayName(props.outcome.characterId));
const ordinal = computed(() => ["first", "second", "third"][props.priority - 1] ?? `${props.priority}th`);
const delta = computed(() => deltaText(props.outcome.before?.value, props.outcome.after?.value));
const tone = computed(() => deltaTone(props.outcome.before?.value, props.outcome.after?.value));
const band = computed(() => erBand(props.outcome));
const notes = computed(() => resultNotes(props.outcome, props.plan));
const buffNames = computed(() => buffDefaultNames(props.outcome.buffDefaults));
/** How much of the change is buffs switched on rather than echoes. */
const buffPart = computed(() => {
  const b = props.outcome.before;
  if (!b?.withRunBuffs || !(b.value > 0) || props.outcome.sameEchoes) return "";
  const buff = b.withRunBuffs / b.value - 1;
  if (Math.abs(buff) < 0.0005) return "";
  return `${buff > 0 ? "+" : "−"}${Math.abs(buff * 100).toFixed(1)} % of it from buffs switched on`;
});
const objectiveLabel = computed(() => {
  const o = props.outcome.objective;
  if (!o) return "their rotation";
  if (o.source === "team") return "their part of the team rotation";
  // a generated wuwa_calc / preset name reads as its short title ("Lynae S6R1 Spectrum Blaster R1 · …" → "Lynae")
  const title = parsePresetName(o.label).title;
  return `their best rotation, “${title || o.label}”`;
});
const failTitle = computed(() =>
  props.outcome.status === "skipped" ? "Skipped" : props.outcome.status === "noEchoes" ? "No echoes to build with" : "Not enough echoes",
);
</script>
