/**
 * Hands Wuthering Tools' game tables to @wutheringtools/scanner-core, which holds the
 * scanner logic but no data (ADR 0034). Imported for its side effect by every module
 * that re-exports data-dependent scanner functions (parse, layoutCheck, dedupe,
 * echoes/parsedEchoMapping), so the data is always set before any of them run.
 */
import { setScannerGameData } from "@wutheringtools/scanner-core/gameData";
import { echoCostClassMap, mainEchoesData } from "../echoes/index";
import {
  flatBonusesByRankByType,
  statsTable,
  subStatsTable,
  verboseStatLabelMap,
} from "../echoes/stats";

setScannerGameData({
  echoes: mainEchoesData,
  echoCostByClass: echoCostClassMap,
  statsTable,
  subStatsTable,
  verboseStatLabelMap,
  flatBonusesByRankByType,
});
