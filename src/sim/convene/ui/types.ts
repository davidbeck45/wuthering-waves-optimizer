// Wuthering Tools+ — what the Convene tabs hand to upstream's odds simulator (ConveneView.vue's own refs; its index
// conventions: `currentOwnedIndex` −1 = no copy, S0 / "R0" = 0; `targetIndex` = copies − 1).
import type { ConveneMode } from "../../../convene/simulateConvene";

export interface ConveneSimPrefill {
  mode: ConveneMode;
  /** 0–78 (the simulator's curve reaches 100 % on pull 79) */
  startingPity: number;
  guaranteedNextFeatured: boolean;
  currentOwnedIndex?: number;
  targetIndex?: number;
}

/** a prefill plus the sentence the page shows once the simulator has it */
export interface ConvenePrefillRequest {
  prefill: ConveneSimPrefill;
  note: string;
}
