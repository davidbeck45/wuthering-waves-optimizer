// Wuthering Tools+ — the "Rotation" button on a /rankings detail page: opens this row (its key, picks spelled out) as
// the cue card + fight timeline. One call from the controller's `mountImportControls` (the topbar box next to Back
// that it re-points at every detail render); the button lives inside that box, so it goes when the box goes.
import { rotationPath } from "./hash";

export function mountRotationLink(box: HTMLElement, rowKey: string, navigate: (path: string) => void): void {
  let link = box.querySelector<HTMLAnchorElement>("a[data-test-rankings-rotation]");
  if (!link) {
    link = document.createElement("a");
    link.className = "btn btn-outline btn-xs";
    link.textContent = "Rotation";
    link.title = "This row as a cue card (one line per swap, play-along timer) and a fight timeline";
    link.setAttribute("data-test-rankings-rotation", "");
    link.addEventListener("click", (e) => {
      // a plain click stays in the app; a middle / modified click opens a tab as a link does
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigate(link!.getAttribute("href") ?? "/rotation");
    });
    box.prepend(link);
    // one more control in a box sized for two: let it wrap (right-aligned) where a phone has no room, or the
    // Import button runs off the screen (inline, so the hook stays in this file and his topbar CSS is left alone)
    box.style.flexWrap = "wrap";
    box.style.justifyContent = "flex-end";
    box.style.rowGap = "0.4rem";
  }
  const teamKey = rowKey.split("-")[0] ?? rowKey;
  link.href = rotationPath({ kind: "team", teamKey, rowKey: rowKey.includes("-") ? rowKey : null, picks: null });
}
