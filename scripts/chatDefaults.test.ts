import assert from "node:assert/strict";
import { chatConfigurationError, chatModelLabel, modelEfforts, normalizeChatDefaults, normalizeChatModelFavorites, validChatModel } from "../src/chatDefaults.ts";

assert.deepEqual(normalizeChatDefaults({
  default: { model: "gpt-5.6-sol", effort: "high" },
  plan: { model: "invalid model", effort: "unknown" },
}), {
  default: { model: "gpt-5.6-sol", effort: "high" },
  plan: { model: "gpt-5.6-terra", effort: "medium" },
});

const discovered = "new-codex-model";
assert.equal(normalizeChatDefaults({ plan: { model: discovered, effort: "high" } }).plan.model, discovered);
assert.equal(chatModelLabel(discovered, [{ model: discovered, displayName: "New Codex Model" }]), "New Codex Model");
assert.equal(chatModelLabel(discovered, []), discovered);
for (const model of [null, 42, "", "invalid model", "x".repeat(101)]) assert.equal(validChatModel(model), false);
assert.equal(validChatModel("~openai/gpt-sol-latest"), true);
const models = [{ model: "model-a", displayName: "Model A", supportedReasoningEfforts: [{ reasoningEffort: "low" }, { reasoningEffort: "high" }] }];
assert.deepEqual(modelEfforts("model-a", models), ["low", "high"]);
assert.equal(chatConfigurationError("model-a", "high", models, true), null);
assert.match(chatConfigurationError("model-a", "medium", models, true)!, /not supported/);
assert.match(chatConfigurationError("missing", "high", models, true)!, /unavailable/);
assert.match(chatConfigurationError("model-a", "high", [], false)!, /not available yet/);
for (const efforts of [undefined, []]) {
  const unknown = [{ model: "unknown", displayName: "Unknown", supportedReasoningEfforts: efforts }];
  assert.deepEqual(modelEfforts("unknown", unknown), ["low", "medium", "high", "xhigh"]);
  assert.equal(chatConfigurationError("unknown", "high", unknown, true), null);
}
assert.deepEqual(normalizeChatModelFavorites(["gpt-6-luna", "gpt-6-luna", "bad model", 42, "~openai/other"]), ["gpt-6-luna", "~openai/other"]);
assert.deepEqual(normalizeChatModelFavorites({ model: "gpt-6-luna" }), []);
