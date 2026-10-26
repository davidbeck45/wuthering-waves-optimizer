<template>
  <Teleport :to="host">
    <div v-if="view" class="wt-strip" role="list" aria-label="This team against your account" data-test-rankings-strip>
      <div
        v-for="m in members"
        :key="m.slot"
        class="wt-strip__m"
        role="listitem"
        data-test-rankings-strip-member
        :data-name="m.name"
        :data-main="m.mainDps ? '1' : '0'"
        :data-own="m.status.kind"
        :data-build="m.build.kind">
        <span class="relative inline-flex">
          <RankingsPortrait :app-key="m.appKey" :name="m.name" :color="m.color" :main="m.mainDps" size="2.5rem" />
          <span v-if="m.mainDps" class="wt-strip__dps">DPS</span>
        </span>
        <div class="wt-strip__body">
          <span class="wt-strip__name" :title="m.label">{{ m.label }}</span>
          <div class="wt-strip__line" :title="weaponTitle(m)">
            <img v-if="m.icon && !brokenIcons.has(m.weapon)" :src="m.icon" :alt="m.weapon" class="wt-strip__weapon" loading="lazy" data-test-rankings-strip-weapon @error="brokenIcons.add(m.weapon)" />
            <span v-else class="wt-strip__weapon wt-strip__weapon--none" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14.5 4.5l5 5L9 20H4v-5L14.5 4.5z" stroke-linejoin="round" /></svg>
            </span>
            <span class="wt-strip__wname" :class="{ 'wt-strip__wname--wide': !view.mine }" data-test-rankings-strip-weapon-name>{{ m.weapon }}</span>
            <span v-if="!view.mine" class="wt-strip__token tabular-nums" data-test-rankings-strip-token>runs {{ m.token }}</span>
          </div>
          <div class="wt-strip__line wt-strip__chips">
            <span class="wt-strip__own" :class="`wt-own--${m.status.kind}`" :title="m.status.title" data-test-rankings-strip-own>{{ ownText(m.status) }}</span>
            <span v-if="m.build.kind !== 'missing'" class="wt-strip__build" :class="`wt-build--${m.build.kind}`" :title="buildTitle(m)" data-test-rankings-strip-build>
              <svg v-if="m.build.kind === 'full'" viewBox="0 0 24 24" class="size-3 shrink-0" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M5 12l5 5L20 7" stroke-linecap="round" stroke-linejoin="round" /></svg>
              {{ m.build.text }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
// Wuthering Tools+: the member strip over Riley's rotation detail (controller.ts `mountMemberStrip` keeps
// the host in his topbar beside Back and publishes `rankingsDetail`): per member — main DPS first — the
// portrait, the weapon the row runs and its investment, the account's own S/R and whether that character
// has a build (echoes) in the calculator, all from the Account State (src/sim/account).
import { computed, reactive, ref, watch } from "vue";
import type { AccountState } from "../account/accountState";
import { rankingsDetail, stripHost } from "./controller";
import { buildStatus, ownByRileyName, ownStatus, type CardMember, type OwnLike, type OwnStatus } from "./phoneCards";
import { loadWeaponIcon } from "./weaponIcon";
import RankingsPortrait from "./RankingsPortrait.vue";

const props = defineProps<{ account: AccountState }>();
const host = stripHost();
const view = rankingsDetail;

const ownMap = computed(() => {
  const chars: Record<string, OwnLike & { rileyName: string; key: string }> = {};
  for (const [k, c] of Object.entries(props.account.characters)) chars[k] = { ...c, echoes: c.build?.echoes ?? [] };
  return ownByRileyName(chars);
});

// weapon icons load lazily from the app's weapon modules (weaponIcon.ts), cached by name
const icons = ref<Record<string, string>>({});
const brokenIcons = reactive(new Set<string>());
watch(
  () => view.value?.members.map((m) => m.weapon).join("|"),
  () => {
    for (const m of view.value?.members ?? []) {
      if (icons.value[m.weapon]) continue;
      void loadWeaponIcon(m.weapon).then((url) => {
        icons.value = { ...icons.value, [m.weapon]: url };
      });
    }
  },
  { immediate: true },
);

const members = computed(() =>
  (view.value?.members ?? []).map((m: CardMember) => {
    const own = ownMap.value.get(m.name);
    // a Rover's portrait follows the gender the account set up
    return { ...m, appKey: own?.key ?? m.appKey, own, status: ownStatus(m, own, view.value!.mine), build: buildStatus(own), icon: icons.value[m.weapon] ?? "" };
  }),
);

function ownText(s: OwnStatus): string {
  if (s.kind === "missing") return "not owned";
  if (s.kind === "assumed") return "4★ · S6";
  return `Own ${s.own}${s.weaponGap === "other" ? " · no sig" : ""}`;
}
function weaponTitle(m: (typeof members.value)[number]): string {
  const inv = `sequence ${m.sequence}, ${m.weapon} at R${m.refinement}${m.token.endsWith("R0") ? " (R0 = no signature weapon)" : ""}`;
  return view.value?.mine ? `${m.label} at your account: ${inv}` : `This row runs ${m.label} at ${inv}`;
}
function buildTitle(m: (typeof members.value)[number]): string {
  if (m.build.kind === "missing") return `${m.name} is not set up in the calculator`;
  if (m.build.kind === "full") return `${m.name} has five echoes on the build the calculator runs`;
  if (m.build.kind === "partial") return `${m.name} has ${m.build.echoes} of five echoes on the build the calculator runs`;
  return `${m.name} has no echoes equipped in the calculator yet`;
}
</script>

<style scoped>
.wt-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem 1.25rem;
  min-width: 0;
  color: oklch(var(--bc));
  font-family: var(--sans, inherit);
}
.wt-strip__m {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.65rem;
}
.wt-strip__body {
  display: grid;
  min-width: 0;
  gap: 0.15rem;
}
.wt-strip__line {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  line-height: 1.3;
}
.wt-strip__name {
  overflow: hidden;
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* the main DPS's tag sits on its portrait, as on the cards, so the three members' lines stay level */
.wt-strip__dps {
  position: absolute;
  top: -0.35rem;
  left: 50%;
  transform: translateX(-50%);
  padding: 0 0.3rem;
  border-radius: 9999px;
  background: oklch(var(--p));
  color: oklch(var(--pc));
  font-size: 0.55rem;
  font-weight: 800;
  line-height: 1.35;
  letter-spacing: 0.04em;
}
.wt-strip__weapon {
  display: inline-flex;
  width: 1.25rem;
  height: 1.25rem;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 0.3rem;
  background: oklch(var(--bc) / 0.08);
  object-fit: contain;
}
.wt-strip__weapon--none {
  color: oklch(var(--bc) / 0.35);
}
.wt-strip__weapon--none svg {
  width: 0.8rem;
  height: 0.8rem;
}
.wt-strip__wname {
  min-width: 0;
  overflow: hidden;
  color: oklch(var(--bc) / 0.75);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wt-strip__token {
  flex: none;
  font-weight: 600;
  color: oklch(var(--bc) / 0.85);
  white-space: nowrap;
}
.wt-strip__chips {
  flex-wrap: wrap;
  row-gap: 0.2rem;
}
.wt-strip__own,
.wt-strip__build {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 0.15rem;
  padding: 0 0.4rem;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.45;
  white-space: nowrap;
}
.wt-own--same,
.wt-own--above {
  background: oklch(var(--su) / 0.14);
  color: oklch(var(--su));
}
.wt-own--below {
  background: oklch(var(--wa) / 0.16);
  color: oklch(var(--wa));
}
.wt-own--missing,
.wt-own--assumed {
  background: oklch(var(--bc) / 0.07);
  color: oklch(var(--bc) / 0.6);
}
.wt-build--full {
  background: oklch(var(--su) / 0.14);
  color: oklch(var(--su));
}
.wt-build--partial {
  background: oklch(var(--wa) / 0.16);
  color: oklch(var(--wa));
}
.wt-build--none {
  background: oklch(var(--bc) / 0.07);
  color: oklch(var(--bc) / 0.6);
}
/* light themes: DaisyUI's success / warning are pale on white, so the chips' text takes them darker (the
   scope attribute lands on the chip, so `html[…]` as an ancestor needs no :global — which would swallow the
   rest of the selector) */
html[data-theme-style="light"] .wt-own--same,
html[data-theme-style="light"] .wt-own--above,
html[data-theme-style="light"] .wt-build--full {
  color: color-mix(in oklch, oklch(var(--su)) 60%, black);
}
html[data-theme-style="light"] .wt-own--below,
html[data-theme-style="light"] .wt-build--partial {
  color: color-mix(in oklch, oklch(var(--wa)) 50%, black);
}
/* a phone: each member stacks portrait over its lines, three across; the weapon reads as its icon and
   the row's token (its name stays in the line's tooltip); a long name ends in an ellipsis, in full on hover */
@media (max-width: 767px) {
  .wt-strip {
    gap: 0.5rem 0.4rem;
  }
  .wt-strip__m {
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    text-align: center;
  }
  .wt-strip__body {
    width: 100%;
    justify-items: center;
  }
  .wt-strip__name {
    max-width: 100%;
  }
  .wt-strip__line {
    max-width: 100%;
    justify-content: center;
  }
  .wt-strip__wname--wide {
    display: none;
  }
}
</style>
