<template>
  <div class="cnr" :data-test-convene-new-resonator="characterKey">
    <p class="cnr__lead">
      wuwa_calc can run {{ name }}'s teams at your account as if you had one copy: S0, with a weapon that is not a signature. It says whether any main DPS you own gets a better team.
    </p>
    <div class="cnr__actions">
      <button v-if="state !== 'running'" type="button" class="btn btn-sm btn-outline" data-test-convene-new-resonator-run @click="run">
        {{ verdict ? `Check ${name} again` : `Check ${name} on my account` }}
      </button>
      <template v-else>
        <span class="cnr__busy" role="status" aria-live="polite" data-test-convene-new-resonator-busy>
          <span class="loading loading-spinner loading-xs" aria-hidden="true"></span>
          Running wuwa_calc{{ progress.total ? `: ${progress.done} of ${progress.total} teams` : "…" }}
        </span>
        <button type="button" class="btn btn-ghost btn-xs" data-test-convene-new-resonator-cancel @click="cancel">Cancel</button>
      </template>
    </div>
    <div v-if="verdict" class="cnr__verdict" :data-tone="verdict.tone" role="status" data-test-convene-new-resonator-verdict>
      <p class="cnr__headline">{{ verdict.headline }}</p>
      <ul v-if="verdict.lines.length" class="cnr__lines">
        <li v-for="line in verdict.lines" :key="line">{{ line }}</li>
      </ul>
      <p class="cnr__foot">
        wuwa_calc's engine at your account, on your own echoes (his standard substats for {{ name }}, who has none). DPS is damage per second in his engine: compare it with Team rankings, not with the
        calculator's damage.
      </p>
    </div>
    <p v-if="error" class="cnr__error" role="alert" data-test-convene-new-resonator-error>{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ — on the pull advisor, under a featured resonator the account does not own: one button that asks
// wuwa_calc what a copy would add (newResonator.ts has the why and the wording). Runs only when asked: the solve is a
// few hundred team runs in the app's one solver worker (no new worker), a few seconds on a phone. Nothing is stored:
// the solves stay in the selector's session memory (selectorRiley.ts), so a second press is instant.
import { onBeforeUnmount, ref, shallowRef, toRaw } from "vue";
import { useCharacterStore } from "../../../stores/character";
import { useInventoryStore } from "../../../stores/inventory";
import { useTeamRotationsStore } from "../../../stores/teamRotations";
import { useRileyAccount } from "../../engine/useRileyAccount";
import { newResonatorVerdict, type NewResonatorVerdict } from "../newResonator";

const props = defineProps<{ characterKey: string; name: string }>();

const characterStore = useCharacterStore();
const inventoryStore = useInventoryStore();
const teamStore = useTeamRotationsStore();
const rileyAccount = useRileyAccount();

const state = ref<"idle" | "running">("idle");
const progress = ref({ done: 0, total: 0 });
const verdict = shallowRef<NewResonatorVerdict | null>(null);
const error = ref<string | null>(null);
let controller: AbortController | null = null;

const plain = <T,>(value: T): T => JSON.parse(JSON.stringify(toRaw(value ?? null)));

async function run(): Promise<void> {
  if (state.value === "running") return;
  controller = new AbortController();
  const signal = controller.signal;
  state.value = "running";
  error.value = null;
  progress.value = { done: 0, total: 0 };
  try {
    // loaded on the press: the selector pulls in the roster ranking, which the Convene page does not need to open
    const [{ rankResonatorPool }, { browserSelectorRiley }] = await Promise.all([import("../../weaponValue/selector"), import("../../weaponValue/selectorRiley")]);
    const riley = await browserSelectorRiley(toRaw(rileyAccount.value), signal);
    const rows = await rankResonatorPool(
      {
        items: [props.characterKey],
        characters: plain(characterStore.characters) ?? {},
        echoes: plain(inventoryStore.echoes) ?? [],
        teams: plain(teamStore.teams) ?? [],
        // no roster ranking: that side scores the next copy of a resonator the account owns, which this one is not
        ranking: null,
      },
      riley,
      { signal, onProgress: (p) => (progress.value = { done: p.done, total: p.total }) },
    );
    if (signal.aborted) return;
    const row = rows[0];
    if (!row) throw new Error("no answer came back");
    verdict.value = newResonatorVerdict(row, props.name);
  } catch (err) {
    if (!signal.aborted) error.value = `wuwa_calc could not run ${props.name}'s teams: ${err instanceof Error ? err.message : String(err)}. Nothing was changed; try again.`;
  } finally {
    if (controller?.signal === signal) controller = null;
    state.value = "idle";
  }
}

function cancel(): void {
  controller?.abort();
  state.value = "idle";
}

onBeforeUnmount(() => controller?.abort());
</script>

<style scoped>
.cnr {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid oklch(var(--bc) / 0.1);
  min-width: 0;
}
/* the tab's body ink at 0.8: 4.5 to 1 and better on every theme (the 0.7 beside it is the tab's own muted line) */
.cnr__lead,
.cnr__foot {
  color: oklch(var(--bc) / 0.8);
}
.cnr__lead {
  font-size: 0.875rem;
  line-height: 1.5;
}
.cnr__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
.cnr__busy {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.875rem;
}
.cnr__verdict {
  margin-top: 0.75rem;
  padding: 0.75rem 0.85rem;
  border-radius: var(--rounded-box, 1rem);
  border: 1px solid oklch(var(--bc) / 0.12);
  background: oklch(var(--b2) / 0.6);
  overflow-wrap: anywhere;
}
.cnr__verdict[data-tone="gain"] {
  border-color: oklch(var(--su) / 0.55);
}
.cnr__headline {
  font-weight: 600;
  line-height: 1.4;
}
.cnr__lines {
  margin-top: 0.4rem;
  padding-left: 1.1rem;
  list-style: disc;
  font-size: 0.875rem;
  line-height: 1.5;
}
.cnr__lines li + li {
  margin-top: 0.3rem;
}
.cnr__foot {
  margin-top: 0.6rem;
  font-size: 0.75rem;
  line-height: 1.5;
}
.cnr__error {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  line-height: 1.5;
}
</style>
