<template>
  <dialog ref="dialog" class="modal modal-bottom sm:modal-middle" data-test-echo-plan-sheet @close="emit('close')">
    <div v-if="card && chip" class="modal-box max-h-[85dvh] max-w-lg p-0">
      <header class="flex items-start gap-3 border-b border-base-300 px-4 pt-4 pb-3">
        <img v-if="card.icon" :src="card.icon" alt="" class="size-10 shrink-0 rounded-lg bg-base-200 p-0.5" />
        <div class="min-w-0 flex-1">
          <div class="text-xs font-semibold uppercase tracking-wider opacity-60">{{ card.name }} · Cost {{ chip.cost }}</div>
          <h2 class="text-lg font-bold leading-tight" data-test-echo-plan-sheet-title>{{ chip.label }}</h2>
        </div>
        <span
          class="ep-badge mt-0.5 shrink-0"
          :class="chip.verdict === 'keep' ? 'ep-badge--done' : chip.verdict === 'discard' ? 'ep-badge--muted' : 'ep-badge--muted'"
          data-test-echo-plan-sheet-verdict>
          {{ chip.verdict === "keep" ? "Lock" : chip.verdict === "discard" ? "Discard" : "No plan" }}
        </span>
      </header>

      <div class="space-y-3 px-4 py-3 text-sm">
        <p class="opacity-80" data-test-echo-plan-sheet-why>{{ why }}</p>

        <div v-if="chip.wantedBy.length">
          <h3 class="mb-1.5 text-xs font-semibold uppercase tracking-wider opacity-60">Who wants it</h3>
          <ul class="space-y-2">
            <li v-for="w in chip.wantedBy" :key="w.character" class="flex items-start gap-2.5" :data-test-echo-plan-wanted-by="w.character">
              <img :src="characterPortraitUrl(w.character)" :alt="''" class="size-8 shrink-0 rounded-full bg-base-300 object-cover" loading="lazy" />
              <div class="min-w-0">
                <div class="font-semibold leading-tight">{{ characterName(w.character) }}</div>
                <ul class="mt-0.5 space-y-0.5 text-xs">
                  <li v-for="s in w.sources" :key="s.source" class="leading-snug">
                    <span class="font-semibold opacity-80">{{ SOURCE_LABEL[s.source] }}</span>
                    <span class="opacity-65"> — {{ s.details.join(" · ") }}<template v-if="s.more"> · +{{ s.more }} more</template></span>
                  </li>
                </ul>
              </div>
            </li>
          </ul>
        </div>

        <div>
          <h3 class="mb-1.5 text-xs font-semibold uppercase tracking-wider opacity-60">Your choice</h3>
          <div class="join w-full" role="radiogroup" aria-label="Verdict for this main stat">
            <button
              v-for="o in choices"
              :key="o.id"
              type="button"
              role="radio"
              class="btn join-item btn-sm flex-1"
              :class="choice === o.id ? 'btn-primary' : 'btn-ghost border-base-300'"
              :aria-checked="choice === o.id"
              :data-test-echo-plan-override="o.id"
              @click="pick(o.id)">
              {{ o.label }}
            </button>
          </div>
          <p class="mt-1.5 text-xs opacity-60">
            Auto follows your roster and the switches; Lock or Discard pins this one main stat whatever they say.
          </p>
        </div>
      </div>

      <div class="modal-action mt-0 border-t border-base-300 px-4 py-3">
        <form method="dialog"><button class="btn btn-sm" data-test-echo-plan-sheet-close>Close</button></form>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button aria-label="Close">close</button></form>
  </dialog>
</template>

<script setup lang="ts">
// Wuthering Tools+ /echo-plan — the tap sheet behind a chip: why it is locked or discarded, who wants it (and from
// which source), and the player's own override. A bottom sheet on a phone, a dialog on desktop.
import { computed, nextTick, ref, watch } from "vue";
import { critPartner, type PlanChip, type SonataCard, type Verdict } from "./plan";
import { characterName, characterPortraitUrl, characterShortName } from "./names";
import type { WantSource } from "./wants";

const props = defineProps<{ card: SonataCard | null; chip: PlanChip | null }>();
const emit = defineEmits<{ (e: "override", verdict: Verdict | null): void; (e: "close"): void }>();

const SOURCE_LABEL: Record<WantSource, string> = {
  equipped: "Wears now",
  build: "Saved build",
  preset: "Curated preset",
  engine: "wuwa_calc loadout",
  default: "Kit default",
};

const dialog = ref<HTMLDialogElement | null>(null);
watch(
  () => Boolean(props.card && props.chip),
  async (open) => {
    await nextTick();
    const el = dialog.value;
    if (!el) return;
    if (open && !el.open) el.showModal?.();
    if (!open && el.open) el.close();
  },
  { immediate: true },
);

const choice = computed<"auto" | Verdict>(() => props.chip?.override ?? "auto");
const choices = [
  { id: "auto", label: "Auto" },
  { id: "keep", label: "Lock" },
  { id: "discard", label: "Discard" },
] as const;

function pick(id: "auto" | Verdict): void {
  emit("override", id === "auto" ? null : id);
}

const why = computed(() => {
  const c = props.chip;
  const card = props.card;
  if (!c || !card) return "";
  const what = `a COST ${c.cost} ${c.label} ${card.name} echo`;
  switch (c.reason) {
    case "override":
      return `You set this one to ${c.override === "keep" ? "lock" : "discard"}.`;
    case "wanted": {
      const n = c.wantedBy.length;
      return `Locked: ${n === 1 ? "one character on your roster wears or would wear" : `${n} characters on your roster wear or would wear`} ${what}.`;
    }
    case "critPair": {
      const main = critPartner(c.cost, c.main);
      const partner = main ? card.rows.find((r) => r.cost === 4)?.chips.find((x) => x.main === main) : undefined;
      const who = (partner?.wantedBy ?? []).map((w) => characterShortName(w.character));
      const list = who.length > 3 ? `${who.slice(0, 3).join(", ")} and ${who.length - 3} more` : who.join(", ");
      return `Locked as the pair of COST 4 ${partner?.label ?? "crit"}${list ? `, which ${list} ${who.length === 1 ? "wants" : "want"}` : ""}: a build takes whichever crit 4-cost its substats need. Switch off “Pair the crit 4-costs” to keep only the exact one.`;
    }
    case "keepAll4":
      return `Locked because “Keep every 4-cost” is on — nobody wants this main stat, but a 4-cost can be re-rolled with Batch Mainstat Modification.`;
    case "thrown":
      return `Discarded: nobody on your roster uses ${card.name} and “Throw unused Sonatas” is on.`;
    case "off":
      return `${card.name} has no plan: nobody on your roster uses it, so the game will neither lock nor discard its echoes. Lock or discard this main stat to give it one.`;
    default:
      return `Discarded: nobody on your roster wears ${what}.`;
  }
});
</script>
