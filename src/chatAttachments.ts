import type { ChatAttachment } from "./types.ts";

export function isChatUpload(attachment: ChatAttachment): attachment is Extract<ChatAttachment, { kind: "image" | "localFile" }> {
  return attachment.kind === "image" || attachment.kind === "localFile";
}
