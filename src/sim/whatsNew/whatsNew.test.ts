// Wuthering Tools+ — "What's new on Tools+": the unseen marker's rules, and the hand-kept list held to its format
// (unique ids, real dates, a link that is a route of this app).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TAG_LABELS, WHATS_NEW, type WhatsNewEntry } from "./entries";
import { WHATS_NEW_PATH, dateLabel, entryLink, groupByDate, linkCharacter, readSeen, seenMarker, unseenIds, unseenText } from "./whatsNew";
import { PLUS_PAGES } from "../shell/plusPages";

const entry = (id: string, date: string): WhatsNewEntry => ({ id, date, title: id, text: "t", where: "w", link: "/account" });
const LIST = [entry("c1", "2026-11-10"), entry("c2", "2026-11-10"), entry("b1", "2026-11-02"), entry("a1", "2026-10-27")];

describe("the unseen marker", () => {
  it("shows nothing in a browser with no account, marker or not", () => {
    expect(unseenIds(LIST, null, false)).toEqual([]);
    expect(unseenIds(LIST, new Set(["a1"]), false)).toEqual([]);
  });

  it("treats only the newest release day as new for an account that never opened the page", () => {
    expect(unseenIds(LIST, null, true)).toEqual(["c1", "c2"]);
    // the newest day wherever the file lists it
    expect(unseenIds([entry("a1", "2026-10-27"), ...LIST.slice(0, 3)], null, true)).toEqual(["c1", "c2"]);
  });

  it("counts every entry the marker does not hold, also one added later under a day already seen", () => {
    const seen = readSeen(seenMarker(LIST));
    expect(unseenIds(LIST, seen, true)).toEqual([]);
    const later = [entry("d1", "2026-11-17"), entry("c3", "2026-11-10"), ...LIST];
    expect(unseenIds(later, seen, true)).toEqual(["d1", "c3"]);
  });

  it("is cleared by opening the page: the marker holds every id listed today and nothing else", () => {
    const seen = readSeen(seenMarker(LIST));
    expect([...(seen ?? [])]).toEqual(["c1", "c2", "b1", "a1"]);
    // an id the list dropped does not live on in the marker
    expect(JSON.parse(seenMarker(LIST.slice(1))).ids).toEqual(["c2", "b1", "a1"]);
  });

  it("reads anything it did not write as no marker", () => {
    for (const raw of [null, undefined, "", "1", "null", "[]", "{", '{"v":2,"ids":["a1"]}', '{"v":1}', '{"v":1,"ids":"a1"}']) expect(readSeen(raw), String(raw)).toBeNull();
    expect([...(readSeen('{"v":1,"ids":["a1",7,null]}') ?? [])]).toEqual(["a1"]);
    expect(readSeen('{"v":1,"ids":[]}')?.size).toBe(0); // opened once when the list was empty: a marker, nothing seen
  });

  it("words the count for one and for many, and does not say 'last visit' before there was one", () => {
    expect(unseenText(1, true)).toBe("1 new thing on Tools+ since your last visit");
    expect(unseenText(3, true)).toBe("3 new things on Tools+ since your last visit");
    expect(unseenText(14, false)).toBe("14 new things on Tools+ in the latest update");
  });
});

describe("the list's shape", () => {
  it("groups by release day, newest first, keeping the file's order inside a day", () => {
    const groups = groupByDate([entry("b1", "2026-11-02"), entry("c1", "2026-11-10"), entry("a1", "2026-10-27"), entry("c2", "2026-11-10")]);
    expect(groups.map((g) => [g.date, g.entries.map((e) => e.id)])).toEqual([
      ["2026-11-10", ["c1", "c2"]],
      ["2026-11-02", ["b1"]],
      ["2026-10-27", ["a1"]],
    ]);
    expect(groups[0].label).toBe("10 November 2026");
  });

  it("writes a date in words without going through a time zone", () => {
    expect(dateLabel("2026-11-02")).toBe("2 November 2026");
    expect(dateLabel("2026-01-31")).toBe("31 January 2026");
    expect(dateLabel("soon")).toBe("soon");
    expect(dateLabel("2026-13-01")).toBe("2026-13-01");
  });

  it("fills {character} from the account, and falls back to the page alone without one", () => {
    expect(entryLink("/account?focus={character}&section=cost", "RoverAero")).toBe("/account?focus=RoverAero&section=cost");
    expect(entryLink("/account?focus={character}&section=cost", null)).toBe("/account");
    expect(entryLink("/echo-lab?tab=farm", null)).toBe("/echo-lab?tab=farm");
    expect(linkCharacter({ A: { weapon: "x" }, B: { weapon: "y" }, C: {} }, "B")).toBe("B");
    expect(linkCharacter({ A: { weapon: "x" }, B: { weapon: "y" }, C: {} }, "C")).toBe("A"); // shown, but not set up
    expect(linkCharacter({ C: {} }, "C")).toBeNull();
    expect(linkCharacter(null, null)).toBeNull();
  });
});

describe("the entries as shipped", () => {
  // every route path main.ts registers, read from its source (main.ts mounts the app, so it cannot be imported here)
  const mainTs = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../main.ts"), "utf8");
  const literal = new Set([...mainTs.matchAll(/\{\s*path:\s*"(\/[^":*]*)"/g)].map((m) => m[1]));
  // routes with a parameter (/kit/:name): a link fills it with one path segment
  const withParams = [...mainTs.matchAll(/\{\s*path:\s*"(\/[^"*]*:[^"*]*)"/g)].map(
    (m) => new RegExp(`^${m[1].replace(/:[A-Za-z]+/g, "[^/]+")}$`),
  );
  const routes = { has: (path: string) => literal.has(path) || withParams.some((re) => re.test(path)) };

  it("has ids that are unique and plain, and dates that are real days, newest block first", () => {
    const ids = WHATS_NEW.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of WHATS_NEW) {
      expect(e.id, e.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(e.date, e.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${e.date}T00:00:00Z`).toISOString().slice(0, 10), e.id).toBe(e.date);
    }
    const dates = WHATS_NEW.map((e) => e.date);
    expect(dates, "the file lists newer entries above older ones").toEqual([...dates].sort().reverse());
  });

  it("gives every entry a title, a sentence, where to find it and a tag the page can label", () => {
    for (const e of WHATS_NEW) {
      expect(e.title.trim().length, e.id).toBeGreaterThan(3);
      expect(e.text.trim().length, e.id).toBeGreaterThan(30);
      expect(e.text.trim().endsWith("."), `${e.id}: the text is a sentence`).toBe(true);
      expect(e.where.trim().length, e.id).toBeGreaterThan(3);
      if (e.tag) expect(TAG_LABELS[e.tag], e.id).toBeTruthy();
    }
  });

  it("links every entry to a route this app has", () => {
    expect(routes.has("/account")).toBe(true); // the reader found main.ts's routes
    expect(routes.has(WHATS_NEW_PATH)).toBe(true);
    expect(routes.has("/kit/Lily"), "a route with a parameter").toBe(true);
    expect(routes.has("/kit/Lily/extra"), "a parameter is one segment").toBe(false);
    for (const e of WHATS_NEW) {
      expect(e.link.startsWith("/"), e.id).toBe(true);
      const path = entryLink(e.link, "Someone").split(/[?#]/)[0];
      expect(routes.has(path), `${e.id} → ${path} is not a route in main.ts`).toBe(true);
      expect(routes.has(entryLink(e.link, null).split(/[?#]/)[0]), `${e.id} with no account`).toBe(true);
    }
  });

  it("is itself a plus page in the menu and the palette", () => {
    expect(PLUS_PAGES.some((p) => p.path === WHATS_NEW_PATH)).toBe(true);
  });
});
