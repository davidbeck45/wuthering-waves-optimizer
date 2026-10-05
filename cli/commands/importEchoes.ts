import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { confirm } from "@inquirer/prompts";
import { fetchEchoList } from "../lib/api.js";
import {
  buildImportedEchoesFile,
  getEchoImportNotices,
  loadEchoSetLabelToKeyMap,
} from "../lib/echoes.js";
import { withSpinner } from "../lib/progress.js";
import { printReviewChecklist } from "../lib/reviewNotices.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const echoesIndexPath = path.join(projectRoot, "src/echoes/index.ts");
const echoStatsPath = path.join(projectRoot, "src/echoes/stats.ts");

export async function runImportEchoes(options: {
  /** Use Encore's beta dataset; prompts when undefined. */
  beta?: boolean;
  /** Only import these echo groups (e.g. "phantom"); all groups when empty. */
  groups?: string[];
} = {}): Promise<void> {
  const beta =
    options.beta ??
    (await confirm({
      message: "Use the Beta API (may include unreleased echoes)?",
      default: false,
    }));
  const groups = (options.groups ?? [])
    .flatMap((group) => group.split(","))
    .map((group) => group.trim())
    .filter(Boolean);

  const apiEchoes = await withSpinner(
    `Fetching ${beta ? "beta " : ""}echo list from Encore API`,
    () => fetchEchoList({ beta }),
    (result) => `Loaded ${result.length} echoes`,
  );

  const labelToKey = loadEchoSetLabelToKeyMap(echoStatsPath);
  const echoesFileContent = fs.readFileSync(echoesIndexPath, "utf8");
  const result = buildImportedEchoesFile({
    echoesFileContent,
    apiEchoes,
    labelToKey,
    groups,
  });

  fs.writeFileSync(echoesIndexPath, result.content);

  console.log(`Updated ${path.relative(projectRoot, echoesIndexPath)}`);
  printReviewChecklist(getEchoImportNotices(result));
}
