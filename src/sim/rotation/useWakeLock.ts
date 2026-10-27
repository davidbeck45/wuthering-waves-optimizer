// Wuthering Tools+ — keep the screen on while the play mode runs (Screen Wake Lock API). The lock is released by
// the browser whenever the page is hidden, so it is taken again on the way back. Where the API is missing (Firefox,
// older Safari) the state reads "unsupported" and the play mode says so.
import { onBeforeUnmount, ref, watch, type Ref } from "vue";

export type WakeState = "off" | "on" | "unsupported" | "denied";

interface Sentinel {
  release(): Promise<void>;
  addEventListener(type: "release", fn: () => void): void;
}

export function useWakeLock(active: Ref<boolean>) {
  const nav = typeof navigator === "undefined" ? null : (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<Sentinel> } });
  const supported = !!nav?.wakeLock;
  const state = ref<WakeState>(supported ? "off" : "unsupported");
  let sentinel: Sentinel | null = null;
  let wanted = false;

  async function acquire(): Promise<void> {
    if (!supported || sentinel || typeof document === "undefined" || document.visibilityState !== "visible") return;
    try {
      const s = await nav!.wakeLock!.request("screen");
      if (!wanted) {
        await s.release().catch(() => undefined);
        return;
      }
      sentinel = s;
      state.value = "on";
      s.addEventListener("release", () => {
        if (sentinel === s) sentinel = null;
        if (state.value === "on") state.value = "off";
      });
    } catch {
      state.value = "denied";
    }
  }

  async function release(): Promise<void> {
    const s = sentinel;
    sentinel = null;
    if (supported) state.value = "off";
    await s?.release().catch(() => undefined);
  }

  const onVisible = (): void => {
    if (wanted && document.visibilityState === "visible") void acquire();
  };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);

  watch(
    active,
    (on) => {
      wanted = on;
      void (on ? acquire() : release());
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    wanted = false;
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
    void release();
  });

  return { state, supported };
}
