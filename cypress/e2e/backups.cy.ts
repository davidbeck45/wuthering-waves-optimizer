// Wuthering Tools+ automatic backups (/backups, src/sim/backup/) in the v3 UI at the S26's 412 px and 130 % text, on a
// real IndexedDB: the day's backup taken on its own, the list, Download, Share, Restore through the confirm, the
// backup a Settings import or a bulk delete takes first, a damaged record, a browser without IndexedDB, Delete your
// data. Backups stand aside under Cypress unless a spec sets the switch below. Seeded through onBeforeLoad with
// public data only: upstream's Cartethyia fixture, one saved team, and three made-up pulls.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

const DB = "wtplus-backups";
const SWITCH = "wtplus:backup:e2e";
const PULLS = "wtplus:convene:history";
const CLEARS = "wtplus:endgame:clears";
const STATE = "wtplus:backup:state";
const API_KEY = "sk-ant-api03-NOT-A-REAL-KEY";
const TEAM = "Cartethyia · Ciaccona · Chisa";
const S26 = { width: 412, height: 915 };
/** a backup taken a moment ago reads "Today …"; a run that crosses midnight reads "Yesterday …" and is no failure */
const DAY = /^(Today|Yesterday) /;

type Pull = [string, number, number, string];
const pulls = (rows: Pull[]): string => JSON.stringify({ v: 1, active: "800000001", players: { "800000001": { region: "global", updatedAt: 1, pools: { "1": rows }, imports: [] } } });
const THREE: Pull[] = [
  ["2026-05-01 10:00:00", 21010013, 3, "Originite: Type II"],
  ["2026-05-02 11:30:00", 1503, 5, "Verina"],
  ["2026-06-10 09:15:00", 21020015, 3, "Guardian Sword"],
];
const TEAMS = JSON.stringify({
  teams: [{ id: "bk-t1", name: TEAM, characterIds: ["Cartethyia", "Ciaccona", "Chisa"], buildIds: [null, null, null], actions: [], duration: null }],
  favoriteTeamIds: [],
  favoritePresetNames: [],
});
const CLEARS_THEN = JSON.stringify({ v: 1, clears: [{ id: "c1", seconds: 71 }] });

/* eslint-disable no-unused-vars -- parameter names in function types */
/** the bit of src/sim/backup/backupStore.ts the two-connections test uses */
interface TestStore {
  add: (meta: object, data: string) => Promise<boolean>;
  list: () => Promise<Array<{ id: string }>>;
}
interface StoreModule {
  idbBackupStore: (factory: IDBFactory) => TestStore;
}
/* eslint-enable no-unused-vars */

interface Saved {
  name: string;
  text: string;
}
type TestWindow = Cypress.AUTWindow & { __saved?: Saved[]; __lastBlob?: Blob | null; __shared?: Array<{ name: string; type: string; text: string }> };

function large(win: Window): void {
  const style = win.document.createElement("style");
  style.textContent = "html { font-size: 130%; }";
  win.document.head.appendChild(style);
}

/** A download is caught instead of written to disk: the file's name, and its text once read. */
function catchDownloads(win: TestWindow): void {
  win.__saved = [];
  const realCreate = win.URL.createObjectURL.bind(win.URL);
  win.URL.createObjectURL = (blob: Blob | MediaSource) => {
    win.__lastBlob = blob instanceof win.Blob || blob instanceof Blob ? (blob as Blob) : null;
    return realCreate(blob);
  };
  const realClick = win.HTMLAnchorElement.prototype.click;
  win.HTMLAnchorElement.prototype.click = function click() {
    const link = this as HTMLAnchorElement;
    if (!link.download) return realClick.call(link);
    const entry: Saved = { name: link.download, text: "" };
    win.__saved!.push(entry);
    void win.__lastBlob?.text().then((text) => (entry.text = text));
  };
}

function seed() {
  return {
    onBeforeLoad(win: Cypress.AUTWindow) {
      win.sessionStorage.clear();
      win.localStorage.clear();
      win.localStorage.setItem(SWITCH, "1");
      win.localStorage.setItem("character", configOptimizer.data.character);
      win.localStorage.setItem("inventory", configOptimizer.data.inventory);
      win.localStorage.setItem("teamRotations", TEAMS);
      win.localStorage.setItem(PULLS, pulls(THREE));
      win.localStorage.setItem(CLEARS, CLEARS_THEN);
      win.localStorage.setItem("wtplus:ai:key", API_KEY);
      win.localStorage.setItem("settings", JSON.stringify({ config: { useClassicUi: false, theme: "dark" }, labs: {} }));
    },
    onLoad: large,
  };
}

/** Cypress clears localStorage between tests, not IndexedDB: each test starts with no backups. */
function dropBackups(): Cypress.Chainable<string> {
  return cy.wrap(
    new Promise<string>((resolve) => {
      const timer = setTimeout(() => resolve("timeout"), 5000);
      const done = (how: string) => () => {
        clearTimeout(timer);
        resolve(how);
      };
      const r = window.indexedDB.deleteDatabase(DB);
      r.onsuccess = done("deleted");
      r.onerror = done("error");
    }),
    { log: false, timeout: 10000 },
  );
}

/** What each stored backup says is inside, read straight from the database. */
function storedCounts(): Promise<Array<{ characters: number; echoes: number; teams: number; pulls: number | null }>> {
  return new Promise((resolve, reject) => {
    const open = window.indexedDB.open(DB);
    open.onerror = () => reject(open.error);
    open.onupgradeneeded = () => open.transaction?.abort(); // no database: nothing is stored
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("meta")) {
        db.close();
        return resolve([]);
      }
      const all = db.transaction(["meta"], "readonly").objectStore("meta").getAll();
      all.onsuccess = () => {
        db.close();
        resolve((all.result as Array<{ counts: { characters: number; echoes: number; teams: number; pulls: number | null } }>).map((m) => m.counts));
      };
      all.onerror = () => reject(all.error);
    };
  }).catch(() => []) as Promise<Array<{ characters: number; echoes: number; teams: number; pulls: number | null }>>;
}

const rows = (timeout = 20000) => cy.get("[data-test-backup-row]", { timeout });
const saved = () => cy.window().then((win) => (win as TestWindow).__saved ?? []);
const weaponRank = (win: Window): string | undefined => {
  const cart = JSON.parse(win.localStorage.getItem("character")!).characters.Cartethyia;
  return cart.weapons?.[cart.weapon]?.refinement;
};
const confirmBox = () => cy.get(".confirm-dialog .modal-box");

function expectNoHorizontalScroll(what: string): void {
  cy.window().then((win) => expect(win.document.documentElement.scrollWidth, `${what} page width`).to.be.at.most(win.document.documentElement.clientWidth));
}

describe("automatic backups", () => {
  beforeEach(() => {
    cy.viewport(S26.width, S26.height);
    dropBackups();
    // every load of the test, the app's own reloads included
    cy.on("window:before:load", (win) => catchDownloads(win as TestWindow));
  });

  it("takes the day's backup on its own, says what is inside, and does not take a second one", () => {
    cy.visit("/backups", seed());
    cy.title().should("eq", "Backups — Wuthering Waves Calculator & Optimizer");
    cy.get("[data-test-backup-outside]").should("contain.text", "Last copy saved outside this browser: never");
    cy.get("[data-test-backup-status]").should("have.attr", "data-stale", "true").and("contain.text", "If the phone clears this site's data");
    // no share sheet in this browser: the button is not offered
    cy.get("[data-test-backup-share-now]").should("not.exist");

    rows().should("have.length", 1).first().as("row");
    cy.get("@row").should("have.attr", "data-reason", "daily");
    cy.get("@row").find("[data-test-backup-reason]").should("have.text", "Daily");
    cy.get("@row").find("[data-test-backup-when]").invoke("text").should("match", DAY);
    cy.get("@row")
      .find("[data-test-backup-inside]")
      .invoke("text")
      .then((text) => {
        const plain = text.replace(/\u00a0/g, " ");
        const echoes = JSON.parse(configOptimizer.data.inventory).echoes.length;
        expect(plain).to.match(/^\d+ characters? · /);
        expect(plain).to.contain(`${echoes} echoes`).and.to.contain("1 team").and.to.contain("3 pulls");
        expect(plain).to.match(/\d+ saved builds?/);
      });
    cy.get("@row").find("[data-test-backup-size]").invoke("text").should("match", /KB in this browser · .*KB as a file$/);
    cy.get("@row").find("[data-test-backup-share]").should("not.exist");
    cy.get("[data-test-backups-total]").should("contain.text", "1 backup");
    cy.get("[data-test-backups-kept]").should("contain.text", "newest 7 daily");
    expectNoHorizontalScroll("/backups at 412 px");
    cy.viewport(360, 800);
    expectNoHorizontalScroll("/backups at 360 px");
    // every button of a row is inside the page
    cy.get("@row").find("button").each(($b) => expect($b[0]!.getBoundingClientRect().right, $b.text()).to.be.at.most(360));
    cy.viewport(S26.width, S26.height);

    // the same day, after a reload and well past the automatic check: still one
    cy.reload();
    rows().should("have.length", 1);
    // eslint-disable-next-line cypress/no-unnecessary-waiting -- the automatic check runs 4 s after a load: nothing to wait on when it rightly does nothing
    cy.wait(6000);
    rows().should("have.length", 1);
    // by hand with nothing changed: none either, and it says why
    cy.get("[data-test-backups-now]").click();
    cy.contains(/Nothing has changed since the backup of (Today|Yesterday) /).should("be.visible");
    rows().should("have.length", 1);
  });

  it("downloads a backup as a file Ryan's import reads, without the API key, and remembers that a copy left this browser", () => {
    cy.visit("/backups", seed());
    rows().should("have.length", 1);
    cy.get("[data-test-backup-download]").click();
    cy.contains(/Downloaded wuthering-tools-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json/).should("be.visible");
    saved().should("have.length", 1);
    saved().should((files) => expect(files[0]!.text.length).to.be.greaterThan(1000));
    saved().then((files) => {
      const file = JSON.parse(files[0]!.text);
      expect(files[0]!.name).to.match(/^wuthering-tools-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
      // his export, as his import reads it: the nested format with the three stores as text
      expect(file.meta.source).to.eq("WutheringTools");
      expect(Number(file.meta.version)).to.be.at.least(6);
      expect(Object.keys(file.data).sort()).to.deep.eq(["character", "inventory", "teamRotations"]);
      expect(JSON.parse(file.data.inventory).echoes).to.have.length(JSON.parse(configOptimizer.data.inventory).echoes.length);
      expect(JSON.parse(file.data.teamRotations).teams[0].name).to.eq(TEAM);
      // what plus adds
      expect(file.wtplus.reason).to.eq("daily");
      expect(file.wtplus.keys[PULLS]).to.eq(pulls(THREE));
      expect(file.wtplus.keys[CLEARS]).to.eq(CLEARS_THEN);
      // and never the key
      expect(files[0]!.text).to.not.contain(API_KEY);
      expect(files[0]!.text).to.not.contain("wtplus:ai");
    });
    cy.get("[data-test-backup-outside]").should("contain.text", "Last copy saved outside this browser: today");
    cy.get("[data-test-backup-status]").should("have.attr", "data-stale", "false");
    cy.window().then((win) => expect(JSON.parse(win.localStorage.getItem(STATE)!).outside).to.include({ how: "download", kind: "full" }));

    // the account as it is now, from the status card
    cy.get("[data-test-backup-download-now]").click();
    saved().should("have.length", 2);
    saved().should((files) => expect(JSON.parse(files[1]!.text || "{}").wtplus?.reason).to.eq("manual"));
  });

  it("restores a backup through the confirm: today's account is saved first, the account comes back, pulls are merged", () => {
    cy.visit("/backups", seed());
    rows().should("have.length", 1);

    // since that backup: the weapon went to R5, the team was deleted, a pull was made, the clears log changed
    let rankThen: string | undefined;
    cy.window().then((win) => {
      rankThen = weaponRank(win);
      const store = JSON.parse(win.localStorage.getItem("character")!);
      const cart = store.characters.Cartethyia;
      cart.weapons = { ...(cart.weapons ?? {}), [cart.weapon]: { ...(cart.weapons?.[cart.weapon] ?? {}), refinement: "5" } };
      win.localStorage.setItem("character", JSON.stringify(store));
      win.localStorage.setItem("teamRotations", JSON.stringify({ teams: [], favoriteTeamIds: [], favoritePresetNames: [] }));
      win.localStorage.setItem(PULLS, pulls([...THREE, ["2026-11-15 21:00:00", 21050016, 3, "Variation"]]));
      win.localStorage.setItem(CLEARS, JSON.stringify({ v: 1, clears: [] }));
    });
    cy.reload();
    rows().should("have.length", 1);
    cy.window().then((win) => expect(weaponRank(win)).to.eq("5"));

    cy.get("[data-test-backup-restore]").click();
    confirmBox()
      .should("contain.text", "Restore this backup?")
      .and("contain.text", "This replaces your characters and their saved builds, your echoes and your teams with the backup of ")
      .and("contain.text", "Today's account is saved first as a backup of its own")
      .and("contain.text", "Pull history: merged");
    // the dialog fits the phone: its buttons are on screen
    cy.get(".confirm-dialog .modal-action .btn-warning").then(($b) => expect($b[0]!.getBoundingClientRect().bottom).to.be.at.most(S26.height));
    cy.get(".confirm-dialog .modal-action .btn-warning").click();
    cy.contains(/Restored the backup of (Today|Yesterday) .* Reloading/).should("be.visible");

    // after the reload: today's account was kept first, and the backup's is the account
    rows().should("have.length", 2);
    rows().first().should("have.attr", "data-reason", "before-restore").find("[data-test-backup-reason]").should("have.text", "Before a restore");
    rows().first().find("[data-test-backup-inside]").invoke("text").should("match", /0\u00a0teams/).and("match", /4\u00a0pulls/);
    cy.window().then((win) => {
      expect(weaponRank(win), "the weapon's refinement").to.eq(rankThen);
      expect(JSON.parse(win.localStorage.getItem("teamRotations")!).teams.map((t: { name: string }) => t.name)).to.deep.eq([TEAM]);
      expect(win.localStorage.getItem(CLEARS)).to.eq(CLEARS_THEN);
      // merged, never replaced: the pull made since the backup is still there
      const history = JSON.parse(win.localStorage.getItem(PULLS)!);
      expect(history.players["800000001"].pools["1"]).to.have.length(4);
    });
    // and it is what the other pages show
    cy.visit("/teams", { onLoad: large });
    cy.contains(TEAM).should("be.visible");
    cy.visit("/account", { onLoad: large });
    cy.get("[data-test-account]").should("exist");
    cy.get('[data-test-backup-status][data-variant="account"]', { timeout: 20000 }).should("contain.text", "Last copy saved outside this browser: never");

    // the way back: restoring "Before a restore" gives the account from just before
    cy.visit("/backups", { onLoad: large });
    rows().should("have.length", 2);
    cy.get('[data-test-backup-row][data-reason="before-restore"] [data-test-backup-restore]').click();
    cy.get(".confirm-dialog .modal-action .btn-warning").click();
    cy.contains(/Restored the backup of (Today|Yesterday) /).should("be.visible");
    cy.window().its("localStorage").should((ls) => expect(JSON.parse(ls.getItem("teamRotations")!).teams).to.have.length(0));
    cy.window().then((win) => expect(weaponRank(win)).to.eq("5"));
  });

  it("a Settings import keeps the account it replaces as a 'Before an import' backup, and one of our files brings its plus records", () => {
    cy.visit("/settings?section=backup-restore", seed());
    cy.get('[data-test-backup-status][data-variant="settings"]').should("contain.text", "Last copy saved outside this browser: never");
    const file = {
      meta: configOptimizer.meta,
      data: { character: configOptimizer.data.character, inventory: JSON.stringify({ echoes: [], equipped: {} }), teamRotations: JSON.stringify({ teams: [] }) },
      wtplus: { v: 1, madeAt: 1_763_000_000_000, reason: "daily", keys: { [CLEARS]: JSON.stringify({ v: 1, clears: [{ id: "from-the-file", seconds: 55 }] }), [PULLS]: null } },
    };
    cy.get("[data-test-import-raw-text]").invoke("val", JSON.stringify(file)).trigger("input");
    cy.get("[data-test-import-raw-button]").click();
    cy.contains("Your data has been overwritten!").should("be.visible");
    // his import took his three stores, and the plus part of the file came with them
    cy.window().its("localStorage").should((ls) => {
      expect(JSON.parse(ls.getItem("inventory")!).echoes).to.have.length(0);
      expect(ls.getItem(CLEARS)).to.contain("from-the-file");
      expect(JSON.parse(ls.getItem(PULLS)!).players["800000001"].pools["1"]).to.have.length(3); // the file had none: nothing merged, nothing removed
    });
    cy.visit("/backups", { onLoad: large });
    cy.get('[data-test-backup-row][data-reason="before-import"]', { timeout: 20000 })
      .should("have.length", 1)
      .find("[data-test-backup-inside]")
      .invoke("text")
      .should("match", new RegExp(`${JSON.parse(configOptimizer.data.inventory).echoes.length}\u00a0echoes`))
      .and("match", /1\u00a0team/);
  });

  it("a damaged backup is refused in words, and the account is untouched", () => {
    cy.visit("/backups", seed());
    rows().should("have.length", 1);
    let before = "";
    cy.window().then((win) => (before = win.localStorage.getItem("character")!));
    // the stored bytes are overwritten, as a failing disk would
    cy.window().then(
      (win) =>
        new Cypress.Promise<void>((resolve, reject) => {
          const open = win.indexedDB.open(DB);
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction(["meta", "data"], "readwrite");
            const metas = tx.objectStore("meta").getAllKeys();
            metas.onsuccess = () => {
              for (const id of metas.result) tx.objectStore("data").put(new Uint8Array([31, 139, 8, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), id);
            };
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    cy.get("[data-test-backup-restore]").click();
    cy.contains("That backup is damaged and can't be read, so nothing was changed.").should("be.visible");
    cy.get(".confirm-dialog[open]").should("not.exist");
    cy.get("[data-test-backup-download]").click();
    cy.contains("That backup is damaged").should("be.visible");
    saved().should("have.length", 0);
    cy.window().then((win) => expect(win.localStorage.getItem("character")).to.eq(before));
    rows().should("have.length", 1);
  });

  it("a browser without IndexedDB says backups are unavailable, still gives a copy, and restores a file after saying today is not saved first", () => {
    const noIndexedDb = (win: Window): void => {
      Object.defineProperty(win, "indexedDB", {
        configurable: true,
        get() {
          throw new DOMException("The operation is insecure.", "SecurityError");
        },
      });
    };
    cy.on("window:before:load", noIndexedDb);
    cy.visit("/backups", seed());
    cy.get("[data-test-backups]").should("have.attr", "data-state", "unavailable");
    cy.get("[data-test-backups-unavailable]").should("contain.text", "Backups are unavailable here").and("contain.text", "Your account is not affected");
    cy.get("[data-test-backups-now]").should("not.exist");
    expectNoHorizontalScroll("/backups without IndexedDB");
    // the rest of the app is as it was
    // eslint-disable-next-line cypress/no-unnecessary-waiting -- past the automatic check, which has nothing to show here
    cy.wait(5000);
    cy.get(".alert-error").should("not.exist");
    cy.get("[data-test-backup-download-now]").click();
    saved().should("have.length", 1);
    saved().should((files) => expect(JSON.parse(files[0]!.text || "{}").wtplus?.keys?.[PULLS]).to.eq(pulls(THREE)));

    // a copy from elsewhere, shared as .txt: one echo fewer than today
    const fewer = JSON.parse(configOptimizer.data.inventory);
    fewer.echoes = fewer.echoes.slice(1);
    const copy = { meta: configOptimizer.meta, data: { character: configOptimizer.data.character, inventory: JSON.stringify(fewer), teamRotations: TEAMS }, wtplus: { v: 1, madeAt: 1_763_000_000_000, reason: "manual", keys: {} } };
    cy.get("[data-test-backups-file-input]").selectFile({ contents: Cypress.Buffer.from(JSON.stringify(copy)), fileName: "wuthering-tools-backup-2026-11-12-1402.txt", mimeType: "text/plain" });
    confirmBox().should("contain.text", "NOT saved first").and("contain.text", `${fewer.echoes.length}\u00a0echoes`);
    cy.get(".confirm-dialog .modal-action .btn-warning").click();
    cy.contains(/Restored the backup of/).should("be.visible");
    cy.window().its("localStorage").should((ls) => expect(JSON.parse(ls.getItem("inventory")!).echoes).to.have.length(fewer.echoes.length));
    // the copy is from an older version of the site (data version 6): it came in through Ryan's migrations, so
    // every character has the saved builds version 8 added, and the stored data is on today's version
    cy.window().then((win) => {
      expect(configOptimizer.meta.version).to.eq("6");
      expect(JSON.parse(configOptimizer.data.character).characters.Cartethyia.builds, "the file itself has no builds").to.eq(undefined);
      const restored = JSON.parse(win.localStorage.getItem("character")!).characters.Cartethyia;
      expect(restored.builds, "builds after the restore").to.have.length(1);
      expect(restored.activeBuildId).to.eq(restored.builds[0].id);
      expect(Number(win.localStorage.getItem("dataVersion"))).to.be.at.least(10);
    });

    // a file that is no backup is refused before any question is asked
    cy.get("[data-test-backups-file-input]", { timeout: 20000 }).selectFile({ contents: Cypress.Buffer.from("[1,2,3]"), fileName: "echoes.json", mimeType: "application/json" });
    cy.contains("That is not a backup this page can read, so nothing was changed.").should("be.visible");
    cy.get(".confirm-dialog[open]").should("not.exist");
  });

  it("a browser that is full on the first day says there is no backup here yet, and promises none on its own", () => {
    // every write to IndexedDB refused as a full browser refuses it
    cy.on("window:before:load", (win) => {
      const full = (): never => {
        throw new (win as unknown as { DOMException: typeof DOMException }).DOMException("full", "QuotaExceededError");
      };
      const proto = (win as unknown as { IDBObjectStore: typeof IDBObjectStore }).IDBObjectStore.prototype;
      proto.add = full;
      proto.put = full;
    });
    // the fake throws where a real full browser aborts the transaction: other stores' writes (saved results) see it as
    // a throw, which a real browser never makes, so only that error is let through here
    cy.on("uncaught:exception", (e) => (e.name === "QuotaExceededError" || /QuotaExceededError/.test(String(e.message)) ? false : undefined));
    cy.viewport(360, S26.height);
    cy.visit("/backups", seed());
    cy.get("[data-test-backups-missed]", { timeout: 20000 })
      .should("contain.text", "could not be stored")
      .and("contain.text", "There is no backup here yet, so download or share a copy now.")
      .and("not.contain.text", "are kept");
    cy.get("[data-test-backups-empty]").should("have.text", "No backups yet.");
    expectNoHorizontalScroll("/backups, full browser, 360 px");
  });

  it("offers Share only where the browser shares files, and hands the share sheet the backup as a .txt", () => {
    const withShare = (win: Window): void => {
      const w = win as TestWindow;
      w.__shared = [];
      Object.defineProperty(win.navigator, "canShare", { configurable: true, value: (data: { files?: File[] }) => !!data.files?.length && data.files.every((f) => f.type === "text/plain") });
      Object.defineProperty(win.navigator, "share", {
        configurable: true,
        value: async (data: { files?: File[] }) => {
          for (const f of data.files ?? []) w.__shared!.push({ name: f.name, type: f.type, text: await f.text() });
        },
      });
    };
    cy.on("window:before:load", withShare);
    cy.visit("/backups", seed());
    rows().should("have.length", 1);
    cy.get("[data-test-backup-share]").should("be.visible").click();
    cy.contains("Shared as a .txt file").should("be.visible");
    cy.window().then((win) => {
      const shared = (win as TestWindow).__shared!;
      expect(shared).to.have.length(1);
      expect(shared[0]!.name).to.match(/^wuthering-tools-backup-\d{4}-\d{2}-\d{2}-\d{4}\.txt$/);
      expect(shared[0]!.type).to.eq("text/plain");
      expect(JSON.parse(shared[0]!.text).wtplus.keys[PULLS]).to.eq(pulls(THREE));
      expect(shared[0]!.text).to.not.contain(API_KEY);
      expect(JSON.parse(win.localStorage.getItem(STATE)!).outside).to.include({ how: "share", kind: "full" });
    });
    cy.get("[data-test-backup-outside]").should("contain.text", "today");
    // four buttons to a row at 360 px: all inside the page
    cy.viewport(360, 800);
    expectNoHorizontalScroll("/backups with Share at 360 px");
    rows().first().find("button").should("have.length", 4).each(($b) => expect($b[0]!.getBoundingClientRect().right, $b.text()).to.be.at.most(360));
    cy.get("[data-test-backup-share-now]").should("be.visible");
  });

  it("two connections make one backup for the day, and a deleted one is gone after the confirm", () => {
    cy.visit("/backups", seed());
    rows().should("have.length", 1);
    cy.window().then((win) =>
      cy.wrap(
        (async () => {
          // the app's own store module, twice: two tabs on one database
          const mod = (await win.eval('import("/src/sim/backup/backupStore.ts")')) as StoreModule;
          const a = mod.idbBackupStore(win.indexedDB);
          const b = mod.idbBackupStore(win.indexedDB);
          const meta = { id: "auto-2031-01-01", at: Date.now() - 3 * 86_400_000, reason: "daily", hash: "h", bytes: 3, textLength: 3, enc: "text", counts: { characters: 1, builds: 1, echoes: 1, teams: 0, pulls: 0 }, dataVersion: "10" };
          const made = await Promise.all([a.add({ ...meta }, "one"), b.add({ ...meta }, "two"), a.add({ ...meta }, "three")]);
          return { made, list: (await b.list()).map((m) => m.id) };
        })(),
        { timeout: 20000 },
      ).then((result) => {
        const { made, list } = result as { made: boolean[]; list: string[] };
        expect(made.filter(Boolean), "writes that stored a record").to.have.length(1);
        expect(list.filter((id) => id === "auto-2031-01-01")).to.have.length(1);
      }),
    );
    // this tab is told when it is looked at again
    cy.document().then((doc) => doc.dispatchEvent(new Event("visibilitychange")));
    rows().should("have.length", 2);
    rows().eq(1).find("[data-test-backup-age]").should("have.text", "3 days ago");
    rows().eq(1).find("[data-test-backup-delete]").click();
    confirmBox().should("contain.text", "Delete this backup?").and("contain.text", "Your account is not touched");
    cy.get(".confirm-dialog .modal-action .btn-error").click();
    cy.contains("Backup deleted.").should("be.visible");
    rows().should("have.length", 1).first().should("have.attr", "data-reason", "daily");
  });

  it("deleting several echoes at once keeps the account from just before, as 'Before a bulk delete'", () => {
    cy.visit("/backups", seed());
    rows().should("have.length", 1); // the day's backup is there: the backup code is loaded, and the guard with it
    const total = JSON.parse(configOptimizer.data.inventory).echoes.length;
    const deleteThroughStore = (win: Cypress.AUTWindow, count: number) =>
      cy.wrap(
        (async () => {
          // the running app's own inventory store, the one Ryan's Delete selected and Wavescan Replace call
          const mod = (await win.eval('import("/src/stores/inventory.js")')) as { useInventoryStore: () => { echoes: Array<{ echoId: string }>; deleteEcho: (id: string) => void } };
          const store = mod.useInventoryStore();
          for (const id of store.echoes.slice(0, count).map((e) => e.echoId)) {
            store.deleteEcho(id);
            await new Promise((r) => setTimeout(r, 30));
          }
          return store.echoes.length;
        })(),
        { timeout: 20000 },
      );
    // one echo by hand: no backup for that
    cy.window().then((win) => deleteThroughStore(win, 1).should("eq", total - 1));
    // eslint-disable-next-line cypress/no-unnecessary-waiting -- past the guard's quiet time, which rightly ends in nothing
    cy.wait(2500);
    rows().should("have.length", 1);
    // six at once: the inventory as it was before the first of them is kept
    cy.window().then((win) => deleteThroughStore(win, 6).should("eq", total - 7));
    cy.get('[data-test-backup-row][data-reason="before-delete"]', { timeout: 20000 }).should("have.length", 1).as("kept");
    cy.get("@kept").find("[data-test-backup-reason]").should("have.text", "Before a bulk delete");
    cy.get("@kept").find("[data-test-backup-inside]").invoke("text").should("match", new RegExp(`${total - 1}\u00a0echoes`));
    rows().should("have.length", 2);
  });

  it("Delete your data offers a copy first and takes the backups with the account", () => {
    cy.visit("/backups", seed());
    rows().should("have.length", 1);
    cy.get("[data-test-backup-download]").click();
    cy.get("[data-test-backup-outside]").should("contain.text", "today");

    cy.visit("/settings?section=danger-zone", { onLoad: large });
    cy.get("[data-test-delete-what]").should("contain.text", "the automatic backups included");
    cy.get("[data-test-backup-copy-first-download]").should("be.visible").click();
    saved().should("have.length", 1);
    saved().should((files) => expect(JSON.parse(files[0]!.text || "{}").wtplus?.keys?.[PULLS]).to.eq(pulls(THREE)));
    expectNoHorizontalScroll("Settings › Danger Zone");
    cy.contains("button.btn-error", "Delete").click();
    confirmBox().should("contain.text", "the automatic backups in this browser").and("contain.text", "download a copy first");
    cy.get(".confirm-dialog .modal-action .btn-error").click();
    cy.contains("Your data has been deleted!").should("be.visible");
    cy.window().its("localStorage").should((ls) => expect(ls.getItem(STATE)).to.eq(null));

    // every backup of the deleted account is gone from the database, whatever the page shows
    cy.wrap(null).then(() => storedCounts()).then((counts) => expect(counts.filter((c) => c.echoes > 0 || c.characters > 0 || c.teams > 0), "backups that still hold the account").to.have.length(0));

    cy.visit("/backups", { onLoad: large });
    cy.get("[data-test-backups]").should("have.attr", "data-state", "ready");
    cy.get("[data-test-backup-outside]").should("contain.text", "never");
    // Delete keeps the Convene pull history (its own rule), so that is still worth a backup: the next automatic one
    // holds the pulls and nothing of the account
    rows().should("have.length", 1).first().find("[data-test-backup-inside]").invoke("text").should("match", /^0\u00a0characters · 0\u00a0echoes · 0\u00a0teams · 0\u00a0saved\u00a0builds · 3\u00a0pulls$/);
  });

  it("an empty account takes no backup; the status line counts Ryan's own Download as a copy, and says what it lacks", () => {
    cy.visit("/backups", {
      onBeforeLoad(win) {
        win.localStorage.clear();
        win.localStorage.setItem(SWITCH, "1");
        win.localStorage.setItem("settings", JSON.stringify({ config: { useClassicUi: false, theme: "dark" }, labs: {} }));
      },
      onLoad: large,
    });
    cy.get("[data-test-backups]").should("have.attr", "data-state", "ready");
    // eslint-disable-next-line cypress/no-unnecessary-waiting -- past the automatic check, which rightly takes nothing
    cy.wait(6500);
    cy.get("[data-test-backup-row]").should("not.exist");
    cy.get("[data-test-backups-empty]").should("contain.text", "Nothing to back up yet");
    cy.get("[data-test-backups-now]").should("be.disabled");
    cy.get("[data-test-backup-nothing]").should("be.visible");
    cy.get("[data-test-backup-download-now]").should("not.exist");

    cy.visit("/settings?section=backup-restore", seed());
    cy.get('[data-test-backup-status][data-variant="settings"]').as("card").should("contain.text", "never");
    cy.get("[data-test-settings-export-download]").click();
    cy.get("@card").find("[data-test-backup-outside]").should("contain.text", "today").and("contain.text", "a plain .json from Settings: characters, echoes and teams, no pull history");
    cy.get("@card").find("[data-test-backup-all]").should("have.attr", "href", "/backups");
    expectNoHorizontalScroll("Settings › Backup & Restore with the backups card");
    cy.viewport(360, 800);
    expectNoHorizontalScroll("Settings › Backup & Restore at 360 px");
  });
});
