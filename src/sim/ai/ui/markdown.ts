// Wuthering Tools+ AI — a small markdown-subset parser for Claude's answers. Pure: text in, a plain AST out;
// `MarkdownView.ts` turns the AST into VNodes whose text is always a text node. Nothing here (or there) ever
// produces HTML from model output: a raw `<img onerror=…>` in an answer stays literal text.
//
// Supported: paragraphs (single newlines become line breaks), headings, **bold** / __bold__, *italic* / _italic_
// (underscores only at word boundaries, so `calc_team` stays one word), `inline code`, fenced code blocks, bullet and
// numbered lists (one level of nesting), GitHub tables, block quotes, horizontal rules, [links](url) and bare URLs.
// Links: http(s) only, or an in-app route the caller recognises (`isRoute`); anything else (javascript:, data:,
// relative paths the app doesn't have) renders as plain text.

export type Inline =
  | { t: "text"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "code"; v: string; route?: string }
  | { t: "link"; href: string; kind: "external" | "route"; c: Inline[] }
  | { t: "br" };

export interface ListItem {
  c: Inline[];
  sub: Block | null;
}

export type Align = "left" | "center" | "right" | null;

export type Block =
  | { t: "p"; c: Inline[] }
  | { t: "h"; level: 1 | 2 | 3 | 4; c: Inline[] }
  | { t: "code"; lang: string | null; v: string }
  | { t: "list"; ordered: boolean; start: number; items: ListItem[] }
  | { t: "table"; align: Align[]; head: Inline[][]; rows: Inline[][][] }
  | { t: "quote"; c: Block[] }
  | { t: "hr" };

export interface MarkdownOptions {
  /** true for an in-app route the router knows ("/my-rankings", "/rankings#tc=mine…") */
  // eslint-disable-next-line no-unused-vars -- the parameter of a function type
  isRoute?: (path: string) => boolean;
}

const MAX_SOURCE = 60_000; // an answer is a few KB; never let a pathological one stall the UI

// ── links ───────────────────────────────────────────────────────────────────────────────────

/** A link target the panel may follow, or null. External: http(s) with a host. Route: "/path…" the caller knows. */
export function safeHref(raw: string, options: MarkdownOptions = {}): { href: string; kind: "external" | "route" } | null {
  const href = raw.trim();
  if (!href || /[\s<>"'`\\]/.test(href)) return null;
  if (/^https?:\/\//i.test(href)) {
    try {
      const url = new URL(href);
      if ((url.protocol === "http:" || url.protocol === "https:") && url.hostname) return { href: url.href, kind: "external" };
    } catch {
      return null;
    }
    return null;
  }
  if (href.startsWith("/") && !href.startsWith("//") && options.isRoute?.(href)) return { href, kind: "route" };
  return null;
}

// ── inline ──────────────────────────────────────────────────────────────────────────────────

const PUNCT = /[!-/:-@[-`{-~]/;
const isWordChar = (ch: string | undefined): boolean => !!ch && /[\p{L}\p{N}]/u.test(ch);

function pushText(out: Inline[], v: string): void {
  if (!v) return;
  const last = out[out.length - 1];
  if (last && last.t === "text") last.v += v;
  else out.push({ t: "text", v });
}

/** Bare in-app paths in running text ("see /my-rankings") become route links when the caller knows them. */
function pushTextWithRoutes(out: Inline[], v: string, options: MarkdownOptions): void {
  if (!options.isRoute || !v.includes("/")) return pushText(out, v);
  const re = /(^|[\s(])(\/[a-z][a-z0-9-]*(?:\/[a-z0-9-]+)*)(?=$|[\s).,;:!?])/gi;
  let at = 0;
  for (let m = re.exec(v); m; m = re.exec(v)) {
    const path = m[2];
    const start = m.index + m[1].length;
    if (!options.isRoute(path)) continue;
    pushText(out, v.slice(at, start));
    out.push({ t: "link", href: path, kind: "route", c: [{ t: "text", v: path }] });
    at = start + path.length;
  }
  pushText(out, v.slice(at));
}

/** Bare http(s) URLs in running text. Trailing punctuation stays outside the link. */
function pushTextWithUrls(out: Inline[], v: string, options: MarkdownOptions): void {
  const re = /https?:\/\/[^\s<>"'`]+/gi;
  let at = 0;
  for (let m = re.exec(v); m; m = re.exec(v)) {
    let url = m[0];
    while (/[.,;:!?)\]]$/.test(url)) url = url.slice(0, -1);
    const safe = safeHref(url, options);
    if (!safe) continue;
    pushTextWithRoutes(out, v.slice(at, m.index), options);
    out.push({ t: "link", href: safe.href, kind: "external", c: [{ t: "text", v: url }] });
    at = m.index + url.length;
    re.lastIndex = at;
  }
  pushTextWithRoutes(out, v.slice(at), options);
}

/** The index of the closing delimiter for an emphasis run opened at `from`, or -1. */
function findClose(src: string, delim: string, from: number): number {
  let i = from;
  while (i < src.length) {
    const j = src.indexOf(delim, i);
    if (j < 0) return -1;
    if (src[j - 1] === "\\") {
      i = j + 1;
      continue;
    }
    const before = src[j - 1];
    const after = src[j + delim.length];
    const inner = src.slice(from, j);
    const single = delim.length === 1;
    // `*a*` must not close on the first half of a `**`, a closer needs non-space before it
    const ok =
      j > from &&
      inner.trim() === inner &&
      before !== " " &&
      (!single || (src[j + 1] !== delim && before !== delim)) &&
      (delim[0] !== "_" || !isWordChar(after));
    if (ok) return j;
    i = j + delim.length;
  }
  return -1;
}

export function parseInline(src: string, options: MarkdownOptions = {}): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = (): void => {
    if (buf) pushTextWithUrls(out, buf, options);
    buf = "";
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    // backslash escapes of punctuation
    if (ch === "\\" && i + 1 < src.length && PUNCT.test(src[i + 1])) {
      buf += src[i + 1];
      i += 2;
      continue;
    }
    // hard line break inside a paragraph
    if (ch === "\n") {
      flush();
      out.push({ t: "br" });
      i += 1;
      continue;
    }
    // code span: a run of backticks closed by the same run
    if (ch === "`") {
      let n = 1;
      while (src[i + n] === "`") n += 1;
      const fence = "`".repeat(n);
      const close = src.indexOf(fence, i + n);
      if (close >= 0) {
        flush();
        let v = src.slice(i + n, close);
        if (v.startsWith(" ") && v.endsWith(" ") && v.trim()) v = v.slice(1, -1);
        const route = options.isRoute && /^\/[^\s]*$/.test(v) && safeHref(v, options)?.kind === "route" ? v : undefined;
        out.push(route ? { t: "code", v, route } : { t: "code", v });
        i = close + n;
        continue;
      }
      buf += fence;
      i += n;
      continue;
    }
    // [text](url)
    if (ch === "[") {
      const closeText = findBracket(src, i);
      if (closeText > 0 && src[closeText + 1] === "(") {
        const closeUrl = src.indexOf(")", closeText + 2);
        if (closeUrl > 0) {
          const label = src.slice(i + 1, closeText);
          const target = src.slice(closeText + 2, closeUrl).trim().replace(/\s+"[^"]*"$/, "");
          const safe = safeHref(target, options);
          flush();
          const inner = flattenLinks(parseInline(label, { ...options, isRoute: undefined }));
          if (safe) out.push({ t: "link", href: safe.href, kind: safe.kind, c: inner.length ? inner : [{ t: "text", v: target }] });
          else {
            // an unsafe target: keep the words, drop the link
            for (const n of inner) {
              if (n.t === "text") pushText(out, n.v);
              else out.push(n);
            }
          }
          i = closeUrl + 1;
          continue;
        }
      }
    }
    // **strong** / __strong__
    if ((ch === "*" || ch === "_") && src[i + 1] === ch) {
      const delim = ch + ch;
      const opens = src[i + 2] !== undefined && src[i + 2] !== " " && (ch === "*" || !isWordChar(src[i - 1]));
      const close = opens ? findClose(src, delim, i + 2) : -1;
      if (close > 0) {
        flush();
        out.push({ t: "strong", c: parseInline(src.slice(i + 2, close), options) });
        i = close + 2;
        continue;
      }
      buf += delim;
      i += 2;
      continue;
    }
    // *em* / _em_
    if (ch === "*" || ch === "_") {
      const opens = src[i + 1] !== undefined && src[i + 1] !== " " && (ch === "*" || !isWordChar(src[i - 1]));
      const close = opens ? findClose(src, ch, i + 1) : -1;
      if (close > 0) {
        flush();
        out.push({ t: "em", c: parseInline(src.slice(i + 1, close), options) });
        i = close + 1;
        continue;
      }
    }
    buf += ch;
    i += 1;
  }
  flush();
  return out;
}

/** Links never nest: a link inside a link label keeps only its words. */
function flattenLinks(nodes: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const n of nodes) {
    if (n.t === "link") {
      for (const c of flattenLinks(n.c)) {
        if (c.t === "text") pushText(out, c.v);
        else out.push(c);
      }
    }
    else if (n.t === "text") pushText(out, n.v);
    else out.push(n);
  }
  return out;
}

/** The `]` matching the `[` at `open` (nested brackets allowed), or -1. */
function findBracket(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === "\\") {
      i += 1;
      continue;
    }
    if (ch === "\n" && src[i + 1] === "\n") return -1;
    if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// ── blocks ──────────────────────────────────────────────────────────────────────────────────

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([\w+#.-]*)[^`]*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const LIST_ITEM = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  let inCode = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\" && s[i + 1] === "|") {
      cur += "|";
      i += 1;
    } else if (ch === "`") {
      inCode = !inCode;
      cur += ch;
    } else if (ch === "|" && !inCode) {
      cells.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

const isTableStart = (lines: string[], i: number): boolean =>
  lines[i].includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes("-") && splitRow(lines[i]).length === splitRow(lines[i + 1]).length;

function startsBlock(lines: string[], i: number): boolean {
  const line = lines[i];
  return FENCE.test(line) || HEADING.test(line) || HR.test(line) || QUOTE.test(line) || LIST_ITEM.test(line) || isTableStart(lines, i);
}

function parseList(lines: string[], start: number, options: MarkdownOptions): { block: Block; next: number } {
  const first = LIST_ITEM.exec(lines[start])!;
  const baseIndent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items: ListItem[] = [];
  let i = start;
  let current: { text: string[]; subLines: string[] } | null = null;
  const finish = (): void => {
    if (!current) return;
    const sub = current.subLines.length ? parseBlocks(current.subLines, options).find((b) => b.t === "list") ?? null : null;
    items.push({ c: parseInline(current.text.join("\n"), options), sub });
  };
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      // a blank line ends the list unless the next line continues it
      const next = lines[i + 1];
      const m = next !== undefined ? LIST_ITEM.exec(next) : null;
      if (m && m[1].length >= baseIndent && /\d/.test(m[2]) === ordered) {
        i += 1;
        continue;
      }
      break;
    }
    const m = LIST_ITEM.exec(line);
    if (m && m[1].length <= baseIndent + 1) {
      if (/\d/.test(m[2]) !== ordered && m[1].length <= baseIndent) break; // a different list starts
      finish();
      current = { text: [m[3]], subLines: [] };
      i += 1;
      continue;
    }
    if (m && current) {
      current.subLines.push(line.slice(Math.min(line.length - line.trimStart().length, baseIndent + 2)));
      i += 1;
      continue;
    }
    if (current && /^\s+\S/.test(line) && !startsBlock(lines, i)) {
      if (current.subLines.length) current.subLines.push(line.trim());
      else current.text.push(line.trim());
      i += 1;
      continue;
    }
    break;
  }
  finish();
  return { block: { t: "list", ordered, start: ordered ? Number.parseInt(first[2], 10) || 1 : 1, items }, next: i };
}

function parseBlocks(lines: string[], options: MarkdownOptions): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1];
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !new RegExp(`^\\s{0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}\\s*$`).test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // the closing fence (or past the end while streaming)
      blocks.push({ t: "code", lang: fence[2] || null, v: body.join("\n") });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ t: "h", level: Math.min(4, heading[1].length) as 1 | 2 | 3 | 4, c: parseInline(heading[2], options) });
      i += 1;
      continue;
    }
    if (HR.test(line)) {
      blocks.push({ t: "hr" });
      i += 1;
      continue;
    }
    if (isTableStart(lines, i)) {
      const head = splitRow(line);
      const align: Align[] = splitRow(lines[i + 1]).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : c.startsWith(":") ? "left" : null));
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        const cells = splitRow(lines[i]);
        rows.push(head.map((_, k) => parseInline(cells[k] ?? "", options)));
        i += 1;
      }
      blocks.push({ t: "table", align, head: head.map((h) => parseInline(h, options)), rows });
      continue;
    }
    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        body.push(QUOTE.exec(lines[i])![1]);
        i += 1;
      }
      blocks.push({ t: "quote", c: parseBlocks(body, options) });
      continue;
    }
    if (LIST_ITEM.test(line)) {
      const { block, next } = parseList(lines, i, options);
      blocks.push(block);
      i = next;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && (para.length === 0 || !startsBlock(lines, i))) {
      para.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ t: "p", c: parseInline(para.join("\n"), options) });
  }
  return blocks;
}

/** Markdown text → blocks. Safe on partial input (a streaming answer): an open fence runs to the end. */
export function parseMarkdown(source: string, options: MarkdownOptions = {}): Block[] {
  const text = (source.length > MAX_SOURCE ? source.slice(0, MAX_SOURCE) + "…" : source).replace(/\r\n?/g, "\n");
  return parseBlocks(text.split("\n"), options);
}

/** The plain text of inlines (for copy, titles and tests). */
export function inlineText(nodes: Inline[]): string {
  return nodes.map((n) => (n.t === "text" || n.t === "code" ? n.v : n.t === "br" ? "\n" : inlineText(n.c))).join("");
}
