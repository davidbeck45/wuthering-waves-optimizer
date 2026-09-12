// Wuthering Tools+ — Vercel function: a shared Google Photos album -> its photo ids (see _lib/googlePhotos.ts).
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleAlbumRequest } from "./_lib/googlePhotos.js";

export default function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return handleAlbumRequest(req, res);
}
