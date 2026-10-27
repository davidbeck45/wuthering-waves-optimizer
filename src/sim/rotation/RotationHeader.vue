<template>
  <div class="flex flex-col gap-3" data-test-rotation-header>
    <div class="grid gap-2 grid-cols-1 sm:grid-cols-3">
      <div
        v-for="m in run.members"
        :key="m.name"
        class="flex items-center gap-2 sm:gap-3 rounded-box border border-base-300 bg-base-100 px-3 py-1.5 sm:py-2 min-w-0"
        :data-test-rotation-member="m.name"
      >
        <MemberAvatar :app-key="m.appKey" :name="m.name" :hue="hueOf(m.name)" :size="avatarSize" />
        <div class="min-w-0 flex-1 max-sm:flex max-sm:items-center max-sm:gap-2">
          <div class="flex items-baseline gap-2 min-w-0 max-sm:flex-1">
            <span class="font-bold truncate rv-hue-text max-sm:text-sm" :style="{ '--hue': hueOf(m.name) }">{{ m.name }}</span>
            <span class="text-xs shrink-0" :class="m.owned ? 'opacity-70' : 'rv-warn-text'" :title="m.owned ? undefined : notYoursTitle(m)">S{{ m.sequence }}<span class="sm:hidden"> R{{ m.refinement }}{{ m.owned ? "" : "*" }}</span></span>
            <span v-if="!m.owned" class="badge badge-outline badge-xs shrink-0 max-sm:hidden rv-warn-text" :title="notYoursTitle(m)" data-test-rotation-not-owned>not yours</span>
          </div>
          <div class="text-xs opacity-80 truncate max-sm:hidden" :title="`${m.weapon} R${m.refinement}${m.weaponApproximated ? ' (stand-in: your weapon is not on this loadout list)' : ''}`">
            {{ m.weapon }} R{{ m.refinement }}<span v-if="m.weaponApproximated" class="opacity-70"> · stand-in</span>
          </div>
          <div class="text-xs opacity-60 truncate max-sm:hidden" :title="`${m.echo} · ${m.mainStats} · ${m.spread}`">{{ m.echo }}</div>
          <div class="sm:mt-1 flex items-center gap-2 max-sm:w-[64px] max-sm:shrink-0" :title="`${int(m.dps)} DPS of the team's ${int(run.total)}`">
            <div class="h-1.5 flex-1 rounded-full bg-base-300 overflow-hidden">
              <div class="h-full rv-hue-dot" :style="{ width: `${Math.round(m.share * 100)}%`, '--hue': hueOf(m.name) }"></div>
            </div>
            <span class="text-[11px] tabular-nums opacity-70 shrink-0">{{ Math.round(m.share * 100) }} %</span>
          </div>
        </div>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
      <div class="flex items-baseline gap-2">
        <span class="text-2xl font-bold tabular-nums" data-test-rotation-dps>{{ int(run.total) }}</span>
        <span class="text-sm opacity-70">DPS</span>
      </div>
      <div class="text-sm opacity-70">
        {{ origin }} · wuwa_calc <span class="font-mono">{{ run.engine.commit }}</span>
      </div>
      <div class="flex flex-wrap items-center gap-2 ml-auto max-md:ml-0 max-sm:w-full">
        <label v-if="variants.length > 1" class="flex items-center gap-2 text-sm">
          <span class="opacity-70 max-sm:hidden">Loadout</span>
          <select class="select select-bordered select-sm max-w-[16rem]" :value="teamKey ?? ''" data-test-rotation-variant @change="emit('variant', ($event.target as HTMLSelectElement).value)">
            <option v-for="v in variants" :key="v.teamKey" :value="v.teamKey" :disabled="v.status !== 'ok'">
              {{ v.label }}{{ v.total != null ? ` · ${int(v.total)} DPS` : " · no build" }}
            </option>
          </select>
        </label>
        <div class="join max-sm:w-full" role="group" aria-label="Substats" data-test-rotation-subs>
          <button
            v-for="s in SPREADS"
            :key="s.value"
            type="button"
            class="btn btn-sm join-item max-sm:flex-1 max-sm:px-1 max-sm:text-xs"
            :class="subs === s.value ? 'btn-primary' : ''"
            :title="s.title"
            :data-test-rotation-subs-option="s.value"
            @click="emit('subs', s.value)"
          >
            {{ s.label }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { RunLite, RunMember, SubsMode } from "../engine/rileyRun";
import MemberAvatar from "./MemberAvatar.vue";
import type { Variant } from "./useRotationRun";

const props = defineProps<{ run: RunLite; hues: Map<string, string>; variants: Variant[]; teamKey: string | null; subs: SubsMode; exactRow: boolean }>();
const emit = defineEmits<{ subs: [SubsMode]; variant: [string] }>();

const SPREADS: Array<{ value: SubsMode; label: string; title: string }> = [
  { value: "mine", label: "My echoes", title: "Each member wears the substats of the echoes you have equipped (ChemX32 where you have none)" },
  { value: "standard", label: "ChemX32", title: "Riley's standard substat spread" },
  { value: "high", label: "High Invest", title: "Riley's High Invest substat spread" },
];

const hueOf = (name: string): string => props.hues.get(name) ?? "";
// a phone's three member cards share one row: a smaller portrait there
const avatarSize = typeof window !== "undefined" && window.matchMedia?.("(max-width: 639px)").matches ? 26 : 40;
const int = (n: number): string => Math.round(n).toLocaleString("en-US");
const origin = computed(() => (props.exactRow ? "the Team rankings row you opened" : "solved at your account"));
/** what the run wore for a member the account lacks (read off the run: a /rankings row keeps its own S / R) */
const notYoursTitle = (m: RunMember): string =>
  `Not on your account: ${props.exactRow ? "the row you opened runs" : "wuwa_calc runs"} them at S${m.sequence} with ${m.weapon} R${m.refinement}`;
</script>
