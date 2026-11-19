import assert from "node:assert/strict";
import { renderMarkdown, validateMessage } from "telegram-md-entities";
import { formatTelegramMessage } from "../src/telegramFormat.ts";

const code = `def example():\n${Array.from({ length: 250 }, (_, index) => `    print("line ${index}")  `).join("\n")}`;
const markdown = `Before **code**\n\n\`\`\`python\n${code}\n\`\`\`\n\nAfter [code](https://example.com)`;
const chunks = formatTelegramMessage(markdown);
const blocks = chunks.filter((chunk) => chunk.entities.some((entity) => entity.type === "pre"));
assert.ok(blocks.length >= 2);
assert.equal(blocks.map((chunk) => chunk.text).join(""), code);
assert.ok(blocks.slice(1).every((chunk) => chunk.text.startsWith("    print")));
assert.ok(blocks.every((chunk) => chunk.entities[0].language === "python"));
assert.ok(chunks[0].entities.some((entity) => entity.type === "bold"));
assert.ok(chunks.at(-1)!.entities.some((entity) => entity.type === "text_link"));

for (const source of [
  markdown,
  `\`\`\`text\n${"x".repeat(3999)}😀${"y".repeat(4100)}\n\`\`\``,
  `\`\`\`python\nstart\n${"\n".repeat(25)}\t    end\n\`\`\``,
  `**${"x".repeat(3999)}😀end**`,
  Array.from({ length: 120 }, (_, index) => `**x${index}**`).join(" "),
]) {
  const messages = formatTelegramMessage(source);
  assert.ok(messages.every((chunk) => chunk.text.length <= 4000 && validateMessage(chunk).length === 0));
  if (source.startsWith("```")) assert.equal(messages.map((chunk) => chunk.text).join(""), renderMarkdown(source).text);
}
console.log("Telegram format checks passed");
