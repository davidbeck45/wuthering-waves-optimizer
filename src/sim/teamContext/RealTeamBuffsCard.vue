<!-- Wuthering Tools+ — "Use their real buffs" on the calculator's Team Buffs screen (batch 5, lane real-panel).
     The two teammates picked here, with the buffs the player's own builds of them really give (realPanel.ts, which runs
     plus's team resolver). Writes through the store as Ryan's own controls do, and stamps the panel so a saved team of
     the three keeps deriving live (typicalPanel.ts). -->
<template>
  <section class="wtp-real-panel" data-test-real-panel aria-label="Team buffs from your own builds">
    <template v-if="pair">
      <p v-if="busy && !real" class="wtp-real-panel__title" data-test-real-panel-status="reading">
        Reading your own builds of {{ pairNames }}…
      </p>
      <p v-else-if="error" class="wtp-real-panel__title text-error" data-test-real-panel-status="error">{{ error }}</p>
      <template v-else-if="real">
        <p v-if="!differences.length" class="wtp-real-panel__title" data-test-real-panel-status="match">
          These team buffs are what your own builds of {{ pairNames }} give: {{ real.on.length }} on.
        </p>
        <p v-else-if="source === 'builds'" class="wtp-real-panel__title" data-test-real-panel-status="drift">
          {{ driftLine }}
        </p>
        <p v-else class="wtp-real-panel__title" data-test-real-panel-status="differs">
          {{ differences.length }} {{ differences.length === 1 ? "buff here is" : "buffs here are" }} not what your own builds of
          {{ pairNames }} give.
        </p>
        <template v-if="otherSaved.length">
          <p class="wtp-real-panel__line" data-test-real-panel-saved-line>{{ otherSavedLine }}</p>
          <ul class="wtp-real-panel__teams">
            <li v-for="team in otherSaved.slice(0, 3)" :key="team.id">
              <button
                type="button"
                class="btn btn-sm btn-outline wtp-real-panel__team"
                :disabled="busy"
                :title="team.name ? `From your saved team ${team.name}` : undefined"
                :aria-label="`Use the real buffs of ${nameOf(team.mates[0])} and ${nameOf(team.mates[1])}, your saved team`"
                data-test-real-panel-saved-team
                @click="useSavedTeam(team)">
                {{ nameOf(team.mates[0]) }} + {{ nameOf(team.mates[1]) }}
              </button>
            </li>
          </ul>
        </template>
        <div class="wtp-real-panel__actions">
          <button v-if="differences.length" type="button" class="btn btn-sm btn-primary" :disabled="busy" data-test-real-panel-use @click="useReal">
            {{ source === "builds" ? "Refresh" : "Use their real buffs" }}
          </button>
          <button
            type="button"
            class="btn btn-sm btn-ghost wtp-real-panel__why"
            :aria-expanded="open"
            aria-controls="wtp-real-panel-why"
            data-test-real-panel-why
            @click="open = !open">
            {{ open ? "Hide why" : "Why" }}
          </button>
        </div>
        <div v-if="open" id="wtp-real-panel-why" class="wtp-real-panel__why-list" data-test-real-panel-list>
          <template v-if="differences.length">
            <p class="wtp-real-panel__head">What differs ({{ differences.length }})</p>
            <ul data-test-real-panel-differences>
              <li v-for="d in differences" :key="d.key"><strong>{{ d.name }}</strong> — {{ d.says }}</li>
            </ul>
          </template>
          <p class="wtp-real-panel__head">What your builds turn on ({{ real.on.length }}) and leave off ({{ real.off.length }})</p>
          <p v-for="note in real.notes" :key="note" class="wtp-real-panel__note" data-test-real-panel-note>{{ note }}</p>
          <ul>
            <li v-for="line in real.on" :key="'on-' + line.key" data-test-real-panel-on>
              <strong>{{ line.name }}</strong> ({{ nameOf(line.from) }}) — {{ line.reason }}
            </li>
            <li v-for="line in real.off" :key="'off-' + line.key" data-test-real-panel-off>
              <strong>{{ line.name }}</strong> ({{ nameOf(line.from) }}) — {{ line.reason }}
            </li>
          </ul>
        </div>
      </template>
    </template>

    <template v-else>
      <template v-if="savedTeams.length">
        <p class="wtp-real-panel__title">Team buffs from your own builds: tap one of your saved teams to fill them in.</p>
        <ul class="wtp-real-panel__teams">
          <li v-for="team in shownTeams" :key="team.id">
            <button
              type="button"
              class="btn btn-sm btn-outline wtp-real-panel__team"
              :disabled="busy"
              :title="team.name ? `From your saved team ${team.name}` : undefined"
              data-test-real-panel-team
              @click="useSavedTeam(team)">
              {{ nameOf(team.mates[0]) }} + {{ nameOf(team.mates[1]) }}
            </button>
          </li>
        </ul>
        <button v-if="savedTeams.length > shownTeams.length" type="button" class="btn btn-xs btn-ghost" data-test-real-panel-more @click="showAll = true">
          Show all {{ savedTeams.length }} saved teams
        </button>
      </template>
      <p v-else class="wtp-real-panel__title" data-test-real-panel-status="pick">
        Team buffs from your own builds: pick two teammates below to fill in what your builds of them give.
      </p>
    </template>
  </section>
</template>

<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { getCharacterRosterDisplayName } from "../../characters/characters";
import { deriveRealPanel, panelDifferences, realPanelWrite, type RealPanel } from "./realPanel";
import { markTypicalPanel, typicalPanelSource } from "./typicalPanel";
import { snapshotCharacters } from "../buildHistory/history";
import { otherSavedPairs, savedPairsLine, savedTeamPairs, type SavedPair } from "./savedTeamPairs";

const props = defineProps<{ character: string }>();

const characterStore = useCharacterStore();
const inventoryStore = useInventoryStore();
const teamStore = useTeamRotationsStore();

const nameOf = (id: string): string => getCharacterRosterDisplayName(id) || id;
const record = computed<Record<string, any>>(() => (characterStore.characters as Record<string, any>)[props.character] ?? {});
const panel = computed<Record<string, any>>(() => record.value.teamBuffs ?? {});
const pair = computed<[string, string] | null>(() => {
  const a = panel.value.selectedCharacter1;
  const b = panel.value.selectedCharacter2;
  // the character as their own teammate is no trio the resolver can read
  return a && b && a !== b && a !== props.character && b !== props.character ? [a, b] : null;
});
const source = computed(() => typicalPanelSource(panel.value));
const pairNames = computed(() => (pair.value ? `${nameOf(pair.value[0])} and ${nameOf(pair.value[1])}` : ""));

const real = ref<RealPanel | null>(null);
/** the list of what is on and off and why: folded until asked for (a phone keeps the teammate pickers in view) */
const open = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);

/** Everything the derivation reads: the two teammates' records, the character's own record without its panel, the
 *  echoes. A change to any of them derives again; a change to the panel alone does not. */
const inputs = computed(() => {
  if (!pair.value) return null;
  const chars = characterStore.characters as Record<string, any>;
  const { teamBuffs: _panel, ...own } = record.value;
  return JSON.stringify([props.character, pair.value, own, chars[pair.value[0]] ?? null, chars[pair.value[1]] ?? null, inventoryStore.echoes.length]);
});

let run = 0;
async function derive(mates: [string, string]): Promise<RealPanel> {
  return deriveRealPanel(props.character, mates, characterStore.characters as Record<string, any>, inventoryStore.echoes as any[]);
}
let timer: ReturnType<typeof setTimeout> | null = null;
watch(
  inputs,
  (key) => {
    if (timer) clearTimeout(timer);
    if (!key || !pair.value) {
      real.value = null;
      return;
    }
    const mates = pair.value;
    // the panel on screen is read off the store; this only waits for a burst of edits to settle
    timer = setTimeout(async () => {
      const mine = ++run;
      busy.value = true;
      error.value = null;
      try {
        const next = await derive(mates);
        if (mine === run) real.value = next;
      } catch {
        if (mine === run) error.value = "Your builds could not be read just now. Try again after changing a teammate.";
      } finally {
        if (mine === run) busy.value = false;
      }
    }, 250);
  },
  { immediate: true },
);
onBeforeUnmount(() => timer && clearTimeout(timer));

const differences = computed(() => (real.value && pair.value ? panelDifferences(real.value, panel.value) : []));

/** Who the drift comes from: the teammates whose buffs differ (by the derivation's own lines). */
const driftLine = computed(() => {
  const from = new Set<string>();
  const lines = [...(real.value?.on ?? []), ...(real.value?.off ?? [])];
  for (const d of differences.value) {
    const line = lines.find((l) => l.key === d.key);
    if (line) from.add(line.from);
  }
  const names = [...from].map(nameOf);
  const who = names.length ? `Your ${names.join(" and your ")}` : "Your teammates' builds";
  return `${who} changed since these buffs were filled from your builds.`;
});

function write(next: RealPanel) {
  // one tap can change twenty switches: the panel as it was goes into build history first, where Restore puts it back
  snapshotCharacters([props.character], "before-real-buffs", {
    characters: characterStore.characters as Record<string, any>,
    echoes: (inventoryStore.echoes ?? []) as any[],
  });
  characterStore.setCharacterData(props.character, { teamBuffs: realPanelWrite(next, panel.value) });
  markTypicalPanel((characterStore.characters as Record<string, any>)[props.character], "builds");
  real.value = next;
}

async function useReal() {
  if (!pair.value) return;
  busy.value = true;
  error.value = null;
  try {
    write(await derive(pair.value));
  } catch {
    error.value = "Your builds could not be read just now. Nothing was changed.";
  } finally {
    busy.value = false;
  }
}

// --- the player's saved teams with this character: the choices when no teammates are picked, and the line under the
// first one when the picked pair is none of them (savedTeamPairs.ts) ---
const savedTeams = computed<SavedPair[]>(() => savedTeamPairs(teamStore.teams as any[], props.character));
const otherSaved = computed<SavedPair[]>(() => (pair.value ? otherSavedPairs(teamStore.teams as any[], props.character, pair.value) : []));
const otherSavedLine = computed(() => savedPairsLine(otherSaved.value, nameOf(props.character), nameOf));
const showAll = ref(false);
const shownTeams = computed(() => (showAll.value ? savedTeams.value : savedTeams.value.slice(0, 3)));

async function useSavedTeam(team: SavedPair) {
  busy.value = true;
  error.value = null;
  try {
    write(await derive(team.mates));
  } catch {
    error.value = "Your builds could not be read just now. Nothing was changed.";
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.wtp-real-panel {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid oklch(var(--p) / 0.35);
  background: oklch(var(--b2));
  min-width: 0;
}
.wtp-real-panel__title {
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.wtp-real-panel__line,
.wtp-real-panel__note {
  font-size: 0.8125rem;
  overflow-wrap: anywhere;
}
.wtp-real-panel__note {
  opacity: 0.85;
  margin: 0.25rem 0;
}
.wtp-real-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.wtp-real-panel__head {
  font-size: 0.8125rem;
  font-weight: 600;
  margin-top: 0.35rem;
}
.wtp-real-panel button:focus-visible {
  outline: 2px solid oklch(var(--p));
  outline-offset: 2px;
}
.wtp-real-panel__why-list ul {
  margin: 0.35rem 0 0;
  padding-left: 1rem;
  list-style: disc;
  font-size: 0.8125rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.wtp-real-panel__why-list li {
  overflow-wrap: anywhere;
}
.wtp-real-panel__teams {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.wtp-real-panel__team {
  height: auto;
  min-height: 2rem;
  max-width: 100%;
  white-space: normal;
  text-align: left;
  line-height: 1.25;
  padding-block: 0.3rem;
}
</style>
