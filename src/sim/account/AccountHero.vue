<template>
  <section class="acc-hero" data-test-account-hero>
    <div class="acc-hero__lead" :style="leadStyle" data-test-account-hero-team>
      <div class="acc-hero__eyebrow">Best team you can field</div>
      <template v-if="best">
        <div class="acc-hero__team">
          <span class="acc-hero__faces">
            <CharacterAvatar v-for="m in shares" :id="m.id" :key="m.id" :size="44" :ring="m.color" dot />
          </span>
          <div class="acc-hero__figure">
            <span class="acc-hero__value" data-test-account-hero-damage>{{ compact(best.avgDamage) }}</span>
            <span class="acc-hero__unit">per rotation<template v-if="best.dps"> · {{ compact(best.dps) }} DPS</template></span>
          </div>
        </div>
        <div class="acc-hero__name">
          <PresetNameLabel :name="best.name" :source="best.source" :owned="owned" :max-chips="2" />
        </div>
        <div class="acc-hero__shares">
          <div class="acc-hero__bar" aria-hidden="true">
            <span v-for="m in shares" :key="m.id" :style="{ width: `${m.share * 100}%`, background: m.color }"></span>
          </div>
          <ul class="acc-hero__legend" aria-label="Share of the team's damage">
            <li v-for="m in shares" :key="m.id">
              <span class="acc-hero__swatch" :style="{ background: m.color }" aria-hidden="true"></span>{{ characterShortName(m.id) }}
              <b>{{ Math.round(m.share * 100) }}%</b>
            </li>
          </ul>
        </div>
        <div class="acc-hero__links">
          <RouterLink :to="{ path: '/rankings', hash: rankingsMineHash(best.characterIds) }" class="acc-hero__link" data-test-account-hero-rankings>
            This team at my account
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-3" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </RouterLink>
          <span v-if="kpis.strongest" class="acc-hero__strongest">
            Strongest: <b>{{ kpis.strongest.name }}</b> {{ compact(kpis.strongest.damage ?? 0) }}
          </span>
        </div>
      </template>
      <div v-else-if="status.state === 'running'" class="acc-hero__wait">
        <span class="acc-hero__skeleton"></span>
        <span class="acc-hero__wait-text">Scoring your teams… {{ status.done }} / {{ status.total || "…" }}</span>
      </div>
      <div v-else class="acc-hero__none">
        <span class="acc-hero__none-title">No team you can field yet</span>
        <span class="acc-hero__none-text">A team needs three characters with a weapon equipped.</span>
        <RouterLink to="/teams" class="acc-hero__link">Open Team Rotations</RouterLink>
      </div>
    </div>

    <div class="acc-hero__kpis">
      <div class="kpi" data-test-account-kpi="characters">
        <div class="kpi__label"><span class="max-md:hidden">Characters set up</span><span class="md:hidden">Set up</span></div>
        <div class="kpi__value">{{ kpis.owned }}<span class="kpi__of">/ {{ kpis.characters }}</span></div>
        <div class="kpi__meter"><span :style="{ width: ratio(kpis.owned, kpis.characters) }"></span></div>
        <div class="kpi__sub">{{ kpis.built }} fully built · weapon + 5 echoes</div>
      </div>
      <div class="kpi" data-test-account-kpi="s6">
        <div class="kpi__label"><span class="max-md:hidden">At S6</span><span class="md:hidden">S6</span></div>
        <div class="kpi__value">{{ kpis.s6 }}<span class="kpi__of">/ {{ kpis.owned }}</span></div>
        <div class="kpi__meter kpi__meter--gold"><span :style="{ width: ratio(kpis.s6, kpis.owned) }"></span></div>
        <div class="kpi__sub">of your set-up characters</div>
      </div>
      <div class="kpi" data-test-account-kpi="r5">
        <div class="kpi__label"><span class="max-md:hidden">Weapon at R5</span><span class="md:hidden">R5</span></div>
        <div class="kpi__value">{{ kpis.r5 }}<span class="kpi__of">/ {{ kpis.owned }}</span></div>
        <div class="kpi__meter kpi__meter--gold"><span :style="{ width: ratio(kpis.r5, kpis.owned) }"></span></div>
        <div class="kpi__sub">worn weapons fully refined</div>
      </div>
      <div class="kpi" data-test-account-kpi="echoes">
        <div class="kpi__label"><span class="max-md:hidden">Echoes equipped</span><span class="md:hidden">Echoes</span></div>
        <div class="kpi__value">{{ kpis.echoes.equipped }}<span class="kpi__of">/ {{ kpis.echoes.total }}</span></div>
        <div class="kpi__meter"><span :style="{ width: ratio(kpis.echoes.equipped, kpis.echoes.total) }"></span></div>
        <div class="kpi__sub">of the echoes in your inventory</div>
      </div>
      <div class="kpi" data-test-account-kpi="teams">
        <div class="kpi__label"><span class="max-md:hidden">Teams you can field</span><span class="md:hidden">Teams</span></div>
        <div class="kpi__value">
          <template v-if="kpis.fieldable !== null">{{ kpis.fieldable }}</template>
          <span v-else class="kpi__dash">…</span>
        </div>
        <div class="kpi__meter kpi__meter--none"></div>
        <div class="kpi__sub">{{ kpis.teamsFieldable }} of your {{ kpis.teams }} saved · the rest stock</div>
      </div>
      <div class="kpi" data-test-account-kpi="score">
        <div class="kpi__label"><span class="max-md:hidden">Avg Build Score</span><span class="md:hidden">Build Score</span></div>
        <div class="kpi__value">
          <template v-if="kpis.averageScore !== null">
            <span class="kpi__grade" :class="gradeClass">{{ averageGrade.grade }}</span>{{ Math.round(kpis.averageScore) }}<span class="kpi__of">%</span>
          </template>
          <span v-else class="kpi__dash">—</span>
        </div>
        <div class="kpi__meter"><span :style="{ width: `${Math.min(100, kpis.averageScore ?? 0)}%` }"></span></div>
        <div class="kpi__sub">substat quality of equipped echoes</div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ — the /account hero: the strongest team the roster can field as the page's one big number, and the
// Account State as KPI tiles (set up, S6, R5, echoes, fieldable teams, the average of upstream's Build Score).
import { computed } from "vue";
import CharacterAvatar from "../display/CharacterAvatar.vue";
import PresetNameLabel from "../display/PresetNameLabel.vue";
import { characterMeta, characterShortName, elementColor } from "../display/names";
import { rankingsMineHash } from "./accountState";
import { memberShares } from "../myRankings/rows";
import { compact } from "../myRankings/format";
import { getGradeForSubstatScorePercent } from "../../echoes/rating";
import type { AccountKpis } from "./accountView";
import type { RunStatus } from "./useAccountData";

const props = defineProps<{ kpis: AccountKpis; status: RunStatus; owned: string[] }>();

const best = computed(() => props.kpis.bestTeam);
const shares = computed(() => (best.value ? memberShares(best.value) : []));
const ratio = (n: number, of: number): string => `${of > 0 ? Math.min(100, (n / of) * 100) : 0}%`;
const averageGrade = computed(() => getGradeForSubstatScorePercent(props.kpis.averageScore ?? 0));
const gradeClass = computed(() => `kpi__grade--${averageGrade.value.color}`);
/** a wash of the main DPS's element colour behind the hero */
const leadStyle = computed(() => {
  const main = shares.value[0]?.id ?? props.kpis.strongest?.id ?? null;
  const color = elementColor(characterMeta(main)?.element);
  return { "--acc-hero-tint": color };
});
</script>

<style scoped>
.acc-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.55fr);
  gap: 0.75rem;
}
.acc-hero__lead {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  min-width: 0;
  padding: 1rem 1.15rem 1rem;
  border-radius: 0.9rem;
  overflow: hidden;
  background:
    radial-gradient(28rem 14rem at 0% 0%, color-mix(in oklab, var(--acc-hero-tint) 26%, transparent), transparent 70%),
    radial-gradient(22rem 12rem at 100% 120%, oklch(var(--p) / 0.12), transparent 70%),
    oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.08);
}
.acc-hero__eyebrow,
.kpi__label {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: oklch(var(--bc) / 0.6);
}
.acc-hero__team {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  min-width: 0;
}
.acc-hero__faces {
  display: inline-flex;
  gap: 0.35rem;
  flex-shrink: 0;
}
.acc-hero__figure {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.acc-hero__value {
  font-size: 3rem;
  font-weight: 650;
  line-height: 1;
  letter-spacing: -0.02em;
}
.acc-hero__unit {
  margin-top: 0.2rem;
  font-size: 0.75rem;
  color: oklch(var(--bc) / 0.6);
  white-space: nowrap;
}
.acc-hero__name {
  min-width: 0;
  font-size: 0.9rem;
}
.acc-hero__shares {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
/* one bar split by member share, 2 px surface gaps between the fills */
.acc-hero__bar {
  display: flex;
  gap: 2px;
  height: 0.35rem;
  border-radius: 9999px;
  overflow: hidden;
}
.acc-hero__bar > span {
  display: block;
  height: 100%;
}
.acc-hero__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.15rem 0.85rem;
  font-size: 0.72rem;
  color: oklch(var(--bc) / 0.7);
}
.acc-hero__legend li {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
.acc-hero__legend b {
  font-weight: 650;
  color: oklch(var(--bc) / 0.9);
}
.acc-hero__swatch {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 0.15rem;
}
.acc-hero__links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 1rem;
  margin-top: auto;
  font-size: 0.75rem;
}
.acc-hero__link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-weight: 600;
  color: oklch(var(--p));
}
.acc-hero__link:hover {
  text-decoration: underline;
}
.acc-hero__strongest {
  color: oklch(var(--bc) / 0.6);
}
.acc-hero__strongest b {
  font-weight: 650;
  color: oklch(var(--bc) / 0.85);
}
.acc-hero__wait {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.acc-hero__skeleton {
  width: 12rem;
  height: 3rem;
  border-radius: 0.5rem;
  background: linear-gradient(90deg, oklch(var(--bc) / 0.06), oklch(var(--bc) / 0.12), oklch(var(--bc) / 0.06));
  background-size: 200% 100%;
  animation: acc-hero-shimmer 1.2s linear infinite;
}
@keyframes acc-hero-shimmer {
  to {
    background-position: -200% 0;
  }
}
.acc-hero__wait-text,
.acc-hero__none-text {
  font-size: 0.78rem;
  color: oklch(var(--bc) / 0.6);
}
.acc-hero__none {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.acc-hero__none-title {
  font-size: 1.1rem;
  font-weight: 650;
}
.acc-hero__kpis {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.6rem;
}
.kpi {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
  padding: 0.7rem 0.85rem 0.75rem;
  border-radius: 0.8rem;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
}
.kpi__value {
  display: flex;
  align-items: baseline;
  gap: 0.3rem;
  font-size: 1.55rem;
  font-weight: 650;
  line-height: 1.15;
}
.kpi__of {
  font-size: 0.8rem;
  font-weight: 600;
  color: oklch(var(--bc) / 0.5);
}
.kpi__dash {
  color: oklch(var(--bc) / 0.35);
}
.kpi__grade {
  align-self: center;
  margin-right: 0.15rem;
  padding: 0.05rem 0.4rem;
  border-radius: 0.35rem;
  font-size: 0.8rem;
  font-weight: 800;
  line-height: 1.4;
  color: oklch(var(--bc));
  background: oklch(var(--bc) / 0.1);
}
.kpi__grade--green {
  color: #fff;
  background: #047857;
}
.kpi__grade--blue {
  color: #fff;
  background: #2563eb;
}
.kpi__grade--purple {
  color: #fff;
  background: #9333ea;
}
.kpi__grade--gold {
  color: #1c1400;
  background: #eab308;
}
.kpi__grade--red {
  color: #fff;
  background: #dc2626;
}
/* the meter's track is a light step of its own fill */
.kpi__meter {
  height: 0.25rem;
  border-radius: 9999px;
  background: oklch(var(--p) / 0.16);
  overflow: hidden;
}
.kpi__meter > span {
  display: block;
  height: 100%;
  border-radius: 9999px;
  background: oklch(var(--p));
  transition: width 0.3s ease;
}
.kpi__meter--gold {
  background: rgb(224 172 70 / 0.18);
}
.kpi__meter--gold > span {
  background: #e0ac46;
}
.kpi__meter--none {
  background: transparent;
}
.kpi__sub {
  font-size: 0.7rem;
  color: oklch(var(--bc) / 0.55);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 1023px) {
  .acc-hero {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 767px) {
  .acc-hero {
    gap: 0.5rem;
  }
  .acc-hero__lead {
    padding: 0.8rem 0.85rem;
    gap: 0.45rem;
  }
  .acc-hero__faces :deep(.wt-avatar) {
    width: 34px !important;
    height: 34px !important;
  }
  .acc-hero__team {
    gap: 0.6rem;
  }
  .acc-hero__value {
    font-size: 2rem;
  }
  .acc-hero__kpis {
    gap: 0.35rem;
  }
  .kpi {
    padding: 0.45rem 0.5rem 0.5rem;
    gap: 0.15rem;
    border-radius: 0.65rem;
  }
  .kpi__label {
    font-size: 0.55rem;
    letter-spacing: 0.04em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .kpi__value {
    font-size: 1rem;
    flex-wrap: wrap;
    column-gap: 0.15rem;
    row-gap: 0;
  }
  .kpi__of {
    font-size: 0.6rem;
  }
  .kpi__grade {
    font-size: 0.6rem;
    padding: 0 0.25rem;
  }
  .kpi__sub {
    display: none;
  }
}
</style>
