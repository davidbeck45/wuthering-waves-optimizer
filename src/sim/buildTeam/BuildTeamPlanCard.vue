<template>
  <article class="bt-card bt-plan" :data-test-build-team-plan="characterId">
    <header class="bt-card__head">
      <span class="bt-prio" :title="`Priority ${priority}: picks echoes ${priority === 1 ? 'first' : priority === 2 ? 'second' : 'third'}`">{{ priority }}</span>
      <CharacterAvatar :id="characterId" :size="44" dot />
      <div class="bt-card__who">
        <div class="bt-card__name">{{ name }}</div>
        <div class="bt-card__role">{{ role }}</div>
      </div>
      <div class="bt-move" role="group" :aria-label="`Priority of ${name}`">
        <button type="button" class="btn btn-ghost btn-xs btn-square" :disabled="priority === 1" :aria-label="`Move ${name} up`" data-test-build-team-move-up @click="$emit('move', -1)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" class="size-4" aria-hidden="true"><path d="M6 15l6-6 6 6" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
        <button type="button" class="btn btn-ghost btn-xs btn-square" :disabled="priority === count" :aria-label="`Move ${name} down`" data-test-build-team-move-down @click="$emit('move', 1)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" class="size-4" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
      </div>
    </header>

    <div class="bt-plan__source">
      <span class="bt-chip" :class="`bt-chip--${plan.source}`">{{ sourceLabel }}</span>
      <span v-if="plan.note && plan.source !== 'riley'" class="bt-plan__note" :title="plan.note">{{ plan.note }}</span>
      <span v-else-if="plan.source === 'riley' && plan.dps" class="bt-plan__note">{{ fmtInt(plan.dps) }} DPS in his run</span>
    </div>

    <dl class="bt-plan__rows">
      <div class="bt-row">
        <dt>Sets</dt>
        <dd>
          <span v-if="!plan.sets.length" class="opacity-60">Any set</span>
          <span v-for="s in plan.sets" :key="s.key" class="bt-set" :class="{ 'bt-off': !options.useSets }">
            <img v-if="setIcon(s.key)" :src="setIcon(s.key)!" alt="" class="size-4" loading="lazy" />
            <span>{{ setName(s.key) }}</span><span class="bt-set__n">{{ s.pieces }}pc</span>
          </span>
        </dd>
      </div>
      <div class="bt-row">
        <dt>Main echo</dt>
        <dd>
          <template v-if="options.keepMainEcho && currentMainEcho">
            <img v-if="echoImage(currentMainEcho)" :src="echoImage(currentMainEcho)!" alt="" class="bt-echo-pic" loading="lazy" />
            <span>{{ echoName(currentMainEcho) }}</span><span class="bt-mini">kept</span>
          </template>
          <template v-else-if="plan.mainEcho">
            <img v-if="echoImage(plan.mainEcho.keys[0])" :src="echoImage(plan.mainEcho.keys[0])!" alt="" class="bt-echo-pic" loading="lazy" />
            <span>{{ plan.mainEcho.name }}</span>
          </template>
          <span v-else class="opacity-60">The optimizer's pick</span>
        </dd>
      </div>
      <div class="bt-row">
        <dt>Main stats</dt>
        <dd class="bt-layout" :class="{ 'bt-off': !options.useMainStats }">
          <template v-if="groups.length">
            <span class="bt-layout__code">{{ plan.mainStats!.layout }}</span>
            <span v-for="g in groups" :key="g.cost" class="bt-cost">
              <span class="bt-cost__n">{{ g.cost }}</span>{{ g.stats.join(" · ") }}
            </span>
          </template>
          <span v-else class="opacity-60">Any layout</span>
        </dd>
      </div>
      <div class="bt-row bt-row--er">
        <dt><label :for="`bt-er-${characterId}`">ER floor</label></dt>
        <dd>
          <label class="bt-er">
            <input
              :id="`bt-er-${characterId}`"
              type="number"
              inputmode="decimal"
              min="0"
              max="400"
              step="0.1"
              class="input input-bordered input-sm bt-er__input"
              :value="erFloor ?? ''"
              placeholder="none"
              :data-test-build-team-er="characterId"
              @change="onEr(($event.target as HTMLInputElement).value)" />
            <span class="bt-er__pct">%</span>
          </label>
          <span class="bt-er__hint">
            {{ erHint }}<template v-if="currentEr != null"> · you have <b :class="{ 'bt-short': erFloor != null && currentEr + 1e-6 < erFloor }">{{ pctText(currentEr) }}</b></template>
          </span>
        </dd>
      </div>
      <div class="bt-row">
        <dt>Scored on</dt>
        <dd class="text-sm">{{ objective }}</dd>
      </div>
    </dl>
    <p v-if="plan.unmapped.length" class="bt-plan__warn">Not in this app: {{ plan.unmapped.join(", ") }}</p>
  </article>
</template>

<script setup lang="ts">
// Wuthering Tools+ "Build it for me" — step 1: one member's plan (the wuwa_calc pick, a preset or their own build),
// their priority, and the Energy Regen floor the run must keep (editable).
import { computed } from "vue";
import CharacterAvatar from "../display/CharacterAvatar.vue";
import { characterDisplayName } from "../display/names";
import type { BuildOptions } from "./constraints";
import type { MemberPlan } from "./rileyPlan";
import { echoImage, echoName, fmtInt, layoutGroups, pctText, PLAN_SOURCE_LABEL, roleLine, setIcon, setName } from "./buildTeamView";

const props = defineProps<{
  plan: MemberPlan;
  characterId: string;
  priority: number;
  count: number;
  erFloor: number | null;
  currentEr: number | null;
  currentMainEcho: string | null;
  options: BuildOptions;
  objective: string;
}>();
const emit = defineEmits<{ move: [delta: number]; "update:erFloor": [value: number | null] }>();

const name = computed(() => characterDisplayName(props.characterId));
const role = computed(() => roleLine(props.plan));
const sourceLabel = computed(() => PLAN_SOURCE_LABEL[props.plan.source]);
const groups = computed(() => layoutGroups(props.plan));
const erHint = computed(() => {
  if (props.plan.erSetBy === "kit") return "the kit's own floor";
  if (props.plan.erSetBy === "loop") return "what wuwa_calc's loop needs";
  return props.plan.source === "riley" ? "no energy gate" : "no measured need";
});

function onEr(raw: string): void {
  const v = raw.trim() === "" ? null : Number(raw);
  emit("update:erFloor", v == null || !Number.isFinite(v) || v <= 0 ? null : Math.round(v * 10) / 10);
}
</script>
