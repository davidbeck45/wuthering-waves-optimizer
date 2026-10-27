// Wuthering Tools+ — per-row panel state for /my-rankings (what if…, substat weights). Kept per CharacterRank
// object in a WeakMap, so collapsing a row and opening it again keeps its form and result, and a new ranking
// (new objects) starts clean without anyone clearing anything — the rows a progressive run hands over are the
// same objects as the final result's.
import { reactive, toRaw } from "vue";
import type { CharacterRank, WeaponOption, WhatIfResult } from "./rankRoster";
import type { EchoSubstatWorth, SubstatWeightsResult } from "../substats/substatWeights";
import type { ErFloorScorer } from "../energy/energySubstats";

export interface WhatIfState {
  sequence: number;
  weapon: string;
  refinement: number;
  weapons: WeaponOption[];
  weaponsLoaded: boolean;
  running: boolean;
  result: WhatIfResult | null;
  error: string | null;
}

export interface SubstatsState {
  started: boolean;
  running: boolean;
  result: SubstatWeightsResult | null;
  echoes: EchoSubstatWorth[] | null;
  error: string | null;
  /** Energy Regen as a floor (the energy check's need for this character), null until read */
  er: ErFloorScorer | null;
}

const whatIfs = new WeakMap<object, WhatIfState>();
const substats = new WeakMap<object, SubstatsState>();

export function whatIfStateOf(rank: CharacterRank): WhatIfState {
  const key = toRaw(rank);
  let state = whatIfs.get(key);
  if (!state) {
    state = reactive<WhatIfState>({
      sequence: rank.sequence,
      weapon: rank.weapon ?? "",
      refinement: rank.refinement,
      weapons: [],
      weaponsLoaded: false,
      running: false,
      result: null,
      error: null,
    }) as WhatIfState;
    whatIfs.set(key, state);
  }
  return state;
}

export function substatsStateOf(rank: CharacterRank): SubstatsState {
  const key = toRaw(rank);
  let state = substats.get(key);
  if (!state) {
    state = reactive<SubstatsState>({ started: false, running: false, result: null, echoes: null, error: null, er: null }) as SubstatsState;
    substats.set(key, state);
  }
  return state;
}
