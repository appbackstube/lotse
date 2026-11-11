import assert from "node:assert/strict";
import { applyChatEvent, carryReviewChat, finalizePlanOutput, persistedChatEntries } from "../src/chatTimeline.ts";
import type { ChatMessage, ReviewSession } from "../src/types.ts";

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
