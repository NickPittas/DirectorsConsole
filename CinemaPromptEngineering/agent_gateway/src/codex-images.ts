import { randomUUID } from "node:crypto";
import { open, realpath, stat, unlink, type FileHandle } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import type { PiImageInput } from "./contracts.js";

const maxImageBytes = 6 * 1024 * 1024;
const maxTotalBytes = 8 * 1024 * 1024;
const maxBase64Length = Math.ceil(maxImageBytes / 3) * 4 + 4;
const invalidImage = () => new Error("Invalid Codex image input.");

function assertNotAborted(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}

async function wait<T>(operation: () => Promise<T>, signal?: AbortSignal, onResolve?: (value: T) => void): Promise<T> {
  assertNotAborted(signal);
  try {
    const value = await operation();
    onResolve?.(value);
    return value;
  } finally {
    assertNotAborted(signal);
  }
}

async function waitForCleanup<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  try { assertNotAborted(signal); } catch { /* Cleanup must finish after abort. */ }
  try {
    return await operation();
  } finally {
    try { assertNotAborted(signal); } catch { /* Cleanup must finish after abort. */ }
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export async function stageCodexImages(
  cwd: string,
  images: readonly PiImageInput[] | undefined,
  signal?: AbortSignal,
): Promise<{ input: Array<{ type: "localImage"; path: string }>; dispose: () => Promise<void> }> {
  const staged: Array<{ type: "localImage"; path: string }> = [];
  const owned: string[] = [];
  let cleanupPromise: Promise<void> | undefined;
  const dispose = (): Promise<void> => cleanupPromise ??= (async () => {
    let failed = false;
    for (const name of owned) {
      try { await waitForCleanup(() => unlink(name), signal); }
      catch (error) { if (!isMissing(error)) failed = true; }
    }
    if (failed) throw new Error("Could not clean up staged Codex images.");
  })();

  try {
    assertNotAborted(signal);
    if (images !== undefined && !Array.isArray(images)) throw invalidImage();
    if ((images?.length ?? 0) > 4) throw invalidImage();
    const decoded: Array<{ bytes: Buffer; ext: string }> = [];
    let total = 0;
    for (const image of images ?? []) {
      if (!image || typeof image !== "object" || typeof image.data !== "string" || !image.data.length ||
          image.data.length > maxBase64Length) throw invalidImage();
      const ext = image.mimeType === "image/jpeg" ? "jpg" : image.mimeType === "image/png" ? "png" : image.mimeType === "image/webp" ? "webp" : "";
      if (!ext) throw invalidImage();
      const bytes = Buffer.from(image.data, "base64");
      if (!bytes.length || bytes.length > maxImageBytes || bytes.toString("base64") !== image.data) throw invalidImage();
      const validMagic = ext === "jpg" ? bytes.length >= 3 && bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
        : ext === "png" ? bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        : bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
      total += bytes.length;
      if (!validMagic || total > maxTotalBytes) throw invalidImage();
      decoded.push({ bytes, ext });
    }

    if (typeof cwd !== "string" || !cwd || cwd.includes("\0") || cwd.length > 2048 || !isAbsolute(cwd) || resolve(cwd) !== cwd) {
      throw new Error("Invalid staging directory.");
    }
    if (await wait(() => realpath(cwd), signal) !== cwd || !(await wait(() => stat(cwd), signal)).isDirectory()) {
      throw new Error("Invalid staging directory.");
    }

    for (const { bytes, ext } of decoded) {
      assertNotAborted(signal);
      const path = join(cwd, `codex-media-${randomUUID()}.${ext}`);
      let handle: FileHandle | undefined;
      try {
        await wait(() => open(path, "wx", 0o600), signal, (opened) => { owned.push(path); handle = opened; });
        await wait(() => handle!.writeFile(bytes, { signal }), signal);
      } finally {
        if (handle) await waitForCleanup(() => handle!.close(), signal);
      }
      staged.push({ type: "localImage", path });
    }
    return { input: staged, dispose };
  } catch {
    try { await waitForCleanup(() => dispose(), signal); }
    catch { throw new Error("Could not clean up staged Codex images."); }
    throw new Error(signal?.aborted ? "Codex image staging was aborted." : "Could not stage Codex images.");
  }
}
