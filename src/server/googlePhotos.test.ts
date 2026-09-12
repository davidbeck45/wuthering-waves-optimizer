// Wuthering Tools+: the Google Photos album handlers (api/_lib/googlePhotos.ts) with a fake fetch.
import { describe, expect, it } from "vitest";
import {
  albumIdFromUrl,
  fetchAlbum,
  handleAlbumRequest,
  handleImageRequest,
  isAlbumUrl,
  parseAlbumPage,
  photoUrl,
} from "../../api/_lib/googlePhotos";

const ID_A = "AP1GczNQSdgqCqK92N_6a03vQTUcX9iAI-aaaaaaaaaaaa";
const ID_B = "AP1GczNQSdgqCqK92N_6a03vQTUcX9iAI-bbbbbbbbbbbb";
const PAGE = `<html><script>["https://lh3.googleusercontent.com/pw/${ID_A}",1],["https://lh3.googleusercontent.com/pw/${ID_B}=w1200",2],"https://lh3.googleusercontent.com/pw/${ID_A}=d"</script></html>`;

function fakeResponse(init: { ok?: boolean; status?: number; url?: string; text?: string; body?: unknown; headers?: Record<string, string> }): Response {
  const headers = new Headers(init.headers ?? {});
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    url: init.url ?? "",
    headers,
    text: async () => init.text ?? "",
    body: init.body ?? null,
  } as unknown as Response;
}

class FakeRes {
  statusCode = 0;
  headers: Record<string, string> = {};
  body = "";
  setHeader(name: string, value: string | number): void {
    this.headers[name] = String(value);
  }
  end(chunk?: string): void {
    this.body = chunk ?? "";
  }
}
const asRes = (r: FakeRes): Parameters<typeof handleAlbumRequest>[1] => r as unknown as Parameters<typeof handleAlbumRequest>[1];
const req = (url: string): Parameters<typeof handleAlbumRequest>[0] => ({ url }) as unknown as Parameters<typeof handleAlbumRequest>[0];

describe("google photos album import: parsing", () => {
  it("accepts only Google Photos share links", () => {
    expect(isAlbumUrl("https://photos.app.goo.gl/WdNUs8kzVeFXBLRp6")).toBe(true);
    expect(isAlbumUrl("https://photos.google.com/share/AF1Qip?key=abc")).toBe(true);
    expect(isAlbumUrl("http://photos.app.goo.gl/x")).toBe(false);
    expect(isAlbumUrl("https://example.com/photos.app.goo.gl")).toBe(false);
    expect(isAlbumUrl("not a url")).toBe(false);
  });

  it("lists every photo once, in album order, and builds original-size urls", () => {
    expect(parseAlbumPage(PAGE)).toEqual([ID_A, ID_B]);
    expect(photoUrl(ID_A)).toBe(`https://lh3.googleusercontent.com/pw/${ID_A}=d`);
    expect(albumIdFromUrl("https://photos.google.com/share/AF1QipP4FTuV-abc_123?key=djRi")).toBe("AF1QipP4FTuV-abc_123");
    expect(albumIdFromUrl("https://photos.app.goo.gl/WdNUs8kzVeFXBLRp6")).toBeNull();
  });

  it("follows the short link and reports the share id", async () => {
    const fetchImpl = (async () => fakeResponse({ url: "https://photos.google.com/share/AF1QipTest?key=k", text: PAGE })) as unknown as typeof fetch;
    const album = await fetchAlbum("https://photos.app.goo.gl/WdNUs8kzVeFXBLRp6", fetchImpl);
    expect(album.albumId).toBe("AF1QipTest");
    expect(album.photos.map((p) => p.id)).toEqual([ID_A, ID_B]);
  });
});

describe("google photos album import: handlers", () => {
  it("answers the album request with json and rejects other hosts", async () => {
    const fetchImpl = (async () => fakeResponse({ url: "https://photos.google.com/share/AF1QipTest?key=k", text: PAGE })) as unknown as typeof fetch;
    const ok = new FakeRes();
    await handleAlbumRequest(req("/api/photos-album?url=" + encodeURIComponent("https://photos.app.goo.gl/WdNUs8kzVeFXBLRp6")), asRes(ok), fetchImpl);
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(ok.body).photos).toHaveLength(2);
    const bad = new FakeRes();
    await handleAlbumRequest(req("/api/photos-album?url=" + encodeURIComponent("https://evil.example/x")), asRes(bad), fetchImpl);
    expect(bad.statusCode).toBe(400);
    const missing = new FakeRes();
    await handleAlbumRequest(req("/api/photos-album"), asRes(missing), fetchImpl);
    expect(missing.statusCode).toBe(400);
  });

  it("proxies only well-formed photo ids and reports upstream failures", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      return fakeResponse({ ok: false, status: 404 });
    }) as unknown as typeof fetch;
    const bad = new FakeRes();
    await handleImageRequest(req("/api/photos-image?id=../etc/passwd"), asRes(bad), fetchImpl);
    expect(bad.statusCode).toBe(400);
    expect(calls).toEqual([]);
    const gone = new FakeRes();
    await handleImageRequest(req(`/api/photos-image?id=${ID_A}`), asRes(gone), fetchImpl);
    expect(gone.statusCode).toBe(502);
    expect(calls).toEqual([photoUrl(ID_A)]);
  });
});
