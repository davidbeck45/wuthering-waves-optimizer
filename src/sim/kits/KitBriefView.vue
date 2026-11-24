<template>
  <Nav cur-page="kit" :disable-mobile-nav="true"></Nav>
  <div class="kit" data-test-kit-brief :data-test-kit-name="entry?.name ?? ''">
    <RouterLink to="/kit" class="kit-link kit-back" data-test-kit-back>← All resonator briefs</RouterLink>

    <!-- an address no brief answers to: a name the engine does not have, or a resonator this app has no character for -->
    <div v-if="!entry" class="kit-card" data-test-kit-missing>
      <h1 class="kit-h1">No brief for “{{ wanted }}”</h1>
      <p class="kit-text">There is a brief for every resonator that both Riley's wuwa_calc engine and this app have. Check the spelling, or pick one from the list.</p>
      <RouterLink to="/kit" class="btn btn-primary btn-sm mt-3">All resonator briefs</RouterLink>
    </div>

    <template v-else>
      <header class="kit-head">
        <CharacterAvatar :id="key" :size="60" dot />
        <div class="kit-head__body">
          <h1 class="kit-h1" data-test-kit-title>{{ name }}</h1>
          <p class="kit-muted">{{ entry.element }} · {{ entry.weapon }} · {{ tierLabel(entry.tier) }}</p>
          <div class="kit-row__meta">
            <span v-for="r in rolesOf(entry)" :key="r" class="kit-chip">{{ ROLE_LABEL[r] }}</span>
          </div>
        </div>
      </header>

      <div v-if="state === 'loading'" class="kit-list" role="status" data-test-kit-loading>
        <span class="sr-only">Loading {{ name }}'s brief…</span>
        <div class="kit-skeleton"></div>
        <div class="kit-skeleton"></div>
        <div class="kit-skeleton"></div>
      </div>

      <div v-else-if="state === 'failed'" class="kit-card" role="alert" data-test-kit-failed>
        <p class="kit-text">{{ name }}'s brief did not load. This usually means the connection dropped: nothing is lost, and Try again fetches it again.</p>
        <button type="button" class="btn btn-primary btn-sm mt-3" data-test-kit-retry @click="load">Try again</button>
      </div>

      <template v-else-if="kit && file && account">
        <nav class="kit-toc" aria-label="Sections of this brief">
          <a v-for="s in sections" :key="s.id" :href="`#${s.id}`" class="kit-pill" :data-test-kit-jump="s.id" @click.prevent="jump(s.id)">{{ s.label }}</a>
        </nav>

        <!-- the engine's kit is not the released game's (Lily: the 3.8 beta's): said before any figure, fed by the generator -->
        <div v-if="differs" class="kit-card kit-card--warn" role="note" data-test-kit-differs>
          <p class="kit-text"><b>{{ differs.head }}</b></p>
          <ul class="kit-list mt-1">
            <li v-for="(row, n) in differs.rows" :key="n" class="kit-muted">{{ row }}</li>
          </ul>
          <p class="kit-muted mt-1">{{ differs.tail }}</p>
        </div>

        <div v-if="unmet" class="kit-card kit-card--warn" role="note" data-test-kit-unmet>
          <p class="kit-text"><b>{{ unmet.head }}</b></p>
          <ul class="kit-list mt-1">
            <li v-for="(row, n) in unmet.rows" :key="n" class="kit-muted">{{ row }}</li>
          </ul>
          <p class="kit-muted mt-1">{{ unmet.tail }}</p>
        </div>

        <div data-test-kit-basis>
          <p class="kit-muted">
            Every figure on this page is <b>wuwa_calc's team DPS</b> (Riley31415's engine, damage per second) on <b>his standard builds</b>, not your account's.
            Each team has a link to the same team at your account.
          </p>
          <p class="kit-muted mt-1" data-test-kit-table-hint>
            Riley's table (Team rankings) opens on each team's average damage per rotation: tap the “Avg damage / rotation” heading there for team DPS, the figure on this page.
          </p>
          <details class="kit-more">
            <summary>What Riley's standard builds are, and why other pages show other numbers</summary>
            <p class="kit-muted">{{ basisText(file._meta) }}</p>
            <p class="kit-muted mt-1">{{ WHY_ENGINES_DIFFER }}</p>
          </details>
        </div>

        <!-- ---------------------------------------------------------------------------- On your account -->
        <section id="kit-account" class="kit-card kit-card--mine kit-section" aria-labelledby="kit-account-h" data-test-kit-account>
          <h2 id="kit-account-h" class="kit-h2">On your account</h2>
          <p class="kit-text" data-test-kit-owned>{{ ownedText(account, name, weaponDisplayName(account.weapon)) }}</p>
          <p class="kit-text" data-test-kit-next>{{ nextText(account, name) }}</p>

          <template v-if="account.ranked">
            <h3 class="kit-h3 mt-3">Your best team with {{ name }}</h3>
            <div class="kit-team" data-test-kit-ranked>
              <div class="kit-team__top">
                <span class="kit-team__name">{{ teamTitle(account.ranked.name, account.ranked.characterIds) }}</span>
                <span class="kit-team__dps">{{ compact(account.ranked.avgDamage) }} <span class="kit-team__unit">average damage per rotation</span></span>
              </div>
              <p class="kit-muted">
                <template v-if="account.ranked.dps">{{ compact(account.ranked.dps) }} DPS. </template>On your own builds, by this app's engine: from your roster ranking saved in this
                browser, the same figure as on My roster rankings. Not comparable with Riley's figures below.
              </p>
              <div class="kit-actions">
                <RouterLink to="/my-rankings" class="btn btn-outline btn-xs" data-test-kit-open-ranking>Open My roster rankings</RouterLink>
              </div>
            </div>
          </template>

          <template v-if="account.team">
            <h3 class="kit-h3 mt-3">{{ account.ranked ? "Of Riley's top teams, the best you can field" : "The best of Riley's top teams you can field" }}</h3>
            <KitTeamRow :team="account.team.team" :subject="kit.name" :cost="account.team.cost" :characters="characters" />
            <p class="kit-muted mt-1" data-test-kit-team-basis>
              {{ teamBasisText(account, dpsText(account.team.team.dps)) }}
              <template v-if="!account.hasRanking">
                No roster ranking is saved in this browser for your account as it is now:
                <RouterLink to="/my-rankings" class="kit-link" data-test-kit-rank>Rank my teams</RouterLink> scores the teams you can field on your builds.
              </template>
              <template v-else-if="!account.ranked">
                Your roster ranking has no team with {{ name }} in it: it scores the teams you saved and Riley's stock teams you can field.
                <RouterLink to="/my-rankings" class="kit-link" data-test-kit-open-ranking>Open My roster rankings</RouterLink>
              </template>
            </p>
          </template>
          <template v-else-if="account.wanted">
            <h3 class="kit-h3 mt-3">Riley's best team for {{ name }}</h3>
            <KitTeamRow :team="account.wanted.team" :subject="kit.name" :cost="account.wanted.cost" :characters="characters" />
            <p class="kit-muted mt-1" data-test-kit-missing-members>
              {{ missingText(account, name, kit.name, (m) => characterShortName(memberKey(m))) }}
              <template v-if="!account.hasRanking"><RouterLink to="/my-rankings" class="kit-link" data-test-kit-rank>Rank my teams</RouterLink> scores the teams you can field.</template>
            </p>
          </template>
          <template v-if="account.ifPulled">
            <h3 class="kit-h3 mt-3">If you pull {{ name }}: the best of Riley's teams with them you could field</h3>
            <KitTeamRow :team="account.ifPulled.team" :subject="kit.name" :cost="account.ifPulled.cost" :characters="characters" />
            <p class="kit-muted mt-1" data-test-kit-if-pulled>{{ pulledText(account, name, dpsText(account.ifPulled.team.dps)) }}</p>
          </template>

          <h3 class="kit-h3 mt-3">Do something about it</h3>
          <ul class="kit-list" data-test-kit-links>
            <li v-for="l in account.links" :key="l.id" class="kit-text">
              <RouterLink :to="l.to" class="kit-link font-semibold" :data-test-kit-link="l.id">{{ l.label }}</RouterLink>
              <span class="kit-sub">{{ l.why }}</span>
            </li>
          </ul>
        </section>

        <!-- ---------------------------------------------------------------------------- role -->
        <section id="kit-role" class="kit-card kit-section" aria-labelledby="kit-role-h" data-test-kit-role-section>
          <h2 id="kit-role-h" class="kit-h2">What {{ name }} does in a team</h2>
          <p v-for="(line, n) in roleLines" :key="`r${n}`" class="kit-text">{{ line }}</p>
          <p v-for="(line, n) in mixLines" :key="`m${n}`" class="kit-text">{{ line }}</p>
          <template v-if="kit.notes.length">
            <p class="kit-label mt-3">Riley's own note on these teams</p>
            <p v-for="(note, n) in kit.notes" :key="`n${n}`" class="kit-note">“{{ note }}”</p>
          </template>
        </section>

        <!-- ---------------------------------------------------------------------------- how they are played -->
        <section id="kit-play" class="kit-card kit-section" aria-labelledby="kit-play-h" data-test-kit-play>
          <h2 id="kit-play-h" class="kit-h2">How {{ name }} is played</h2>
          <p class="kit-muted">The loop Riley's engine presses every time {{ name }} takes the field, in order{{ account.owned ? `, at your S${account.sequence}` : ", at S0" }}. Cast names are the engine's.</p>
          <div v-for="l in loops.slice(0, 1)" :key="l.id" class="mt-2" data-test-kit-loop>
            <h3 v-if="loops.length > 1" class="kit-h3">{{ l.title }}</h3>
            <p v-else-if="l.shared > 1" class="kit-muted">All {{ l.shared }} builds press this same loop.</p>
            <p v-if="l.locked" class="kit-text">This build has no loop below S{{ l.minSequence }}: Riley only fields it from S{{ l.minSequence }} up. From there:</p>
            <p class="kit-text">{{ l.sentence }}.</p>
          </div>
          <details v-if="loops.length > 1" class="kit-more mt-2" data-test-kit-more-loops>
            <summary>The {{ loops.length === 2 ? "other build's loop" : `${loops.length - 1} other builds' loops` }}</summary>
            <div v-for="l in loops.slice(1)" :key="l.id" class="mt-2" data-test-kit-loop>
              <h3 class="kit-h3">{{ l.title }}</h3>
              <p v-if="l.locked" class="kit-text">This build has no loop below S{{ l.minSequence }}: Riley only fields it from S{{ l.minSequence }} up. From there:</p>
              <p class="kit-text">{{ l.sentence }}.</p>
            </div>
          </details>
          <div v-if="cueCard" class="kit-actions mt-3">
            <RouterLink :to="cueCard.to" class="btn btn-primary btn-sm" data-test-kit-cue>Cue card: {{ cueCard.label }}</RouterLink>
          </div>
          <p v-if="cueCard" class="kit-muted mt-1">The cue card is that team's whole rotation, one line per swap, with a play-along timer, run at your account.</p>
        </section>

        <!-- ---------------------------------------------------------------------------- sequences -->
        <section id="kit-sequences" class="kit-card kit-section" aria-labelledby="kit-sequences-h" data-test-kit-sequences>
          <h2 id="kit-sequences-h" class="kit-h2">Sequences that change how you play</h2>
          <p v-if="!changes.length" class="kit-text" data-test-kit-no-changes>None. {{ name }} presses the same loop at every sequence: sequences add damage, not buttons.</p>
          <ul v-else class="kit-list" data-test-kit-changes>
            <li v-for="c in changes" :key="`${c.level}${c.kind}`" class="kit-text" :data-test-kit-change="`${c.level}-${c.kind}`">
              <b>{{ c.text }}.</b>
              <span v-if="account.owned" class="kit-chip ml-1" :class="{ 'kit-chip--own': c.level <= account.sequence }">{{ c.level <= account.sequence ? "you have it" : "not yet" }}</span>
              <span v-for="(d, n) in c.details" :key="n" class="kit-sub"><template v-if="d.loadouts.length">{{ d.loadouts.join("; ") }}: </template>{{ d.detail }}</span>
            </li>
          </ul>
          <p v-for="l in late" :key="l.title" class="kit-text mt-2">{{ l.title }} has no loop below S{{ l.minSequence }}.</p>

          <h3 class="kit-h3 mt-4">Every sequence</h3>
          <p class="kit-muted">
            What each level adds to team DPS over the level below, in {{ name }}'s best {{ ladderCost }} team (the ladder further down), and Riley's own note on how his engine
            models the piece.
          </p>
          <div class="mt-2">
            <div v-for="s in sequenceRows" :key="s.level" class="kit-seq" :data-test-kit-sequence="s.level">
              <div class="kit-seq__top">
                <span class="kit-chip" :class="{ 'kit-chip--own': account.owned && s.level <= account.sequence }">S{{ s.level }}</span>
                <span class="kit-seq__name">{{ s.name || "No name in Riley's kit yet" }}</span>
                <span v-if="s.kind" class="kit-chip kit-chip--change">{{ CHANGE_WORDS[s.kind].short }}</span>
                <span v-if="s.stepText" class="kit-chip" :class="s.step && s.step > 0.0005 ? 'kit-up' : ''">{{ s.stepText }}</span>
              </div>
              <p v-if="s.note" class="kit-note">{{ s.note }}</p>
              <p v-else-if="!s.name" class="kit-note">Likely not modelled yet: it changes no figure here.</p>
            </div>
          </div>
        </section>

        <!-- ---------------------------------------------------------------------------- builds -->
        <section id="kit-builds" class="kit-section" aria-labelledby="kit-builds-h" data-test-kit-builds>
          <h2 id="kit-builds-h" class="kit-h2">{{ kit.loadouts.length > 1 ? `${name}'s ${kit.loadouts.length} builds` : `${name}'s build` }}</h2>
          <p class="kit-muted mb-2">
            {{ kit.loadouts.length > 1 ? "Each is a build Riley declares, the one he fields most first" : "The build Riley declares" }}; his solver tries its weapons, echo sets
            and main stats per team and keeps the best. Shown: its pick in the best team that fields the build.
          </p>
          <div class="kit-list">
            <details v-for="(l, n) in builds" :key="l.id" class="kit-card kit-cost" :open="n === 0" :data-test-kit-build="l.id">
              <summary class="kit-cost__head">
                <h3 class="kit-cost__label">{{ l.title }}<span class="sr-only">: </span></h3>
                <span class="kit-cost__best" data-test-kit-build-teams>{{ buildTeamsText(l.teams, l.main, l.support) }}</span>
              </summary>
              <p v-if="l.mode" class="kit-muted mb-2">{{ l.mode }}.</p>
              <dl class="kit-dl">
                <dt>Weapon</dt>
                <dd>
                  {{ l.pick ? `${l.pick.weapon} R${l.pick.rank}` : l.weapons[0]?.name }}
                  <span v-if="l.otherWeapons" class="kit-sub">Also modelled: {{ l.otherWeapons }}</span>
                </dd>
                <dt>Echoes</dt>
                <dd>
                  {{ l.echo }}
                  <span v-if="l.otherEchoes" class="kit-sub">Or: {{ l.otherEchoes }}</span>
                </dd>
                <dt>Main stats</dt>
                <dd>
                  {{ l.mainstat }}
                  <span class="kit-sub">The solver's pick out of {{ l.layouts }} {{ l.layouts === 1 ? "layout" : "layouts" }}{{ l.pickTeam ? `, in ${l.pickTeam}` : "" }}</span>
                </dd>
                <dt>Substats, in order</dt>
                <dd>
                  {{ l.substats }}
                  <span class="kit-sub">Riley's standard order (ChemX32). High Invest: {{ l.substatsHigh }}</span>
                </dd>
                <dt>Energy Regen</dt>
                <dd>{{ l.energy }}</dd>
                <template v-if="l.minCritRate">
                  <dt>Crit Rate</dt>
                  <dd>The kit wants at least {{ l.minCritRate }}% Crit Rate on the character screen.</dd>
                </template>
              </dl>
            </details>
          </div>
        </section>

        <!-- ---------------------------------------------------------------------------- teams -->
        <section id="kit-teams" class="kit-section" aria-labelledby="kit-teams-h" data-test-kit-teams>
          <h2 id="kit-teams-h" class="kit-h2">Best teams at each Team Cost</h2>
          <p class="kit-muted mb-2">
            A Team Cost is how invested the team is, from everyone at S0 to everyone at S6 with an R5 weapon. Riley solves his whole table at each; these are
            {{ name }}'s best there. Tap one for its members, {{ name }}'s part and more teams. The bar under each is its best team's DPS against the highest of
            the nine, from zero.
          </p>
          <p v-if="kit.teams.main === 0 && (kit.tier === 'Limited' || kit.tier === 'Standard')" class="kit-muted mb-2" data-test-kit-support-costs>
            {{ name }} is never the main DPS on his table, so the Team Costs that raise one resonator (S2R1 DPS and up) raise the main DPS of each team, not {{ name }}:
            {{ name }} is at S0 in those, but at S2 in “S6R1 DPS · S2R1 supports” and S6 in “S6R5 all”. What {{ name }}'s own sequences add is under “What each step of investment is worth”.
          </p>
          <div class="kit-list">
            <details v-for="c in costs" :key="c.cost" class="kit-card kit-cost" :open="c.cost === openCost" :data-test-kit-cost="c.cost">
              <summary class="kit-cost__head">
                <h3 class="kit-cost__label">{{ c.label }}<span v-if="c.cost === openCost && account.owned" class="kit-chip kit-chip--own ml-2">nearest to yours</span></h3>
                <span v-if="c.teams[0]" class="kit-cost__best" :data-test-kit-cost-best="c.cost">{{ labelOfTeam(c.teams[0]) }} · <b>{{ dpsText(c.teams[0].dps) }}</b> team DPS</span>
                <span v-else class="kit-cost__best">No team this app can field</span>
                <svg v-if="c.teams[0]" class="kit-cost__bar" aria-hidden="true" focusable="false" width="100%" height="100%" :data-test-kit-cost-bar="c.cost">
                  <rect x="0" y="0" :width="`${((costBar[c.cost] ?? 0) * 100).toFixed(2)}%`" height="100%" rx="2" />
                </svg>
              </summary>
              <p class="kit-muted">{{ c.label }} means: {{ c.means }}.</p>
              <div v-if="c.teams.length" class="kit-list">
                <KitTeamRow :team="c.teams[0]!" :subject="kit.name" :cost="c.cost" :characters="characters" />
                <details v-if="c.teams.length > 1" class="kit-more" :data-test-kit-more-teams="c.cost">
                  <summary>{{ c.teams.length - 1 }} more {{ c.teams.length === 2 ? "team" : "teams" }} at {{ c.label }}</summary>
                  <div class="kit-list">
                    <KitTeamRow v-for="(t, n) in c.teams.slice(1)" :key="n" :team="t" :subject="kit.name" :cost="c.cost" :characters="characters" />
                  </div>
                </details>
              </div>
            </details>
          </div>
        </section>

        <!-- ---------------------------------------------------------------------------- ladder -->
        <section v-if="kit.ladder && ladderTeam" id="kit-ladder" class="kit-card kit-section" aria-labelledby="kit-ladder-h" data-test-kit-ladder>
          <h2 id="kit-ladder-h" class="kit-h2">What each step of investment is worth</h2>
          <p class="kit-muted">
            In {{ name }}'s best {{ ladderCost }} team, {{ ladderTeam }}: teammates stay as they are, {{ name }} stays on {{ kit.ladder.held.weapon }} with {{ kit.ladder.held.echo }} and
            {{ mainstatText(kit.ladder.held.mainstat) }}, and one thing moves at a time. All figures are team DPS (wuwa_calc).
          </p>

          <h3 class="kit-h3 mt-3">Sequences, on {{ kit.ladder.held.weapon }} R{{ kit.ladder.held.rank }}</h3>
          <KitBarChart
            name="seq"
            :caption="`Team DPS at each sequence of ${name}: a bar per level from zero, each with what it adds over the level below.`"
            :bars="seqChart.bars" />
          <p class="kit-text mt-1" data-test-kit-ladder-biggest>{{ seqChart.biggestText }}</p>
          <p v-if="seqChart.lower.length" class="kit-muted" data-test-kit-ladder-lower>
            {{ seqChart.lower.map((l) => `S${l}`).join(", ") }} {{ seqChart.lower.length === 1 ? "reads" : "read" }} lower than the level below in Riley's run: that is his engine's figure, shown as it is.
          </p>
          <details class="kit-more mt-1" data-test-kit-ladder-figures="seq">
          <summary>Show the figures</summary>
          <div class="kit-table kit-table--4" role="table" aria-label="Team DPS at each sequence" data-test-kit-ladder-seq>
            <span class="kit-th" role="columnheader">Level</span>
            <span class="kit-th kit-num" role="columnheader">Team DPS</span>
            <span class="kit-th kit-num" role="columnheader">Over the level below</span>
            <span class="kit-th kit-num" role="columnheader">Over S{{ steps[0]?.level ?? 0 }}</span>
            <template v-for="s in steps" :key="s.level">
              <span :class="{ 'kit-you': account.owned && s.level === account.sequence }">S{{ s.level }}{{ account.owned && s.level === account.sequence ? " (you)" : "" }}</span>
              <span class="kit-num">{{ dpsText(s.dps) }}</span>
              <span class="kit-num" :class="{ 'kit-up': (s.step ?? 0) > 0.0005 }">{{ s.step == null ? "start" : signedPercent(s.step) }}</span>
              <span class="kit-num">{{ s.total == null ? "start" : signedPercent(s.total) }}</span>
            </template>
          </div>
          </details>
          <p v-if="shortLevels" class="kit-muted mt-1">At {{ shortLevels }} the standard substats fall short of the Energy Regen the loop asks for.</p>

          <template v-if="weapons.length > 1">
            <h3 class="kit-h3 mt-4">Weapons, at S{{ kit.ladder.held.sequence }}</h3>
            <KitBarChart
              name="weapons"
              wide
              :caption="`Team DPS on each weapon, best first, from zero: each against ${kit.ladder.held.weapon}, the weapon the rest of this section holds.`"
              :bars="weaponBars" />
            <details class="kit-more mt-1" data-test-kit-ladder-figures="weapons">
            <summary>Show the figures</summary>
            <div class="kit-table kit-table--3" role="table" aria-label="Team DPS on each weapon" data-test-kit-ladder-weapons>
              <span class="kit-th" role="columnheader">Weapon</span>
              <span class="kit-th kit-num" role="columnheader">Team DPS</span>
              <span class="kit-th kit-num" role="columnheader">Against the best</span>
              <template v-for="w in weapons" :key="w.weapon">
                <span>{{ w.weapon }} R{{ w.rank }}<span class="kit-sub">{{ weaponKindLabel(w.kind) }}</span></span>
                <span class="kit-num">{{ dpsText(w.dps) }}</span>
                <span class="kit-num" :class="{ 'kit-down': w.vsBest < -0.0005 }">{{ w.vsBest ? signedPercent(w.vsBest) : "best" }}</span>
              </template>
            </div>
            </details>
            <p v-if="signatureLine" class="kit-text mt-2" data-test-kit-signature>{{ signatureLine }}</p>
          </template>

          <template v-if="ranks.length > 1">
            <h3 class="kit-h3 mt-4">{{ kit.ladder.held.weapon }} from R{{ ranks[0]!.rank }} to R{{ ranks.at(-1)!.rank }}, at S{{ kit.ladder.held.sequence }}</h3>
            <KitBarChart
              name="ranks"
              :caption="`Team DPS at each refinement rank of ${kit.ladder.held.weapon}, from zero: each with what it adds over the rank below.`"
              :bars="rankBars" />
            <details class="kit-more mt-1" data-test-kit-ladder-figures="ranks">
            <summary>Show the figures</summary>
            <div class="kit-table kit-table--3" role="table" aria-label="Team DPS at each refinement rank" data-test-kit-ladder-ranks>
              <span class="kit-th" role="columnheader">Rank</span>
              <span class="kit-th kit-num" role="columnheader">Team DPS</span>
              <span class="kit-th kit-num" role="columnheader">Over R{{ ranks[0]!.rank }}</span>
              <template v-for="r in ranks" :key="r.rank">
                <span>R{{ r.rank }}</span>
                <span class="kit-num">{{ dpsText(r.dps) }}</span>
                <span class="kit-num" :class="{ 'kit-up': (r.total ?? 0) > 0.0005 }">{{ r.total == null ? "start" : signedPercent(r.total) }}</span>
              </template>
            </div>
            </details>
          </template>
          <p class="kit-muted mt-3">
            His solver would pick weapon, echoes and main stats again at every row; these rows hold them, so each reads as the worth of that step alone. For your own
            builds: <RouterLink to="/my-rankings" class="kit-link">What if</RouterLink> on My roster rankings, and <RouterLink to="/weapons" class="kit-link">Weapon value</RouterLink>.
          </p>
        </section>

        <p class="kit-muted" data-test-kit-source>
          Generated from wuwa_calc at {{ file._meta.wuwaCalcCommit }} and this app at {{ file._meta.appCommit }} on {{ file._meta.generated }}. The words on this page are built from the
          engine's data; the quoted notes are Riley's own, from his source.
        </p>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ — /kit/<name>: one resonator's brief (src/sim/kits/), from the generated tables and read against
// the account. Sections: On your account (owned or not, the best team they can field, the next sequence that changes
// the loop, links to act on it), the role, the loop in a sentence with a link to the cue card, the sequences that
// change how they are played, the builds, the best teams at every Team Cost (each a link into /rankings and to the same
// team at the account) and the investment ladder. Every figure is wuwa_calc's team DPS on his standard builds and says
// so; the one figure of this app's engine (the cached roster ranking's) is labelled as that. The briefs are a file of
// their own, fetched here (load.ts): the page shows who it is about from the small index while they load, and Try again
// fetches them again after a dropped connection.
import { computed, onMounted, ref, shallowRef, toRaw, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import Nav from "../../components/navigation/Nav.vue";
import { useDocumentTitle } from "../../composables/useDocumentTitle";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { scrollBehavior } from "../a11y/shellA11y";
import { accountCharacterOf } from "../account/accountState";
import CharacterAvatar from "../display/CharacterAvatar.vue";
import { characterShortName, isRosterCharacter, teamLabel, weaponDisplayName } from "../display/names";
import { WHY_ENGINES_DIFFER } from "../display/numberBasis";
import { teamTitle } from "../display/teamName";
import { compact } from "../myRankings/format";
import { rankingFingerprint, readCachedRanking, readSavedRanking } from "../myRankings/rankingCache";
import { accountKeyOf } from "../rankings/rileyNames";
import { rotationPath } from "../rotation/hash";
import { autoTeamBuffs } from "../teamContext/autoTeamBuffs";
import KitBarChart from "./KitBarChart.vue";
import KitTeamRow from "./KitTeamRow.vue";
import { costWidths, rankChart, sameWeaponName, sequenceChart, weaponChart } from "./ladderChart";
import {
  CHANGE_WORDS,
  ROLE_LABEL,
  basisText,
  costLabel,
  differsText,
  dpsText,
  echoText,
  energyText,
  findKit,
  kitPath,
  kitSlug,
  kitsInApp,
  ladderSteps,
  lateLoadouts,
  loadoutTitles,
  loopAt,
  loopChanges,
  loopSentence,
  mainOf,
  mainstatText,
  mixText,
  rankSteps,
  roleText,
  rolesOf,
  signedPercent,
  teamOf,
  teamsByCost,
  tierLabel,
  unmetText,
  weaponKindLabel,
  weaponSteps,
  type KitMember,
  type KitTeam,
  type KitsFile,
  buildTeamsText,
} from "./kits";
import briefsUrl from "./data/kits.json?url"; // the file's address, not its contents: fetched below, with this page
import { BriefsError, KIT_INDEX_ENTRIES, loadKits } from "./load";
import { reloadOnce } from "../perf/chunkReload";
import { missingText, nextText, onAccountOf, ownedText, pulledText, teamBasisText, type AccountSide, type RankedTeam } from "./onAccount";
import "./kits.css";

const route = useRoute();
const router = useRouter();
const { characters } = storeToRefs(useCharacterStore()) as unknown as { characters: { value: Record<string, Record<string, any>> } };
const inventoryStore = useInventoryStore();
const { teams } = storeToRefs(useTeamRotationsStore()) as unknown as { teams: { value: Array<Record<string, any>> } };

const wanted = computed(() => String(route.params.name ?? ""));
/** the briefs the app shows: its own character list decides */
const shownIndex = computed(() => kitsInApp(KIT_INDEX_ENTRIES, isRosterCharacter));
const entry = computed(() => findKit(shownIndex.value, wanted.value));
/** the key the account plays them under (a male Rover) */
const key = computed(() => (entry.value ? accountKeyOf(entry.value.appKey, characters.value ?? {}) : ""));
const name = computed(() => characterShortName(key.value));

useDocumentTitle(
  () => (entry.value ? `${name.value}: resonator brief — Wuthering Waves Calculator & Optimizer` : "Resonator brief — Wuthering Waves Calculator & Optimizer"),
  () =>
    entry.value
      ? `How ${name.value} is played in Wuthering Waves: builds, the sequences that change the rotation, best teams at every investment tier and what each sequence and weapon is worth, from the wuwa_calc engine and read against your account.`
      : "A brief per Wuthering Waves resonator from the wuwa_calc engine.",
);

// one address per brief: /kit/RoverAeroMale and /kit/Aero Rover both land on /kit/aero-rover
watch(
  [entry, wanted],
  () => {
    if (entry.value && wanted.value !== kitSlug(entry.value.name)) void router.replace({ path: kitPath(entry.value.name), hash: route.hash });
  },
  { immediate: true },
);

// ---- the briefs (their own chunk)
const file = shallowRef<KitsFile | null>(null);
const state = ref<"loading" | "ready" | "failed">("loading");
async function load(): Promise<void> {
  state.value = "loading";
  try {
    file.value = await loadKits(briefsUrl);
    state.value = "ready";
  } catch (err) {
    // a tab older than the site asks for a file the new build no longer has: one guarded reload fetches the new page
    // (as a lost chunk does, perf/chunkReload.ts); a dropped connection stays here, where Try again fetches it again
    if (err instanceof BriefsError && err.kind === "stale" && reloadOnce()) return;
    state.value = "failed";
  }
}
const kit = computed(() => (file.value && entry.value ? file.value.kits[entry.value.name] ?? null : null));

// ---- the roster ranking, only if this browser already has one for the account as it is now (never scored here)
const rankedTeams = shallowRef<RankedTeam[] | null>(null);
async function readRanking(): Promise<void> {
  try {
    for (const investment of [true, false]) {
      const fp = rankingFingerprint({
        characters: toRaw(characters.value ?? {}),
        echoes: toRaw(inventoryStore.echoes ?? []),
        teams: toRaw(teams.value ?? []),
        investment,
        autoTeamBuffs: autoTeamBuffs.value,
      });
      const hit = readCachedRanking(fp) ?? (await readSavedRanking(fp))?.ranking ?? null;
      if (hit && !hit.incomplete) {
        rankedTeams.value = hit.teams;
        return;
      }
    }
  } catch {
    /* no ranking to show: the block offers the link instead */
  }
  rankedTeams.value = null;
}

onMounted(() => {
  void load();
  void readRanking();
});

const side = (k: string): AccountSide | null => (characters.value?.[k] ? accountCharacterOf(k, characters.value[k]) : null);
const account = computed(() =>
  file.value && kit.value
    ? onAccountOf({ file: file.value, kit: kit.value, index: KIT_INDEX_ENTRIES, inApp: isRosterCharacter, characters: characters.value ?? {}, side, rankedTeams: rankedTeams.value })
    : null,
);

const memberKey = (m: KitMember): string => accountKeyOf(m.appKey, characters.value ?? {});
const labelOfTeam = (team: KitTeam): string => {
  const main = kit.value ? mainOf(team, kit.value.name) : null;
  return teamLabel(team.members.map(memberKey), main ? memberKey(main) : null);
};
const list = (items: string[]): string => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

const sections = computed(() => [
  { id: "kit-account", label: "Your account" },
  { id: "kit-role", label: "Role" },
  { id: "kit-play", label: "How to play" },
  { id: "kit-sequences", label: "Sequences" },
  { id: "kit-builds", label: "Builds" },
  { id: "kit-teams", label: "Teams" },
  ...(kit.value?.ladder ? [{ id: "kit-ladder", label: "Investment" }] : []),
]);
function jump(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
}

// ---- role
const roleLines = computed(() => (kit.value && file.value ? roleText(kit.value, name.value, file.value._meta.sustain.filter((n) => shownIndex.value.some((k) => k.name === n))) : []));
const mixLines = computed(() => (kit.value ? mixText(kit.value, name.value) : []));
const differs = computed(() => (kit.value ? differsText(kit.value, name.value) : null));
const unmet = computed(() => (kit.value ? unmetText(kit.value, name.value) : null));

// ---- how they are played
const titles = computed(() => (kit.value ? loadoutTitles(kit.value.loadouts) : []));
const titleOf = (n: number): string => titles.value[n]!.replace(kit.value!.name, name.value);
const loops = computed(() => {
  const out: Array<{ id: string; title: string; sentence: string; locked: boolean; minSequence: number; shared: number }> = [];
  (kit.value?.loadouts ?? []).forEach((l, n) => {
    const at = loopAt(l, account.value?.sequence ?? 0);
    if (!at) return;
    const sentence = loopSentence(at.casts, l.echoes.map((e) => e.main));
    const locked = l.minSequence > (account.value?.sequence ?? 0);
    // builds that press the same loop (Aemeath's two Resonance Modes) are one paragraph under both names
    const same = out.find((o) => o.sentence === sentence && o.locked === locked && o.minSequence === l.minSequence);
    if (same) {
      same.title = `${same.title} and ${titleOf(n)}`;
      same.shared += 1;
    } else out.push({ id: l.id, title: titleOf(n), sentence, locked, minSequence: l.minSequence, shared: 1 });
  });
  return out;
});
/** the cue card of the team the account plays them in (the ranking's, else Riley's best it can field), else of Riley's
 *  best team for them that the app can field */
const cueCard = computed(() => {
  const a = account.value;
  if (!a || !kit.value || !file.value) return null;
  if (a.play?.source === "ranking" && a.ranked) return { to: rotationPath({ kind: "chars", chars: a.play.keys }), label: teamTitle(a.ranked.name, a.ranked.characterIds) };
  const team = a.team ?? a.wanted;
  if (!team) return null;
  return { to: rotationPath({ kind: "chars", chars: team.keys }), label: labelOfTeam(team.team) };
});

// ---- sequences
const changes = computed(() => (kit.value ? loopChanges(kit.value).map((c) => ({ ...c, details: c.details.map((d) => ({ ...d, loadouts: d.loadouts.map((t) => t.replace(kit.value!.name, name.value)) })) })) : []));
const late = computed(() => (kit.value ? lateLoadouts(kit.value).map((l) => ({ ...l, title: l.title.replace(kit.value!.name, name.value) })) : []));
const steps = computed(() => ladderSteps(kit.value?.ladder ?? null));
const ladderCost = computed(() => costLabel(kit.value?.ladder?.cost ?? "s0r1"));
const sequenceRows = computed(() =>
  (kit.value?.sequences ?? []).map((s) => {
    const step = steps.value.find((x) => x.level === s.level)?.step ?? null;
    return { ...s, step, stepText: step == null ? "" : Math.abs(step) < 0.0005 ? "no DPS change" : `${signedPercent(step)} team DPS` };
  }),
);

// ---- builds
const builds = computed(() =>
  (kit.value?.loadouts ?? []).map((l, n) => {
    const pick = l.pick;
    const pickTeam = pick && file.value ? teamOf(file.value, pick.team) : null;
    const pickedEcho = pick ? { main: pick.mainEcho, sets: pick.sets } : l.echoes[0];
    return {
      id: l.id,
      title: titleOf(n),
      mode: l.mode,
      teams: l.teams,
      main: l.main,
      support: l.support,
      weapons: l.weapons,
      pick,
      otherWeapons: l.weapons
        .filter((w) => w.name !== pick?.weapon)
        .map((w) => `${w.name} (${weaponKindLabel(w.kind)})`)
        .join(", "),
      echo: pickedEcho ? echoText(pickedEcho) : "",
      otherEchoes: l.echoes
        .filter((e) => !pickedEcho || e.main !== pickedEcho.main || e.sets.join() !== pickedEcho.sets.join())
        .map(echoText)
        .join("; "),
      mainstat: pick ? mainstatText(pick.mainstat) : "",
      layouts: l.layouts,
      pickTeam: pickTeam && pick ? `${labelOfTeam(pickTeam)} at ${costLabel(pick.cost)}` : "",
      substats: `${l.substats.slice(0, 5).join(" > ")}, then ${l.substats[5]}`,
      substatsHigh: l.substatsHigh.slice(0, 5).join(" > "),
      energy: energyText(l, file.value?._meta.erRoll ?? 0),
      minCritRate: l.minCritRate ?? 0,
    };
  }),
);

// ---- teams and the ladder
const costs = computed(() => (kit.value && file.value ? teamsByCost(file.value, kit.value, isRosterCharacter) : []));
/** the Team Cost that opens by itself: the one the account's own team was read at, else his default view */
const openCost = computed(() => account.value?.team?.cost ?? account.value?.wanted?.cost ?? "s0r1");
const ladderTeam = computed(() => {
  if (!kit.value?.ladder || !file.value) return "";
  // the ladder runs in his best team as generated; when the app lacks one of its members the ladder is still his, so name it as it is
  const team = teamOf(file.value, kit.value.ladder.team);
  return team ? team.members.map((m) => (isRosterCharacter(m.appKey) ? characterShortName(memberKey(m)) : m.name)).join(" · ") : "";
});
const weapons = computed(() => weaponSteps(kit.value?.ladder ?? null));
const ranks = computed(() => rankSteps(kit.value?.ladder ?? null));
// the charts: the same rows as the tables, scaled and worded (ladderChart.ts)
const seqChart = computed(() => sequenceChart(steps.value, account.value?.owned ? account.value.sequence : null));
const ownWeaponName = computed(() => (account.value?.owned && account.value.weapon ? weaponDisplayName(account.value.weapon) : null));
const weaponBars = computed(() => (kit.value?.ladder ? weaponChart(weapons.value, kit.value.ladder.held, ownWeaponName.value) : []));
const rankBars = computed(() =>
  rankChart(ranks.value, kit.value?.ladder && account.value?.owned && sameWeaponName(ownWeaponName.value, kit.value.ladder.held.weapon) ? account.value.refinement : null),
);
const costBar = computed(() => costWidths(costs.value));
const shortLevels = computed(() => list(steps.value.filter((s) => s.short).map((s) => `S${s.level}`)));
/** "The signature is worth +13.5 % team DPS over the best other weapon here." */
const signatureLine = computed(() => {
  const sig = weapons.value.find((w) => w.kind === "Limited");
  const other = weapons.value.find((w) => w.kind !== "Limited");
  if (!sig || !other || !other.dps) return "";
  const gain = (sig.dps - other.dps) / other.dps;
  return `${sig.weapon} (the signature) at R${sig.rank} is worth ${signedPercent(gain)} team DPS over ${other.weapon} R${other.rank}, the best other weapon modelled.`;
});
</script>
