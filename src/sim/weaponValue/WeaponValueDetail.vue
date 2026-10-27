<template>
  <div class="wvd" :data-test-weapons-detail="row.id">
    <div class="wvd__table-wrap">
      <table class="wvd__table">
        <thead>
          <tr>
            <th scope="col">Weapon</th>
            <th scope="col" class="wvd__num">Own damage</th>
            <th scope="col" class="wvd__num">Own</th>
            <th scope="col" class="wvd__num">Team damage</th>
            <th scope="col" class="wvd__num">Team</th>
          </tr>
        </thead>
        <tbody>
          <tr class="wvd__now">
            <th scope="row">
              <span class="wvd__opt">
                <WeaponIcon :weapon-key="row.current.weaponKey" :size="24" title="" />
                <span>
                  <span class="wvd__opt-name">{{ heldLabel }}</span>
                  <span class="wvd__opt-sub">now</span>
                </span>
              </span>
            </th>
            <td class="wvd__num" data-label="Own damage">{{ compact(row.current.avgDamage) }}</td>
            <td class="wvd__num wvd__muted" data-label="Own">—</td>
            <td class="wvd__num" data-label="Team damage">{{ row.team ? compact(row.team.base) : "—" }}</td>
            <td class="wvd__num wvd__muted" data-label="Team">—</td>
          </tr>
          <template v-for="(group, gi) in groups" :key="group.key">
            <tr class="wvd__group" :class="{ 'wvd__group--first': gi === 0 }">
              <th colspan="5" scope="colgroup">{{ group.title }}<span v-if="group.hint" class="wvd__group-hint"> · {{ group.hint }}</span></th>
            </tr>
            <tr v-for="o in group.options" :key="o.id" :data-test-weapons-option="o.id" :class="{ 'wvd__hl': highlight === o.id }">
              <th scope="row">
                <span class="wvd__opt">
                  <WeaponIcon :weapon-key="o.weaponKey" :size="24" title="" />
                  <span>
                    <span class="wvd__opt-name">{{ o.label }}</span>
                    <span class="wvd__opt-sub">{{ optionSub(o) }}</span>
                  </span>
                </span>
              </th>
              <td class="wvd__num" data-label="Own damage">{{ compact(o.avgDamage) }}</td>
              <td class="wvd__num" data-label="Own">
                <span :class="cls(o.gain)">{{ pctFine(o.gain) }}</span>
                <span v-if="o.low" class="wvd__floor" title="the weapon's stats alone, every passive off">stats only {{ pctFine(o.low.gain) }}</span>
              </td>
              <td class="wvd__num" data-label="Team damage">{{ o.team ? compact(o.team.avgDamage) : "—" }}</td>
              <td class="wvd__num" data-label="Team" :title="o.team ? panelsText(o) : o.teamNote ?? ''">
                <span v-if="o.team" :class="cls(o.team.gain)">{{ pctFine(o.team.gain) }}</span>
                <span v-else class="wvd__muted">—</span>
                <span v-if="o.panels.length" class="wvd__floor">panel follows</span>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
      <p v-if="!groups.length" class="wvd__empty">{{ row.note ?? "Nothing to compare for this character." }}</p>
    </div>

    <aside class="wvd__side">
      <div class="wvd__ctx">
        <span class="wvd__ctx-label">Measured on</span>
        <PresetNameLabel :name="row.current.rotation" :owned="owned" :max-chips="2" />
        <span class="wvd__ctx-meta">{{ compact(row.current.avgDamage) }} per rotation{{ row.current.dps ? ` · ${compact(row.current.dps)} DPS` : "" }}</span>
      </div>
      <div class="wvd__ctx">
        <span class="wvd__ctx-label">Team figures on</span>
        <template v-if="row.team">
          <span class="wvd__team">
            <CharacterAvatar v-for="k in row.team.characterIds" :id="k" :key="k" :size="22" title="" />
          </span>
          <PresetNameLabel :name="row.team.name" :owned="owned" :max-chips="2" />
          <span v-if="row.teamNote" class="wvd__ctx-meta wvd__warn">{{ row.teamNote }}</span>
        </template>
        <span v-else class="wvd__ctx-meta">{{ row.teamNote ?? "no team you can field" }}</span>
      </div>
      <div class="wvd__actions">
        <button type="button" class="btn btn-sm btn-primary" :data-test-weapons-calculator="row.id" @click="emit('calculator')">Open in calculator</button>
        <RouterLink :to="{ path: '/my-rankings', query: { focus: row.id, tab: 'whatif' } }" class="btn btn-sm" :data-test-weapons-whatif="row.id">What if</RouterLink>
        <a :href="prydwenUrl(row.id)" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-ghost" title="Prydwen's character guide (opens their site)">
          Prydwen guide
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-3.5" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </a>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ — a /weapons row opened: every option scored for the character (the signature ladder, the held
// weapon's next refinement, the standard 5★ weapons, the best 4★ at R5) with own and team damage and their change,
// what they were measured on, and the ways on (calculator, what-if, Prydwen's guide — a link out, never their text).
// Below 768 px the table reads as one card per option (cells caption themselves through data-label).
import { computed } from "vue";
import CharacterAvatar from "../display/CharacterAvatar.vue";
import WeaponIcon from "../display/WeaponIcon.vue";
import PresetNameLabel from "../display/PresetNameLabel.vue";
import { characterShortName, weaponDisplayName } from "../display/names";
import { compact } from "../myRankings/format";
import { pctFine, prydwenUrl, type Scope } from "./weaponValueView";
import type { CharacterWeaponValue, ValueOption } from "./weaponValue";

const props = defineProps<{ row: CharacterWeaponValue; scope: Scope; owned: string[] }>();
const emit = defineEmits<{ calculator: [] }>();

const heldLabel = computed(() => (props.row.current.weaponKey ? `${weaponDisplayName(props.row.current.weaponKey)} R${props.row.current.refinement}` : "No weapon"));
const highlight = computed(() => props.row.signature.steps[0]?.id ?? null);

const groups = computed(() => {
  const r = props.row;
  const out: Array<{ key: string; title: string; hint: string | null; options: ValueOption[] }> = [];
  if (r.signature.steps.length) out.push({ key: "sig", title: "Signature", hint: r.signature.status === "swap" ? "passives at full stacks; stats only below" : "on your own passive settings", options: r.signature.steps });
  if (r.refine) out.push({ key: "refine", title: "Your weapon, one refinement up", hint: null, options: [r.refine] });
  if (r.standard.length) out.push({ key: "std", title: "Standard 5★ (Standard Weapon Convene)", hint: "R1", options: r.standard });
  if (r.four) out.push({ key: "four", title: "Best 4★ of the type", hint: "R5", options: [r.four] });
  return out;
});

const cls = (g: number): string => (g > 0.0005 ? "wvd__up" : g < -0.0005 ? "wvd__down" : "");
function optionSub(o: ValueOption): string {
  if (o.kind === "signature") return props.row.signature.status === "swap" ? `${o.refinement} ${o.refinement === 1 ? "copy" : "copies"}` : `+${o.refinement - props.row.current.refinement} ${o.refinement - props.row.current.refinement === 1 ? "copy" : "copies"}`;
  if (o.kind === "refine") return "one more copy";
  if (o.kind === "standard") return "a new copy";
  return "any 4★ of the type, at R5";
}
function panelsText(o: ValueOption): string {
  if (!o.panels.length) return "";
  return o.panels.map((p) => `${characterShortName(p.member)}'s Team Buffs panel is set by hand: scored as if ${p.on.length ? "this weapon's buff is ticked there" : ""}${p.on.length && p.off.length ? " and " : ""}${p.off.length ? "the old weapon's buff is unticked" : ""}`).join("\n");
}
</script>

<style scoped>
.wvd {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 17rem;
  gap: 1rem 1.25rem;
  margin: 0.15rem 0.5rem 0.75rem;
  padding: 0.85rem;
  border-radius: 0.75rem;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
}
.wvd__table-wrap {
  min-width: 0;
}
.wvd__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}
.wvd__table thead th {
  padding: 0 0.5rem 0.4rem;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: oklch(var(--bc) / 0.5);
  text-align: left;
}
.wvd__table tbody th,
.wvd__table tbody td {
  padding: 0.3rem 0.5rem;
  border-top: 1px solid oklch(var(--bc) / 0.06);
  font-weight: 400;
  text-align: left;
  vertical-align: middle;
}
.wvd__num {
  text-align: right !important;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.wvd__num > span {
  display: block;
}
.wvd__now th,
.wvd__now td {
  background: oklch(var(--bc) / 0.035);
}
.wvd__group th {
  padding-top: 0.6rem !important;
  font-size: 0.66rem !important;
  font-weight: 700 !important;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: oklch(var(--bc) / 0.55);
  border-top: 0 !important;
}
.wvd__group-hint {
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
}
.wvd__hl th,
.wvd__hl td {
  background: oklch(var(--p) / 0.07);
}
.wvd__opt {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}
.wvd__opt > span {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.wvd__opt-name {
  font-weight: 600;
}
.wvd__opt-sub {
  font-size: 0.68rem;
  color: oklch(var(--bc) / 0.5);
}
.wvd__floor {
  font-size: 0.66rem;
  color: oklch(var(--bc) / 0.5);
}
.wvd__up {
  color: oklch(var(--su));
  font-weight: 700;
}
:root[data-theme-style="light"] .wvd__up {
  color: color-mix(in oklab, oklch(var(--su)) 70%, black);
}
.wvd__down {
  color: oklch(var(--er));
  font-weight: 700;
}
.wvd__muted {
  color: oklch(var(--bc) / 0.4);
}
.wvd__empty {
  font-size: 0.8rem;
  color: oklch(var(--bc) / 0.55);
}
.wvd__side {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  min-width: 0;
}
.wvd__ctx {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 0;
}
.wvd__ctx-label {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: oklch(var(--bc) / 0.5);
}
.wvd__ctx-meta {
  font-size: 0.72rem;
  color: oklch(var(--bc) / 0.6);
}
.wvd__warn {
  color: oklch(var(--wa));
}
:root[data-theme-style="light"] .wvd__warn {
  color: color-mix(in oklab, oklch(var(--wa)) 60%, black);
}
.wvd__team {
  display: flex;
  gap: 0.25rem;
}
.wvd__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: auto;
}

@media (max-width: 1023px) {
  .wvd {
    grid-template-columns: minmax(0, 1fr);
  }
}
/* phone: one card per option */
@media (max-width: 767px) {
  .wvd {
    margin: 0 0.35rem 0.6rem;
    padding: 0.6rem;
  }
  .wvd__table thead {
    display: none;
  }
  .wvd__table,
  .wvd__table tbody {
    display: block;
  }
  .wvd__table tbody tr {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.1rem 0.75rem;
    padding: 0.45rem 0.1rem;
    border-top: 1px solid oklch(var(--bc) / 0.07);
  }
  .wvd__table tbody th,
  .wvd__table tbody td {
    border: 0;
    padding: 0;
    background: none !important;
  }
  .wvd__table tbody th[scope="row"] {
    flex: 1 0 100%;
  }
  .wvd__table tbody td {
    flex: 0 1 auto;
    text-align: left !important;
  }
  .wvd__table tbody td::before {
    content: attr(data-label) " ";
    font-size: 0.64rem;
    font-weight: 600;
    color: oklch(var(--bc) / 0.5);
  }
  .wvd__num > span {
    display: inline;
  }
  .wvd__floor {
    margin-left: 0.3rem;
  }
  .wvd__group {
    border-top: 0 !important;
    padding-bottom: 0 !important;
  }
  .wvd__hl {
    border-radius: 0.4rem;
    background: oklch(var(--p) / 0.07);
  }
}
</style>
