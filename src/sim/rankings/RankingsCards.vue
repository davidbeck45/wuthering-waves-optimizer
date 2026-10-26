<template>
  <Teleport :to="headHost">
    <div v-if="view?.phone" class="wt-cards-head" data-test-rankings-cards-head>
      <div class="min-w-0 flex-1 leading-tight">
        <p class="truncate text-sm font-semibold tabular-nums" data-test-rankings-cards-count>{{ count(view.cards.length) }} team{{ view.cards.length === 1 ? "" : "s" }}</p>
        <p v-if="view.cards.length" class="truncate text-xs opacity-60">{{ view.pinned ? "% of pinned" : "% of top" }}</p>
      </div>
      <div class="join shrink-0" role="group" aria-label="Rank by">
        <button
          v-for="m in MODES"
          :key="m.id"
          type="button"
          class="btn join-item btn-xs"
          :class="view.mode === m.id ? 'btn-primary' : 'btn-ghost border-base-300'"
          :aria-pressed="view.mode === m.id"
          :title="m.title"
          :data-test-rankings-cards-mode="m.id"
          @click="setRankingsTeamMode(m.id)">
          {{ m.label }}
        </button>
      </div>
    </div>
  </Teleport>
  <Teleport :to="host">
    <section v-if="view" class="wt-cards" :class="{ 'wt-cards--mine': view.mine, 'wt-cards--desktop': !view.phone }" data-test-rankings-cards>
      <!-- while his rows are still being solved an empty list is "not yet" (his overlay says so), not "no match" -->
      <div v-if="!view.cards.length && !view.loading" class="wt-cards__empty" data-test-rankings-cards-empty>
        <template v-if="view.mine && !ownedCount">
          <p class="text-base font-semibold">No team you can field yet</p>
          <p class="mt-1 text-sm opacity-70">
            Set your resonators up in the calculator (an equipped weapon counts one as owned), or switch Teams I can field off
            {{ view.phone ? "under the account button above" : "in the bar above" }}.
          </p>
          <RouterLink to="/" class="btn btn-primary btn-sm mt-3" data-test-rankings-cards-setup>Open the calculator</RouterLink>
        </template>
        <template v-else>
          <p class="text-base font-semibold">No team matches these filters</p>
          <p class="mt-1 text-sm opacity-70">
            Take a Main DPS / With / Without chip off above, or
            {{ view.phone ? "open Filters for the weapon, echo and sequence filters." : "remove a weapon, echo or sequence filter from the search panel." }}
          </p>
        </template>
      </div>

      <ol v-else-if="view.phone && view.cards.length" class="wt-cards__list">
        <li v-for="c in shown" :key="c.key">
          <a
            :href="hrefOf(c.key)"
            class="wt-card"
            :style="{ '--wt-k': c.strength.toFixed(3), '--wt-share': c.width.toFixed(4) }"
            :aria-label="`#${c.rank}${c.pinned ? ' (pinned)' : ''}: ${c.members.map((m) => m.label).join(', ')} — ${count(c.figure)} ${view.mode === 'dps' ? 'DPS' : 'DPR'}, ${c.share}`"
            data-test-rankings-card
            :data-team="c.key"
            @click.prevent="openRankingsTeam(c.key)">
            <div class="wt-card__top">
              <span class="wt-card__rank tabular-nums">
                <svg v-if="c.pinned" viewBox="0 0 24 24" class="wt-card__pin" fill="currentColor" aria-label="pinned" data-test-rankings-card-pinned><path d="M16 9V4h1a1 1 0 0 0 0-2H7a1 1 0 0 0 0 2h1v5a3 3 0 0 1-3 3v2h5.97v7l1 1 1-1v-7H19v-2a3 3 0 0 1-3-3z" /></svg>{{ c.rank }}
              </span>
              <span class="wt-card__share tabular-nums" data-test-rankings-card-share>{{ c.share }}</span>
              <span class="wt-card__figure tabular-nums" data-test-rankings-card-figure>
                {{ count(c.figure) }}<span v-if="c.loop != null" class="wt-card__loop">{{ c.loop.toFixed(1) }}s</span>
              </span>
              <svg viewBox="0 0 24 24" class="size-4 shrink-0 opacity-40" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </div>
            <div class="wt-card__members">
              <div v-for="m in c.members" :key="m.slot" class="wt-card__member" data-test-rankings-card-member :data-name="m.name" :data-main="m.mainDps ? '1' : '0'">
                <span class="relative inline-flex">
                  <RankingsPortrait :app-key="m.appKey" :name="m.name" :color="m.color" :main="m.mainDps" size="2.6rem" />
                  <span v-if="m.mainDps" class="wt-card__dps">DPS</span>
                </span>
                <span class="wt-card__name" :title="m.label">{{ m.label }}</span>
                <span class="wt-card__inv">
                  <span class="wt-card__token tabular-nums" :title="tokenTitle(m)">{{ m.token }}</span>
                  <span v-if="m.status" class="wt-card__own" :class="`wt-own--${m.status.kind}`" :title="m.status.title" data-test-rankings-card-own :data-kind="m.status.kind">{{ m.status.text }}</span>
                </span>
              </div>
            </div>
            <span class="wt-card__bar" aria-hidden="true"></span>
          </a>
        </li>
      </ol>

      <div v-if="view.phone && view.cards.length > limit" ref="sentinel" class="wt-cards__more">
        <button type="button" class="btn btn-ghost btn-sm w-full border-base-300" data-test-rankings-cards-more @click="showMore">
          Show {{ Math.min(PAGE, view.cards.length - limit) }} more
          <span class="font-normal opacity-60 tabular-nums">· {{ count(limit) }} of {{ count(view.cards.length) }}</span>
        </button>
      </div>
    </section>
  </Teleport>
</template>

<script setup lang="ts">
// Wuthering Tools+: /rankings on a phone — Riley's comparison rows as cards (controller.ts `cardsPass`
// publishes them in his table's order, phoneCards.ts builds them). The controller re-attaches the host
// inside his page after each of his draws and hides his grid while this is mounted; tapping a card opens
// the team's rotation detail the same way his "view rotation" link does.
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { AccountState } from "../account/accountState";
import { cardsHeadHost, cardsHost, claimCards, openRankingsTeam, rankingsCards, setRankingsTeamMode } from "./controller";
import { buildStatus, ownByRileyName, ownStatus, type CardMember, type OwnLike, type OwnStatus } from "./phoneCards";
import type { TeamMode } from "./compareColumn";
import RankingsPortrait from "./RankingsPortrait.vue";

const props = defineProps<{ account: AccountState }>();

const host = cardsHost();
const headHost = cardsHeadHost();
const view = rankingsCards;
const PAGE = 50;
const MODES: ReadonlyArray<{ id: TeamMode; label: string; title: string }> = [
  { id: "dpr", label: "DPR", title: "Team Avg DPR: the damage of one rotation, averaged over four" },
  { id: "dps", label: "DPS", title: "Team DPS: the four rotations' damage over the time they took" },
];

// ---- 50 at a time: the table can hold 500+ rows, and a phone only ever reads the top of it
const limit = ref(PAGE);
watch(
  () => view.value?.listId,
  (id, was) => {
    if (id !== was) limit.value = PAGE;
  },
);
/** the cards on screen, each member with where the account stands against them */
const shown = computed(() => {
  const v = view.value;
  if (!v) return [];
  // a Rover's portrait follows the gender the account set up (his one "Aero Rover" is either of the app's two)
  return v.cards.slice(0, limit.value).map((c) => ({
    ...c,
    members: c.members.map((m) => ({ ...m, appKey: ownMap.value.get(m.name)?.key ?? m.appKey, status: own(m, v.mine) })),
  }));
});
function showMore(): void {
  limit.value += PAGE;
}
// the next 50 come in on their own as the list's end nears (the button stays for keyboards and old browsers)
const sentinel = ref<HTMLElement | null>(null);
let io: IntersectionObserver | null = null;
watch(sentinel, (el, was) => {
  if (was) io?.unobserve(was);
  if (el) io?.observe(el);
});

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const count = (n: number): string => fmt.format(Math.trunc(n));

/** a real link (long-press opens it in a tab); a tap goes through the router like his table's link */
function hrefOf(key: string): string {
  const p = new URLSearchParams(location.hash.replace(/^#/, ""));
  p.set("team", key);
  return `${location.pathname}#${p.toString()}`;
}

// ---- against the player's account
const ownMap = computed(() => {
  const chars: Record<string, OwnLike & { rileyName: string; key: string }> = {};
  for (const [k, c] of Object.entries(props.account.characters)) chars[k] = { ...c, echoes: c.build?.echoes ?? [] };
  return ownByRileyName(chars);
});
/** The short line beside a member's token: where the account stands against this row (Riley's tiers), or,
 *  under My account (where the token already is the account's own), only what is missing — a resonator
 *  not set up, or one set up without five echoes on the build the calculator runs. */
type CardBadge = { kind: OwnStatus["kind"] | "build"; text: string; title: string };
const ownedCount = computed(() => props.account.summary.owned);
function own(m: CardMember, mine: boolean): CardBadge | null {
  const o = ownMap.value.get(m.name);
  const status = ownStatus(m, o, mine);
  if (!mine || status.kind !== "same") return status;
  const build = buildStatus(o);
  if (build.kind === "full" || build.kind === "missing") return null;
  return {
    kind: "build",
    text: build.kind === "none" ? "no build" : `${build.echoes}/5`,
    title: build.kind === "none" ? `${m.name} has no echoes equipped in the calculator yet` : `${m.name} has ${build.echoes} of five echoes on the build the calculator runs`,
  };
}
const tokenTitle = (m: CardMember): string =>
  `${m.label}: sequence ${m.sequence}, ${m.weapon} at R${m.refinement}${m.token.endsWith("R0") ? " (R0 = no signature weapon)" : ""}${m.subs === "h" ? " · High Invest substats" : m.subs === "u" ? " · your own build's substats" : ""}`;

onMounted(() => {
  claimCards(true);
  io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting) && view.value && view.value.cards.length > limit.value) showMore();
    },
    { rootMargin: "0px 0px 600px 0px" },
  );
  if (sentinel.value) io.observe(sentinel.value);
});
onBeforeUnmount(() => {
  io?.disconnect();
  io = null;
  claimCards(false);
});
</script>

<style scoped>
.wt-cards {
  padding-bottom: 0.5rem;
  color: oklch(var(--bc));
  font-family: var(--sans, inherit);
}
.wt-cards-head {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 0.6rem;
  color: oklch(var(--bc));
}
.wt-cards__list {
  display: grid;
  gap: 0.5rem;
  padding-top: 0.6rem;
}
.wt-cards--desktop {
  padding: 0 0 1rem;
}
.wt-cards__empty {
  margin-top: 1rem;
  padding: 1.25rem 1rem;
  border: 1px dashed oklch(var(--bc) / 0.2);
  border-radius: var(--rounded-box, 0.75rem);
  text-align: center;
}
.wt-cards__more {
  margin-top: 0.75rem;
}
.wt-card {
  position: relative;
  display: block;
  overflow: hidden;
  padding: 0.5rem 0.7rem 0.65rem;
  border: 1px solid oklch(var(--bc) / 0.09);
  border-radius: var(--rounded-box, 0.75rem);
  background: oklch(var(--b2));
  color: inherit;
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.12s, border-color 0.12s;
}
.wt-card:hover {
  border-color: oklch(var(--bc) / 0.18);
}
.wt-card:active {
  background: oklch(var(--b3));
}
.wt-card:focus-visible {
  outline: 2px solid oklch(var(--p));
  outline-offset: 2px;
}
.wt-card__top {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}
.wt-card__rank {
  display: inline-flex;
  align-items: baseline;
  gap: 0.15rem;
  min-width: 1.6rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: oklch(var(--bc) / 0.5);
}
.wt-card__pin {
  width: 0.7rem;
  height: 0.7rem;
  align-self: center;
  color: oklch(var(--p));
}
/* the share, on the Compare column's heat: neutral at the weakest row, the accent at the top */
.wt-card__share {
  padding: 0.05rem 0.4rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  color: color-mix(in oklch, oklch(var(--p)) calc(var(--wt-k, 0) * 70%), oklch(var(--bc) / 0.75));
  background: color-mix(in oklch, oklch(var(--p)) calc(var(--wt-k, 0) * 22%), oklch(var(--bc) / 0.06));
}
.wt-card__figure {
  margin-left: auto;
  font-size: 1.125rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  white-space: nowrap;
}
.wt-card__loop {
  margin-left: 0.25rem;
  font-size: 0.7rem;
  font-weight: 500;
  color: oklch(var(--bc) / 0.5);
}
.wt-card__members {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.25rem;
  margin-top: 0.45rem;
}
.wt-card__member {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  text-align: center;
}
.wt-card__dps {
  position: absolute;
  top: -0.3rem;
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
.wt-card__name {
  max-width: 100%;
  margin-top: 0.1rem;
  overflow: hidden;
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wt-card__inv {
  display: inline-flex;
  max-width: 100%;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0 0.3rem;
  font-size: 0.6875rem;
  line-height: 1.3;
}
.wt-card__token {
  padding: 0 0.3rem;
  border-radius: 0.3rem;
  background: oklch(var(--bc) / 0.08);
  font-weight: 600;
  color: oklch(var(--bc) / 0.85);
}
.wt-card__own {
  font-weight: 600;
  white-space: nowrap;
}
.wt-own--same,
.wt-own--above {
  color: oklch(var(--su));
}
.wt-own--below,
.wt-own--build {
  color: oklch(var(--wa));
}
/* light themes: DaisyUI's success / warning are too pale on a white card */
html[data-theme-style="light"] .wt-own--same,
html[data-theme-style="light"] .wt-own--above {
  color: color-mix(in oklch, oklch(var(--su)) 60%, black);
}
html[data-theme-style="light"] .wt-own--below,
html[data-theme-style="light"] .wt-own--build {
  color: color-mix(in oklch, oklch(var(--wa)) 50%, black);
}
.wt-own--missing {
  color: oklch(var(--bc) / 0.5);
  font-weight: 500;
}
.wt-own--assumed {
  color: oklch(var(--bc) / 0.55);
}
/* the share as a hairline along the card's foot, accent-strong at the top of the table */
.wt-card__bar {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3px;
  width: calc(var(--wt-share, 0) * 100%);
  background: color-mix(in oklch, oklch(var(--p)) calc(35% + var(--wt-k, 0) * 65%), transparent);
}
</style>
