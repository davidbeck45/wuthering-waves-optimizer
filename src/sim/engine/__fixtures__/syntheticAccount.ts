// A made-up account for the Riley run seam's fixture and tests — no player's data. Shorekeeper S2 on Variation R5,
// Lynae and Iuno S0 on their signatures at R1 (no weapon set reads as the signature under `mine`), and a crit-heavy
// "My build" for Iuno, so the fixture carries every case a consumer reads: a kit ER floor above the measured bar
// (Shorekeeper 240 % > ~188 %), a ChemX32 member with ER rolls (Lynae), a member on the player's own spread past
// 100 % Crit Rate (Iuno), and a Tune Break slot. `__fixtures__/runLite.json` is `tracedRun` of t404 on it.
import { accountKeyOf, type RileyAccountEntry } from "../../account/accountState";
import { rollsKey } from "../../rankings/myBuilds";
import type { RileyAccount } from "../rileyRun";

export const SYNTHETIC_TEAM = ["Shorekeeper", "Lynae", "Iuno"];

const entries: Record<string, RileyAccountEntry> = {
  Shorekeeper: { sequence: 2, weapon: "Variation", refine: 5, owned: true },
  Lynae: { sequence: 0, weapon: null, refine: 1, owned: true },
  Iuno: { sequence: 0, weapon: null, refine: 1, owned: true },
};

const rolls = [
  ...[10.5, 9.9, 9.3, 8.7, 8.1].map((value) => ({ kind: "CritRate", value })),
  ...[21, 19.8, 18.6, 17.4, 16.2].map((value) => ({ kind: "CritDmg", value })),
  ...[11.6, 10.9, 10.1].map((value) => ({ kind: "AtkPct", value })),
  ...[11.6, 10.9].map((value) => ({ kind: "Liberation", value })),
  { kind: "Er", value: 10.8 },
  { kind: "FlatAtk", value: 50 },
  { kind: "FlatAtk", value: 40 },
];

export const SYNTHETIC_ACCOUNT: RileyAccount = {
  key: accountKeyOf(entries),
  entries,
  builds: [{ name: "Iuno", key: rollsKey(rolls), rolls }],
  buildsKey: rollsKey(rolls.map((r) => ({ kind: `Iuno/${r.kind}`, value: r.value }))),
};
