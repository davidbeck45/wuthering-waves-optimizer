// Wuthering Tools+: server side of the Google Photos album import — a Vercel
// function in production (api/photos-album.ts, api/photos-image.ts), the same
// handlers as a Vite middleware in `vite dev`. The browser cannot read a shared
// album on its own: the share page is HTML from another origin and Google's
// image host sends no CORS header, so a canvas could not read the pixels. Both
// pass through here, same-origin. Only Google Photos share links and lh3
// "/pw/" photo ids are accepted — this is not an open proxy.
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

export const ALBUM_HOSTS = new Set(["photos.app.goo.gl", "photos.google.com"]);
/** an lh3 "/pw/" photo id: url-safe base64, long */
export const PHOTO_ID_RE = /^[A-Za-z0-9_-]{20,}$/;
const PHOTO_URL_RE = /https:\/\/lh3\.googleusercontent\.com\/pw\/([A-Za-z0-9_-]+)/g;
const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 WutheringToolsPlus/1.0";

export interface AlbumPhoto {
  id: string;
  url: string;
}
export interface AlbumInfo {
  /** the share id from photos.google.com/share/<id> (stable across the short link and the long one) */
  albumId: string | null;
  resolvedUrl: string;
  photos: AlbumPhoto[];
}

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function isAlbumUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "https:" && ALBUM_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/** the original bytes ("=d") of a photo, the size the phone took it at */
export function photoUrl(id: string): string {
  return `https://lh3.googleusercontent.com/pw/${id}=d`;
}

export function albumIdFromUrl(url: string): string | null {
  const m = /\/share\/([A-Za-z0-9_-]+)/.exec(url);
  return m ? m[1] : null;
}

/** every photo of a share page, in album order, once each */
export function parseAlbumPage(html: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(PHOTO_URL_RE)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    ids.push(m[1]);
  }
  return ids;
}

type FetchLike = typeof fetch;

export async function fetchAlbum(url: string, fetchImpl: FetchLike = fetch): Promise<AlbumInfo> {
  if (!isAlbumUrl(url)) throw new HttpError(400, "Not a Google Photos share link (photos.app.goo.gl or photos.google.com/share)");
  const response = await fetchImpl(url, { redirect: "follow", headers: { "user-agent": USER_AGENT, accept: "text/html" } });
  if (!response.ok) throw new HttpError(502, `Google Photos answered ${response.status}`);
  const html = await response.text();
  const ids = parseAlbumPage(html);
  return {
    albumId: albumIdFromUrl(response.url) ?? albumIdFromUrl(url),
    resolvedUrl: response.url || url,
    photos: ids.map((id) => ({ id, url: photoUrl(id) })),
  };
}

function query(req: IncomingMessage): URLSearchParams {
  return new URL(req.url ?? "/", "http://localhost").searchParams;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

function sendError(res: ServerResponse, error: unknown): void {
  const status = error instanceof HttpError ? error.status : 500;
  sendJson(res, status, { error: error instanceof Error ? error.message : String(error) });
}

/** GET /api/photos-album?url=<share link> -> { albumId, resolvedUrl, photos: [{ id, url }] } */
export async function handleAlbumRequest(req: IncomingMessage, res: ServerResponse, fetchImpl: FetchLike = fetch): Promise<void> {
  try {
    const url = query(req).get("url")?.trim() ?? "";
    if (!url) throw new HttpError(400, "Missing url");
    sendJson(res, 200, await fetchAlbum(url, fetchImpl));
  } catch (error) {
    sendError(res, error);
  }
}

/** GET /api/photos-image?id=<lh3 /pw/ id> -> the original JPEG, same-origin so a canvas can read it */
export async function handleImageRequest(req: IncomingMessage, res: ServerResponse, fetchImpl: FetchLike = fetch): Promise<void> {
  try {
    const id = query(req).get("id") ?? "";
    if (!PHOTO_ID_RE.test(id)) throw new HttpError(400, "Not a Google Photos photo id");
    const upstream = await fetchImpl(photoUrl(id), { headers: { "user-agent": USER_AGENT } });
    if (!upstream.ok || !upstream.body) throw new HttpError(502, `Google Photos answered ${upstream.status}`);
    res.statusCode = 200;
    res.setHeader("content-type", upstream.headers.get("content-type") ?? "image/jpeg");
    res.setHeader("cache-control", "private, max-age=3600");
    const length = upstream.headers.get("content-length");
    if (length) res.setHeader("content-length", length);
    Readable.fromWeb(upstream.body as unknown as NodeReadableStream).pipe(res);
  } catch (error) {
    sendError(res, error);
  }
}
