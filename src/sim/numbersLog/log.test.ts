// Wuthering Tools+ numbers log — the log itself: what an entry holds, what "the same record" is, the caps, the stored
// form and what a damaged one reads as. Synthetic account (testAccount.ts).
import { describe, expect, it } from "vitest";
import { entryFromRanking } from "./entry";
import { MAX_BYTES, MAX_ENTRIES, appendEntry, decodeLog, emptyLog, encodeLog, halved, recordKey, sameRecord, type LastSeen, type LogEntry, type NumbersLog } from "./log";
import { DAY, T0, account, charRank, ranking, teamRank } from "./testAccount";

const meta = (at = T0, build = "0.0.1+abc+dev", autoTeamBuffs = true) => ({ at, build, autoTeamBuffs });
const entry = (over: Parameters<typeof ranking>[0] = {}, at = T0, build = "0.0.1+abc+dev"): LogEntry => entryFromRanking(ranking(over), account(), meta(at, build)) as LogEntry;
const seen = (at = T0): LastSeen => ({ fp: "v6:x:1:ia", build: "0.0.1+abc+dev", at });

describe("an entry", () => {
  it("holds each character's best rotation, its damage and the build's signature, and each fieldable team", () => {
    const e = entry();
    expect(e.at).toBe(T0);
    expect(e.build).toBe("0.0.1+abc+dev");
    expect(e.autoTeamBuffs).toBe(true);
    expect(e.characters.map((c) => [c.id, c.rotation, c.damage])).toEqual([
      ["Aaa", "Aaa loop", 1_000_000],
      ["Bbb", "Bbb loop", 400_000],
      ["Ccc", "Ccc loop", 120_000],
    ]);
    expect(e.characters[0].sig).toMatchObject({ weapon: "SwordOne", refinement: 1, sequence: 2 });
    expect(e.teams.map((t) => [t.id, t.name, t.source, t.damage, t.members])).toEqual([
      ["t-mine", "My trio", "yours", 2_000_000, ["Aaa", "Bbb", "Ccc"]],
      ["wuwa_calc:Aaa hypercarry", "Aaa hypercarry", "wuwa_calc", 2_400_000, ["Aaa", "Bbb", "Ccc"]],
    ]);
    expect(e.teams[0].def).toMatch(/^[0-9a-z]{8}$/); // his own team carries a hash of the team as defined
    expect(e.teams[1].def).toBe(""); // a stock team only changes with the app
  });

  it("is never made from a ranking that did not fully score", () => {
    expect(entryFromRanking(ranking({}, { incomplete: true }), account(), meta())).toBeNull();
    expect(entryFromRanking(null as never, account(), meta())).toBeNull();
    expect(entryFromRanking({ ...ranking(), teams: undefined } as never, account(), meta())).toBeNull();
  });

  it("leaves out a team with an unarmed member, and keeps a character no rotation scored for at 0", () => {
    const r = ranking();
    r.teams.push(teamRank("wuwa_calc:with a bare member", 900_000, ["Aaa", "Bbb", "Ddd"], { unarmed: ["Ddd"] }));
    r.characters.push(charRank("Eee", 0, null));
    const e = entryFromRanking(r, account(), meta()) as LogEntry;
    expect(e.teams.map((t) => t.id)).not.toContain("wuwa_calc:with a bare member");
    expect(e.characters.find((c) => c.id === "Eee")).toMatchObject({ rotation: null, damage: 0 });
  });

  it("rounds a figure to the unit, so float dust is not a move", () => {
    const a = entry({ Aaa: 1_000_000.2 });
    const b = entry({ Aaa: 1_000_000.4 }, T0 + DAY);
    expect(a.characters[0].damage).toBe(1_000_000);
    expect(sameRecord(a, b)).toBe(true);
  });
});

describe("the same record", () => {
  it("is everything but the time: figures, rotations, signatures, the build, the buffs switch", () => {
    expect(sameRecord(entry(), entry({}, T0 + DAY))).toBe(true);
    expect(sameRecord(entry(), entry({ Aaa: 1_000_001 }))).toBe(false);
    expect(sameRecord(entry(), entry({ stock: 2_400_001 }))).toBe(false);
    expect(sameRecord(entry(), entry({}, T0, "0.0.1+abc+ffff00001111"))).toBe(false); // an update that moved nothing is still a record
    expect(sameRecord(entry(), entryFromRanking(ranking(), account(), meta(T0, "0.0.1+abc+dev", false)) as LogEntry)).toBe(false);
    const edited = account();
    edited.characters.Aaa.buffs.OwnBuff.isEnabled = false;
    expect(sameRecord(entry(), entryFromRanking(ranking(), edited, meta()) as LogEntry)).toBe(false); // same damage, another build
    const renamed = account();
    renamed.teams[0].name = "Another name";
    const r = ranking();
    r.teams[0].name = "Another name";
    expect(sameRecord(entry(), entryFromRanking(r, renamed, meta()) as LogEntry)).toBe(true); // a renamed team is no new record
    const reordered = entry();
    reordered.characters.reverse();
    reordered.teams.reverse();
    expect(recordKey(reordered)).toBe(recordKey(entry())); // the ranking's order is not part of it
  });
});

describe("appending", () => {
  it("does not store an entry equal to the last one, and still notes that a ranking was seen", () => {
    const first = appendEntry(emptyLog(), entry(), seen(T0));
    expect(first.stored).toBe(true);
    const again = appendEntry(first.log, entry({}, T0 + DAY), seen(T0 + DAY));
    expect(again.stored).toBe(false);
    expect(again.log.entries).toHaveLength(1);
    expect(again.log.entries[0].at).toBe(T0); // the record keeps its own time
    expect(again.log.seen?.at).toBe(T0 + DAY);
  });

  it("stores one that differs, and one equal to an older entry but not to the last", () => {
    let log = appendEntry(emptyLog(), entry(), seen()).log;
    log = appendEntry(log, entry({ Aaa: 1_100_000 }, T0 + 1), seen()).log;
    const back = appendEntry(log, entry({}, T0 + 2), seen()); // he undid the change: that is a move back, a third record
    expect(back.stored).toBe(true);
    expect(back.log.entries.map((e) => e.characters[0].damage)).toEqual([1_000_000, 1_100_000, 1_000_000]);
  });

  it(`keeps the last ${MAX_ENTRIES} entries`, () => {
    let log: NumbersLog = emptyLog();
    for (let i = 0; i < MAX_ENTRIES + 5; i++) log = appendEntry(log, entry({ Aaa: 1_000_000 + i }, T0 + i), seen(T0 + i)).log;
    expect(log.entries).toHaveLength(MAX_ENTRIES);
    expect(log.entries[0].characters[0].damage).toBe(1_000_005);
    expect(log.entries[MAX_ENTRIES - 1].characters[0].damage).toBe(1_000_000 + MAX_ENTRIES + 4);
    expect(encodeLog(log).length).toBeLessThan(MAX_BYTES);
  });

  it("stays under its byte budget by dropping the oldest, and refuses an entry bigger than the budget", () => {
    const one = encodeLog(appendEntry(emptyLog(), entry(), seen()).log).length;
    const budget = Math.round(one * 2.5); // room for three entries of the interned form, not four
    let log: NumbersLog = emptyLog();
    for (let i = 0; i < 6; i++) log = appendEntry(log, entry({ Aaa: 1_000_000 + i }, T0 + i), seen(T0 + i), { maxBytes: budget }).log;
    expect(encodeLog(log).length).toBeLessThanOrEqual(budget);
    expect(log.entries.length).toBeGreaterThan(1);
    expect(log.entries.length).toBeLessThan(6);
    expect(log.entries[log.entries.length - 1].characters[0].damage).toBe(1_000_005); // the newest is the one kept
    const tooBig = appendEntry(log, entry({ Aaa: 7 }, T0 + 9), seen(T0 + 9), { maxBytes: 50 });
    expect(tooBig.stored).toBe(false);
    expect(tooBig.log.entries).toEqual(log.entries);
  });

  it("halves by dropping the older half, never the newest", () => {
    let log: NumbersLog = emptyLog();
    for (let i = 0; i < 5; i++) log = appendEntry(log, entry({ Aaa: 1_000_000 + i }, T0 + i), seen()).log;
    expect(halved(log).entries.map((e) => e.characters[0].damage)).toEqual([1_000_002, 1_000_003, 1_000_004]);
    expect(halved({ entries: log.entries.slice(0, 1), seen: null }).entries).toHaveLength(1);
  });
});

describe("the stored form", () => {
  const filled = (): NumbersLog => {
    let log: NumbersLog = emptyLog();
    for (let i = 0; i < 4; i++) log = appendEntry(log, entry({ Aaa: 1_000_000 + i * 1000, mine: 2_000_000 + i }, T0 + i * DAY), seen(T0 + i * DAY)).log;
    log.entries[2].importedAt = T0 + DAY + 5;
    return log;
  };

  it("reads back exactly what was written", () => {
    const log = filled();
    expect(decodeLog(encodeLog(log))).toEqual(log);
    expect(decodeLog(encodeLog(emptyLog()))).toEqual(emptyLog());
  });

  it("writes each name once, so a second entry costs far less than the first", () => {
    const one = encodeLog({ entries: filled().entries.slice(0, 1), seen: null }).length;
    const four = encodeLog({ entries: filled().entries, seen: null }).length;
    expect((four - one) / 3).toBeLessThan(one * 0.6);
    const table = (JSON.parse(encodeLog(filled())) as { s: string[] }).s;
    expect(new Set(table).size).toBe(table.length);
    expect(table.filter((s) => s === "Aaa loop")).toHaveLength(1);
  });

  it("reads anything it did not write as an empty log, without throwing", () => {
    for (const raw of [null, undefined, "", "nope", "null", "[]", "{}", '{"v":2,"s":[],"e":[]}', '{"v":1,"s":"x","e":[]}', '{"v":1,"s":[1],"e":[]}', '{"v":1,"s":[]}']) expect(decodeLog(raw), String(raw)).toEqual(emptyLog());
  });

  it("drops an entry with a hole in it and keeps the others", () => {
    const stored = JSON.parse(encodeLog(filled())) as { e: Array<{ c: number[][]; m: number[][]; t: unknown }> };
    stored.e[1].c[0][0] = 9999; // a name the table does not have
    stored.e[3].t = "yesterday";
    const back = decodeLog(JSON.stringify(stored));
    expect(back.entries.map((e) => e.at)).toEqual([T0, T0 + 2 * DAY]);
    stored.e[0].m[0] = [0, 1, 7, 5, 2, 3]; // a source that does not exist
    expect(decodeLog(JSON.stringify(stored)).entries.map((e) => e.at)).toEqual([T0 + 2 * DAY]);
  });

  it("reads the entries oldest first whatever order they were stored in", () => {
    const stored = JSON.parse(encodeLog(filled())) as { e: unknown[] };
    stored.e.reverse();
    expect(decodeLog(JSON.stringify(stored)).entries.map((e) => e.at)).toEqual([T0, T0 + DAY, T0 + 2 * DAY, T0 + 3 * DAY]);
  });
});
