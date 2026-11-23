import { describe, expect, it } from "vitest";
import { isGeneratedTeamName } from "../rankings/importFromRankings";
import { WUWA_CALC_COMMIT } from "../engine/engineCommit";
import { rankingsMineHash } from "../account/accountState";
import {
  SYNC_HASH,
  takeSyncRequest,
  ENGINE_UPDATES,
  SYNC_NOTICE_KEY,
  behindTeams,
  isWuwaCalcTeam,
  markHandled,
  noticeHeadline,
  readHandled,
  showSyncNotice,
} from "./syncNotice";

const NOW = Date.parse("2026-11-23T20:00:00Z");
const gen = (id: string, stamp?: string | null) => ({ id, name: `Aemeath · Chisa + Denia · S0R1 (wuwa_calc)`, ...(stamp !== undefined ? { wuwaCalcCommit: stamp } : {}) });

const memory = (): Pick<Storage, "getItem" | "setItem"> & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

describe("behindTeams", () => {
  it("a team stamped with today's engine is current", () => {
    const b = behindTeams([gen("a", "821f8db")], "821f8db");
    expect(b.teams).toEqual([]);
    expect(b.generated).toBe(1);
  });

  it("a team stamped with an older engine is behind", () => {
    expect(behindTeams([gen("a", "e95d4e6")], "821f8db").teams.map((t) => t.id)).toEqual(["a"]);
  });

  it("an unstamped generated team (saved before stamps) is behind", () => {
    expect(behindTeams([gen("a"), gen("b", null)], "821f8db").teams.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("a team the player named, or renamed away from a generated name, is never listed", () => {
    const b = behindTeams([{ id: "a", name: "My Aemeath team" }, { id: "b", name: "Aemeath · Chisa + Denia (mine now)", wuwaCalcCommit: "e95d4e6" }], "821f8db");
    expect(b.teams).toEqual([]);
    expect(b.generated).toBe(0);
  });

  it("every generated name form counts: an import, the older 'wuwa_calc …', a stock team 't307'", () => {
    const names = ["Aemeath · Chisa + Denia · S6R5 (wuwa_calc)", "wuwa_calc Aemeath Chisa Denia", "Aemeath · Chisa + Denia (wuwa_calc t307)"];
    expect(behindTeams(names.map((name, i) => ({ id: String(i), name })), "821f8db").teams).toHaveLength(3);
  });

  it("no teams, or no store yet: nothing behind", () => {
    expect(behindTeams([], "821f8db").teams).toEqual([]);
    expect(behindTeams(null, "821f8db").teams).toEqual([]);
    expect(showSyncNotice(behindTeams(undefined, "821f8db"), null)).toBe(false);
  });

  it("a starred stock team is not a saved team: starring writes only its name to favoritePresetNames, so the teams list has nothing to count", () => {
    const store = { teams: [{ id: "own", name: "Team 1" }], favoritePresetNames: ["Aemeath · Chisa + Denia · S6R5 (wuwa_calc)"] };
    expect(showSyncNotice(behindTeams(store.teams, "821f8db"), null)).toBe(false);
  });

  it("knows the date of today's engine", () => {
    expect(ENGINE_UPDATES[WUWA_CALC_COMMIT]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(behindTeams([], WUWA_CALC_COMMIT).updatedOn).toBe(ENGINE_UPDATES[WUWA_CALC_COMMIT]);
  });
});

describe("isWuwaCalcTeam", () => {
  it("answers as importFromRankings' isGeneratedTeamName, which Sync my teams goes by", () => {
    const names = [
      "Aemeath · Chisa + Denia · S6R5 (wuwa_calc)",
      "Aemeath · Chisa + Denia · S6R5 (wuwa_calc)  ",
      "wuwa_calc Aemeath",
      "Aemeath (wuwa_calc t12)",
      "Aemeath (wuwa_calc) mine",
      "my wuwa_calc team",
      "Team 1",
      "",
    ];
    for (const name of names) expect(isWuwaCalcTeam({ name }), name).toBe(isGeneratedTeamName(name));
  });
});

describe("the notice", () => {
  it("shows while a team is behind and it was not handled at this engine", () => {
    const b = behindTeams([gen("a")], "821f8db");
    expect(showSyncNotice(b, null)).toBe(true);
    expect(showSyncNotice(b, "e95d4e6")).toBe(true); // closed at the engine before: shows again
    expect(showSyncNotice(b, "821f8db")).toBe(false);
  });

  it("says how many, since when", () => {
    const three = behindTeams([gen("a"), gen("b"), gen("c")], "821f8db");
    expect(noticeHeadline(three, NOW)).toBe("All 3 of your saved teams from Team rankings were read before its update of 22\u00a0November.");
    const some = behindTeams([gen("a"), gen("b"), gen("c", "821f8db")], "821f8db");
    expect(noticeHeadline(some, NOW)).toBe("2 of your saved teams from Team rankings were read before its update of 22\u00a0November.");
    expect(noticeHeadline(behindTeams([gen("a")], "821f8db"), NOW)).toBe("Your saved team from Team rankings was read before its update of 22\u00a0November.");
    expect(noticeHeadline(behindTeams([gen("a"), gen("b")], "821f8db"), NOW)).toBe("Both of your saved teams from Team rankings were read before its update of 22\u00a0November.");
    expect(noticeHeadline(behindTeams([gen("a")], "0000000"), NOW)).toBe("Your saved team from Team rankings was read before its latest update.");
    expect(noticeHeadline(three, Date.parse("2027-02-01T00:00:00Z"))).toContain("22\u00a0November 2026");
  });

  it("remembers the engine it was handled at; a refusing or missing storage never throws", () => {
    const s = memory();
    expect(readHandled(s)).toBeNull();
    markHandled("821f8db", s);
    expect(s.data.get(SYNC_NOTICE_KEY)).toBe("821f8db");
    expect(readHandled(s)).toBe("821f8db");
    const refusing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); } };
    expect(() => markHandled("821f8db", refusing)).not.toThrow();
    expect(readHandled(refusing)).toBeNull();
    expect(readHandled(null)).toBeNull();
  });
});

describe("the way to Sync my teams", () => {
  it("is /rankings at the account's own state, as /account links it", () => {
    expect(SYNC_HASH).toBe(rankingsMineHash());
  });

  it("is asked once: the request comes off the address, other query keys stay", () => {
    expect(takeSyncRequest({ sync: "1", x: "y" })).toEqual({ x: "y" });
    expect(takeSyncRequest({ x: "y" })).toBeNull();
    expect(takeSyncRequest({ sync: "0" })).toBeNull();
    expect(takeSyncRequest({})).toBeNull();
  });
});
