// Wuthering Tools+: keep Cypress's headless Electron drawing frames at the normal rate after a screenshot.
//
// Cypress takes every Electron screenshot (cy.screenshot, and the failure screenshot a CI run saves) between
// Page.startScreencast and Page.stopScreencast. Once that screencast stops, the hidden Electron window draws
// about one frame a second for the rest of the spec: requestAnimationFrame, smooth scrolling and CSS transitions
// crawl, and every forced layout waits about a second. Measured 2026-10-31 (Cypress 15.21.1, Electron 37 /
// Chromium 138, any page, /info included): 60 frames a second before a cy.screenshot, 1 after it, in the same
// test and in every later test of the spec. Ryan's workspaceReadiness.cy.ts takes a screenshot in its first
// test, so the smooth scroll in its second test ("clicking the buffs warning opens the section") got about four
// frames inside the assertion's 4 s, and CI failed it whenever those frames came a little late.
//
// A screencast that is left running keeps the window drawing at the normal rate. This one asks for 8 px JPEGs and
// never acknowledges a frame, so Chromium captures one frame and then nothing more. It starts again after every
// screenshot. Electron only; a run that records video already keeps its own screencast running.

const IDLE_SCREENCAST = { format: "jpeg", quality: 1, maxWidth: 8, maxHeight: 8 } as const;

function restartIdleScreencast(): void {
  if (Cypress.browser?.name !== "electron" || Cypress.config("video")) return;
  Promise.resolve(
    Cypress.automation("remote:debugger:protocol", { command: "Page.startScreencast", params: IDLE_SCREENCAST }),
  ).catch(() => {
    // Without the screencast the spec still runs, only at the slow frame rate described above.
  });
}

Cypress.Screenshot.defaults({ onAfterScreenshot: restartIdleScreencast });
