<template>
  <div class="bh-d" data-test-build-history-comparison>
    <p class="bh-d__sides"><b>{{ fromText }}</b> → <b>{{ toText }}</b></p>

    <!-- damage on one rotation -->
    <div class="bh-d__block" data-test-build-history-diff-damage>
      <h3 class="bh-h3">Damage</h3>
      <p v-if="comparison.fromDamage && comparison.toDamage" class="bh-d__dmg">
        <span>{{ compact(comparison.fromDamage.avgDamage) }}</span>
        <span aria-hidden="true">→</span>
        <span>{{ compact(comparison.toDamage.avgDamage) }}</span>
        <span class="bh-muted">average per rotation</span>
        <span class="bh-delta" :class="tone(comparison.fromDamage.avgDamage, comparison.toDamage.avgDamage)" data-test-build-history-diff-damage-change>{{ dmgChange }}</span>
      </p>
      <p v-else class="bh-muted">{{ busyDamage ? "Scoring both versions…" : "No damage figure: one side has no weapon." }}</p>
      <p v-if="rotation" class="bh-muted bh-d__rot">
        Both on <PresetNameLabel :name="rotation.name" :source="rotationSource" :owned="owned" :max-chips="2" /> — {{ characterShortName(charId) }}'s best rotation, enemy level 100 with 20 % resistance (the roster rankings' target).
      </p>
    </div>

    <p v-if="comparison.gear.identical" class="bh-d__same" data-test-build-history-diff-identical>The two builds are the same: same weapon, sequence, echoes and settings.</p>

    <!-- weapon and sequence -->
    <div class="bh-d__block" data-test-build-history-diff-gear>
      <h3 class="bh-h3">Weapon and sequence</h3>
      <ul class="bh-d__lines">
        <li>{{ comparison.gear.weapon.text ?? `Same weapon: ${weaponLine(comparison.to.payload.members[0])}` }}</li>
        <li>{{ comparison.gear.sequence.text ?? `Same sequence: S${comparison.to.payload.members[0].sequence}` }}</li>
      </ul>
    </div>

    <!-- echoes per slot -->
    <div class="bh-d__block" data-test-build-history-diff-echoes>
      <h3 class="bh-h3">Echoes <span class="bh-count">{{ changedSlots }} of 5 slots changed</span></h3>
      <ol class="bh-slots">
        <li v-for="s in comparison.gear.slots" :key="s.slot" class="bh-slot" :class="`bh-slot--${s.status}`" data-test-build-history-slot :data-slot-status="s.status">
          <div class="bh-slot__head">
            <span class="bh-slot__n">Slot {{ s.slot + 1 }}</span>
            <span class="bh-slot__cost">{{ costOf(s) }}</span>
            <span class="bh-slot__status">{{ STATUS_TEXT[s.status] }}</span>
          </div>
          <div v-if="s.to || s.from" class="bh-slot__echo">
            {{ echoName((s.to ?? s.from)!.key) }} · {{ setName((s.to ?? s.from)!.set) }} · {{ mainText((s.to ?? s.from)!) }}
          </div>
          <ul v-if="s.lines.length && s.status !== 'added' && s.status !== 'removed'" class="bh-d__lines bh-slot__lines">
            <li v-for="(l, i) in s.lines" :key="i">{{ l }}</li>
          </ul>
          <p v-else-if="s.status === 'removed'" class="bh-muted">Taken off in the newer version.</p>
          <p v-else-if="s.status === 'empty'" class="bh-muted">Empty on both.</p>
        </li>
      </ol>
    </div>

    <!-- character-screen stats -->
    <div class="bh-d__block" data-test-build-history-diff-stats>
      <h3 class="bh-h3">Stats <span class="bh-count">character screen: gear and always-on bonuses</span></h3>
      <p v-if="!comparison.stats" class="bh-muted">{{ busy ? "Working out the stats…" : "The stats could not be worked out." }}</p>
      <table v-else class="bh-stats">
        <thead>
          <tr><th scope="col">Stat</th><th scope="col">From</th><th scope="col">To</th><th scope="col">Change</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in comparison.stats" :key="r.key" :class="{ 'bh-stats__changed': r.changed }" data-test-build-history-stat :data-stat="r.key">
            <th scope="row" class="bh-stats__label">{{ r.label }}</th>
            <td class="bh-stats__from" data-label="From">{{ r.fromText }}</td>
            <td class="bh-stats__to" data-label="To">{{ r.toText }}</td>
            <td class="bh-stats__delta" :class="r.changed ? (r.to > r.from ? 'bh-delta--up' : 'bh-delta--down') : 'bh-delta--flat'">{{ r.changed ? r.deltaText : "same" }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="comparison.gear.settings.length || comparison.gear.characterNotes.length" class="bh-d__block" data-test-build-history-diff-settings>
      <h3 class="bh-h3">Also different</h3>
      <ul class="bh-d__lines">
        <li v-if="comparison.gear.settings.length">Settings: {{ comparison.gear.settings.join(", ") }}</li>
        <li v-for="(n, i) in comparison.gear.characterNotes" :key="i">{{ n }} (the character's, not the build's: a restore keeps today's)</li>
      </ul>
    </div>

    <div v-if="comparison.from.id !== NOW_ID && comparison.to.id === NOW_ID && !comparison.gear.identical" class="bh-d__restore">
      <button type="button" class="btn btn-warning btn-sm" data-test-build-history-diff-restore @click="emit('restore')">Restore the version from {{ fromWhen }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ build history — one comparison, from the older version to the newer one: damage on one rotation,
// weapon and sequence, the five echoes slot by slot, the character-screen stats, the other settings, in words.
import { computed } from "vue";
import PresetNameLabel, { type PresetSource } from "../display/PresetNameLabel.vue";
import { characterShortName } from "../display/names";
import { compact } from "../myRankings/format";
import { weaponName, type ShareMember } from "../share/buildCodec";
import { changeText, echoName, mainText, setName, type RotationRef, type SlotDiff, type SlotStatus } from "./diff";
import { NOW_ID, type Comparison } from "./useBuildHistory";

const props = defineProps<{
  charId: string;
  comparison: Comparison;
  rotation: RotationRef | null;
  rotationSource: PresetSource | null;
  owned: string[];
  busy: boolean;
  fromText: string;
  /** the From side's time alone, for the restore button */
  fromWhen: string;
  toText: string;
}>();
const emit = defineEmits<{ restore: [] }>();

const STATUS_TEXT: Record<SlotStatus, string> = { same: "same echo", changed: "changed", moved: "moved", added: "added", removed: "taken off", empty: "empty" };

const changedSlots = computed(() => props.comparison.gear.slots.filter((s) => s.status !== "same" && s.status !== "empty").length);
const busyDamage = computed(() => props.comparison.fromDamage === undefined || props.comparison.toDamage === undefined);
const dmgChange = computed(() => {
  const t = changeText(props.comparison.fromDamage?.avgDamage, props.comparison.toDamage?.avgDamage);
  return t === "same" ? "same" : t;
});
const tone = (from: number, to: number): string => (to > from * 1.0005 ? "bh-delta--up" : to < from * 0.9995 ? "bh-delta--down" : "bh-delta--flat");
const weaponLine = (m: ShareMember): string => (m.weapon ? `${weaponName(m.weapon.id, props.charId)} R${m.weapon.rank}` : "none");
const costOf = (s: SlotDiff): string => {
  const e = s.to ?? s.from;
  return e ? `${e.cost}-cost` : "";
};
</script>
