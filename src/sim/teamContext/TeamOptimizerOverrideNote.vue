<template>
  <div role="status" class="too-note" data-test-team-optimizer-override-note>
    The search ranked this build on {{ search }}, and the Team page calculates {{ page }}. The reason is known:
    {{ who }} {{ gap.characterIds.length === 1 ? "has" : "have" }} an action that switches a weapon effect for that action alone,
    and the search cannot read such a switch. The Team page's number is the one shown here, so nothing shown is wrong; the
    order of the results may differ slightly from what a search that read the switch would give.
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ — what Optimize team says in place of Ryan's "report this team in the Discord" alert when the gap
// between the search and the Team page is one it is known not to read (teamOptimizerOverrides.ts).
import { computed } from "vue";
import { characterShortName } from "../display/names";
import type { OverrideGap } from "./teamOptimizerOverrides";

const props = defineProps<{ gap: OverrideGap; /** the search's score, as the page prints figures */ search: string; /** the Team page's figure */ page: string }>();
const who = computed(() => {
  const names = props.gap.characterIds.map((id) => characterShortName(id) || id);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
});
</script>

<style scoped>
.too-note {
  padding: 0.6rem 0.8rem;
  border-radius: 0.7rem;
  font-size: 0.85rem;
  line-height: 1.45;
  text-align: left;
  color: oklch(var(--bc));
  background: color-mix(in oklab, oklch(var(--wa)) 10%, oklch(var(--b1)));
  box-shadow:
    inset 0 0 0 1px oklch(var(--wa) / 0.45),
    inset 4px 0 0 0 oklch(var(--wa));
  overflow-wrap: anywhere;
}
</style>
