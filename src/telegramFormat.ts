import { normalizeEntities, renderMarkdown, splitMessage, type RenderedMessage } from "telegram-md-entities";

const MAX_LENGTH = 4000;

function renderTelegramMarkdown(markdown: string): RenderedMessage {
  const options = { underline: false, spoiler: false };
  const rendered = renderMarkdown(markdown, options);
  if (!rendered.entities.some((entity) => entity.type === "pre" && (entity.offset === 0 || entity.offset + entity.length === rendered.text.length))) return rendered;

  const wrapped = renderMarkdown(`X\n\n${markdown}\n\nX`, options);
  if (!wrapped.text.startsWith("X\n\n") || !wrapped.text.endsWith("\n\nX")) return rendered;
  const text = wrapped.text.slice(3, -3);
  const entities = wrapped.entities.flatMap((entity) => {
    const start = Math.max(3, entity.offset);
    const end = Math.min(wrapped.text.length - 3, entity.offset + entity.length);
    return end > start ? [{ ...entity, offset: start - 3, length: end - start }] : [];
  });
  const leading = text.length - text.trimStart().length;
  const trailing = text.trimEnd().length;
  const trimmedEntities = normalizeEntities(entities.flatMap((entity) => {
    const start = Math.max(leading, entity.offset);
    const end = Math.min(trailing, entity.offset + entity.length);
    return end > start ? [{ ...entity, offset: start - leading, length: end - start }] : [];
  }));
  if (text.trim() !== rendered.text || JSON.stringify(trimmedEntities) !== JSON.stringify(rendered.entities)) return rendered;

  const start = entities.some((entity) => entity.type === "pre" && entity.offset === 0) ? 0 : leading;
  const end = entities.some((entity) => entity.type === "pre" && entity.offset + entity.length === text.length) ? text.length : trailing;
  return {
    text: text.slice(start, end),
    entities: entities.flatMap((entity) => {
      const entityStart = Math.max(start, entity.offset);
      const entityEnd = Math.min(end, entity.offset + entity.length);
      return entityEnd > entityStart ? [{ ...entity, offset: entityStart - start, length: entityEnd - entityStart }] : [];
    }),
  };
}

export function formatTelegramMessage(markdown: string) {
  const rendered = renderTelegramMarkdown(markdown);
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
