// Wuthering Tools+ — which build Optimize team's Edit drawer edits.
//
// A team can pin a member to a build that is not the active one: Whole account and Build my team leave every saved
// member on "Account plan" that way. His drawer (`OptimizerWorkspaceSetup` embedded, and the echo buff rows under it)
// read and wrote the character's live record, the ACTIVE build, while the search read the pinned one. So switching
// Sound of True Name off for Sigrika changed nothing in the run (7,322,921 both times) and quietly changed what the
// calculator's Optimizer used for her.
//
// The drawer's host provides a scope (who, and the team's pin). The three places under it that reach the character
// store ask for it through `optimizerSettingsStore`: with no scope (the calculator) that is the store itself; with one
// it is a view where the member's record IS the pinned build, and writes land in that stored build. With no pin, or
// a pin on the active build, the view is the store again.
import { computed, hasInjectionContext, inject, reactive, type InjectionKey, type Ref } from "vue";
// @ts-expect-error lodash ships no types; this is the store's own merge (src/stores/character.js), so a write lands the same way
import merge from "lodash/merge";
import { resolveCharactersForBuild } from "../../calculator/buildOverride";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface OptimizerSettingsScope {
  characterId: string;
  /** the team's pin for this member; null = the active build */
  buildId: string | null;
}

export const OPTIMIZER_SETTINGS_SCOPE: InjectionKey<Ref<OptimizerSettingsScope | null>> = Symbol("wtplus:optimizerSettingsScope");

/** The stored build a scope addresses, or null when it is the live record (no pin, the active build, a build since deleted). */
export function scopedBuild(characters: Record<string, any> | null | undefined, scope: OptimizerSettingsScope | null | undefined): Record<string, any> | null {
  if (!scope?.buildId) return null;
  const record = characters?.[scope.characterId];
  if (!record || scope.buildId === record.activeBuildId) return null;
  return record.builds?.find((build: any) => build?.id === scope.buildId) ?? null;
}

/** The name of the build a scope addresses, for the drawer's line: the pinned build's, else the active one's. */
export function scopedBuildName(characters: Record<string, any> | null | undefined, scope: OptimizerSettingsScope | null | undefined): string | null {
  if (!scope) return null;
  const record = characters?.[scope.characterId];
  const build = scopedBuild(characters, scope) ?? record?.builds?.find((entry: any) => entry?.id === record?.activeBuildId) ?? null;
  return typeof build?.name === "string" && build.name ? build.name : null;
}

/** The character store as the drawer under `scope` should see it. Same members the buff rows use, nothing else. */
export function scopedSettingsStore<S>(store: S, scope: Ref<OptimizerSettingsScope | null>): S {
  const real = store as any;
  const buildFor = (characterId: string): Record<string, any> | null =>
    scope.value && scope.value.characterId === characterId ? scopedBuild(real.characters, scope.value) : null;
  const characters = computed<Record<string, any>>(() =>
    scope.value && scopedBuild(real.characters, scope.value)
      ? resolveCharactersForBuild(real.characters, scope.value.characterId, scope.value.buildId)
      : real.characters,
  );
  const write = (characterId: string, change: (build: Record<string, any>) => void): boolean => {
    if (!buildFor(characterId)) return false;
    // found again inside the patch: one store mutation, so it is saved and sent to other tabs like any other
    real.$patch((state: any) => {
      const build = scopedBuild(state.characters, scope.value);
      if (build) change(build);
    });
    return true;
  };
  return reactive({
    characters,
    setCharacterData(characterId: string, data: Record<string, any>) {
      if (!write(characterId, (build) => void merge(build, data))) return real.setCharacterData(characterId, data);
    },
    /** Under a drawer the minimums are the team run's own (its choices hold them): nothing is saved. */
    setCharacterOptimizerMinStats() {},
    clearOptimizerEchoSetPassive(characterId: string, passiveKey: string) {
      if (!write(characterId, (build) => void delete build.optimizer?.echoSetPassives?.[passiveKey])) return real.clearOptimizerEchoSetPassive(characterId, passiveKey);
    },
    clearOptimizerMainEchoBuff(characterId: string, echoKey: string, buffKey: string) {
      const done = write(characterId, (build) => {
        // as the store's own: the per-buff shape, else the legacy one switch for the echo
        const entry = build.optimizer?.mainEchoBuffs?.[echoKey];
        if (!entry) return;
        if (entry.buffs && Object.keys(entry.buffs).length > 0) delete entry.buffs[buffKey];
        else {
          delete entry.isEnabled;
          delete entry.stacks;
        }
      });
      if (!done) return real.clearOptimizerMainEchoBuff(characterId, echoKey, buffKey);
    },
  }) as unknown as S;
}

/** For a component or composable: the store, or the scoped view when a drawer above provides a scope. */
export function optimizerSettingsStore<S>(store: S): S {
  const scope = hasInjectionContext() ? inject(OPTIMIZER_SETTINGS_SCOPE, null) : null;
  return scope ? scopedSettingsStore(store, scope) : store;
}

/** The drawer's one line: which settings are this run's own, and which build keeps the echo buff switches. */
export function drawerScopeLine(characters: Record<string, any> | null | undefined, scope: OptimizerSettingsScope, name: string): string {
  const build = scopedBuildName(characters, scope);
  const where = build ? `${name}'s build "${build}", the one this team uses` : `${name}'s build, the one this team uses`;
  const active = scopedBuild(characters, scope) ? "" : " The calculator's Optimizer reads the same switches.";
  return `Sets, main echoes, minimum stats and advanced settings picked here are for this team run only. Echo buff switches are saved on ${where}.${active}`;
}

/** What the embedded setup starts from: the team run's own choice, not a saved record. */
export interface EmbeddedSetupStart {
  minStats: any[];
  ignoreOtherResonatorEchoes: boolean;
  loadoutFormat: string;
}
