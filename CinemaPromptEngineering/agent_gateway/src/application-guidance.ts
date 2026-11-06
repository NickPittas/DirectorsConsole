import { readFileSync, statSync } from "node:fs";
import { PiGatewayError } from "./contracts.js";

export function readApplicationGuidance(): string[] {
  try {
    return [
      ["comfy-application/SKILL.md", new URL("../../agent_resources/skills/comfy-application/SKILL.md", import.meta.url)],
      ["comfy-application/references/application-tools.md", new URL("../../agent_resources/skills/comfy-application/references/application-tools.md", import.meta.url)],
    ].map(([id, url]) => {
      const file = statSync(url);
      if (!file.isFile() || file.size > 32 * 1024) throw new Error();
      const bytes = readFileSync(url);
      if (bytes.byteLength > 32 * 1024) throw new Error();
      const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (!content.trim()) throw new Error();
      return `Reviewed prompt/skill context (${id}):\n${content}`;
    });
  } catch {
    throw new PiGatewayError("invalid_reviewed_context", "Reviewed context needs a short stable ID and non-empty text content.");
  }
}
