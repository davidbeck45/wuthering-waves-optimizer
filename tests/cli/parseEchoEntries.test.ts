import { describe, expect, it } from "vitest";
import { withBetaParam } from "../../cli/lib/api.js";
import {
  buildImportedEchoesFile,
  getEchoGroup,
  getEchoImportNotices,
} from "../../cli/lib/echoes.js";
import { parseEchoEntries } from "../../cli/lib/parseEchoEntries.js";

const sampleEchoesFile = `interface Echo {
  key: string;
}

type MainEchoes = Record<string, Echo>;

export const mainEchoesData: MainEchoes = {
  AeroDrake: {
    key: "AeroDrake",
    name: "Aero Drake",
    class: "Common",
    image:
      "https://ryanbenson.github.io/wuthering-waves-assets/images/echoes/AeroDrake.webp",
    details: \`Custom details\`,
    modifiers: [
      {
        modifier: "Aero",
        modifierValue: 0.1,
      },
    ],
    actions: [],
    sets: ["GustsofWelkin"],
  },
  YoungRoseshroom: {
    key: "YoungRoseshroom",
    name: "Baby Roseshroom",
    class: "Common",
    image:
      "https://ryanbenson.github.io/wuthering-waves-assets/images/echoes/YoungRoseshroom.png",
    details: \`Roseshroom details\`,
    modifiers: [],
    actions: [],
    sets: ["SierraGale"],
  },
};
`;

describe("parseEchoEntries", () => {
  it("extracts echo keys, names, and preserved properties", () => {
    const parsed = parseEchoEntries(sampleEchoesFile);
    const aeroDrake = parsed.entriesByKey.get("AeroDrake");

    expect(parsed.entriesInOrder).toHaveLength(2);
    expect(aeroDrake?.name).toBe("Aero Drake");
    expect(aeroDrake?.details).toContain("Custom details");
    expect(aeroDrake?.modifiers).toContain('modifier: "Aero"');
    expect(parsed.entriesByName.get("baby roseshroom")?.objectKey).toBe(
      "YoungRoseshroom",
    );
    expect(aeroDrake?.image).toBe(
      "https://ryanbenson.github.io/wuthering-waves-assets/images/echoes/AeroDrake.webp",
    );
  });
});

describe("withBetaParam", () => {
  it("adds v=Beta only when beta is on", () => {
    expect(withBetaParam("https://x/echo", false)).toBe("https://x/echo");
    expect(withBetaParam("https://x/echo", true)).toBe("https://x/echo?v=Beta");
    expect(withBetaParam("https://x/echo?a=1", true)).toBe(
      "https://x/echo?a=1&v=Beta",
    );
  });
});

describe("getEchoGroup", () => {
  it("returns the normalized prefix before the first colon", () => {
    expect(getEchoGroup("Phantom: Crownless")).toBe("phantom");
    expect(getEchoGroup("Reminiscence - Nightmare: Foo")).toBe(
      "reminiscence - nightmare",
    );
    expect(getEchoGroup("Crownless")).toBeNull();
  });
});

describe("buildImportedEchoesFile", () => {
  it("preserves details, modifiers, and actions for existing echoes", () => {
    const labelToKey = new Map([
      ["Gusts of Welkin", "GustsofWelkin"],
      ["Sierra Gale", "SierraGale"],
      ["Lingering Tunes", "LingeringTunes"],
    ]);

    const result = buildImportedEchoesFile({
      echoesFileContent: sampleEchoesFile,
      apiEchoes: [
        {
          Id: 1,
          Name: "Aero Drake",
          Rarity: 0,
          FetterGroups: [{ Id: 1, Name: "Gusts of Welkin" }],
        },
        {
          Id: 2,
          Name: "Baby Roseshroom",
          Rarity: 0,
          FetterGroups: [{ Id: 2, Name: "Sierra Gale" }],
        },
        {
          Id: 3,
          Name: "Hooscamp",
          Rarity: 1,
          FetterGroups: [{ Id: 3, Name: "Lingering Tunes" }],
        },
      ],
      labelToKey,
    });

    expect(result.content).toContain("Custom details");
    expect(result.content).toContain('modifier: "Aero"');
    expect(result.content).toContain("Roseshroom details");
    expect(result.content).toContain("YoungRoseshroom:");
    expect(result.content).toContain('name: "Hooscamp"');
    expect(result.content).toContain('class: "Elite"');
    expect(result.content).toContain("details: ``,");
    expect(result.addedCount).toBe(1);
    expect(result.updatedCount).toBe(2);
    expect(result.content.indexOf("AeroDrake:")).toBeLessThan(
      result.content.indexOf("Hooscamp:"),
    );
    expect(result.content.indexOf("Hooscamp:")).toBeLessThan(
      result.content.indexOf("YoungRoseshroom:"),
    );
  });

  it("skips Phantom echoes from the API", () => {
    const labelToKey = new Map([["Lingering Tunes", "LingeringTunes"]]);

    const result = buildImportedEchoesFile({
      echoesFileContent: sampleEchoesFile,
      apiEchoes: [
        {
          Id: 1,
          Name: "Phantom: Mourning Aix",
          Rarity: 2,
          FetterGroups: [{ Id: 1, Name: "Lingering Tunes" }],
        },
        {
          Id: 2,
          Name: "Hooscamp",
          Rarity: 0,
          FetterGroups: [{ Id: 1, Name: "Lingering Tunes" }],
        },
      ],
      labelToKey,
    });

    expect(result.content).not.toContain("PhantomMourningAix:");
    expect(result.content).toContain("Hooscamp:");
    expect(result.addedCount).toBe(1);
  });

  it("skips blacklisted character echoes from the API", () => {
    const labelToKey = new Map([["Lingering Tunes", "LingeringTunes"]]);

    const result = buildImportedEchoesFile({
      echoesFileContent: sampleEchoesFile,
      apiEchoes: [
        {
          Id: 1,
          Name: "Jinhsi",
          Rarity: 2,
          FetterGroups: [{ Id: 1, Name: "Lingering Tunes" }],
        },
        {
          Id: 2,
          Name: "Hooscamp",
          Rarity: 0,
          FetterGroups: [{ Id: 1, Name: "Lingering Tunes" }],
        },
      ],
      labelToKey,
    });

    expect(result.content).not.toContain("Jinhsi:");
    expect(result.content).toContain("Hooscamp:");
    expect(result.addedCount).toBe(1);
  });

  it("drops blacklisted echoes already present in the file", () => {
    const content = `${sampleEchoesFile.replace("};", "")}
  Jinhsi: {
    key: "Jinhsi",
    name: "Jinhsi",
    class: "Overlord",
    image:
      "https://ryanbenson.github.io/wuthering-waves-assets/images/echoes/Jinhsi.webp",
    details: \`\`,
    modifiers: [],
    actions: [],
    sets: ["LingeringTunes"],
  },
};`;

    const result = buildImportedEchoesFile({
      echoesFileContent: content,
      apiEchoes: [],
      labelToKey: new Map(),
    });

    expect(result.content).not.toContain("Jinhsi:");
    expect(result.preservedCount).toBe(2);
  });

  it("formats echo entries without blank lines between properties", () => {
    const labelToKey = new Map([["Gusts of Welkin", "GustsofWelkin"]]);

    const result = buildImportedEchoesFile({
      echoesFileContent: sampleEchoesFile,
      apiEchoes: [
        {
          Id: 1,
          Name: "Aero Drake",
          Rarity: 0,
          FetterGroups: [{ Id: 1, Name: "Gusts of Welkin" }],
        },
      ],
      labelToKey,
    });

    const entryMatch = result.content.match(
      /AeroDrake: \{[\s\S]*?\n  \},/,
    );
    expect(entryMatch).not.toBeNull();
    expect(entryMatch![0]).not.toMatch(/\n\s*\n\s*details:/);
    expect(entryMatch![0]).not.toMatch(/\n\s*\n\s*modifiers:/);
    expect(entryMatch![0]).not.toMatch(/\n\s*\n\s*actions:/);
  });

  it("hot-links the API icon for new echoes and keeps existing images", () => {
    const result = buildImportedEchoesFile({
      echoesFileContent: sampleEchoesFile,
      apiEchoes: [
        {
          Id: 1,
          Name: "Aero Drake",
          Rarity: 0,
          Icon: "https://cdn.example/aero.webp",
          FetterGroups: [],
        },
        {
          Id: 2,
          Name: "Hooscamp",
          Rarity: 0,
          Icon: "https://cdn.example/hooscamp.webp",
          FetterGroups: [],
        },
      ],
      labelToKey: new Map(),
    });

    expect(result.content).toContain(
      "https://ryanbenson.github.io/wuthering-waves-assets/images/echoes/AeroDrake.webp",
    );
    expect(result.content).not.toContain("https://cdn.example/aero.webp");
    expect(result.content).toContain("https://cdn.example/hooscamp.webp");
  });

  it("imports only the requested groups and leaves other entries untouched", () => {
    const labelToKey = new Map([["Lingering Tunes", "LingeringTunes"]]);

    const result = buildImportedEchoesFile({
      echoesFileContent: sampleEchoesFile,
      apiEchoes: [
        {
          Id: 1,
          Name: "Phantom: Mourning Aix",
          Rarity: 2,
          Icon: "https://cdn.example/phantom-aix.webp",
          FetterGroups: [{ Id: 1, Name: "Lingering Tunes" }],
        },
        {
          Id: 2,
          Name: "Nightmare: Crownless",
          Rarity: 2,
          FetterGroups: [{ Id: 1, Name: "Lingering Tunes" }],
        },
        {
          Id: 3,
          Name: "Hooscamp",
          Rarity: 0,
          FetterGroups: [{ Id: 1, Name: "Lingering Tunes" }],
        },
        {
          Id: 4,
          Name: "Aero Drake",
          Rarity: 0,
          FetterGroups: [],
        },
      ],
      labelToKey,
      groups: ["Phantom:"],
    });

    expect(result.content).toContain("PhantomMourningAix:");
    expect(result.content).toContain('name: "Phantom: Mourning Aix"');
    expect(result.content).toContain("https://cdn.example/phantom-aix.webp");
    expect(result.content).not.toContain("NightmareCrownless:");
    expect(result.content).not.toContain("Hooscamp:");
    // Untouched entries keep their hand-written content and existing sets.
    expect(result.content).toContain("Custom details");
    expect(result.content).toContain('sets: ["GustsofWelkin"]');
    expect(result.addedCount).toBe(1);
    expect(result.updatedCount).toBe(0);
    expect(result.preservedCount).toBe(0);
    expect(result.untouchedCount).toBe(2);
    expect(getEchoImportNotices(result)[0]).toContain(
      "Left 2 echos outside the selected groups untouched",
    );
    expect(
      result.notices.some((notice) => notice.includes("was not found")),
    ).toBe(false);
  });

  it("keeps entries with non-ASCII keys (regression: Jué was dropped)", () => {
    const content = `${sampleEchoesFile.replace("};", "")}
  Jué: {
    key: "Jué",
    name: "Jué",
    class: "Calamity",
    image:
      "https://ryanbenson.github.io/wuthering-waves-assets/images/echoes/Jue.png",
    details: \`Jue details\`,
    modifiers: [],
    actions: [],
    sets: ["CelestialLight"],
  },
};`;

    expect(parseEchoEntries(content).entriesByKey.has("Jué")).toBe(true);

    const groupImport = buildImportedEchoesFile({
      echoesFileContent: content,
      apiEchoes: [
        { Id: 1, Name: "Phantom: Mourning Aix", Rarity: 2, FetterGroups: [] },
      ],
      labelToKey: new Map(),
      groups: ["phantom"],
    });
    expect(groupImport.content).toContain("Jué: {");
    expect(groupImport.content).toContain("Jue details");

    const fullImport = buildImportedEchoesFile({
      echoesFileContent: content,
      apiEchoes: [{ Id: 1, Name: "Jué", Rarity: 3, FetterGroups: [] }],
      labelToKey: new Map(),
    });
    expect(fullImport.content).toContain("Jué: {");
    expect(fullImport.content).not.toContain("Jue: {");
    expect(fullImport.content).toContain("Jue details");
    expect(fullImport.addedCount).toBe(0);
  });

  it("throws on a group the API does not have", () => {
    expect(() =>
      buildImportedEchoesFile({
        echoesFileContent: sampleEchoesFile,
        apiEchoes: [
          { Id: 1, Name: "Phantom: Mourning Aix", Rarity: 2, FetterGroups: [] },
        ],
        labelToKey: new Map(),
        groups: ["phantm"],
      }),
    ).toThrow(/phantm.*Available groups: phantom/);
  });

  it("keeps Phantom echoes already in the file in sync on a full import", () => {
    const content = `${sampleEchoesFile.replace("};", "")}
  PhantomMourningAix: {
    key: "PhantomMourningAix",
    name: "Phantom: Mourning Aix",
    class: "Overlord",
    image:
      "https://cdn.example/phantom-aix.webp",
    details: \`Aix details\`,
    modifiers: [],
    actions: [],
    sets: [],
  },
};`;

    const result = buildImportedEchoesFile({
      echoesFileContent: content,
      apiEchoes: [
        {
          Id: 1,
          Name: "Phantom: Mourning Aix",
          Rarity: 2,
          FetterGroups: [{ Id: 1, Name: "Lingering Tunes" }],
        },
        {
          Id: 2,
          Name: "Phantom: Crownless",
          Rarity: 2,
          FetterGroups: [{ Id: 1, Name: "Lingering Tunes" }],
        },
      ],
      labelToKey: new Map([["Lingering Tunes", "LingeringTunes"]]),
    });

    expect(result.content).toContain("PhantomMourningAix:");
    expect(result.content).toContain("Aix details");
    expect(result.content).toContain('sets: ["LingeringTunes"]');
    expect(result.content).not.toContain("PhantomCrownless:");
    expect(result.updatedCount).toBe(1);
  });

  it("points new Phantom echoes at their base echo", () => {
    const content = sampleEchoesFile.replace(
      'name: "Aero Drake"',
      'name: "Crownless"',
    );

    const result = buildImportedEchoesFile({
      echoesFileContent: content,
      apiEchoes: [
        { Id: 1, Name: "Phantom: Crownless", Rarity: 2, FetterGroups: [] },
      ],
      labelToKey: new Map(),
      groups: ["phantom"],
    });

    expect(result.notices).toContain(
      'New Overlord echo "Phantom: Crownless" (PhantomCrownless) — Phantom skin of AeroDrake; copy its details, modifiers, and actions',
    );
  });
});
