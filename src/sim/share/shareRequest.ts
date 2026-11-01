// Wuthering Tools+ share cards — "share this" from anywhere (the command palette): a request the shell's lazily
// mounted ShareSheetHost opens the sheet for. Light on purpose (the palette module is in the entry chunk); the sheet
// and its card code load on the first request.
import { shallowRef } from "vue";
import type { ShareSource } from "./buildCodec";

export const shareRequest = shallowRef<{ source: ShareSource; n: number } | null>(null);
let count = 0;

/** Open the share sheet for a build or a saved team (a new request re-opens it, even for the same source). */
export function requestShare(source: ShareSource): void {
  count += 1;
  shareRequest.value = { source, n: count };
}
