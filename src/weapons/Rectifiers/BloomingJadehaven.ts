const weaponInfo: WeaponInfo = {
  name: "Blooming Jadehaven",
  image: "https://ryanbenson.github.io/wuthering-waves-assets/images/weapons/BloomingJadehaven.png",
  description: "Jade to pillars, gold to nexus, a hundred mechanisms meshed into one working. Infinite forms divide and proliferate among the blooms, and it still fits in the palm of Her hand.\nWalls and mechanisms know no feeling. What makes a life's work worth the life is not the making, but that something in it was loved.",
  type: "Rectifier",
  rarity: 5,
  passiveName: "Hundredfold Artifice",
  passiveValue: `<div>Grants <span style="color:#ffd12f;" class="font-bold">12%/15%/18%/21%/24%</span> All-Attribute DMG Bonus. After the wielder inflicts Electro Flare or triggers Unison Response, Resonance Skill DMG is Amplified by <span style="color:#ffd12f;" class="font-bold">36%/45%/54%/63%/72%</span> and ignores <span style="color:#ffd12f;" class="font-bold">10%/13.5%/17%/20.5%/24%</span> of the target's Electro RES. While the wielder is the active Resonator, Electro Flare DMG taken by targets within a certain range is Amplified by <span style="color:#ffd12f;" class="font-bold">30%/37.5%/45%/52.5%/60%</span> for <span style="color:#ffd12f;" class="font-bold">30/30/30/30/30</span>s, triggered <saptag=6><span style="color:#ffd12f;" class="font-bold">1/1/1/1/1</span> time every <span style="color:#ffd12f;" class="font-bold">0.1/0.1/0.1/0.1/0.1</span>s. Only the strongest effect of the same name applies.</saptag=6></div>`,
  passiveData: [
    {
      key: "BloomingsJadehavenAllElementAttributeBonus",
      hasStacks: false,
      modifier: "AllElementAttributeBonus",
      modifierByRefinement: {
        "1": 0.12,
        "2": 0.15,
        "3": 0.18,
        "4": 0.21,
        "5": 0.24,
      },
      details:
        `Grants <span style="color:#ffd12f;" class="font-bold">12%/15%/18%/21%/24%</span> All-Attribute DMG Bonus.`,
      alwaysEnabled: true,
    },
    {
      key: "BloomingsJadehavenSkill",
      hasStacks: false,
      modifier: "DMGDeepen:Skill",
      modifierByRefinement: {
        "1": 0.36,
        "2": 0.45,
        "3": 0.54,
        "4": 0.63,
        "5": 0.72,
      },
      details:
        `After the wielder inflicts Electro Flare or triggers Unison Response, Resonance Skill DMG is Amplified by <span style="color:#ffd12f;" class="font-bold">36%/45%/54%/63%/72%</span>`,
      alwaysEnabled: false,
    },
    {
      key: "BloomingsJadehavenSkillShred",
      hasStacks: false,
      modifier: "ResistShred:Electro:Skill",
      modifierByRefinement: {
        "1": 0.1,
        "2": 0.135,
        "3": 0.17,
        "4": 0.205,
        "5": 0.24,
      },
      details:
        `After the wielder inflicts Electro Flare or triggers Unison Response, Resonance Skill DMG ignores <span style="color:#ffd12f;" class="font-bold">10%/13.5%/17%/20.5%/24%</span> of the target's Electro RES.`,
      alwaysEnabled: false,
    },
    {
      key: "BloomingsJadehavenFlareAmp",
      hasStacks: false,
      modifier: "DMGDeepen:ElectroFlare",
      modifierByRefinement: {
        "1": 0.3,
        "2": 0.375,
        "3": 0.45,
        "4": 0.525,
        "5": 0.6,
      },
      details:
        `While the wielder is on the field, Electro Flare DMG taken by targets within a certain range is Amplified by <span style="color:#ffd12f;" class="font-bold">30%/37.5%/45%/52.5%/60%</span> for <span style="color:#ffd12f;" class="font-bold">30/30/30/30/30</span>s, triggered <saptag=6><span style="color:#ffd12f;" class="font-bold">1/1/1/1/1</span> time every <span style="color:#ffd12f;" class="font-bold">0.1/0.1/0.1/0.1/0.1</span>s. Only the strongest effect of the same name applies.</saptag=6>`,
      alwaysEnabled: false,
    },
  ],
};

const weaponData: WeaponData = {
  "1": {
    attack: 47,
    modifier: "CritRate",
    modifierValue: 0.054,
  },
  "20": {
    attack: 122,
    modifier: "CritRate",
    modifierValue: 0.096,
  },
  "40": {
    attack: 232,
    modifier: "CritRate",
    modifierValue: 0.138,
  },
  "50": {
    attack: 303,
    modifier: "CritRate",
    modifierValue: 0.159,
  },
  "60": {
    attack: 374,
    modifier: "CritRate",
    modifierValue: 0.18,
  },
  "70": {
    attack: 445,
    modifier: "CritRate",
    modifierValue: 0.201,
  },
  "80": {
    attack: 516,
    modifier: "CritRate",
    modifierValue: 0.222,
  },
  "90": {
    attack: 587,
    modifier: "CritRate",
    modifierValue: 0.243,
  },
  "20+": {
    attack: 153,
    modifier: "CritRate",
    modifierValue: 0.096,
  },
  "40+": {
    attack: 264,
    modifier: "CritRate",
    modifierValue: 0.138,
  },
  "50+": {
    attack: 335,
    modifier: "CritRate",
    modifierValue: 0.159,
  },
  "60+": {
    attack: 406,
    modifier: "CritRate",
    modifierValue: 0.18,
  },
  "70+": {
    attack: 476,
    modifier: "CritRate",
    modifierValue: 0.201,
  },
  "80+": {
    attack: 547,
    modifier: "CritRate",
    modifierValue: 0.222,
  },
};

export function getWeaponInfo(): WeaponInfo {
  return weaponInfo;
}

export function getWeaponData(): WeaponData {
  return weaponData;
}

export function getWeaponDataByLevel(level: string): WeaponLevelData {
  return weaponData[level];
}

export function getWeapon() {
  return {
    info: weaponInfo,
    data: weaponData,
    getWeaponInfo,
    getWeaponData,
    getWeaponDataByLevel,
  };
}
