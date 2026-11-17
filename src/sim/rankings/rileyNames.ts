// Wuthering Tools+ — Riley31415/wuwa_calc resonator names ⇄ this app's character keys. Dependency-free on purpose:
// `presets/` and `account/` need `rileyNameOf` on every page, the cast mapper (castMapper.ts) only on /rankings.

/** Riley's resonator name -> app character key, where the two differ */
export const ALIAS: Record<string, string> = {
  Xuanling: "YangyangXuanling",
  "Electro Rover": "Roverelectrofemale",
  "Aero Rover": "RoverAeroFemale",
  "Spectro Rover": "RoverSpectroFemale",
  "Havoc Rover": "RoverHavocFemale",
  "Luuk Herssen": "LuukHerssen",
  "Xiangli Yao": "XiangliYao",
};
export const appKeyOf = (name: string): string => ALIAS[name] ?? name.replace(/ /g, "");
/** app character key -> Riley's resonator name (ALIAS inverted; both Rover genders are his one form) */
const RILEY_NAME: Record<string, string> = Object.fromEntries(Object.entries(ALIAS).map(([riley, app]) => [app, riley]));
for (const [riley, app] of Object.entries(ALIAS)) if (/female$/i.test(app)) RILEY_NAME[app.replace(/(f)emale$/i, (_, f) => (f === "F" ? "Male" : "male"))] = riley;
export const rileyNameOf = (appKey: string): string => RILEY_NAME[appKey] ?? appKey;

/** A Rover form's key in the other gender ("RoverAeroFemale" ⇄ "RoverAeroMale", "Roverelectrofemale" ⇄
 *  "Roverelectromale"); null for everyone else. The two are one kit: Riley has one Rover per element. */
const ROVER_TWIN: Record<string, string> = {};
for (const app of Object.values(ALIAS)) {
  if (!/female$/i.test(app)) continue;
  const male = app.replace(/(f)emale$/i, (_, f) => (f === "F" ? "Male" : "male"));
  ROVER_TWIN[app] = male;
  ROVER_TWIN[male] = app;
}
export const roverTwinOf = (appKey: string): string | null => ROVER_TWIN[appKey] ?? null;

/** Whether two app keys are one kit: the same character, or a Rover's two genders of one element. */
export const sameKit = (a: string, b: string): boolean => a === b || rileyNameOf(a) === rileyNameOf(b);

/**
 * The key this account plays a character under. Everything generated from wuwa_calc (the loops, the stock teams) names
 * a Rover by the female key, and an account holds one form: `key` comes back as it is unless the account has only the
 * other gender's record, or has both and only the other one carries a weapon. Anyone but a Rover: `key`.
 * One rule for every reader that asks "does this account have that character" of a generated key (2026-11-08 hunt,
 * numbers 4: a male Rover read 0 wuwa_calc loops and 0 stock teams where the female form read 3 to 6).
 */
export function accountKeyOf(key: string, characters: Record<string, any> | null | undefined): string {
  const twin = roverTwinOf(key);
  if (!twin || !characters) return key;
  const own = characters[key];
  const other = characters[twin];
  // An element the account holds in neither gender takes the gender of the Rover it does play (`roverGenderOf`): Rover
  // is one resonator who changes element, so a male Aero Rover's account reads the Electro and Spectro Rover of a stock
  // team as the male ones, on /rotation's picker and wherever a team is listed for someone who does not own all of it
  // (2026-11-16)
  if (!own && !other) {
    const gender = roverGenderOf(characters);
    return gender && (gender === "male") !== isMaleForm(key) ? twin : key;
  }
  if (!other) return key;
  if (!own) return twin;
  return other.weapon && !own.weapon ? twin : key;
}

function isMaleForm(key: string): boolean {
  return /male$/i.test(key) && !/female$/i.test(key);
}

/**
 * The gender an account plays Rover in, read off the Rover forms it holds: "male" when every form it has set up (a
 * weapon; any record when none carries one) is male, "female" when every one is female. null when it holds no Rover,
 * or holds both genders across elements.
 */
export function roverGenderOf(characters: Record<string, any> | null | undefined): "male" | "female" | null {
  if (!characters) return null;
  const held = Object.keys(ROVER_TWIN).filter((key) => characters[key]);
  if (!held.length) return null;
  const setUp = held.filter((key) => characters[key]?.weapon);
  const forms = setUp.length ? setUp : held;
  if (forms.every(isMaleForm)) return "male";
  return forms.some(isMaleForm) ? null : "female";
}
