// /account's "What moved in your numbers" card: the best saved team's line across the log, its change in words, and
// the link that opens that team's chart on What's new › Your numbers. Synthetic log (testAccount.ts).
import { beforeEach, describe, expect, it } from "vitest";
import { mount, RouterLinkStub } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { useCharacterStore } from "../../stores/character";
import { entryFromRanking } from "./entry";
import { encodeLog, NUMBERS_LOG_KEY, type LogEntry } from "./log";
import { logVersion } from "./logStore";
import NumbersMovedCard from "./NumbersMovedCard.vue";
import { DAY, T0, account, ranking } from "./testAccount";

const entry = (over: Parameters<typeof ranking>[0], at: number): LogEntry => entryFromRanking(ranking(over), account(), { at, build: "b", autoTeamBuffs: true }) as LogEntry;

function card(entries: LogEntry[]) {
  localStorage.setItem(NUMBERS_LOG_KEY, encodeLog({ entries, seen: null }));
  logVersion.value += 1;
  return mount(NumbersMovedCard, { global: { stubs: { RouterLink: RouterLinkStub, CharacterAvatar: true, WhyNumberButton: true } } });
}

describe("/account's numbers card: the best team over time", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useCharacterStore().characters = { Aaa: { weapon: "SwordOne" } } as never;
  });

  it("draws the best saved team's line with its change in words, and links to its opened chart", () => {
    const w = card([entry({ mine: 2_000_000 }, T0), entry({ mine: 2_100_000 }, T0 + DAY), entry({ mine: 2_300_000 }, T0 + 2 * DAY)]);
    const link = w.find("[data-test-numbers-card-trend]");
    expect(link.exists()).toBe(true);
    expect(w.findComponent(RouterLinkStub).exists()).toBe(true);
    const to = w.findAllComponents(RouterLinkStub).map((l) => l.props("to")).find((t) => typeof t === "object" && (t as { query?: { trend?: string } }).query?.trend);
    expect(to).toEqual({ path: "/whats-new", query: { tab: "numbers", trend: "t:t-mine" } });
    expect(w.find("[data-test-numbers-card-trend-change]").text()).toContain("2.30M team damage per rotation, up 15.0 % of the first figure, +300,000 damage since");
    expect(w.find("[data-test-trend-spark]").findAll("polyline")).toHaveLength(1);
  });

  it("draws no line from a single record", () => {
    const w = card([entry({}, T0)]);
    expect(w.find("[data-test-numbers-card-first]").exists()).toBe(true);
    expect(w.find("[data-test-numbers-card-trend]").exists()).toBe(false);
  });
});
