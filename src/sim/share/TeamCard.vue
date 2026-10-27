<template>
  <!-- Wuthering Tools+ team card, 1080 × 1350 (4:5, the portrait size feeds and phones show whole), in the layout of
       Fribbels' HSR "Team Showcase": one tall column per member, art on top, gear below. Fixed px, own theme. -->
  <div class="share-team" :data-theme="theme" data-test-share-team-card>
    <header class="share-team__header">
      <div class="share-team__title-block">
        <div class="share-team__kicker">Team</div>
        <div class="share-team__title" :title="teamName">{{ teamName }}</div>
        <div class="share-team__muted">{{ view.members.map((m) => m.name).join(" · ") }}</div>
      </div>
      <div v-if="showNumbers && headline" class="share-team__headline" data-test-share-card-headline>
        <div class="share-team__headline-value">{{ compactNumber(headline.value) }}</div>
        <div class="share-team__headline-unit">team {{ headlineLabel(headline) }}</div>
        <div class="share-team__muted share-team__small">
          <template v-if="loopSeconds">loop {{ loopSeconds }} s · </template>WT+ engine · {{ headline.enemy }}
        </div>
      </div>
    </header>

    <div class="share-team__columns">
      <template v-for="(col, i) in columns" :key="col.member?.charId ?? `slot-${i}`">
        <section v-if="!col.member" class="share-team__member share-team__member--empty" data-test-share-team-empty-slot>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          <span>{{ col.id ? "Not in this app yet" : "Empty slot" }}</span>
        </section>
        <template v-else>
          <section v-for="m in [col.member!]" :key="m.charId" class="share-team__member" :style="{ '--accent': accentOf(m) }">
            <div class="share-team__art">
              <img v-if="artOf(m)" :src="artOf(m)!" alt="" @error="failed[m.charId] = true" />
              <div class="share-team__art-scrim"></div>
              <div class="share-team__element">{{ m.element }}</div>
              <div class="share-team__identity">
                <div class="share-team__name" :class="{ 'share-team__name--four': m.rarity === 4 }">{{ m.name }}</div>
                <div class="share-team__seq"><span class="share-team__seq-badge">S{{ m.sequence }}</span> Lv {{ m.level }}</div>
              </div>
            </div>

            <div class="share-team__weapon">
              <div class="share-team__weapon-icon" :class="`share-team__rarity-${m.weapon?.rarity ?? 0}`">
                <img v-if="m.weapon?.image" :src="m.weapon.image" alt="" />
              </div>
              <div class="share-team__weapon-text">
                <div class="share-team__weapon-name">{{ m.weapon?.name ?? "No weapon" }}</div>
                <div v-if="m.weapon" class="share-team__muted share-team__small">R{{ m.weapon.rank }} · Lv {{ m.weapon.level }}</div>
              </div>
            </div>

            <div v-if="showNumbers && share(m) !== null" class="share-team__share">
              <div class="share-team__share-row">
                <span>{{ slotFigure(m.charId) }}</span>
                <span class="share-team__share-pct">{{ share(m) }}%</span>
              </div>
              <div class="share-team__bar"><div :style="{ width: `${share(m)}%` }"></div></div>
            </div>

            <div class="share-team__stats">
              <div v-for="s in m.stats" :key="s.key" class="share-team__stat">
                <span class="share-team__muted">{{ s.label }}</span>
                <span class="share-team__stat-value">{{ s.display }}</span>
              </div>
            </div>

            <div class="share-team__echoes">
              <div v-for="(e, j) in m.echoes" :key="j" class="share-team__echo" :class="{ 'share-team__echo--empty': !e }">
                <template v-if="e">
                  <div class="share-team__echo-pic"><img v-if="e.image" :src="e.image" alt="" /></div>
                  <div class="share-team__echo-body">
                    <div class="share-team__echo-top">
                      <span class="share-team__cost">{{ e.cost }}</span>
                      <img v-if="e.setIcon" :src="e.setIcon" alt="" class="share-team__set-icon" />
                      <span class="share-team__echo-main">{{ e.mainLabel }} {{ e.mainDisplay }}</span>
                    </div>
                    <div class="share-team__subs">
                      <span v-for="sub in e.subs" :key="sub.key" class="share-team__sub">
                        <span class="share-team__muted">{{ sub.label }}</span>
                        <b :class="`share-tone-${sub.tone}`">{{ sub.display }}</b>
                      </span>
                    </div>
                  </div>
                </template>
                <span v-else class="share-team__muted share-team__small">Empty slot</span>
              </div>
            </div>
          </section>
        </template>
      </template>
    </div>

    <footer class="share-team__footer">
      <span v-if="owner?.name || owner?.uid" class="share-team__owner">{{ [owner?.name, owner?.uid ? `UID ${owner.uid}` : ""].filter(Boolean).join(" · ") }}</span>
      <span class="share-team__data-mark">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7l8-4 8 4-8 4-8-4zm0 5l8 4 8-4M4 17l8 4 8-4" /></svg>
        Team data inside — drop on /share to load it
      </span>
      <span class="share-team__site">wuthering-tools-plus.vercel.app</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from "vue";
import type { ShareHeadline } from "./buildCodec";
import { ELEMENT_COLOR, type CardView, type MemberView } from "./cardView";
import { compactNumber, headlineLabel } from "./headline";

const props = defineProps<{
  view: CardView;
  headline: ShareHeadline | null;
  showNumbers: boolean;
  owner: { uid?: string; name?: string } | null;
  theme: "dark" | "light";
  teamName: string;
  slots: Array<string | null>;
  duration: number | string | null;
}>();

const failed = reactive<Record<string, boolean>>({});
const artOf = (m: MemberView): string | null => (failed[m.charId] || !m.art ? m.headshot : m.art);
const accentOf = (m: MemberView): string => ELEMENT_COLOR[m.element ?? ""] ?? "#4b6bfb";
const slotOf = (charId: string): number => props.slots.indexOf(charId);
/** Three columns in slot order; an empty slot (or one whose character this app lacks) keeps its place. */
const columns = computed<Array<{ id: string | null; member: MemberView | null }>>(() => {
  const byId = new Map(props.view.members.map((m) => [m.charId, m]));
  const placed = [0, 1, 2].map((i) => {
    const id = props.slots?.[i] ?? null;
    return { id, member: id ? (byId.get(id) ?? null) : null };
  });
  if (placed.filter((c) => c.member).length === props.view.members.length) return placed;
  // slots that don't name the members (a hand-made card): the members in order
  return [0, 1, 2].map((i) => ({ id: props.view.members[i]?.charId ?? null, member: props.view.members[i] ?? null }));
});
// the loop length: the team's duration, else what the headline implies (avg DMG ÷ DPS — a gear-only link drops the duration)
const seconds = computed<number | null>(() => {
  const n = Number(props.duration);
  if (Number.isFinite(n) && n > 0) return n;
  const h = props.headline;
  return h?.dps && h.avgDamage > 0 ? h.avgDamage / h.dps : null;
});
const loopSeconds = computed(() => (seconds.value ? Math.round(seconds.value * 10) / 10 : null));
/** A member's part of the team number, in the headline's unit: DPS (damage ÷ the loop) or avg DMG per rotation. */
function slotFigure(charId: string): string {
  const dmg = props.headline?.perSlot?.[slotOf(charId)] ?? 0;
  if (props.headline?.metric === "dps" && seconds.value) return `${compactNumber(dmg / seconds.value)} DPS`;
  return `${compactNumber(dmg)} avg DMG`;
}
function share(m: MemberView): number | null {
  const per = props.headline?.perSlot;
  if (!per) return null;
  const total = per.reduce((a, b) => a + b, 0);
  const mine = per[slotOf(m.charId)] ?? 0;
  return total > 0 ? Math.round((mine / total) * 1000) / 10 : null;
}
</script>

<style scoped>
.share-team {
  display: flex;
  flex-direction: column;
  width: 1080px;
  height: 1350px;
  padding: 30px 28px 22px;
  gap: 22px;
  overflow: hidden;
  font-family: "Figtree", sans-serif;
  font-size: 15px;
  line-height: 1.25;
  color: oklch(var(--bc));
  background:
    radial-gradient(800px 500px at 0% 0%, oklch(var(--p) / 0.14), transparent 70%),
    oklch(var(--b1));
  box-sizing: border-box;
  text-align: left;
}
.share-team *,
.share-team *::before {
  box-sizing: border-box;
}
.share-team__muted {
  color: oklch(var(--bc) / 0.62);
}
.share-team__small {
  font-size: 12px;
}
.share-team__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 24px;
  min-height: 112px;
}
.share-team__title-block {
  min-width: 0;
}
.share-team__kicker {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: oklch(var(--p));
}
.share-team__title {
  margin: 4px 0 6px;
  font-size: 34px;
  font-weight: 800;
  line-height: 1.08;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.share-team__headline {
  flex: none;
  text-align: right;
}
.share-team__headline-value {
  font-size: 64px;
  font-weight: 800;
  line-height: 0.95;
  letter-spacing: -0.02em;
  color: oklch(var(--p));
  font-variant-numeric: tabular-nums;
}
.share-team__headline-unit {
  margin: 4px 0 2px;
  font-size: 16px;
  font-weight: 700;
}

.share-team__columns {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  flex: 1 1 auto;
  min-height: 0;
}
.share-team__member {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 10px;
  border-radius: 18px;
  background: oklch(var(--b2));
  border: 1px solid oklch(var(--bc) / 0.08);
  border-top: 4px solid var(--accent);
}
.share-team__member--empty {
  align-items: center;
  justify-content: center;
  gap: 12px;
  border: 2px dashed oklch(var(--bc) / 0.16);
  background: oklch(var(--b2) / 0.5);
  color: oklch(var(--bc) / 0.45);
  font-size: 18px;
  font-weight: 700;
}
.share-team__member--empty svg {
  width: 44px;
  height: 44px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
}
.share-team__art {
  position: relative;
  height: 330px;
  flex: none;
  border-radius: 12px;
  overflow: hidden;
  background: oklch(var(--b3));
}
.share-team__art img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 15%;
}
.share-team__art-scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(0deg, rgba(0, 0, 0, 0.82) 0%, rgba(0, 0, 0, 0) 50%);
}
.share-team__element {
  position: absolute;
  top: 10px;
  left: 10px;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #0b0b0f;
  background: var(--accent);
}
.share-team__identity {
  position: absolute;
  left: 14px;
  right: 10px;
  bottom: 12px;
  color: #fff;
}
.share-team__name {
  font-size: 30px;
  font-weight: 800;
  line-height: 1.02;
  color: #fcd34d;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
  overflow-wrap: anywhere;
}
.share-team__name--four {
  color: #c4b5fd;
}
.share-team__seq {
  margin-top: 6px;
  font-size: 14px;
}
.share-team__seq-badge {
  padding: 1px 8px;
  border-radius: 6px;
  font-weight: 800;
  color: #0b0b0f;
  background: var(--accent);
}
.share-team__weapon {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.share-team__weapon-icon {
  width: 48px;
  height: 48px;
  flex: none;
  border-radius: 10px;
  border: 2px solid oklch(var(--bc) / 0.12);
  background: oklch(var(--b1));
  overflow: hidden;
}
.share-team__rarity-5 {
  border-color: #f5c451;
}
.share-team__rarity-4 {
  border-color: #a78bfa;
}
.share-team__weapon-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.share-team__weapon-text {
  min-width: 0;
}
.share-team__weapon-name {
  font-size: 16px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.share-team__share-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
}
.share-team__share-pct {
  font-weight: 800;
  color: var(--accent);
}
/* yellow / green accents on white: darken text set in the accent colour */
[data-theme="light"] .share-team__share-pct {
  color: color-mix(in srgb, var(--accent) 62%, #000);
}
.share-team__bar {
  height: 6px;
  margin-top: 4px;
  border-radius: 999px;
  background: oklch(var(--bc) / 0.1);
  overflow: hidden;
}
.share-team__bar div {
  height: 100%;
  border-radius: 999px;
  background: var(--accent);
}
.share-team__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 3px 10px;
  padding: 8px 10px;
  border-radius: 10px;
  background: oklch(var(--b1));
  font-size: 13px;
}
.share-team__stat {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  min-width: 0;
}
.share-team__stat > span:first-child {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.share-team__stat-value {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.share-team__echoes {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1 1 auto;
  min-height: 0;
}
.share-team__echo {
  display: flex;
  align-items: center;
  gap: 9px;
  flex: 1 1 0;
  min-height: 0;
  padding: 6px 9px;
  border-radius: 10px;
  background: oklch(var(--b1));
  overflow: hidden;
}
.share-team__echo--empty {
  align-items: center;
  justify-content: center;
}
.share-team__echo-pic {
  width: 50px;
  height: 50px;
  align-self: flex-start;
  margin-top: 4px;
  flex: none;
  border-radius: 8px;
  overflow: hidden;
  background: oklch(var(--b3));
}
.share-team__echo-pic img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.share-team__echo-body {
  flex: 1 1 auto;
  min-width: 0;
}
.share-team__echo-top {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 14.5px;
}
.share-team__cost {
  min-width: 17px;
  padding: 0 4px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 800;
  text-align: center;
  color: #0b0b0f;
  background: var(--accent);
}
.share-team__set-icon {
  width: 16px;
  height: 16px;
}
.share-team__echo-main {
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.share-team__subs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 3px 10px;
  margin-top: 5px;
  font-size: 13.5px;
}
.share-team__sub {
  display: flex;
  justify-content: space-between;
  gap: 4px;
  min-width: 0;
}
.share-team__sub > span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.share-team__sub b {
  font-variant-numeric: tabular-nums;
}
.share-tone-1 { color: #34d399; }
.share-tone-2 { color: #60a5fa; }
.share-tone-3 { color: #c084fc; }
.share-tone-4 { color: #fbbf24; }
[data-theme="light"] .share-tone-1 { color: #047857; }
[data-theme="light"] .share-tone-2 { color: #1d4ed8; }
[data-theme="light"] .share-tone-3 { color: #7e22ce; }
[data-theme="light"] .share-tone-4 { color: #b45309; }
.share-team__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  font-size: 13px;
  color: oklch(var(--bc) / 0.55);
  white-space: nowrap;
}
.share-team__owner {
  margin-right: auto;
  font-weight: 700;
  color: oklch(var(--bc) / 0.85);
}
.share-team__data-mark {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-weight: 700;
  color: oklch(var(--p));
  border: 1px solid oklch(var(--p) / 0.45);
}
.share-team__data-mark svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linejoin: round;
}
.share-team__site {
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
</style>
