<template>
  <section class="tdx space-y-4" data-test-tdx>
    <header class="rounded-box border border-base-300 bg-base-100 px-4 py-3 max-sm:px-3">
      <div class="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div class="min-w-0 flex-1">
          <h2 class="text-lg font-semibold leading-tight">Where your Transducers go</h2>
          <p class="text-sm opacity-80">Every equipped five-line echo of your built resonators, ranked by what one Transducer is expected to add to its wearer's damage.</p>
        </div>
        <EchoLabPopover id="transducers" label="How the Transducer ranking is worked out">
          <p>Each echo is read the way the Re-roll tab reads it: every way to keep lines (31 of them) on the wearer's best rotation, scored by the damage engine. A row stands on the plan that pays best per Transducer under your filters.</p>
          <ul class="list-disc space-y-1 pl-4 opacity-80">
            <li v-for="a in assumptions" :key="a">{{ a }}</li>
          </ul>
        </EchoLabPopover>
      </div>
      <p class="mt-1 text-xs opacity-80" data-test-tdx-keep-is-lock>"Keep" a line here = lock it in the game's Data Modify screen (Data Bank); the lines you do not lock are re-rolled.</p>
      <p class="mt-1 text-xs opacity-70" data-test-tdx-scope>Equipped echoes only: spare echoes in your inventory are not ranked.</p>
      <p v-if="queue.length" class="mt-2 flex flex-wrap items-center gap-x-2 text-sm" role="status" data-test-tdx-progress :data-running="running ? 'yes' : 'no'">
        <span v-if="running" class="loading loading-spinner loading-xs text-primary" aria-hidden="true"></span>
        <span>{{ answeredCount }} of {{ queue.length }} echoes read</span>
        <span v-if="!running && runMs !== null" class="text-xs opacity-60">· {{ (runMs / 1000).toFixed(1) }} s</span>
        <span v-if="running && answeredCount" class="text-xs opacity-60">· the ranking fills in as each resonator's echoes are read</span>
      </p>
    </header>

    <div v-if="unfinishedList.length" class="rounded-box border border-base-300 bg-base-100 px-3 py-2 text-sm" data-test-tdx-unfinished>
        <div class="font-semibold">Not fully tuned ({{ unfinishedList.length }})</div>
        <ul class="mt-1 space-y-0.5">
          <li v-for="u in unfinishedList" :key="`${u.characterId}|${u.slot}`">
            {{ characterName(u.characterId) }}'s {{ echoName(slotOf(u.characterId, u.slot)?.echo) }}: {{ u.lines }} of 5 lines: finish tuning it first
            (<a :href="tuneHref" class="link link-primary" @click.prevent="emit('tune')">Tune or Feed</a>).
          </li>
        </ul>
      </div>
    <!-- nothing to rank -->
    <div v-if="!queue.length" class="rounded-box border border-base-300 bg-base-100 p-5 text-sm" data-test-tdx-empty>
      <p class="font-semibold">No equipped echo has all five substat lines yet.</p>
      <p class="mt-1 opacity-80">A Transducer only works on a fully tuned 5-star echo. Tune an echo to +25 and it appears here.</p>
    </div>

    <template v-else>
      <!-- best use -->
      <article v-if="best && best.plan" class="tdx__best rounded-box border-2 border-primary/60 bg-base-100 p-4 max-sm:p-3" data-test-tdx-best :data-key="best.key">
        <div class="text-xs font-semibold uppercase tracking-wide text-primary" data-test-tdx-best-heading>{{ bestHeading(running, answeredCount, queue.length) }}</div>
        <div class="mt-2 flex items-center gap-3">
          <img :src="portrait(best.advice.characterId)" alt="" class="el-portrait size-11 shrink-0" />
          <div class="min-w-0">
            <div class="font-semibold leading-tight">{{ characterName(best.advice.characterId) }}'s {{ echoName(best.advice.echo) }}</div>
            <div class="text-xs opacity-70">{{ slotLabel(best.advice.slot) }}</div>
          </div>
        </div>
        <div class="mt-2 flex flex-wrap gap-1.5 text-sm" data-test-tdx-best-lines>
          <span class="mr-1 self-center text-xs font-semibold opacity-70">Keep</span>
          <span v-for="l in keptLines(best)" :key="`k${l.field}`" class="el-chip el-chip--lock">{{ lineText(l.key, l.value) }}</span>
          <span v-if="!keptLines(best).length" class="text-xs opacity-70">nothing</span>
          <span class="ml-2 mr-1 self-center text-xs font-semibold opacity-70">Re-roll</span>
          <span v-for="l in rerolledLines(best)" :key="`r${l.field}`" class="el-chip el-chip--reroll">{{ lineText(l.key, l.value) }}</span>
        </div>
        <dl class="tdx__facts mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
          <div><dt>Transducers a try</dt><dd>{{ best.plan.cost }} ({{ best.plan.locks }} line{{ best.plan.locks === 1 ? "" : "s" }} kept)</dd></div>
          <div><dt>Chance one try beats the lines it has</dt><dd>{{ chanceText(best.plan.pImprove) }}</dd></div>
          <div class="sm:col-span-2">
            <dt>Expected gain of one try</dt>
            <dd class="el-up" data-test-tdx-best-gain>{{ signedPct(best.plan.expectedGain, 2) }} of {{ characterName(best.advice.characterId) }}'s rotation damage, about {{ fmtInt(best.damage) }} damage per rotation</dd>
          </div>
          <div><dt>A good try (1 in 10 gains this or more)</dt><dd data-test-tdx-best-good>{{ goodTryText(goodTry(best.plan)) }}</dd></div>
          <div><dt>Expected after 3 tries · after 5</dt><dd>{{ signedPct(gainAfter(best.plan, 3), 2) }} · {{ signedPct(gainAfter(best.plan, 5), 2) }}</dd></div>
          <div class="sm:col-span-2" data-test-tdx-best-top>
            <dt>The best it can roll</dt>
            <dd>{{ signedPct(best.plan.top.gain, 2) }} with {{ best.plan.top.lines.map((l) => lineText(l.key, l.value)).join(", ") || "the lines it has" }}<template v-if="oneIn(best.plan.top.chance)"> ({{ oneIn(best.plan.top.chance) }})</template></dd>
          </div>
        </dl>
        <p v-if="best.erUnknown" class="el-er-short mt-2 text-xs" data-test-tdx-er-caution>Caution: this re-rolls Energy Regen, and the app knows no Energy Regen need for {{ characterName(best.advice.characterId) }} (they are in no saved team). Keep it if their rotation needs it.</p>
        <p class="mt-2 text-xs opacity-70">Gains keep the better of the old and the new lines: you may discard a try, the Transducers are spent either way.</p>
      </article>
      <p v-else-if="!running && rows.length" class="rounded-box border border-base-300 bg-base-100 p-4 text-sm" data-test-tdx-best-none>No echo under these filters is expected to gain even 0.05 % from a Transducer: keep them as they are.</p>

      <!-- filters -->
      <div class="rounded-box border border-base-300 bg-base-100 p-3 text-sm" data-test-tdx-filters>
        <div class="mb-1 text-xs font-semibold uppercase tracking-wide opacity-60">Resonator <span class="font-normal normal-case tracking-normal">· {{ pickable.length }}, swipe for more</span></div>
        <ul class="tdx__rail -mx-1 flex gap-1.5 overflow-x-auto px-1 py-1" aria-label="Resonator">
          <li class="shrink-0">
            <button type="button" class="tdx__pick" :class="!view.character && 'tdx__pick--on'" :aria-pressed="!view.character" data-test-tdx-character="" @click="set({ character: null })">All</button>
          </li>
          <li v-for="id in pickable" :key="id" class="shrink-0">
            <button
              type="button"
              class="tdx__pick tdx__pick--face"
              :class="view.character === id && 'tdx__pick--on'"
              :aria-pressed="view.character === id"
              :title="characterName(id)"
              :aria-label="characterName(id)"
              :data-test-tdx-character="id"
              @click="set({ character: view.character === id ? null : id })">
              <img :src="portrait(id)" alt="" class="el-portrait size-9" loading="lazy" />
            </button>
          </li>
        </ul>

        <div class="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <fieldset>
            <legend class="mb-1 text-xs font-semibold uppercase tracking-wide opacity-60">Transducers a try</legend>
            <div class="flex flex-wrap gap-1">
              <button v-for="c in COSTS" :key="String(c.value)" type="button" class="tdx__seg" :class="view.cost === c.value && 'tdx__seg--on'" :aria-pressed="view.cost === c.value" :data-test-tdx-cost="c.value ?? 'any'" @click="setView(withCost(view, c.value))">{{ c.label }}</button>
            </div>
            <p class="mt-1 text-xs opacity-70">1 = up to two lines kept · 2 = three kept · 3 = four kept</p>
          </fieldset>
          <fieldset>
            <legend class="mb-1 text-xs font-semibold uppercase tracking-wide opacity-60">Lines kept</legend>
            <div class="flex flex-wrap gap-1">
              <button v-for="k in KEEPS" :key="String(k)" type="button" class="tdx__seg" :class="view.keep === k && 'tdx__seg--on'" :aria-pressed="view.keep === k" :data-test-tdx-keep="k ?? 'any'" @click="setView(withKeep(view, k))">{{ k ?? "Any" }}</button>
            </div>
          </fieldset>
          <fieldset>
            <legend class="mb-1 text-xs font-semibold uppercase tracking-wide opacity-60">Who</legend>
            <div class="flex flex-wrap gap-1">
              <button type="button" class="tdx__seg" :class="view.who === 'dealers' && 'tdx__seg--on'" :aria-pressed="view.who === 'dealers'" data-test-tdx-who="dealers" @click="set({ who: 'dealers' })">Damage dealers</button>
              <button type="button" class="tdx__seg" :class="view.who === 'everyone' && 'tdx__seg--on'" :aria-pressed="view.who === 'everyone'" data-test-tdx-who="everyone" @click="set({ who: 'everyone' })">Everyone</button>
            </div>
            <p v-if="view.who === 'dealers' && supports.length && !view.character" class="mt-1 text-xs opacity-70" data-test-tdx-supports>
              Left out: {{ supports.map(characterName).join(", ") }}. Echo Lab rates an echo on its wearer's own damage, which is not what a support's echoes are for.
            </p>
          </fieldset>
          <label class="block">
            <span class="mb-1 block text-xs font-semibold uppercase tracking-wide opacity-60">Order</span>
            <select class="select select-bordered select-sm w-full max-w-xs" :value="view.sort" data-test-tdx-sort @change="set({ sort: ($event.target as HTMLSelectElement).value as TransducerSort })">
              <option v-for="s in TRANSDUCER_SORTS" :key="s.id" :value="s.id">{{ s.label }}</option>
            </select>
            <span class="mt-1 block text-xs opacity-70">{{ sortHint }}</span>
          </label>
        </div>

        <div class="mt-3 border-t border-base-200 pt-2" data-test-tdx-switches>
          <div class="mb-1 text-xs font-semibold uppercase tracking-wide opacity-60">What the game does not publish</div>
          <label class="flex cursor-pointer items-start gap-2 py-1">
            <input type="checkbox" class="toggle toggle-sm toggle-primary mt-0.5" :checked="view.repeat" data-test-tdx-repeat @change="set({ repeat: ($event.target as HTMLInputElement).checked })" />
            <span>A re-rolled line can come back as the stat it was <span class="block text-xs opacity-70">The game's text excludes only kept (locked) substats; nothing more is published. Off reads it the other way.</span></span>
          </label>
          <label class="flex cursor-pointer items-start gap-2 py-1">
            <input type="checkbox" class="toggle toggle-sm toggle-primary mt-0.5" :checked="view.keepEr" data-test-tdx-keep-er @change="set({ keepEr: ($event.target as HTMLInputElement).checked })" />
            <span>Keep Energy Regen where the app knows no need <span class="block text-xs opacity-70">For resonators in no saved team the app cannot tell how much Energy Regen they need. Each type is assumed equally likely on a re-roll: the game does not publish the odds.</span></span>
          </label>
        </div>
      </div>

      <!-- unfinished, failed -->
      <div v-if="failed.length" class="alert alert-warning text-sm" data-test-tdx-failed>
        <ul>
          <li v-for="f in failed" :key="f.key">{{ characterName(f.characterId) }}'s {{ echoName(slotOf(f.characterId, f.slot)?.echo) }} could not be read: {{ f.error }}. The rest of the ranking stands.</li>
        </ul>
      </div>

      <!-- I have N Transducers -->
      <section class="rounded-box border border-base-300 bg-base-100 p-3 text-sm" data-test-tdx-budget>
        <div class="flex flex-wrap items-center gap-2">
          <label for="tdx-have" class="font-semibold">I have</label>
          <input
            id="tdx-have"
            type="number"
            inputmode="numeric"
            min="1"
            :max="MAX_BUDGET"
            class="input input-bordered input-sm w-20"
            :value="view.have"
            data-test-tdx-have
            @change="onHave($event)" />
          <span class="font-semibold">Transducers</span>
        </div>
        <p v-if="!spend.steps.length" class="mt-2 opacity-80" data-test-tdx-budget-none>{{ running && !advices.length ? "Reading your echoes…" : "No echo under these filters is worth a Transducer." }}</p>
        <template v-else>
          <p class="mt-2" data-test-tdx-budget-summary>
            Spend {{ spend.used }} of {{ spend.budget }}: about {{ fmtInt(spend.expectedDamage) }} more damage per rotation expected<template v-if="new Set(spend.steps.map((x) => x.advice.characterId)).size > 1">, the sum of each resonator's own rotation, one after another: not a team's damage</template><template v-else> on {{ characterName(spend.steps[0].advice.characterId) }}'s rotation</template>.
          </p>
          <ol class="mt-2 space-y-2">
            <li v-for="(s, i) in spend.steps" :key="s.key" class="rounded-lg bg-base-200 px-3 py-2" data-test-tdx-budget-step>
              <div class="font-semibold">{{ i + 1 }}. {{ characterName(s.advice.characterId) }}'s {{ echoName(s.advice.echo) }}: {{ s.tries }} tr{{ s.tries === 1 ? "y" : "ies" }}, {{ s.transducers }} Transducer{{ s.transducers === 1 ? "" : "s" }}</div>
              <div class="text-xs">Keep {{ planWords(s.advice, s.plan.lockedFields) || "nothing" }}; re-roll {{ planWords(s.advice, s.plan.rerolledFields) }}.</div>
              <div class="text-xs opacity-80" data-test-tdx-budget-any>{{ chanceText(s.pAny) }} chance at least one try improves it · {{ signedPct(s.expectedGain, 2) }} of {{ characterName(s.advice.characterId) }}'s rotation damage expected</div>
              <div v-if="rerollsUnknownEr(s.advice, s.plan)" class="el-er-short text-xs" data-test-tdx-budget-er>Re-rolls Energy Regen: the app knows no Energy Regen need for {{ characterName(s.advice.characterId) }} (in no saved team).</div>
            </li>
          </ol>
        </template>
        <p class="mt-2 text-xs opacity-70">Tries on one echo keep the same lines. After a re-roll you keep, update the echo here and look again.</p>
      </section>

      <!-- the ranking -->
      <section aria-label="Transducer ranking" data-test-tdx-ranking>
        <div class="mb-2 flex flex-wrap items-baseline gap-x-2 text-sm">
          <h3 class="font-semibold">Ranking</h3>
          <span class="text-xs opacity-70">{{ payingCount }} of {{ rows.length }} echoes worth a Transducer under these filters</span>
        </div>
        <p v-if="!rows.length" class="rounded-box border border-dashed border-base-300 px-4 py-6 text-center text-sm opacity-70" data-test-tdx-no-rows>
          {{ running ? "The first resonator is being read…" : "No echo under these filters." }}
        </p>
        <ol class="space-y-2">
          <li
            v-for="row in shownRows"
            :key="row.key"
            class="rounded-box border border-base-300 bg-base-100"
            :class="!row.pays && 'tdx__row--off'"
            :data-test-tdx-row="row.key"
            :data-pays="row.pays ? 'yes' : 'no'">
            <div class="p-3 max-sm:p-2.5">
              <div class="flex items-start gap-2">
                <span class="w-7 shrink-0 pt-1 text-center font-mono text-sm font-bold tabular-nums" :aria-label="row.pays ? `Rank ${row.rank}` : 'Not ranked'">{{ row.pays ? row.rank : "–" }}</span>
                <img :src="portrait(row.advice.characterId)" alt="" class="el-portrait size-9 shrink-0" loading="lazy" />
                <div class="min-w-0 flex-1">
                  <div class="truncate font-semibold leading-tight">{{ characterName(row.advice.characterId) }}</div>
                  <div class="flex min-w-0 items-center gap-1.5 text-xs opacity-80">
                    <img v-if="echoImage(row.advice.echo)" :src="echoImage(row.advice.echo) ?? undefined" alt="" class="size-5 shrink-0 rounded" loading="lazy" />
                    <span class="line-clamp-2">{{ echoName(row.advice.echo) }} · cost {{ slotOf(row.advice.characterId, row.advice.slot)?.cost ?? "?" }} · {{ slotLabel(row.advice.slot) }}</span>
                  </div>
                </div>
                <button
                  type="button"
                  class="tdx__toggle -mr-1 -mt-1 shrink-0"
                  :aria-expanded="openKey === row.key"
                  :aria-label="`Every plan for ${characterName(row.advice.characterId)}'s ${echoName(row.advice.echo)}`"
                  data-test-tdx-row-toggle
                  @click="openKey = openKey === row.key ? null : row.key">
                  <span class="text-xs opacity-70 max-sm:hidden">Plans</span>
                  <svg viewBox="0 0 24 24" class="size-4 opacity-70" :class="openKey === row.key && 'rotate-180'" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                </button>
              </div>
              <div v-if="row.plan" class="mt-2 flex flex-wrap gap-1 text-xs" data-test-tdx-row-lines>
                <span v-for="l in keptLines(row)" :key="`k${l.field}`" class="el-chip el-chip--lock" :aria-label="`Keep ${lineText(l.key, l.value)}`">Keep {{ lineText(l.key, l.value) }}</span>
                <span v-for="l in rerolledLines(row)" :key="`r${l.field}`" class="el-chip el-chip--reroll" :aria-label="`Re-roll ${lineText(l.key, l.value)}`">Re-roll {{ lineText(l.key, l.value) }}</span>
              </div>
              <dl v-if="row.plan" class="tdx__nums mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-5">
                <div><dt>Transducers a try</dt><dd>{{ row.plan.cost }}</dd></div>
                <div><dt>Chance to improve</dt><dd>{{ chanceText(row.plan.pImprove) }}</dd></div>
                <div><dt>Gain of one try, of their rotation</dt><dd :class="row.pays && 'el-up'">{{ signedPct(row.plan.expectedGain, 2) }}</dd></div>
                <div><dt>Damage per Transducer</dt><dd>{{ fmtInt(row.damagePerTransducer) }} a rotation</dd></div>
                <div class="max-sm:col-span-2"><dt>A good try (1 in 10 gains this or more)</dt><dd data-test-tdx-row-good>{{ goodTryText(goodTry(row.plan)) }}</dd></div>
              </dl>
              <p v-if="notWorthText(row)" class="mt-1 text-xs" data-test-tdx-row-why>{{ notWorthText(row) }}</p>
              <p v-if="jointEr.get(row.key)" class="el-er-short mt-1 text-xs" data-test-tdx-row-er-joint>
                Re-rolls Energy Regen, and so do {{ (jointEr.get(row.key) ?? 1) - 1 }} more of {{ characterName(row.advice.characterId) }}'s echoes here: each alone leaves {{ characterName(row.advice.characterId) }} at their Energy Regen need, all of them together would not. "I have N Transducers" above plans them together.
              </p>
              <p v-if="row.erUnknown" class="el-er-short mt-1 text-xs" data-test-tdx-row-er>Re-rolls Energy Regen: the app knows no Energy Regen need for {{ characterName(row.advice.characterId) }} (in no saved team).</p>
            </div>
            <div v-if="openKey === row.key" class="border-t border-base-200 px-3 pb-3 pt-2 text-xs" data-test-tdx-row-detail>
              <p class="mb-1 opacity-80">The best lines to keep at each count. Gains are of {{ characterName(row.advice.characterId) }}'s rotation damage.</p>
              <table class="w-full table-fixed tabular-nums">
                <thead>
                  <tr class="align-bottom leading-tight opacity-70 [&>th]:break-words [&>th]:hyphens-auto" data-test-tdx-plan-head>
                    <th class="w-[2.9rem] pb-1 text-left font-medium">Lines kept</th>
                    <th class="pb-1 text-right font-medium">Trans&shy;ducers a try</th>
                    <th class="pb-1 text-right font-medium">Chance to improve</th>
                    <th class="pb-1 text-right font-medium">Gain of one try</th>
                    <th class="pb-1 text-right font-medium">Gain per Trans&shy;ducer</th>
                    <th class="pb-1 text-right font-medium">After 3 tries</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="p in row.advice.plans" :key="p.locks" :class="p === row.plan && 'font-semibold text-primary'" data-test-tdx-plan>
                    <td>{{ p.locks }}</td>
                    <td class="text-right">{{ p.cost }}</td>
                    <td class="text-right">{{ chanceText(p.pImprove) }}</td>
                    <td class="text-right">{{ signedPct(p.expectedGain, 2) }}</td>
                    <td class="text-right">{{ signedPct(p.gainPerTransducer, 2) }}</td>
                    <td class="text-right">{{ signedPct(gainAfter(p, 3), 2) }}</td>
                  </tr>
                </tbody>
              </table>
              <p class="mt-1 opacity-70" data-test-tdx-plan-legend>Gains are expected gains, of {{ characterName(row.advice.characterId) }}'s rotation damage. After 3 tries = the expected gain of 3 tries with the same lines kept, keeping the best.</p>
              <a :href="rerollHref(row.advice.characterId)" class="link link-primary mt-2 inline-block py-2" data-test-tdx-row-reroll @click.prevent="emit('reroll', row.advice.characterId)">{{ characterName(row.advice.characterId) }} on the Re-roll tab, line by line ›</a>
            </div>
          </li>
        </ol>
        <button v-if="rows.length > shownRows.length" type="button" class="btn btn-ghost btn-sm mt-2 w-full" data-test-tdx-more @click="limit = rows.length">Show all {{ rows.length }} echoes</button>
      </section>

      <!-- the crit question -->
      <section class="rounded-box border border-base-300 bg-base-100 p-3 text-sm" data-test-tdx-crit>
        <h3 class="font-semibold">Is keeping Crit Rate and Crit DMG always right?</h3>
        <p class="mt-1 opacity-80">Keeping two lines costs the same one Transducer as keeping none, so the two lines worth most on that resonator are the ones to keep. That is usually the crit pair, and sometimes a high ATK % or a damage bonus beside one of them.</p>
        <p v-if="!crit.both.echoes" class="mt-2 opacity-80">{{ running ? "Waiting for echoes to be read…" : "No echo under these filters has both crit lines and a one-Transducer plan worth taking." }}</p>
        <template v-else>
          <p class="mt-2" data-test-tdx-crit-summary>
            Of {{ crit.both.echoes }} echo{{ crit.both.echoes === 1 ? "" : "es" }} with both crit lines, keeping exactly the two is the best one-Transducer plan on {{ crit.both.keepsBoth }}; one crit line and another stat is better on {{ crit.both.keepsOneAndOther }}<template v-if="crit.both.keepsLess">, and keeping fewer is better on {{ crit.both.keepsLess }}</template>. Over them, the crit rule gets {{ pct(crit.both.shareOfBest, 0) }} of the best plans' expected gain.
          </p>
          <p class="mt-1 text-xs opacity-80" data-test-tdx-crit-depends>
            These counts are read with a re-rolled line {{ view.repeat ? "able" : "never able" }} to come back as the stat it was (the switch under the filters): the game does not publish which, and the answer changes with it.
          </p>
          <ul v-if="crit.both.exceptions.length" class="mt-2 space-y-1">
            <li v-for="x in crit.both.exceptions.slice(0, 5)" :key="x.key" class="rounded-lg bg-base-200 px-3 py-1.5 text-xs" data-test-tdx-crit-exception>
              {{ characterName(x.advice.characterId) }}'s {{ echoName(x.advice.echo) }}: keeping {{ x.kept.map(statName).join(" and ") || "nothing" }} expects {{ signedPct(x.best.expectedGain, 2) }}; keeping the crit pair, {{ x.critPlan ? signedPct(x.critPlan.expectedGain, 2) : "no such plan" }}.
            </li>
          </ul>
        </template>
        <p v-if="critErBoundText(crit.erBound)" class="mt-2 text-xs opacity-80" data-test-tdx-crit-erbound>{{ critErBoundText(crit.erBound) }}</p>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ Echo Lab — the "Transducers" tab: every equipped five-line echo's re-roll advice side by side
// (the Re-roll tab's own jobs and cache, useEchoLab `runReroll`), ranked by transducerRank.ts, with the best use of
// one Transducer, "I have N Transducers" and the crit rule of thumb against the full search. The view lives in the
// address (transducerView.ts); the run is one job at a time, cancelled when the tab is left.
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { BestOwnerResult, LabSlotSummary } from "./bestOwner";
import { REROLL_ASSUMPTIONS, type RerollAdviceResult } from "./rerollAdvice";
import { MAX_BUDGET, TRANSDUCER_SORTS, critKeepCheck, goodTry, rerollsUnknownEr, gainAfter, spendPlan, transducerRows, type TransducerFilter, type TransducerRow, type TransducerSort } from "./transducerRank";
import { bestHeading, chanceText, critErBoundText, extraOf, jointErRows, goodTryText, rerollExtraKey, notWorthText, oneIn, readCharacters, runQueue, unfinished, withCost, withKeep, type TransducerView } from "./transducerView";
import EchoLabPopover from "./EchoLabPopover.vue";
import { characterName, echoImage, echoName, fmtInt, lineText, pct, portrait, signedPct, slotLabel } from "./echoLabView";
import { useEchoLab } from "./useEchoLab";
import { gearRoleOf } from "../gearMap/gearMap";
import { KIT_INDEX_ENTRIES } from "../kits/load";
import { statLabel } from "../ai/tools/shared";

const props = defineProps<{ result: BestOwnerResult }>();
const view = defineModel<TransducerView>("view", { required: true });
const emit = defineEmits<{ reroll: [characterId: string]; tune: [] }>();
const lab = useEchoLab();

const COSTS = [
  { value: null, label: "Any" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
] as const;
const KEEPS = [null, 0, 1, 2, 3, 4] as const;

const setView = (v: TransducerView): void => {
  view.value = v;
};
const set = (patch: Partial<TransducerView>): void => setView({ ...view.value, ...patch });
function onHave(e: Event): void {
  const n = Math.round(Number((e.target as HTMLInputElement).value));
  const have = Number.isFinite(n) ? Math.min(MAX_BUDGET, Math.max(1, n)) : view.value.have;
  (e.target as HTMLInputElement).value = String(have);
  set({ have });
}

const isDealer = (id: string): boolean => gearRoleOf(id, KIT_INDEX_ENTRIES) === "dealer";
const queue = computed(() => runQueue(props.result.characters, isDealer));
const queueCharacters = computed(() => [...new Set(queue.value.map((q) => q.characterId))]);
const dealers = computed(() => new Set(queueCharacters.value.filter(isDealer)));
/** the resonator picker: whoever the "who" choice covers, and the one picked */
const pickable = computed(() => queueCharacters.value.filter((id) => view.value.who === "everyone" || dealers.value.has(id) || id === view.value.character));
const supports = computed(() => queueCharacters.value.filter((id) => !dealers.value.has(id)));
const unfinishedList = computed(() => unfinished(props.result.characters));
const slotOf = (characterId: string, slot: number): LabSlotSummary | null => props.result.characters.find((c) => c.id === characterId)?.slots.find((s) => s?.slot === slot) ?? null;

const extra = computed(() => extraOf(view.value));
const answer = (characterId: string, slot: number) => lab.rerollOf(characterId, slot, extra.value);
const answeredCount = computed(() => queue.value.filter((q) => answer(q.characterId, q.slot)).length);
/** resonators with all their echoes read: the ranking shows only these, so it re-sorts once a resonator is in */
const ready = computed(() => readCharacters(queue.value, (q) => Boolean(answer(q.characterId, q.slot))));
const advices = computed<RerollAdviceResult[]>(() => {
  const out: RerollAdviceResult[] = [];
  for (const q of queue.value) {
    if (!ready.value.has(q.characterId)) continue;
    const a = answer(q.characterId, q.slot);
    if (a && !("error" in a)) out.push(a);
  }
  return out;
});
const failed = computed(() =>
  queue.value.flatMap((q) => {
    const a = answer(q.characterId, q.slot);
    return a && "error" in a ? [{ key: `${q.characterId}|${q.slot}`, characterId: q.characterId, slot: q.slot, error: a.error }] : [];
  }),
);

const scope = computed<TransducerFilter>(() => ({
  characterId: view.value.character,
  // one resonator picked: theirs, whatever their role (as the CLI's --resonator does)
  characterIds: view.value.character || view.value.who === "everyone" ? null : dealers.value,
}));
const filter = computed<TransducerFilter>(() => ({ ...scope.value, cost: view.value.cost, keep: view.value.keep }));
const rows = computed(() => transducerRows(advices.value, filter.value, view.value.sort));
const jointEr = computed(() => jointErRows(rows.value));
const payingCount = computed(() => rows.value.filter((r) => r.pays).length);
const best = computed(() => (rows.value[0]?.pays ? rows.value[0] : null));
const spend = computed(() => spendPlan(advices.value, view.value.have, filter.value, view.value.sort === "percent" ? "percent" : "damage"));
const crit = computed(() => critKeepCheck(advices.value, scope.value));
const sortHint = computed(() => TRANSDUCER_SORTS.find((s) => s.id === view.value.sort)?.hint ?? "");
const assumptions = computed(() => advices.value[0]?.assumptions ?? REROLL_ASSUMPTIONS);

const limit = ref(20);
const shownRows = computed(() => rows.value.slice(0, limit.value));
const openKey = ref<string | null>(null);

const linesOf = (row: TransducerRow, fields: readonly number[]) => row.advice.lines.filter((l) => fields.includes(l.field)).sort((a, b) => a.field - b.field);
const keptLines = (row: TransducerRow) => linesOf(row, row.plan?.lockedFields ?? []);
const rerolledLines = (row: TransducerRow) => linesOf(row, row.plan?.rerolledFields ?? []);
const planWords = (advice: RerollAdviceResult, fields: readonly number[]): string =>
  advice.lines
    .filter((l) => fields.includes(l.field))
    .sort((a, b) => a.field - b.field)
    .map((l) => lineText(l.key, l.value))
    .join(", ");
const statName = (key: string): string => statLabel(key) ?? key;

const rerollHref = (id: string): string => `/echo-lab?tab=reroll&character=${encodeURIComponent(id)}`;
const tuneHref = "/echo-lab?tab=tune";

// ── the run: one job at a time, the queue's order; a switch that changes the job starts it again ──
const running = ref(false);
const runMs = ref<number | null>(null);
let controller: AbortController | null = null;
async function runAll(): Promise<void> {
  controller?.abort();
  const mine = new AbortController();
  controller = mine;
  const want = extra.value;
  const items = queue.value;
  if (items.every((q) => lab.rerollOf(q.characterId, q.slot, want))) {
    running.value = false;
    return;
  }
  running.value = true;
  const started = performance.now();
  for (const q of items) {
    if (mine.signal.aborted) return;
    await lab.runReroll(q.characterId, q.slot, mine.signal, want);
  }
  if (controller === mine) {
    running.value = false;
    runMs.value = performance.now() - started;
  }
}
watch([queue, () => rerollExtraKey(extra.value)], () => void runAll(), { immediate: true });
onBeforeUnmount(() => controller?.abort());
</script>

<style scoped>
.tdx__facts dt,
.tdx__nums dt {
  font-size: 0.7rem;
  opacity: 0.7;
}
.tdx__facts dd,
.tdx__nums dd {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.tdx__pick {
  display: grid;
  min-width: 2.75rem;
  min-height: 2.75rem;
  place-items: center;
  border-radius: 0.6rem;
  padding: 0.15rem 0.6rem;
  font-weight: 600;
  background: oklch(var(--b2));
}
.tdx__pick--face {
  padding: 0.2rem;
}
.tdx__pick--on {
  background: oklch(var(--p) / 0.15);
  box-shadow: 0 0 0 2px oklch(var(--p));
}
.tdx__pick:focus-visible,
.tdx__seg:focus-visible,
.tdx__toggle:focus-visible {
  outline: 2px solid oklch(var(--p));
  outline-offset: 2px;
}
.tdx__seg {
  min-height: 2.75rem;
  min-width: 2.75rem;
  border-radius: 0.5rem;
  border: 1px solid oklch(var(--bc) / 0.2);
  padding: 0 0.7rem;
  font-weight: 500;
}
.tdx__seg--on {
  border-color: oklch(var(--p));
  background: oklch(var(--p) / 0.15);
  font-weight: 700;
}
.tdx__row--off {
  opacity: 0.7;
}
.tdx__toggle {
  display: inline-flex;
  min-height: 2.75rem;
  min-width: 2.75rem;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  border-radius: 0.5rem;
}
.tdx__toggle:hover {
  background: oklch(var(--b2));
}
</style>
