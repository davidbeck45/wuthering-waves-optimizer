// Wuthering Tools+ — a confirm is about the page it opened on. The dialog lives in App.vue, so Back left it open over the
// next page, where pressing its button wrote what it listed: on /build-history, onto whoever that page now showed
// (2026-11-05 hunt, H2 and L1). Any move to another page or query settles it as cancelled; a hash the page under the
// dialog writes for itself (the rankings' filters) does not.
import type { Router } from "vue-router";
import { useConfirm } from "../../composables/useConfirm";

export function installConfirmRouteGuard(router: Pick<Router, "afterEach">, dialog: Pick<ReturnType<typeof useConfirm>, "confirmRequest" | "settle"> = useConfirm()): () => void {
  return router.afterEach((to, from, failure) => {
    if (failure || !dialog.confirmRequest.value) return;
    if (to.path === from.path && JSON.stringify(to.query) === JSON.stringify(from.query)) return;
    dialog.settle(false);
  });
}
