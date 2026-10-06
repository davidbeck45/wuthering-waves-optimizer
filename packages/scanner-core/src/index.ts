/**
 * @wutheringtools/scanner-core: Wuthering Waves echo-screen scanning logic shared by
 * Wuthering Tools (browser scanner) and Wavescan (desktop scanner).
 *
 * Call `setScannerGameData(...)` once before using the parsing functions. Everything here
 * is plain TypeScript with no DOM, Vue or Pinia dependencies (ADR 0034).
 */
export * from "./gameData";
export * from "./types";
export * from "./levenshtein";
export * from "./fingerprint";
export * from "./stability";
export * from "./queue";
export * from "./contentRect";
export * from "./layout";
export * from "./layoutCheck";
export * from "./review";
export * from "./dedupe";
export * from "./parse";
// parsedEchoMapping has its own looser `ParsedSubstat` (optional fields); expose it under
// a distinct name so it doesn't clash with the scanner's `ParsedSubstat` from ./types.
export {
  getSubstatType,
  getSubstatValue,
  mapParsedEchoes,
  type MappedEcho,
  type ParsedEcho,
  type ParsedSubstat as LooseParsedSubstat,
} from "./parsedEchoMapping";
export * from "./echoIdentity";
