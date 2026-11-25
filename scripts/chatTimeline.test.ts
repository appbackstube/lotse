import assert from "node:assert/strict";
import { applyChatEvent, AssistantSteerBoundary, carryReviewChat, finalizePlanOutput, persistedChatEntries } from "../src/chatTimeline.ts";
import type { AiChatEvent, ChatMessage, ReviewSession } from "../src/types.ts";

const entry = (body: string, appliedDiffs?: ChatMessage["appliedDiffs"]): ChatMessage => ({
  id: body || "diff",
  role: "assistant",
  body,
  createdAt: "2026-09-10T00:00:00.000Z",
  selection: null,
  snapshotId: null,
  suggestions: [],
  contexts: [],
  appliedDiffs,
});

assert.deepEqual(persistedChatEntries([entry(""), entry("partial response"), entry("", [{ path: "src/App.tsx", kind: "update" }])]), [
  entry("partial response"),
  entry("", [{ path: "src/App.tsx", kind: "update" }]),
]);

const streamed = applyChatEvent(
  applyChatEvent([], { requestId: "r", threadId: "t", turnId: "1", kind: "assistantDelta", delta: "draft" }),
  { requestId: "r", threadId: "t", turnId: "1", kind: "assistantMessageCompleted", finalText: "final" },
);
assert.equal(streamed.length, 1);
assert.equal(streamed[0].body, "final");

const twoMessages = applyChatEvent(
  applyChatEvent(streamed, { requestId: "r", threadId: "t", turnId: "1", kind: "assistantMessageStarted" }),
  { requestId: "r", threadId: "t", turnId: "1", kind: "assistantMessageCompleted", finalText: "second" },
);
assert.deepEqual(twoMessages.map(({ body }) => body), ["final", "second"]);

const steer = { ...entry("Follow-up"), id: "steer", role: "user" as const };
const afterSteer = applyChatEvent([...twoMessages, steer], { requestId: "r", threadId: "t", turnId: "1", kind: "assistantDelta", delta: "Later response" });
assert.deepEqual(persistedChatEntries(afterSteer).map(({ role, body }) => [role, body]), [
  ["assistant", "final"], ["assistant", "second"], ["user", "Follow-up"], ["assistant", "Later response"],
]);
assert.deepEqual(persistedChatEntries(JSON.parse(JSON.stringify(afterSteer))).map(({ body }) => body), ["final", "second", "Follow-up", "Later response"]);

const attachmentOnlySteer: ChatMessage = { ...steer, id: "attachment-steer", body: "", attachments: [{ kind: "taskAsset", id: "asset", name: "image.png", image: true }] };

const eventIds = { requestId: "r", threadId: "t", turnId: "1" };
const start = { ...eventIds, kind: "assistantMessageStarted" } as const;
const delta = (text: string): AiChatEvent => ({ ...eventIds, kind: "assistantDelta", delta: text });
const complete = (text: string): AiChatEvent => ({ ...eventIds, kind: "assistantMessageCompleted", finalText: text });
const boundary = new AssistantSteerBoundary();
let liveTimeline: ChatMessage[] = [];
const receive = (event: AiChatEvent) => { liveTimeline = applyChatEvent(liveTimeline, boundary.update(event)); };
receive(start);
receive(delta("First part"));
const beforeFirstSteer = persistedChatEntries([...liveTimeline, steer]);
boundary.markSteered();
liveTimeline = [];
receive(delta(" and second part"));
const afterSecondSteer = [...beforeFirstSteer, ...persistedChatEntries([...liveTimeline, attachmentOnlySteer])];
boundary.markSteered();
liveTimeline = [];
receive(complete("First part and second part and last part"));
receive(start);
receive(complete("First part of a new message"));
const savedHistory: ChatMessage[] = JSON.parse(JSON.stringify([...afterSecondSteer, ...persistedChatEntries(liveTimeline)]));
assert.deepEqual(savedHistory.map(({ role, body }) => [role, body]), [
  ["assistant", "First part"], ["user", "Follow-up"], ["assistant", " and second part"],
  ["user", ""], ["assistant", "and last part"], ["assistant", "First part of a new message"],
]);
assert.deepEqual(savedHistory[3].attachments, attachmentOnlySteer.attachments);

receive(start);
receive(delta("Already shown"));
boundary.markSteered();
liveTimeline = [];
receive(complete("Already shown"));
assert.deepEqual(liveTimeline, []);

receive(start);
receive(delta("Saved prefix"));
boundary.markSteered();
liveTimeline = [];
receive(delta(" draft suffix"));
receive(complete("Saved prefix final suffix"));
assert.deepEqual(liveTimeline.map(({ body }) => body), ["final suffix"]);

receive(start);
receive(delta("Original wording"));
boundary.markSteered();
liveTimeline = [];
receive(delta(" streamed suffix"));
receive(complete("Revised wording and suffix"));
assert.deepEqual(liveTimeline.map(({ body }) => body), [" streamed suffix"]);

const plan = finalizePlanOutput([entry("<proposed_plan>\n## Plan\n\nShip it.\n</proposed_plan>")]);
assert.equal(plan.isPlan, true);
assert.equal(plan.timeline[0].body, "## Plan\n\nShip it.");
assert.equal(plan.timeline[0].plan, true);
assert.equal(plan.timeline[0].canImplementPlan, true);

for (const body of ["A normal response", "Before <proposed_plan>Plan</proposed_plan>", "<proposed_plan>Plan"]) {
  const result = finalizePlanOutput([entry(body)]);
  assert.equal(result.isPlan, false);
  assert.equal(result.timeline[0].body, body);
  assert.equal(result.timeline[0].plan, undefined);
}

const review: ReviewSession = { repoPath: "/repo", baseOid: "old", mode: "workingCopy", baseRef: null, compareRef: null, compareCommitOid: null, comments: [], chatMessages: [entry("Keep this conversation")], agentThreadId: "thread", approvedFiles: [], approvedFileSnapshots: {}, approvedSnapshotId: null };
const nextReview: ReviewSession = { ...review, baseOid: "new", chatMessages: [], agentThreadId: null };
assert.deepEqual(carryReviewChat(review, nextReview).chatMessages, review.chatMessages);
assert.equal(carryReviewChat(review, nextReview).agentThreadId, "thread");
const otherRepository = { ...nextReview, repoPath: "/other" };
assert.equal(carryReviewChat(review, otherRepository), otherRepository);
const sameCommit = { ...nextReview, baseOid: "old" };
assert.equal(carryReviewChat(review, sameCommit), sameCommit);
const branchReview = { ...nextReview, mode: "branch" as const };
assert.equal(carryReviewChat(review, branchReview), branchReview);
