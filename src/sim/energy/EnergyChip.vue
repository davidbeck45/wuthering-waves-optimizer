<template>
  <component
    :is="clickable ? 'button' : 'span'"
    :type="clickable ? 'button' : undefined"
    class="en-chip"
    :class="[`en-chip--${kind}`, { 'en-chip--sm': small || mini, 'en-chip--mini': mini }]"
    :title="tooltip"
    :aria-label="clickable ? `${tooltip}. Show where the energy comes from` : mini ? tooltip : undefined"
    :data-test-energy-chip="characterId ?? ''"
    :data-test-energy-status="kind"
    @click="clickable && $emit('open')">
    <span v-if="kind === 'loading'" class="loading loading-spinner loading-xs en-chip__icon" aria-hidden="true"></span>
    <EnergyStatusIcon v-else :status="kind" class="en-chip__icon" />
    <span v-if="label" class="en-chip__who">{{ label }}</span>
    <template v-if="check && check.need != null && check.status !== 'noGate' && !mini">
      <span v-if="check.have != null" class="en-chip__nums"><b>{{ haveText(check.have) }}</b><span class="en-chip__sep"> / </span>{{ needText(check.need) }}</span>
      <span v-else class="en-chip__nums"><span class="en-chip__sep">needs </span>{{ needText(check.need) }}</span>
      <span class="en-chip__word">{{ word }}</span>
    </template>
    <span v-else class="en-chip__word">{{ word }}</span>
  </component>
</template>

<script setup lang="ts">
// Wuthering Tools+ — one member's ER against their team's need: "110.8% / 115.2% short 4.4% · 1 roll". An icon and a
// word always ride with the colour. A button when the breakdown can open.
import { computed } from "vue";
import EnergyStatusIcon from "./EnergyStatusIcon.vue";
import { haveText, needText, statusDetail } from "./energyFormat";
import type { EnergyCheck, MemberEnergy } from "./energyNeed";
import "./energy.css";

const props = withDefaults(
  defineProps<{
    /** a member's check (`MemberCheck`): its `member` says whether the kit's floor or the loop sets the need */
    check: (EnergyCheck & { member?: Pick<MemberEnergy, "setBy" | "bar"> }) | null;
    /** the member's name inside the chip (the /my-rankings rows) */
    label?: string;
    characterId?: string;
    /** no numbers: "loading", "error", "muted" (not measured) */
    pending?: "loading" | "error" | "muted" | null;
    /** text when pending (the reason) */
    note?: string;
    clickable?: boolean;
    /** the compact form: "ok", "tight", "short 4.4%" (the roll count in the tooltip) */
    compact?: boolean;
    /** smaller type, for a narrow cell */
    small?: boolean;
    /** a pill beside S/R badges: the icon, the label and the verdict ("ER short 4.4%"), every number in the tooltip */
    mini?: boolean;
  }>(),
  { label: "", characterId: undefined, pending: null, note: "", clickable: false, compact: false, small: false, mini: false },
);
defineEmits<{ open: [] }>();

const kind = computed(() => props.pending ?? props.check?.status ?? "muted");
const word = computed(() => {
  if (props.pending === "loading") return props.note || "measuring…";
  if (props.pending === "error") return "—";
  if (props.pending === "muted" || !props.check) return props.note || "not measured";
  const c = props.check;
  const brief = props.compact || props.mini;
  if (brief && (c.status === "ok" || c.status === "tight")) return c.status === "ok" ? "ok" : "tight";
  if (brief && c.status === "short") return `short ${c.short.toFixed(1)}%`;
  if (props.mini && c.status === "unknown") return `needs ${needText(c.need)}`;
  if (c.status === "unknown") return "not set up";
  return statusDetail(c);
});
const tooltip = computed(() => {
  if (props.pending) return props.note || word.value;
  const c = props.check;
  if (!c) return props.note || "Not measured";
  const who = props.label && !props.mini ? `${props.label}: ` : "";
  const more = props.note ? `. ${props.note}` : "";
  if (c.status === "noGate") return `${who}no energy gate — the Liberation costs no energy in this loop${more}`;
  if (c.status === "unknown") return `${who}needs ${needText(c.need)} ER${c.member?.setBy === "kit" ? " (the kit's own floor)" : ""}; not set up in the calculator (no weapon), so there is no build to compare${more}`;
  const why =
    c.member?.setBy === "kit"
      ? `${needText(c.need)} is the kit's own floor in wuwa_calc (this team's loop alone asks ${c.member.bar == null ? "none" : needText(c.member.bar)})`
      : `${needText(c.need)} needed for this team's wuwa_calc loop`;
  return `${who}ER ${haveText(c.have)} on the build, ${why} — ${statusDetail(c)}${more}`;
});
</script>
