// Wuthering Tools+ — "Why this number" from anywhere: a request the shell's lazily mounted AnatomySheetHost opens the
// sheet for. Light on purpose (the buttons and the palette reach it, and it sits in the entry chunk through PlusShell);
// the sheet and the engine code load on the first request.
import { shallowRef } from "vue";

export interface AnatomyRequest {
  characterId: string;
  /** the rotation the figure on screen came from; without one the sheet finds the character's best */
  rotationName?: string | null;
  n: number;
}

export const anatomyRequest = shallowRef<AnatomyRequest | null>(null);
let count = 0;

/** Open the sheet (a new request re-opens it, even for the same character). */
export function requestAnatomy(characterId: string, rotationName?: string | null): void {
  count += 1;
  anatomyRequest.value = { characterId, rotationName: rotationName ?? null, n: count };
}
