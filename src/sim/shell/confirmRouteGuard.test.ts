// Wuthering Tools+: a confirm does not outlive the page it opened on, on a real router.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import { useConfirm } from "../../composables/useConfirm";
import { installConfirmRouteGuard } from "./confirmRouteGuard";

describe("a confirm and the route", () => {
  const page = { template: "<div />" };
  let router: Router;
  let stop: () => void;
  const { confirm, confirmRequest, settle } = useConfirm();

  beforeEach(async () => {
    router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/", component: page }, { path: "/build-history", component: page }, { path: "/today", component: page }] });
    await router.push("/build-history?char=Aemeath");
    await router.push("/build-history?char=Chisa");
    stop = installConfirmRouteGuard(router);
  });
  afterEach(() => {
    stop();
    if (confirmRequest.value) settle(false);
  });

  it("Back to another character on the same page cancels it", async () => {
    const answer = confirm("Restore Chisa's build?");
    router.back();
    await new Promise<void>((resolve) => {
      const off = router.afterEach(() => {
        off();
        resolve();
      });
    });
    expect(confirmRequest.value).toBeNull();
    await expect(answer).resolves.toBe(false);
  });

  it("another page cancels it", async () => {
    const answer = confirm("Save 9 builds?");
    await router.push("/today");
    expect(confirmRequest.value).toBeNull();
    await expect(answer).resolves.toBe(false);
  });

  it("a hash the page writes for itself leaves it open", async () => {
    const answer = confirm("Sync my teams?");
    await router.replace({ path: "/build-history", query: { char: "Chisa" }, hash: "#view=mine" });
    expect(confirmRequest.value).not.toBeNull();
    settle(true);
    await expect(answer).resolves.toBe(true);
  });

  it("a navigation that does not happen leaves it open", async () => {
    const answer = confirm("Save?");
    await router.push("/build-history?char=Chisa"); // already there: a duplicate is a failed navigation
    expect(confirmRequest.value).not.toBeNull();
    settle(true);
    await expect(answer).resolves.toBe(true);
  });

  it("nothing open: nothing to do", async () => {
    await router.push("/today");
    expect(confirmRequest.value).toBeNull();
  });
});
