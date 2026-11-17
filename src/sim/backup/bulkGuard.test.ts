// A backup before several echoes or teams are deleted at once, on the real stores with the plugin the app uses: the
// account is read before the first delete, kept only when the burst was a bulk one, and never in the way of a delete.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { createPersistedState } from "pinia-plugin-persistedstate";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { getExportData } from "../../utils/settingsBackup";
import { persistStorage, refusedStores } from "../storage/persistGuard";
import { createBackups } from "./autoBackup";
import { captureAccount, type Capture, type RyanExport } from "./backupFile";
import { memoryBackupStore } from "./backupStore";
import { BULK_ECHOES, BULK_TEAMS, BURST_QUIET_MS, installBulkGuard, type ActionStore } from "./bulkGuard";
import { testStores } from "./__fixtures__/testAccount";

/* eslint-disable @typescript-eslint/no-explicit-any */

function account(echoes: number, teams: number) {
  const stores = testStores({ echoes, teams });
  localStorage.setItem("character", stores.character);
  localStorage.setItem("inventory", stores.inventory);
  localStorage.setItem("teamRotations", stores.teamRotations);
  const pinia = createPinia();
  createApp({}).use(pinia); // a pinia runs its plugins once an app has installed it
  pinia.use(createPersistedState({ auto: true, storage: persistStorage }));
  setActivePinia(pinia);
  const inventory = useInventoryStore() as any;
  const teamStore = useTeamRotationsStore() as any;
  let clock = new Date(2026, 10, 16, 12).getTime();
  const layer = createBackups({ store: memoryBackupStore(), now: () => (clock += 1000) });
  const env = {
    allowed: vi.fn(() => true),
    capture: vi.fn((): Capture => captureAccount(getExportData as () => RyanExport)),
    take: vi.fn((reason: "before-delete", capture: Capture) => layer.take(reason, capture)),
  };
  const stop = installBulkGuard({ inventory: inventory as ActionStore, teams: teamStore as ActionStore }, env);
  return { inventory, teamStore, layer, env, stop };
}

/** The quiet time after a burst passes, and whatever backup it started is stored. */
async function burstEnds(env: { take: ReturnType<typeof vi.fn> }): Promise<void> {
  await vi.advanceTimersByTimeAsync(BURST_QUIET_MS + 10);
  await Promise.allSettled(env.take.mock.results.map((r) => r.value));
}

/** Ryan's bulk paths: each delete awaited, so the plugin stores the inventory between two of them. */
async function deleteEchoes(inventory: any, count: number): Promise<void> {
  for (const id of inventory.echoes.slice(0, count).map((e: { echoId: string }) => e.echoId)) {
    await inventory.deleteEcho(id);
    await nextTick();
  }
}

beforeEach(() => {
  localStorage.clear();
  refusedStores.value = [];
  // only the guard's own timer is faked: the compression a backup goes through runs on the real clock
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => vi.useRealTimers());

describe("a backup before a bulk delete", () => {
  it("deleting several echoes at once keeps the inventory as it was before the first of them", async () => {
    const { inventory, layer, env } = account(8, 1);
    await deleteEchoes(inventory, 6);
    expect(inventory.echoes).toHaveLength(2);
    expect(await layer.list()).toHaveLength(0); // not until the burst is over
    await burstEnds(env);
    const [kept] = await layer.list();
    expect(kept).toMatchObject({ reason: "before-delete", counts: { echoes: 8, teams: 1 } });
    expect(env.capture).toHaveBeenCalledTimes(1); // read once, at the first delete
    const read = await layer.read(kept!.id);
    expect(read.ok && JSON.parse(JSON.parse(read.text).data.inventory).echoes).toHaveLength(8);
  });

  it("one echo deleted by hand, or four, is not a bulk delete: no backup", async () => {
    const { inventory, layer, env } = account(8, 1);
    await deleteEchoes(inventory, BULK_ECHOES - 1);
    await burstEnds(env);
    expect(await layer.list()).toHaveLength(0);
    expect(env.take).not.toHaveBeenCalled();
  });

  it("deletes far apart are each their own: five echoes over five minutes are five single deletes", async () => {
    const { inventory, layer, env } = account(8, 1);
    for (let i = 0; i < BULK_ECHOES; i++) {
      await deleteEchoes(inventory, 1);
      await vi.advanceTimersByTimeAsync(60_000);
    }
    await burstEnds(env);
    expect(inventory.echoes).toHaveLength(3);
    expect(await layer.list()).toHaveLength(0);
  });

  it("two teams deleted together keep the teams as they were", async () => {
    const { teamStore, layer, env } = account(3, 3);
    expect(BULK_TEAMS).toBe(2);
    for (const id of ["t1", "t2"]) teamStore.deleteTeam(id);
    await burstEnds(env);
    expect(teamStore.teams).toHaveLength(1);
    const [kept] = await layer.list();
    expect(kept).toMatchObject({ reason: "before-delete", counts: { teams: 3 } });
  });

  it("one team deleted alone takes none", async () => {
    const { teamStore, layer, env } = account(3, 3);
    teamStore.deleteTeam("t1");
    await burstEnds(env);
    expect(await layer.list()).toHaveLength(0);
  });

  it("a second bulk delete later takes its own backup, of the account as it was then", async () => {
    const { inventory, layer, env } = account(14, 1);
    await deleteEchoes(inventory, 5);
    await burstEnds(env);
    await deleteEchoes(inventory, 5);
    await burstEnds(env);
    expect((await layer.list()).map((m) => m.counts.echoes).sort((a, b) => a - b)).toEqual([9, 14]);
  });

  it("where backups stand aside nothing is read or kept, and the deletes go through", async () => {
    const { inventory, layer, env } = account(8, 1);
    env.allowed.mockReturnValue(false);
    await deleteEchoes(inventory, 6);
    await burstEnds(env);
    expect(inventory.echoes).toHaveLength(2);
    expect(env.capture).not.toHaveBeenCalled();
    expect(await layer.list()).toHaveLength(0);
  });

  it("a storage that cannot be read, or a backup that fails, never stops a delete", async () => {
    const { inventory, env } = account(8, 1);
    env.capture.mockImplementation(() => {
      throw new Error("blocked");
    });
    await deleteEchoes(inventory, 6);
    expect(inventory.echoes).toHaveLength(2);

    const second = account(8, 1);
    second.env.take.mockImplementation(() => {
      throw new Error("IndexedDB fell over");
    });
    await deleteEchoes(second.inventory, 6);
    await expect(vi.advanceTimersByTimeAsync(BURST_QUIET_MS + 10)).resolves.toBeDefined();
    expect(second.inventory.echoes).toHaveLength(2);
  });

  it("stopped, it hears nothing more", async () => {
    const { inventory, layer, env, stop } = account(8, 1);
    stop();
    await deleteEchoes(inventory, 6);
    await burstEnds(env);
    expect(env.capture).not.toHaveBeenCalled();
    expect(await layer.list()).toHaveLength(0);
  });
});
