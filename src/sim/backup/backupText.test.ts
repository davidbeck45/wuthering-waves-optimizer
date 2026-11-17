// The words on the Backups page: times, ages, sizes and the confirms say what the code does.
import { describe, expect, it, vi } from "vitest";
import { STORAGE_RULES } from "../storage/deleteAccount";
import { daysAgoText, outsideIsStale, outsideText, readOutside, noteCopyLeft, canShareFiles, shareBackupText, downloadBackupText, shareFileOf, BACKUP_STATE_KEY, WHY_OUTSIDE_SHORT, WHY_OUTSIDE_TEXT, missedText, noteAutomatic, readMissed } from "./outside";
import { ageText, deleteConfirm, HOW_KEPT_TEXT, notTakenText, REASON_TEXT, restoreConfirm, sizesText, sizeText, WHAT_IS_INSIDE_TEXT, WHAT_IS_LEFT_OUT_TEXT, whenText } from "./backupText";
import { KEEP_DAILY, KEEP_OTHERS, KEEP_WEEKLY } from "./retention";

const NOW = new Date(2026, 10, 16, 15, 30).getTime();
const at = (d: number, h: number, m = 0): number => new Date(2026, 10, d, h, m).getTime();
const counts = { characters: 12, builds: 14, echoes: 251, teams: 9, pulls: 480 };

describe("when and how old", () => {
  it("today, yesterday, then the date", () => {
    expect(whenText(at(16, 14, 2), NOW, "en-GB")).toBe("Today 14:02");
    expect(whenText(at(15, 21, 15), NOW, "en-GB")).toBe("Yesterday 21:15");
    expect(whenText(at(12, 9, 5), NOW, "en-GB")).toBe("12 Nov, 09:05");
    expect(whenText(new Date(2025, 11, 31, 9, 5).getTime(), NOW, "en-GB")).toBe("31 Dec 2025, 09:05");
    expect(whenText(at(16, 14, 2), NOW, "en-US")).toBe("Today 02:02\u00a0PM"); // the clock time never wraps
  });

  it("minutes, hours, then whole calendar days: 23:50 last night is yesterday, not 15 hours ago", () => {
    expect(ageText(NOW - 20_000, NOW)).toBe("just now");
    expect(ageText(NOW - 60_000, NOW)).toBe("1 minute ago");
    expect(ageText(NOW - 12 * 60_000, NOW)).toBe("12 minutes ago");
    expect(ageText(at(16, 12, 30), NOW)).toBe("3 hours ago");
    expect(ageText(at(15, 23, 50), NOW)).toBe("yesterday");
    expect(ageText(at(11, 15, 30), NOW)).toBe("5 days ago");
    expect(ageText(NOW + 5000, NOW)).toBe("just now"); // a clock that moved back
  });

  it("sizes keep their unit on the same line and say which size is which", () => {
    expect(sizeText(41_300)).toBe("40\u00a0KB");
    expect(sizeText(3_400_000)).toBe("3.2\u00a0MB");
    expect(sizeText(512)).toBe("512\u00a0bytes");
    expect(sizesText({ bytes: 41_300, textLength: 338_000 })).toBe("40\u00a0KB in this browser · 330\u00a0KB as a file");
  });
});

describe("the confirms say what will happen", () => {
  it("Restore: what is replaced, with which backup, and that today's account is saved first", () => {
    const c = restoreConfirm(at(12, 14, 2), counts, { keeps: true, plus: true, nowMs: NOW });
    expect(c.title).toBe("Restore this backup?");
    expect(c.message).toMatch(/replaces your characters and their saved builds, your echoes and your teams with the backup of /);
    expect(c.message.replace(/\u00a0/g, " ")).toContain("12 characters · 251 echoes · 9 teams · 14 saved builds · 480 pulls");
    expect(c.message).toMatch(/Today's account is saved first as a backup of its own \("Before a restore"\)/);
    expect(c.items).toEqual(["Pull history: merged. Pulls are added, none are removed.", "Logged Tower clears and Echo plan: back to that backup's."]);
    expect(c.confirmLabel).toBe("Restore");
  });

  it("Restore where the browser keeps no backups says so instead of promising one", () => {
    const c = restoreConfirm(null, counts, { keeps: false, plus: false, nowMs: NOW });
    expect(c.message).toContain("this backup file");
    expect(c.message).toMatch(/NOT saved first: download a copy before you go on/);
    expect(c.message).not.toMatch(/is saved first as a backup/);
    expect(c.items).toEqual(["A plain export: your pull history, logged Tower clears and Echo plan stay as they are."]);
  });

  it("the Restore list is two short lines at most: the dialog's list box scrolls past 12 rem", () => {
    for (const plus of [true, false]) {
      const c = restoreConfirm(NOW, counts, { keeps: true, plus, nowMs: NOW });
      expect(c.items.length).toBeLessThanOrEqual(2);
      for (const item of c.items) expect(item.length, item).toBeLessThan(90);
    }
  });

  it("Delete names the backup and says the account is not touched", () => {
    const c = deleteConfirm({ at: at(12, 14, 2), reason: "before-import" }, NOW);
    expect(c.message).toMatch(/^The backup of .* \(before an import\) is removed from this browser\. It cannot be undone\. Your account is not touched\.$/);
  });

  it("a backup that was not taken says why", () => {
    expect(notTakenText("empty", undefined, NOW)).toMatch(/nothing to back up yet/);
    expect(notTakenText("unchanged", { at: at(16, 14, 2) }, NOW)).toMatch(/Nothing has changed since the backup of Today/);
    expect(notTakenText("unavailable", undefined, NOW)).toMatch(/isn't keeping backups/);
    expect(notTakenText("full", undefined, NOW)).toMatch(/no room for another backup\. The ones it has are kept/);
    expect(notTakenText("failed", undefined, NOW)).toMatch(/could not be made/);
  });

  it("the page's 'what is inside' says what the rules do, and the numbers it gives are the code's", () => {
    for (const word of ["characters", "saved build", "echoes", "teams", "pull history", "Tower clears", "Echo plan"]) expect(WHAT_IS_INSIDE_TEXT).toContain(word);
    for (const word of ["settings", "Build history", "Undo", "API key"]) expect(WHAT_IS_LEFT_OUT_TEXT).toContain(word);
    expect(WHAT_IS_LEFT_OUT_TEXT).toMatch(/API key, which never goes into a backup or a file/);
    // each thing the sentence names as inside is a rule that says so, and each thing named as left out says that
    const backupOf = (key: string): string | undefined => STORAGE_RULES.find((r) => r.key === key)?.backup;
    for (const key of ["wtplus:convene:history", "wtplus:endgame:clears", "wtplus:echoPlan:v1"]) expect(backupOf(key), key).toBe("account");
    for (const key of ["settings", "wtplus:buildHistory:v1:", "wtplus:buildTeam:undo:v1", "wtplus-results"]) expect(["export", "account"], key).not.toContain(backupOf(key));
    expect(backupOf("wtplus:ai:key")).toBe("secret");
    expect(HOW_KEPT_TEXT).toContain(`newest ${KEEP_DAILY} daily`);
    expect(HOW_KEPT_TEXT).toContain(`${KEEP_WEEKLY} weeks`);
    expect(HOW_KEPT_TEXT).toContain(`newest ${KEEP_OTHERS} made`);
    expect(Object.keys(REASON_TEXT).sort()).toEqual(["before-delete", "before-import", "before-restore", "daily", "manual"]);
  });
});

describe("a copy outside this browser", () => {
  const area = () => {
    const data = new Map<string, string>();
    return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  };

  it("never, today, yesterday, 34 days ago; a plain export says what it lacks", () => {
    expect(outsideText(null, NOW)).toBe("Last copy saved outside this browser: never");
    expect(outsideText({ at: NOW - 3600_000, how: "share", kind: "full" }, NOW)).toBe("Last copy saved outside this browser: today");
    expect(outsideText({ at: at(15, 23, 59), how: "download", kind: "full" }, NOW)).toBe("Last copy saved outside this browser: yesterday");
    expect(daysAgoText(new Date(2026, 9, 13, 10).getTime(), NOW)).toBe("34 days ago");
    expect(outsideText({ at: NOW, how: "download", kind: "plain" }, NOW)).toMatch(/today \(a plain \.json from Settings: characters, echoes and teams, no pull history\)$/);
  });

  it("one sentence says why it matters, on the page and in short on My account", () => {
    for (const text of [WHY_OUTSIDE_TEXT, WHY_OUTSIDE_SHORT]) expect(text).toMatch(/if the phone clears this site's data/i);
    expect(WHY_OUTSIDE_SHORT.length).toBeLessThan(90);
  });

  it("is marked after a month, or when there never was one", () => {
    expect(outsideIsStale(null, NOW)).toBe(true);
    expect(outsideIsStale({ at: NOW - 29 * 86_400_000, how: "share", kind: "full" }, NOW)).toBe(false);
    expect(outsideIsStale({ at: NOW - 31 * 86_400_000, how: "share", kind: "full" }, NOW)).toBe(true);
  });

  it("is remembered when a copy leaves, read back, and anything else stored there reads as never", () => {
    const store = area();
    expect(readOutside(store)).toBeNull();
    noteCopyLeft("share", "full", NOW, store);
    expect(readOutside(store)).toEqual({ at: NOW, how: "share", kind: "full" });
    noteCopyLeft("download", "plain", NOW + 5, store);
    expect(readOutside(store)).toEqual({ at: NOW + 5, how: "download", kind: "plain" });
    for (const junk of ["{broken", "null", JSON.stringify({ v: 2, outside: { at: 5 } }), JSON.stringify({ v: 1, outside: { at: "soon" } })]) {
      store.data.set(BACKUP_STATE_KEY, junk);
      expect(readOutside(store), junk).toBeNull();
    }
    // a storage that refuses: nothing thrown, the line stays as it was
    const refusing = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    };
    expect(() => noteCopyLeft("share", "full", NOW, refusing)).not.toThrow();
    expect(() => noteAutomatic({ saved: false, why: "full" }, NOW, refusing)).not.toThrow();
  });

  it("an automatic backup that could not be stored is remembered until one is stored, beside the copy line and not instead of it", () => {
    const store = area();
    noteCopyLeft("share", "full", NOW - 5, store);
    expect(readMissed(store)).toBeNull();
    noteAutomatic({ saved: false, why: "full" }, NOW, store);
    expect(readMissed(store)).toEqual({ at: NOW, why: "full" });
    expect(readOutside(store)).toEqual({ at: NOW - 5, how: "share", kind: "full" });
    // a day on which none was due says nothing about room: the note stays
    for (const why of ["unchanged", "today", "empty", "unavailable"]) noteAutomatic({ saved: false, why }, NOW + 1, store);
    expect(readMissed(store)).toEqual({ at: NOW, why: "full" });
    noteAutomatic({ saved: false, why: "failed" }, NOW + 2, store);
    expect(readMissed(store)).toEqual({ at: NOW + 2, why: "failed" });
    // a copy leaving the browser does not clear it; a stored backup does
    noteCopyLeft("download", "full", NOW + 3, store);
    expect(readMissed(store)?.why).toBe("failed");
    noteAutomatic({ saved: true }, NOW + 4, store);
    expect(readMissed(store)).toBeNull();
    expect(readOutside(store)?.at).toBe(NOW + 3);
  });

  it("an ordinary day writes nothing: a stored backup with no miss on record leaves the state alone", () => {
    const store = area();
    const setItem = vi.fn(store.setItem);
    noteAutomatic({ saved: true }, NOW, { getItem: store.getItem, setItem });
    noteAutomatic({ saved: false, why: "unchanged" }, NOW, { getItem: store.getItem, setItem });
    expect(setItem).not.toHaveBeenCalled();
  });

  it("the note says the backups it has are kept, and what to do instead", () => {
    expect(missedText({ at: NOW, why: "full" }, "Today 09:00")).toBe("The automatic backup of Today 09:00 could not be stored: this browser has no room left. The backups it has are kept. Download or share a copy instead.");
    expect(missedText({ at: NOW, why: "failed" }, "Today 09:00")).toMatch(/could not be stored\. The backups this browser has are kept/);
  });

  it("Download saves a .json under the backup's own day and time, and counts as a copy outside", () => {
    const saved: Array<[string, string]> = [];
    const taken = at(12, 14, 2);
    const name = downloadBackupText("{\"a\":1}", taken, (content, filename) => void saved.push([content, filename]));
    expect(name).toBe("wuthering-tools-backup-2026-11-12-1402.json");
    expect(saved).toEqual([["{\"a\":1}", name]]);
  });

  it("Share is offered only where the browser says it shares files, asked with a text file like the one it would send", () => {
    expect(canShareFiles(null)).toBe(false);
    expect(canShareFiles({})).toBe(false);
    expect(canShareFiles({ share: async () => undefined })).toBe(false);
    const asked: File[] = [];
    const yes = { share: async () => undefined, canShare: (d: { files?: File[] }) => (asked.push(...(d.files ?? [])), true) };
    expect(canShareFiles(yes)).toBe(true);
    expect(asked[0]!.name).toMatch(/\.txt$/);
    expect(asked[0]!.type).toBe("text/plain");
    expect(canShareFiles({ share: async () => undefined, canShare: () => false })).toBe(false);
    expect(canShareFiles({ share: async () => undefined, canShare: () => { throw new Error("no"); } })).toBe(false);
  });

  it("the shared file is the backup's text as a .txt, named for when it was taken", async () => {
    const taken = at(12, 14, 2);
    const file = shareFileOf("{\"a\":1}", taken);
    expect(file.name).toBe("wuthering-tools-backup-2026-11-12-1402.txt");
    expect(file.type).toBe("text/plain");
    expect(file.size).toBe(7);
    const sent: Array<{ files?: File[]; title?: string }> = [];
    expect(await shareBackupText("{\"a\":1}", taken, { share: async (d) => void sent.push(d) })).toBe("shared");
    expect(sent[0]!.files![0]!.name).toBe(file.name);
  });

  it("closing the share sheet is no error and no copy; a refusal is a failure and no copy either", async () => {
    localStorage.removeItem(BACKUP_STATE_KEY);
    const cancel = { share: async () => { throw new DOMException("closed", "AbortError"); } };
    expect(await shareBackupText("{}", NOW, cancel)).toBe("cancelled");
    const refused = { share: async () => { throw new DOMException("Permission denied", "NotAllowedError"); } };
    expect(await shareBackupText("{}", NOW, refused)).toBe("failed");
    expect(await shareBackupText("{}", NOW, {})).toBe("failed");
    expect(readOutside()).toBeNull();
    expect(await shareBackupText("{}", NOW, { share: async () => undefined })).toBe("shared");
    expect(readOutside()?.how).toBe("share");
    localStorage.removeItem(BACKUP_STATE_KEY);
  });
});
