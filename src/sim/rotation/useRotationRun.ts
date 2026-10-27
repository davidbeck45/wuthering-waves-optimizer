// Wuthering Tools+ — the rotation view's loader: a /rotation target (hash.ts) → Riley's team at the player's account →
// the traced run (Wave 0's `rileyClient`, the app's one solver worker, memoised per engine commit + account + spread +
// team + picks) → the extracted model and the cue plan. Every loadout variant of the composition is solved too (the
// variant picker); a row whose picks went stale (an engine update, echoes changed since the link was made) falls back
// to the team's best row at the account, with a notice.
import { computed, onBeforeUnmount, ref, shallowRef, watch, type Ref } from "vue";
import { rileyClient, type RileyClient } from "../engine/rileyClient";
import { bestOf, type MineSolve, type RileyAccount, type RileyPick, type RileyTeamInfo, type RunError, type RunLite, type SubsMode } from "../engine/rileyRun";
import { cuePlan, type CuePlan } from "./cueModel";
import { extractRotation, type RotationModel } from "./extract";
import type { RotationTarget } from "./hash";
import { teamOfCode } from "./teamCode";

export type RunPhase = "idle" | "engine" | "solving" | "tracing" | "ready" | "error";

export interface RunProblem {
  kind: "code" | "notInApp" | "noBuild" | "unknownTeam" | "error";
  message: string;
  notInApp?: string[];
}

export interface Variant {
  teamKey: string;
  status: MineSolve["status"];
  total: number | null;
  /** what tells it from its siblings: the member whose gear differs, and that gear */
  label: string;
  reason?: MineSolve["reason"];
}

const isAbort = (e: unknown): boolean => (e as { name?: string })?.name === "AbortError";

/** Labels for a composition's variants: the first member whose echo or weapon differs between them. */
export function variantLabels(solves: MineSolve[]): Variant[] {
  const ok = solves.filter((s) => s.best);
  const n = ok[0]?.best?.members.length ?? 0;
  let differs = -1;
  for (let i = 0; i < n && differs < 0; i++) {
    const seen = new Set(ok.map((s) => `${s.best!.members[i]!.echo}|${s.best!.members[i]!.weapon}`));
    if (seen.size > 1) differs = i;
  }
  return solves.map((s) => {
    const m = differs >= 0 ? s.best?.members[differs] : null;
    return {
      teamKey: s.teamKey,
      status: s.status,
      total: s.best?.total ?? null,
      label: m ? `${m.name}: ${m.echo}` : s.teamKey,
      ...(s.reason ? { reason: s.reason } : {}),
    };
  });
}

export function useRotationRun(target: Ref<RotationTarget | null>, subs: Ref<SubsMode>, account: Ref<RileyAccount>, client: RileyClient = rileyClient()) {
  const phase = ref<RunPhase>("idle");
  const run = shallowRef<RunLite | null>(null);
  const problem = shallowRef<RunProblem | null>(null);
  const notice = ref<string | null>(null);
  const variants = shallowRef<Variant[]>([]);
  const teams = shallowRef<RileyTeamInfo[]>([]);
  const progress = ref<{ done: number; total: number }>({ done: 0, total: 0 });
  /** the team key the run is of (a variant pick changes it) */
  const teamKey = ref<string | null>(null);
  let controller: AbortController | null = null;

  const hues = computed(() => {
    const map = new Map<string, string>();
    for (const t of teams.value) for (const m of t.members) if (m.hue && !map.has(m.name)) map.set(m.name, m.hue);
    return map;
  });
  const model = computed<RotationModel | null>(() => (run.value ? extractRotation(run.value) : null));
  const plan = computed<CuePlan | null>(() => (model.value ? cuePlan(model.value) : null));

  const fail = (p: RunProblem): void => {
    problem.value = p;
    phase.value = "error";
  };

  /** A skipped solve as the page's problem. */
  const skipped = (s: MineSolve | undefined): RunProblem =>
    s?.reason === "notInApp"
      ? { kind: "notInApp", message: s.message ?? "A member is not released in this app yet.", notInApp: s.notInApp }
      : s?.reason === "noBuild"
        ? { kind: "noBuild", message: s.message ?? "No build at your account's state." }
        : s?.reason === "unknownTeam"
          ? { kind: "unknownTeam", message: s.message ?? "This team is not in wuwa_calc's list." }
          : { kind: "error", message: s?.message ?? "The solver could not build this team." };

  async function load(retries = 0): Promise<void> {
    controller?.abort();
    const ctl = new AbortController();
    controller = ctl;
    const signal = ctl.signal;
    const t = target.value;
    problem.value = null;
    notice.value = null;
    progress.value = { done: 0, total: 0 };
    if (!t) {
      phase.value = "idle";
      run.value = null;
      return;
    }
    const opts = { account: account.value, subs: subs.value, signal };
    try {
      phase.value = "engine";
      teams.value = await client.teams(signal);
      const blocked = await client.blocked(signal);
      if (signal.aborted) return;

      // a /rankings team code: the team it names (teamCode.ts, pinned to his `tagTeam()`), at the account's state
      let t2: Exclude<RotationTarget, { kind: "code" }>;
      if (t.kind === "code") {
        const key = teamOfCode(t.code, teams.value);
        if (!key) {
          run.value = null;
          return fail({ kind: "code", message: `This Team rankings link names a team wuwa_calc ${client.commit} does not have — team codes outlive his list, so the team may have been retired.` });
        }
        notice.value = "This Team rankings link carried its own sequences and weapons: the cue card runs the team at your account instead.";
        t2 = { kind: "team", teamKey: key, rowKey: null, picks: null };
      } else t2 = t;

      // the composition, its variants, and the key + picks to trace
      let chars: string[];
      let key: string | null = null;
      let picks: RileyPick[] | null = null;
      if (t2.kind === "chars") chars = t2.chars;
      else {
        key = t2.teamKey;
        const team = teams.value.find((x) => x.key === key);
        if (!team) {
          run.value = null;
          return fail({ kind: "unknownTeam", message: `wuwa_calc ${client.commit} has no team ${key} — team keys move with his updates. Pick the team again.` });
        }
        chars = team.members.map((m) => m.appKey);
        if (t2.picks) picks = t2.picks;
      }
      const hidden = chars.filter((c) => blocked.includes(c));
      if (hidden.length) {
        run.value = null;
        return fail({ kind: "notInApp", message: `${hidden.join(" and ")} ${hidden.length > 1 ? "are" : "is"} not released in this app yet.`, notInApp: hidden });
      }
      const keys = await client.teamKeysFor(chars, signal);
      if (!keys.length && !key) {
        run.value = null;
        return fail({ kind: "unknownTeam", message: `wuwa_calc has no team of ${chars.join(" + ")}.` });
      }
      const asked = key && !keys.includes(key) ? [key, ...keys] : keys;
      phase.value = "solving";
      progress.value = { done: 0, total: asked.length };
      const solves = await client.solveMine(asked, { ...opts, onProgress: (done, total) => (progress.value = { done, total }) });
      variants.value = variantLabels(solves);
      const chosen = key ? solves.find((s) => s.teamKey === key) : bestOf(solves) ?? undefined;
      if (!picks) {
        if (!chosen?.best) {
          run.value = null;
          // a composition: report the most telling skip (unreleased first, then a missing build)
          const why = chosen ?? solves.find((s) => s.reason === "notInApp") ?? solves.find((s) => s.reason === "noBuild") ?? solves[0];
          return fail(skipped(why));
        }
        picks = chosen.best.picks;
      }
      key = chosen?.teamKey ?? key!;
      teamKey.value = key;

      phase.value = "tracing";
      let traced: RunLite;
      try {
        traced = await client.tracedRun(key, picks, opts);
      } catch (e) {
        if ((e as RunError)?.reason !== "stalePicks" || !chosen?.best) throw e;
        notice.value = "The row in this link no longer fits (wuwa_calc was updated or your echoes changed): this is the team's best row at your account now.";
        traced = await client.tracedRun(key, chosen.best.picks, opts);
      }
      if (signal.aborted) return;
      run.value = traced;
      phase.value = "ready";
    } catch (e) {
      if (signal.aborted) return;
      // an abort that was not ours: a memoised promise (the team list, a solve) another load started and then
      // cancelled, handed out in the same tick its cancel came in — ask again, it is gone from the memo by now
      if (isAbort(e) && retries < 2) return load(retries + 1);
      run.value = null;
      const err = e as RunError;
      if (err?.reason === "notInApp") fail({ kind: "notInApp", message: err.message, notInApp: err.notInApp });
      else if (err?.reason === "noBuild") fail({ kind: "noBuild", message: err.message });
      else if (err?.reason === "unknownTeam") fail({ kind: "unknownTeam", message: err.message });
      else fail({ kind: "error", message: err instanceof Error ? err.message : String(e) });
    }
  }

  // one string, so a hash change that leaves the team alone (the tab) does not run it again
  watch(
    () => `${target.value ? JSON.stringify(target.value) : ""}|${subs.value}|${account.value.key}|${account.value.buildsKey}`,
    () => void load(),
    { immediate: true },
  );
  onBeforeUnmount(() => controller?.abort());

  return { phase, run, model, plan, problem, notice, variants, teams, hues, progress, teamKey, reload: () => load() };
}
