// Wuthering Tools+ — Vercel function: one Google Photos photo, same-origin (see _lib/googlePhotos.ts).
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleImageRequest } from "./_lib/googlePhotos.js";

export default function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return handleImageRequest(req, res);
}
