import { renderMarkdown, splitMessage } from "telegram-md-entities";

export function formatTelegramMessage(markdown: string) {
  const rendered = renderMarkdown(markdown, { underline: false, spoiler: false });
  return splitMessage(rendered.text.trim() ? rendered : { text: markdown, entities: [] }, { maxLength: 4000 });
}
