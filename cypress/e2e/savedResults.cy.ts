// Wuthering Tools+: saved results (src/sim/persist/) — a heavy page's last result is kept in IndexedDB, so a new tab
// paints it at once instead of scoring again. "A new tab" here = sessionStorage cleared, then a reload (module memory
// goes with the reload): only the saved results can answer. The support file deletes the database before each test.
import { configOptimizer } from "./calculator/data/Cartethyia/data";
import * as fixtureModule from "../../src/sim/echoLab/__fixtures__/echoLabAccount.json";

// Cypress's webpack hands JSON over as the module itself (no default export)
type Account = { characters: Record<string, unknown>; echoes: Array<{ echoId: string }>; equipped: Record<string, unknown> };
const labAccount = ((fixtureModule as unknown as { default?: Account }).default ?? fixtureModule) as unknown as Account;
/** the Echo Lab unit-test fixture (public data only), on the v3 UI */
const seedLab = {
  onBeforeLoad(win: Window) {
    win.localStorage.setItem("character", JSON.stringify({ characters: labAccount.characters, activeCharacter: "Cartethyia" }));
    win.localStorage.setItem("inventory", JSON.stringify({ echoes: labAccount.echoes, equipped: labAccount.equipped, echoPresets: [], equippedPresets: {} }));
    const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
    settings.config = { ...settings.config, useClassicUi: false };
    win.localStorage.setItem("settings", JSON.stringify(settings));
  },
};

const DB = "wtplus-results";

/** How many saved records `cache` has in the app's database (polls up to `timeout` for at least `atLeast`). */
function savedCount(cache: string, atLeast = 0, timeout = 15000): Cypress.Chainable<number> {
  return cy.window({ log: false }).then(
    { timeout: timeout + 5000 },
    (win) =>
      new Cypress.Promise<number>((resolve) => {
        const started = Date.now();
        const once = () => {
          const r = win.indexedDB.open(DB);
          r.onupgradeneeded = () => {
            // no database yet: don't create one with the wrong shape
            r.transaction?.abort();
          };
          r.onerror = () => retry(0);
          r.onsuccess = () => {
            const db = r.result;
            if (!db.objectStoreNames.contains("meta")) {
              db.close();
              return retry(0);
            }
            const req = db.transaction("meta", "readonly").objectStore("meta").getAll();
            req.onsuccess = () => {
              const n = (req.result as Array<{ cache: string }>).filter((m) => m.cache === cache).length;
              db.close();
              retry(n);
            };
            req.onerror = () => {
              db.close();
              retry(0);
            };
          };
        };
        const retry = (n: number) => (n >= atLeast || Date.now() - started > timeout ? resolve(n) : setTimeout(once, 200));
        once();
      }),
  );
}

/** Record every value `attr` takes on `selector` from the first paint of the next page load. */
function watchAttr(selector: string, attr: string) {
  cy.on("window:before:load", (win) => {
    const seen: string[] = [];
    (win as unknown as { __seen: string[] }).__seen = seen;
    const note = () => {
      const v = win.document.querySelector(selector)?.getAttribute(attr);
      if (v != null && seen[seen.length - 1] !== v) seen.push(v);
    };
    win.document.addEventListener("DOMContentLoaded", () => {
      new win.MutationObserver(note).observe(win.document.body, { subtree: true, childList: true, attributes: true, attributeFilter: [attr] });
      note();
    });
  });
}

/** Seen-marker for an element: true once it was ever in the DOM after the next page load. */
function watchAppears(selector: string) {
  cy.on("window:before:load", (win) => {
    const w = win as unknown as { __appeared: boolean };
    w.__appeared = false;
    win.document.addEventListener("DOMContentLoaded", () => {
      new win.MutationObserver(() => {
        if (win.document.querySelector(selector)) w.__appeared = true;
      }).observe(win.document.body, { subtree: true, childList: true });
    });
  });
}

/* eslint-disable no-unused-vars -- the parameters of function types */
type Edit = (value: Record<string, unknown>) => void;
type Test = (values: Array<Record<string, unknown>>) => boolean;
/* eslint-enable no-unused-vars */

/** Wait until the saved values of `cache` (parsed JSON) pass `test`; fails after `timeout`. */
function waitSaved(cache: string, test: Test, timeout = 15000): Cypress.Chainable<boolean> {
  return cy
    .window({ log: false })
    .then({ timeout: timeout + 5000 }, (win) =>
      new Cypress.Promise<boolean>((resolve) => {
        const started = Date.now();
        const once = () => {
          const r = win.indexedDB.open(DB);
          r.onupgradeneeded = () => r.transaction?.abort();
          r.onerror = () => again(false);
          r.onsuccess = () => {
            const db = r.result;
            const tx = db.transaction(["meta", "data"], "readonly");
            const metas = tx.objectStore("meta").getAll();
            const values: Array<Record<string, unknown>> = [];
            metas.onsuccess = () => {
              for (const m of (metas.result as Array<{ key: string; cache: string }>).filter((x) => x.cache === cache)) {
                const get = tx.objectStore("data").get(m.key);
                get.onsuccess = () => values.push(JSON.parse(get.result as string) as Record<string, unknown>);
              }
            };
            tx.oncomplete = () => {
              db.close();
              again(values.length > 0 && test(values));
            };
            tx.onerror = () => {
              db.close();
              again(false);
            };
          };
        };
        const again = (ok: boolean) => (ok || Date.now() - started > timeout ? resolve(ok) : setTimeout(once, 200));
        once();
      }),
    );
}

/** Rewrite every saved record of `cache` in the app's database through `edit` (the parsed JSON value). */
function editSaved(cache: string, edit: Edit): Cypress.Chainable<number> {
  return cy.window({ log: false }).then(
    (win) =>
      new Cypress.Promise<number>((resolve, reject) => {
        const r = win.indexedDB.open(DB);
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction(["meta", "data"], "readwrite");
          const metas = tx.objectStore("meta").getAll();
          let edited = 0;
          metas.onsuccess = () => {
            for (const m of (metas.result as Array<{ key: string; cache: string }>).filter((x) => x.cache === cache)) {
              const get = tx.objectStore("data").get(m.key);
              get.onsuccess = () => {
                const value = JSON.parse(get.result as string) as Record<string, unknown>;
                edit(value);
                tx.objectStore("data").put(JSON.stringify(value), m.key);
                edited += 1;
              };
            }
          };
          tx.oncomplete = () => {
            db.close();
            resolve(edited);
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}

/** When each saved record of `cache` was saved (ms), from the database's meta store, once the list has held still for
 *  `quietMs` (a write still on its way lands within a few ms; this is how a test sees that none came). */
function savedTimes(cache: string, quietMs = 0): Cypress.Chainable<number[]> {
  return cy.window({ log: false }).then(
    { timeout: quietMs + 15000 },
    (win) =>
      new Cypress.Promise<number[]>((resolve, reject) => {
        let last = "";
        let since = Date.now();
        const once = () => {
          const r = win.indexedDB.open(DB);
          r.onerror = () => reject(r.error);
          r.onsuccess = () => {
            const db = r.result;
            const req = db.transaction("meta", "readonly").objectStore("meta").getAll();
            req.onsuccess = () => {
              db.close();
              const times = (req.result as Array<{ cache: string; savedAt: number }>).filter((m) => m.cache === cache).map((m) => m.savedAt);
              const now = JSON.stringify(times);
              if (now !== last) [last, since] = [now, Date.now()];
              if (Date.now() - since >= quietMs) resolve(times);
              else setTimeout(once, 100);
            };
            req.onerror = () => {
              db.close();
              reject(req.error);
            };
          };
        };
        once();
      }),
  );
}

const newTab = () => {
  cy.window().then((win) => win.sessionStorage.clear());
  cy.reload();
};

describe("saved results", () => {
  it("/my-rankings: a new tab paints the saved ranking without scoring again, and says when it was saved", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/my-rankings");
    cy.get("[data-test-my-rankings-status]", { timeout: 120000 }).should("have.attr", "data-status", "live");
    cy.get("[data-test-my-rankings-status]").should("not.have.attr", "data-saved-result");
    savedCount("ranking", 1).should("be.gte", 1);

    watchAttr("[data-test-my-rankings-status]", "data-status");
    newTab();
    cy.get("[data-test-my-rankings-status]", { timeout: 10000 }).should("have.attr", "data-saved-result");
    cy.get("[data-test-my-rankings-status]").should("have.attr", "data-status", "live");
    cy.get('[data-test-my-rankings-row="Cartethyia"]').should("exist");
    cy.get("[data-test-my-rankings-progress]").should("contain.text", "saved just now");
    // the marker: the status tile never read "scoring" on this load
    cy.window().its("__seen").should("not.include", "scoring");
    cy.window().its("__seen").should("include", "live");

    // Recompute scores it fresh: the saved note goes
    cy.get("[data-test-my-rankings-compute]").first().click();
    cy.get("[data-test-my-rankings-status]", { timeout: 120000 }).should("have.attr", "data-status", "live").and("not.have.attr", "data-saved-result");
    cy.get("[data-test-my-rankings-progress]").should("not.contain.text", "data unchanged");
  });

  it("/account: a new tab paints the saved ranking and investment plan without a run", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/account");
    cy.get("[data-test-account-invest-row]", { timeout: 120000 }).should("exist");
    cy.get("[data-test-account-invest-progress]", { timeout: 120000 }).should("not.exist");
    cy.get("[data-test-account-source]").should("have.attr", "data-state", "live").and("not.have.attr", "data-saved-result");
    savedCount("ranking", 1).should("be.gte", 1);
    savedCount("investPlan", 1).should("be.gte", 1);

    watchAttr("[data-test-account-source]", "data-state");
    watchAppears("[data-test-account-invest-progress]");
    newTab();
    cy.get("[data-test-account-source]", { timeout: 10000 }).should("have.attr", "data-saved-result");
    cy.get("[data-test-account-source]").should("have.attr", "data-state", "live").and("contain.text", "saved just now");
    cy.get("[data-test-account-invest-row]").should("exist");
    cy.window().its("__seen").should("not.include", "scoring");
    cy.window().its("__appeared").should("eq", false);
  });

  it("/account: a saved plan whose ER needs no longer match is planned again", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/account");
    cy.get("[data-test-account-invest-row]", { timeout: 120000 }).should("exist");
    cy.get("[data-test-account-invest-progress]", { timeout: 120000 }).should("not.exist");
    savedCount("investPlan", 1).should("be.gte", 1);
    // as if the energy check had read other ER needs when it was planned
    editSaved("investPlan", (v) => (v.key = `${String(v.key)}|another`)).should("eq", 1);

    watchAppears("[data-test-account-invest-progress]");
    newTab();
    cy.get("[data-test-account-source]", { timeout: 10000 }).should("have.attr", "data-saved-result");
    // the saved plan is shown, then planned again once the ER needs arrive and do not match
    cy.window().its("__appeared", { timeout: 60000 }).should("eq", true);
    cy.get("[data-test-account-invest-progress]", { timeout: 120000 }).should("not.exist");
    cy.get("[data-test-account-invest-row]").should("exist");
    // and the new plan is the one saved now
    waitSaved("investPlan", (values) => values.every((v) => !String(v.key).includes("|another"))).should("eq", true);
  });

  it("/echo-lab: a new tab paints the saved pass and benchmarks without running them", () => {
    cy.viewport(1440, 900);
    cy.visit("/echo-lab?tab=benchmark", seedLab);
    cy.get("[data-test-echo-lab-meta]", { timeout: 60000 }).should("exist").and("not.have.attr", "data-saved-result");
    cy.get("[data-test-echo-lab-benchmark-row]", { timeout: 60000 }).should("exist");
    cy.get("[data-test-echo-lab-benchmark-progress]", { timeout: 60000 }).should("not.exist");
    cy.get("[data-test-echo-lab-benchmark-row]").its("length").as("rows");
    // the pass is saved first, then again with the benchmarks beside it
    waitSaved("echoLab", (values) => values.some((v) => v.pass && v.benchmarks)).should("eq", true);

    watchAppears("[data-test-echo-lab-progress], [data-test-echo-lab-benchmark-progress]");
    newTab();
    cy.get("[data-test-echo-lab-meta]", { timeout: 10000 }).should("have.attr", "data-saved-result");
    cy.get("[data-test-echo-lab-meta]").should("contain.text", "saved just now");
    cy.get("@rows").then((rows) => cy.get("[data-test-echo-lab-benchmark-row]").should("have.length", rows as unknown as number));
    cy.window().its("__appeared").should("eq", false);
  });

  it("/inventory's roll chips, rated in a new tab, leave Echo Lab's saved pass as it was saved", () => {
    cy.viewport(1440, 900);
    cy.visit("/echo-lab", seedLab);
    cy.get("[data-test-echo-lab-meta]", { timeout: 60000 }).should("exist").and("not.have.attr", "data-saved-result");
    waitSaved("echoLab", (values) => values.some((v) => v.pass)).should("eq", true);
    savedTimes("echoLab").then((times) => {
      expect(times, "one saved Echo Lab record").to.have.length(1);
      cy.wrap(times[0]).as("savedAt");
    });

    // a new tab on the inventory: its chips read the saved pass, rate every echo, and keep the ratings in the tab copy
    cy.window().then((win) => win.sessionStorage.clear());
    cy.visit("/inventory", seedLab);
    cy.get('[data-test-inventory-quality-status][data-state="done"]', { timeout: 90000 }).should("exist");
    cy.window().should((win) => {
      const tab = JSON.parse(win.sessionStorage.getItem("wtplus:echoLab:cache") ?? "{}") as { ratings?: unknown[] };
      expect(tab.ratings?.length ?? 0, "roll ratings in the tab copy").to.be.greaterThan(0);
    });
    // a write would land within a few ms of the tab copy's: once the saved list holds still, it is the record from before
    cy.get("@savedAt").then((before) => savedTimes("echoLab", 1500).should("deep.equal", [before as unknown as number]));
    waitSaved("echoLab", (values) => values.every((v) => v.pass && !("ratings" in v))).should("eq", true);

    // and Echo Lab in the next tab still paints it without running the pass
    watchAppears("[data-test-echo-lab-progress]");
    cy.window().then((win) => win.sessionStorage.clear());
    cy.visit("/echo-lab", seedLab);
    cy.get("[data-test-echo-lab-meta]", { timeout: 10000 }).should("have.attr", "data-saved-result");
    cy.window().its("__appeared").should("eq", false);
  });

  it("Settings › Clear saved results empties them, and the next visit scores again", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/my-rankings");
    cy.get("[data-test-my-rankings-status]", { timeout: 120000 }).should("have.attr", "data-status", "live");
    savedCount("ranking", 1).should("be.gte", 1);

    cy.visit("/settings");
    cy.get("[data-test-saved-results]").should("be.visible");
    cy.get("[data-test-saved-results-usage]").should("contain.text", "saved result");
    cy.get("[data-test-saved-results-list]").should("contain.text", "Roster rankings");
    cy.get("[data-test-saved-results-clear]").should("be.enabled").click();
    cy.get("[data-test-saved-results-usage]").should("contain.text", "Cleared");
    savedCount("ranking").should("eq", 0);

    // this tab's copy went too: the page scores, and nothing says "saved"
    watchAttr("[data-test-my-rankings-status]", "data-status");
    cy.visit("/my-rankings");
    cy.get("[data-test-my-rankings-status]", { timeout: 120000 }).should("have.attr", "data-status", "live");
    cy.get("[data-test-my-rankings-status]").should("not.have.attr", "data-saved-result");
    cy.window().its("__seen").should("include", "scoring");
  });

  it("without IndexedDB (a private window) the pages compute as before and Settings says nothing is kept", () => {
    const noIdb = (win: Window) => {
      Object.defineProperty(win, "indexedDB", {
        configurable: true,
        get() {
          throw new DOMException("IndexedDB is off", "SecurityError");
        },
      });
    };
    cy.visit("/", { onBeforeLoad: noIdb });
    cy.importCharacterData(configOptimizer);
    cy.on("window:before:load", noIdb);
    cy.visit("/my-rankings");
    cy.get("[data-test-my-rankings-status]", { timeout: 120000 }).should("have.attr", "data-status", "live");
    cy.get('[data-test-my-rankings-row="Cartethyia"]').should("exist");
    cy.get("[data-test-my-rankings] .alert-error").should("not.exist");
    cy.visit("/settings");
    cy.get("[data-test-saved-results-usage]").should("contain.text", "isn't keeping results");
    cy.get("[data-test-saved-results-clear]").should("be.disabled");
  });
});
