// Wuthering Tools+ — a small always-on-top window for the cue card over a borderless game: Document Picture-in-
// Picture where the browser has it (desktop Chromium 116+), else a plain popup window. Either way the window is
// same-origin and empty: the page's stylesheets and theme attributes are copied in, and the caller teleports its
// Vue content into `mount`. Phones have neither — the play mode is the phone's answer (a second screen).
import { onBeforeUnmount, ref, shallowRef } from "vue";

export type PipMode = "pip" | "popup";

interface DocumentPip {
  requestWindow(opts: { width: number; height: number }): Promise<Window>;
}

/** Copy every stylesheet of `from` into `to` (inline rules where readable, a <link> where the sheet is remote). */
export function copyStyles(from: Document, to: Document): void {
  for (const sheet of Array.from(from.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules).map((r) => r.cssText).join("\n");
      const style = to.createElement("style");
      style.textContent = css;
      to.head.appendChild(style);
    } catch {
      if (!sheet.href) continue;
      const link = to.createElement("link");
      link.rel = "stylesheet";
      link.href = sheet.href;
      to.head.appendChild(link);
    }
  }
  for (const attr of ["data-theme", "data-theme-style", "class"]) {
    const v = from.documentElement.getAttribute(attr);
    if (v != null) to.documentElement.setAttribute(attr, v);
  }
}

export function usePip() {
  const pipApi = typeof window === "undefined" ? undefined : (window as Window & { documentPictureInPicture?: DocumentPip }).documentPictureInPicture;
  const pipSupported = !!pipApi;
  const win = shallowRef<Window | null>(null);
  const mount = shallowRef<HTMLElement | null>(null);
  const mode = ref<PipMode | null>(null);
  /** the last attempt failed (popup blocked) */
  const blocked = ref(false);

  let themeObserver: MutationObserver | null = null;

  function close(): void {
    themeObserver?.disconnect();
    themeObserver = null;
    const w = win.value;
    win.value = null;
    mount.value = null;
    mode.value = null;
    try {
      w?.close();
    } catch {
      /* already gone */
    }
  }

  async function open(opts: { width: number; height: number; title: string }): Promise<boolean> {
    if (win.value && !win.value.closed) {
      win.value.focus();
      return true;
    }
    let w: Window | null = null;
    let m: PipMode | null = null;
    if (pipApi) {
      try {
        w = await pipApi.requestWindow({ width: opts.width, height: opts.height });
        m = "pip";
      } catch {
        w = null;
      }
    }
    if (!w) {
      w = window.open("", "wtplus-rotation-cue", `popup,width=${opts.width},height=${opts.height}`);
      m = w ? "popup" : null;
    }
    blocked.value = !w;
    if (!w) return false;
    const doc = w.document;
    doc.title = opts.title;
    // a reused popup keeps its old body: start clean
    doc.head.replaceChildren();
    doc.body.replaceChildren();
    const meta = doc.createElement("meta");
    meta.name = "viewport";
    meta.content = "width=device-width, initial-scale=1";
    doc.head.appendChild(meta);
    copyStyles(document, doc);
    doc.body.className = "bg-base-100 text-base-content";
    // the app's body is a flex row (style.css): a plain block here, the content as wide as the window
    doc.body.style.cssText = "margin:0;display:block;min-width:0;overflow:hidden";
    const el = doc.createElement("div");
    el.className = "h-screen w-full";
    doc.body.appendChild(el);
    w.addEventListener("pagehide", () => {
      if (win.value === w) {
        themeObserver?.disconnect();
        themeObserver = null;
        win.value = null;
        mount.value = null;
        mode.value = null;
      }
    });
    win.value = w;
    mount.value = el;
    mode.value = m;
    // the app's theme switch rewrites <html data-theme>: the window follows while it is open
    themeObserver?.disconnect();
    if (typeof MutationObserver !== "undefined") {
      themeObserver = new MutationObserver(syncTheme);
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-theme-style"] });
    }
    return true;
  }

  /** follow the app's theme while the window is open */
  function syncTheme(): void {
    const doc = win.value?.document;
    if (!doc) return;
    for (const attr of ["data-theme", "data-theme-style"]) {
      const v = document.documentElement.getAttribute(attr);
      if (v != null) doc.documentElement.setAttribute(attr, v);
    }
  }

  onBeforeUnmount(close);
  return { win, mount, mode, blocked, pipSupported, open, close, syncTheme };
}
