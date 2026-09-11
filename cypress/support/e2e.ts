// Add common Cypress configurations or custom commands here.
import "./commands";
import { updateEntries } from "../../src/content/updates";

Cypress.on("uncaught:exception", (err) => {
  // Benign Chromium/Electron warning, not an application bug — see
  // https://github.com/cypress-io/cypress/issues/8418. Any component using
  // ResizeObserver (e.g. the build card's export scaling) can trigger it.
  if (err.message.includes("ResizeObserver loop completed")) {
    return false;
  }
  return true;
});

beforeEach(() => {
  // The site-wide update banner (AppUpdateBanner) sits above the page and
  // covers click targets in headless Chromium/Electron. Pre-dismiss it the
  // way a user would have: the settings store persists
  // `config.dismissedUpdateBannerDate`, and the banner hides when that equals
  // the newest updates entry's date. Set it before every page load, including
  // the reload `importCharacterData` triggers.
  const latestUpdateDate = updateEntries[0]?.date ?? "";
  cy.on("window:before:load", (win) => {
    let settings: Record<string, any> = {};
    try {
      settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}") ?? {};
    } catch {
      settings = {};
    }
    settings.config = { ...(settings.config ?? {}), dismissedUpdateBannerDate: latestUpdateDate };
    win.localStorage.setItem("settings", JSON.stringify(settings));
  });
  // Google Fonts (and related) can stall window.load for tens of seconds in
  // Cypress Electron. Stub them so cy.visit resolves promptly.
  cy.intercept("https://fonts.googleapis.com/**", {
    statusCode: 200,
    headers: { "content-type": "text/css" },
    body: "/* stubbed for Cypress */",
  });
  cy.intercept("https://fonts.gstatic.com/**", {
    statusCode: 200,
    body: "",
  });
  cy.intercept("https://va.vercel-scripts.com/**", {
    statusCode: 200,
    headers: { "content-type": "application/javascript" },
    body: "/* stubbed for Cypress */",
  });
});
