// Wuthering Tools+ AI: the eval question bank stays in step with the tool registry, and the AI modules stay
// browser-safe (no node: imports — every tool must run in the app and under the CLI).
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import bank from "./questions.json";
import { AI_TOOLS } from "../tools/index";

describe("eval question bank", () => {
  it("names only real tools, has unique ids and enough questions", () => {
    const names = new Set(AI_TOOLS.map((t) => t.name));
    expect(bank.questions.length).toBeGreaterThanOrEqual(15);
    expect(new Set(bank.questions.map((q) => q.id)).size).toBe(bank.questions.length);
    for (const q of bank.questions) {
      for (const t of [...q.expect, ...q.acceptable]) expect(names.has(t), `${q.id}: ${t}`).toBe(true);
      expect(q.question.length).toBeGreaterThan(5);
      expect(q.grounding.length).toBeGreaterThan(20);
    }
    // every tool is exercised by at least one question
    const used = new Set(bank.questions.flatMap((q) => [...q.expect, ...q.acceptable]));
    for (const t of names) expect(used.has(t), t).toBe(true);
  });
});

describe("browser safety", () => {
  const roots = [join(__dirname, ".."), join(__dirname, "../../live")];
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) files.push(path);
    }
  };
  roots.forEach(walk);

  it("no AI or live module imports node: built-ins", () => {
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) expect(readFileSync(file, "utf8"), file).not.toMatch(/from\s+["']node:|import\(\s*["']node:/);
  });

  it("nothing the tool worker imports holds a `new Worker(new URL(...))` site (each one nests a worker build inside the tool worker's)", () => {
    const seen = new Set<string>();
    const offenders: string[] = [];
    const resolveSpec = (from: string, spec: string): string | null => {
      if (!spec.startsWith(".")) return null;
      const base = join(dirname(from), spec);
      for (const c of [base, `${base}.ts`, join(base, "index.ts")]) if (existsSync(c) && statSync(c).isFile()) return c;
      return null;
    };
    const visit = (file: string): void => {
      if (seen.has(file) || !file.endsWith(".ts")) return;
      seen.add(file);
      const text = readFileSync(file, "utf8");
      if (/new Worker\(\s*new URL\(/.test(text)) offenders.push(relative(join(__dirname, "../.."), file));
      const specs = [
        ...text.matchAll(/^\s*(?:import|export)\s+(?!type\b)[\w$*{},\s]+?\s+from\s+["']([^"']+)["']/gm),
        ...text.matchAll(/^\s*import\s+["']([^"']+)["']/gm),
        ...text.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g),
      ].map((m) => m[1]!);
      for (const spec of specs) {
        const next = resolveSpec(file, spec);
        if (next) visit(next);
      }
    };
    visit(join(__dirname, "../tools/tools.worker.ts"));
    expect(seen.size).toBeGreaterThan(50);
    expect(offenders).toEqual([]);
  });

  it("the export shape the browser reads is pure too", () => {
    expect(readFileSync(join(__dirname, "../../cli/exportShape.ts"), "utf8")).not.toMatch(/from\s+["']node:|import\(\s*["']node:|^import /m);
  });
});
