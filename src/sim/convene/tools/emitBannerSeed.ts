// Wuthering Tools+ — regenerate src/sim/convene/data/bannerSeed.json: every Convene notice in Kuro's news feed,
// parsed, so a first visit to the banner calendar fetches only the menu and the notices newer than the seed.
//
//   npx tsx src/sim/convene/tools/emitBannerSeed.ts                 # fetch the feed live (≈130 small requests)
//   npx tsx src/sim/convene/tools/emitBannerSeed.ts --update        # start from the current seed: the menu + new notices only
//   npx tsx src/sim/convene/tools/emitBannerSeed.ts --from <dir>    # <dir>/ArticleMenu.json + <dir>/article/<id>.json
//
// The seed also carries each version's release time (its patch-notes entry in the menu), which starts the banners that
// open "with the version update".
//
// Released content only: a notice that still announces a banner whose start hasn't passed (at the earliest server
// clock, UTC+8) is left out of the seed entirely — the app fetches it itself once it is live.
// Node-only (never imported by the app).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BANNER_CACHE_VERSION,
  decodeBannerCache,
  isConveneNotice,
  parseConveneArticle,
  refreshBannerCache,
  unreleasedArticleIds,
  versionReleases,
  type BannerCache,
  type ParsedArticle,
} from "../banners";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "data", "bannerSeed.json");

function fromDir(dir: string): BannerCache {
  const menu = JSON.parse(readFileSync(join(dir, "ArticleMenu.json"), "utf8")) as { articleId: number; articleTitle: string; startTime: string }[];
  const articles: Record<string, ParsedArticle> = {};
  for (const e of menu.filter(isConveneNotice)) {
    let a: { articleTitle?: string; startTime?: string; articleContent?: string };
    try {
      a = JSON.parse(readFileSync(join(dir, "article", `${e.articleId}.json`), "utf8"));
    } catch {
      continue;
    }
    if (typeof a.articleContent !== "string") continue;
    articles[String(e.articleId)] = parseConveneArticle({
      articleId: e.articleId,
      articleTitle: a.articleTitle ?? e.articleTitle,
      startTime: a.startTime ?? e.startTime,
      articleContent: a.articleContent,
    });
  }
  return { v: BANNER_CACHE_VERSION, fetchedAt: 0, articles, releases: versionReleases(menu) };
}

async function main() {
  const i = process.argv.indexOf("--from");
  const base: BannerCache = process.argv.includes("--update")
    ? (decodeBannerCache(readFileSync(OUT, "utf8")) ?? { v: BANNER_CACHE_VERSION, fetchedAt: 0, articles: {} })
    : { v: BANNER_CACHE_VERSION, fetchedAt: 0, articles: {} };
  const cache = i > 0 ? fromDir(process.argv[i + 1]!) : await refreshBannerCache(base);
  const now = Date.now();
  const hold = unreleasedArticleIds(Object.values(cache.articles), now, cache.releases);
  const articles: Record<string, ParsedArticle> = {};
  for (const id of Object.keys(cache.articles).sort((a, b) => Number(a) - Number(b))) {
    if (!hold.has(Number(id))) articles[id] = cache.articles[id]!;
  }
  const releases = Object.fromEntries(Object.entries(cache.releases ?? {}).sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true })));
  const seed: BannerCache = { v: BANNER_CACHE_VERSION, fetchedAt: 0, articles, releases };
  writeFileSync(OUT, JSON.stringify(seed) + "\n");
  const banners = Object.values(articles).reduce((n, a) => n + a.banners.length, 0);
  process.stdout.write(
    `wrote ${OUT}: ${Object.keys(articles).length} notices, ${banners} banners, ${Object.keys(releases).length} version releases${hold.size ? `, held back ${hold.size} unreleased` : ""}\n`,
  );
}

void main();
