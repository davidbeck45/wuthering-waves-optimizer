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
