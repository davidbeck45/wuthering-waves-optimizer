<template>
  <!-- Wuthering Tools+ share card, 1200 × 630 (the link-preview size Discord / X / Reddit crop to). Sized in px, not
       rem: a phone's large-text setting must not reflow an image. Own DaisyUI theme (data-theme), so the export
       looks the same whatever theme the app is in. -->
  <div
    class="share-post"
    :data-theme="theme"
    :style="{ '--accent': accent }"
    data-test-share-post-card>
    <div class="share-post__art">
      <img v-if="artSrc" :src="artSrc" class="share-post__art-img" alt="" @error="artFailed = true" />
      <div class="share-post__art-scrim"></div>
      <div class="share-post__element">{{ view.element }}</div>
      <div class="share-post__identity">
        <div class="share-post__name" :class="{ 'share-post__name--four': view.rarity === 4 }">{{ view.name }}</div>
        <div class="share-post__seq">
          <span class="share-post__seq-badge">S{{ view.sequence }}</span>
          <span>Lv {{ view.level }}</span>
          <span class="share-post__dot">·</span>
          <span class="share-post__talents" title="Talents: basic / skill / forte / liberation / intro">{{ view.talents.join(" / ") }}</span>
        </div>
      </div>
    </div>

    <div class="share-post__main">
      <div class="share-post__top">
        <div class="share-post__weapon">
          <div class="share-post__weapon-icon" :class="`share-post__rarity-${view.weapon?.rarity ?? 0}`">
            <img v-if="view.weapon?.image" :src="view.weapon.image" alt="" />
          </div>
          <div class="share-post__weapon-text">
            <div class="share-post__weapon-name">{{ view.weapon?.name ?? "No weapon" }}</div>
            <div v-if="view.weapon" class="share-post__muted">R{{ view.weapon.rank }} · Lv {{ view.weapon.level }}</div>
          </div>
        </div>
        <div v-if="showNumbers && headline" class="share-post__headline" data-test-share-card-headline>
          <div class="share-post__headline-row">
            <span class="share-post__headline-value">{{ compactNumber(headline.value) }}</span>
            <span class="share-post__headline-unit">{{ headlineLabel(headline) }}</span>
          </div>
          <div class="share-post__headline-rotation" :title="headline.rotationName">{{ headline.rotationName }}</div>
          <div class="share-post__muted share-post__small">WT+ engine · {{ headline.enemy }}</div>
        </div>
      </div>

      <div class="share-post__stats">
        <div v-for="s in view.stats" :key="s.key" class="share-post__stat">
          <img v-if="s.icon" :src="s.icon" alt="" class="share-post__stat-icon" />
          <span class="share-post__stat-label">{{ s.label }}</span>
          <span class="share-post__stat-value">{{ s.display }}</span>
        </div>
      </div>

      <div class="share-post__echoes">
        <div v-for="(e, i) in view.echoes" :key="i" class="share-post__echo" :class="{ 'share-post__echo--empty': !e }">
          <template v-if="e">
            <div class="share-post__echo-head">
              <div class="share-post__echo-pic">
                <img v-if="e.image" :src="e.image" alt="" />
              </div>
              <div class="share-post__echo-meta">
                <div class="share-post__echo-badges">
                  <span class="share-post__cost">{{ e.cost }}</span>
                  <img v-if="e.setIcon" :src="e.setIcon" :title="e.setLabel ?? ''" alt="" class="share-post__set-icon" />
                </div>
                <div v-if="e.setLabel" class="share-post__echo-set">{{ e.setLabel }}</div>
              </div>
            </div>
            <div class="share-post__echo-name" :title="e.name">{{ e.name }}</div>
            <div class="share-post__echo-main">
              <span>{{ e.mainLabel }}</span>
              <span>{{ e.mainDisplay }}</span>
            </div>
            <div class="share-post__subs">
              <div v-for="sub in e.subs" :key="sub.key" class="share-post__sub">
                <span class="share-post__sub-label">{{ sub.label }}</span>
                <span class="share-post__sub-value" :class="`share-tone-${sub.tone}`">{{ sub.display }}</span>
              </div>
            </div>
            <div class="share-post__echo-foot" :title="'Crit value: 2 × Crit Rate + Crit DMG from the substats'">
              <span class="share-post__cv">CV {{ e.cv.toFixed(1) }}</span>
              <div class="share-post__cv-bar"><div :style="{ width: `${Math.min(100, (e.cv / CV_MAX) * 100)}%` }"></div></div>
            </div>
          </template>
          <span v-else class="share-post__muted">Empty slot</span>
        </div>
      </div>

      <div class="share-post__footer">
        <div class="share-post__sets">
          <span v-for="s in view.sets" :key="s.key" class="share-post__set">
            <img v-if="s.icon" :src="s.icon" alt="" />{{ s.count }}pc {{ s.label }}
          </span>
        </div>
        <div class="share-post__brand">
          <span v-if="owner?.name || owner?.uid" class="share-post__owner">{{ [owner?.name, owner?.uid ? `UID ${owner.uid}` : ""].filter(Boolean).join(" · ") }}</span>
          <span class="share-post__data-mark" title="This image carries the build: drop it on /share to load it">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7l8-4 8 4-8 4-8-4zm0 5l8 4 8-4M4 17l8 4 8-4" /></svg>
            Build data inside
          </span>
          <span class="share-post__site">wuthering-tools-plus.vercel.app/share</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { ShareHeadline } from "./buildCodec";
import { ELEMENT_COLOR, type MemberView } from "./cardView";
import { ECHO_CV_MAX as CV_MAX } from "../../echoes/stats";
import { compactNumber, headlineLabel } from "./headline";

const props = defineProps<{
  view: MemberView;
  headline: ShareHeadline | null;
  showNumbers: boolean;
  owner: { uid?: string; name?: string } | null;
  theme: "dark" | "light";
}>();

const accent = computed(() => ELEMENT_COLOR[props.view.element ?? ""] ?? "#4b6bfb");
const artFailed = ref(false);
watch(() => props.view.charId, () => (artFailed.value = false));
const artSrc = computed(() => (artFailed.value || !props.view.art ? props.view.headshot : props.view.art));
</script>

<style scoped>
.share-post {
  position: relative;
  display: flex;
  width: 1200px;
  height: 630px;
  overflow: hidden;
  font-family: "Figtree", sans-serif;
  font-size: 15px;
  line-height: 1.25;
  color: oklch(var(--bc));
  background:
    radial-gradient(900px 420px at 100% 0%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 70%),
    oklch(var(--b1));
  box-sizing: border-box;
  text-align: left;
}
.share-post *,
.share-post *::before {
  box-sizing: border-box;
}
/* text set in the element colour: as is on dark, darkened on white (Spectro yellow, Aero green) */
.share-post {
  --accent-ink: var(--accent);
}
.share-post[data-theme="light"] {
  --accent-ink: color-mix(in srgb, var(--accent) 62%, #000);
}
.share-post__muted {
  color: oklch(var(--bc) / 0.6);
}
.share-post__small {
  font-size: 12px;
}

/* the art column */
.share-post__art {
  position: relative;
  width: 310px;
  flex: none;
  overflow: hidden;
  background: oklch(var(--b3));
}
.share-post__art-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 18%;
}
.share-post__art-scrim {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(0deg, rgba(0, 0, 0, 0.82) 0%, rgba(0, 0, 0, 0.05) 45%, rgba(0, 0, 0, 0.25) 100%),
    linear-gradient(90deg, transparent 70%, color-mix(in srgb, oklch(var(--b1)) 70%, transparent) 100%);
}
.share-post__element {
  position: absolute;
  top: 18px;
  left: 18px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #0b0b0f;
  background: var(--accent);
}
.share-post__identity {
  position: absolute;
  left: 20px;
  right: 16px;
  bottom: 20px;
  color: #fff;
}
.share-post__name {
  font-size: 40px;
  font-weight: 800;
  line-height: 1.02;
  color: #fcd34d;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.6);
  overflow-wrap: anywhere;
}
.share-post__name--four {
  color: #c4b5fd;
}
.share-post__seq {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 15px;
  color: rgba(255, 255, 255, 0.9);
}
.share-post__seq-badge {
  padding: 1px 9px;
  border-radius: 6px;
  font-weight: 800;
  color: #0b0b0f;
  background: var(--accent);
}
.share-post__dot {
  opacity: 0.5;
}
.share-post__talents {
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
}

/* the right column */
.share-post__main {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  padding: 22px 26px 16px 24px;
  gap: 14px;
}
.share-post__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  min-height: 78px;
}
.share-post__weapon {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
.share-post__weapon-icon {
  width: 72px;
  height: 72px;
  flex: none;
  border-radius: 12px;
  background: oklch(var(--b2));
  border: 2px solid oklch(var(--bc) / 0.12);
  overflow: hidden;
}
.share-post__rarity-5 {
  border-color: #f5c451;
  background: linear-gradient(160deg, rgba(245, 196, 81, 0.28), oklch(var(--b2)) 70%);
}
.share-post__rarity-4 {
  border-color: #a78bfa;
  background: linear-gradient(160deg, rgba(167, 139, 250, 0.25), oklch(var(--b2)) 70%);
}
.share-post__weapon-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.share-post__weapon-text {
  min-width: 0;
}
.share-post__weapon-name {
  font-size: 22px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.share-post__headline {
  max-width: 440px;
  text-align: right;
}
.share-post__headline-row {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 8px;
}
.share-post__headline-value {
  font-size: 46px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.01em;
  color: var(--accent-ink);
  font-variant-numeric: tabular-nums;
}
.share-post__headline-unit {
  font-size: 14px;
  font-weight: 600;
  color: oklch(var(--bc) / 0.7);
}
.share-post__headline-rotation {
  margin-top: 4px;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.share-post__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px 8px;
}
.share-post__stat {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 10px;
  border-radius: 8px;
  background: oklch(var(--b2));
  min-width: 0;
}
.share-post__stat-icon {
  width: 18px;
  height: 18px;
  flex: none;
}
[data-theme="light"] .share-post__stat-icon,
[data-theme="light"] .share-post__sub img {
  filter: invert(1);
}
.share-post__stat-label {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13px;
  color: oklch(var(--bc) / 0.7);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.share-post__stat-value {
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.share-post__echoes {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  flex: 1 1 auto;
  min-height: 0;
}
.share-post__echo {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  background: oklch(var(--b2));
  border: 1px solid oklch(var(--bc) / 0.08);
  min-width: 0;
  overflow: hidden;
}
.share-post__echo--empty {
  align-items: center;
  justify-content: center;
  border-style: dashed;
}
.share-post__echo-head {
  display: flex;
  gap: 9px;
  align-items: flex-start;
  min-width: 0;
}
.share-post__echo-pic {
  width: 56px;
  height: 56px;
  flex: none;
  border-radius: 10px;
  overflow: hidden;
  background: oklch(var(--b3));
}
.share-post__echo-pic img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.share-post__echo-meta {
  min-width: 0;
  flex: 1 1 auto;
}
.share-post__echo-badges {
  display: flex;
  align-items: center;
  gap: 5px;
}
.share-post__cost {
  min-width: 18px;
  padding: 0 5px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 800;
  text-align: center;
  color: #0b0b0f;
  background: var(--accent);
}
.share-post__set-icon {
  width: 18px;
  height: 18px;
}
.share-post__echo-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid oklch(var(--bc) / 0.08);
}
.share-post__cv {
  font-size: 13px;
  font-weight: 800;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.share-post__cv-bar {
  flex: 1 1 auto;
  height: 6px;
  border-radius: 999px;
  background: oklch(var(--bc) / 0.1);
  overflow: hidden;
}
.share-post__cv-bar div {
  height: 100%;
  border-radius: 999px;
  background: var(--accent);
}
.share-post__echo-set {
  margin-top: 4px;
  font-size: 11.5px;
  line-height: 1.15;
  color: oklch(var(--bc) / 0.6);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.share-post__echo-name {
  min-height: 31px;
  font-size: 13.5px;
  font-weight: 700;
  line-height: 1.15;
  color: oklch(var(--bc) / 0.9);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.share-post__echo-main {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 7px;
  border-radius: 7px;
  font-size: 14px;
  font-weight: 800;
  background: color-mix(in srgb, var(--accent) 16%, transparent);
}
.share-post__echo-main span:first-child {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.share-post__subs {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 2px 2px 0;
}
.share-post__sub {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  font-size: 15px;
}
.share-post__sub-label {
  color: oklch(var(--bc) / 0.72);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.share-post__sub-value {
  font-weight: 700;
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

.share-post__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 30px;
}
.share-post__sets {
  display: flex;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
}
.share-post__set {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 6px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  background: oklch(var(--b2));
}
.share-post__set img {
  width: 20px;
  height: 20px;
}
.share-post__brand {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  white-space: nowrap;
  color: oklch(var(--bc) / 0.55);
}
.share-post__owner {
  font-weight: 700;
  color: oklch(var(--bc) / 0.85);
}
.share-post__data-mark {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 999px;
  font-weight: 700;
  color: var(--accent-ink);
  border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
}
.share-post__data-mark svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linejoin: round;
}
.share-post__site {
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
</style>
