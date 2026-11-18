export const conversationVoiceKey = "chaoticreview.conversation-voice";
export const conversationVoices = ["marin", "cedar"] as const;
export type ConversationVoice = typeof conversationVoices[number];

export function conversationVoice(value: string | null): ConversationVoice {
  return conversationVoices.find(voice => voice === value) ?? "marin";
}
