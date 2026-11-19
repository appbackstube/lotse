import { renderMarkdown, splitMessage, type RenderedMessage } from "telegram-md-entities";

const MAX_LENGTH = 4000;

export function formatTelegramMessage(markdown: string) {
  const rendered = renderMarkdown(markdown, { underline: false, spoiler: false });
  const message = rendered.text.trim() ? rendered : { text: markdown, entities: [] };
  const chunks: RenderedMessage[] = [];
  let cursor = 0;
  const appendProse = (end: number) => {
    if (end <= cursor) return;
    const entities = message.entities.flatMap((entity) => {
      const start = Math.max(cursor, entity.offset);
      const stop = Math.min(end, entity.offset + entity.length);
      return stop > start ? [{ ...entity, offset: start - cursor, length: stop - start }] : [];
    });
    chunks.push(...splitMessage({ text: message.text.slice(cursor, end), entities }, { maxLength: MAX_LENGTH }));
  };
  // The library trims chunk edges. Split preformatted blocks separately so
  // continuation lines keep their indentation, blank lines and trailing spaces.
  for (const pre of message.entities.filter((entity) => entity.type === "pre").sort((a, b) => a.offset - b.offset)) {
    appendProse(pre.offset);
    cursor = pre.offset;
    const end = pre.offset + pre.length;
    while (cursor < end) {
      let cut = Math.min(cursor + MAX_LENGTH, end);
      if (cut < end) {
        const newline = message.text.lastIndexOf("\n", cut - 1);
        if (newline >= cursor) cut = newline + 1;
        else if (/[\uD800-\uDBFF]/.test(message.text[cut - 1])) cut -= 1;
      }
      const text = message.text.slice(cursor, cut);
      chunks.push({ text, entities: [{ ...pre, offset: 0, length: text.length }] });
      cursor = cut;
    }
  }
  appendProse(message.text.length);
  return chunks;
}
