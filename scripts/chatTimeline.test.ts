import assert from "node:assert/strict";
import { applyChatEvent, AssistantSteerBoundary, carryReviewChat, finalizePlanOutput, persistedChatEntries } from "../src/chatTimeline.ts";
import type { AiChatEvent, ChatMessage, ReviewSession } from "../src/types.ts";
import { insertComposerTranscript } from "../src/composerTranscript.ts";

assert.deepEqual(insertComposerTranscript("Hello world", "brave ", 6, 6), { text: "Hello brave world", cursor: 12 });
assert.deepEqual(insertComposerTranscript("Hello world", "there", 6, 11), { text: "Hello there", cursor: 11 });
assert.deepEqual(insertComposerTranscript("", "Hello", 0, 0), { text: "Hello", cursor: 5 });
assert.deepEqual(insertComposerTranscript("short", "!", 20, 20), { text: "short!", cursor: 6 });
assert.deepEqual(insertComposerTranscript("Please", "check this.", 6, 6), { text: "Please check this.", cursor: 18 });
assert.deepEqual(insertComposerTranscript("ÄpfelBirnen", "und", 5, 5), { text: "Äpfel und Birnen", cursor: 9 });
assert.deepEqual(insertComposerTranscript("Hello!", "there", 5, 5), { text: "Hello there!", cursor: 11 });
assert.deepEqual(insertComposerTranscript("Hello\n", "there", 6, 6), { text: "Hello\nthere", cursor: 11 });

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
boundary.markSteered(liveTimeline);
liveTimeline = [];
receive(delta(" and second part"));
const afterSecondSteer = [...beforeFirstSteer, ...persistedChatEntries([...liveTimeline, attachmentOnlySteer])];
boundary.markSteered(liveTimeline);
liveTimeline = [];
receive(complete("First part and second part and last part"));
assert.equal(boundary.getSteeredResponse("default"), "First part and second part and last part");
receive(start);
assert.equal(boundary.getSteeredResponse("default"), "First part and second part and last part");
receive(complete("First part of a new message"));
assert.equal(boundary.getSteeredResponse("default"), "First part of a new message");
const savedHistory: ChatMessage[] = JSON.parse(JSON.stringify([...afterSecondSteer, ...persistedChatEntries(liveTimeline)]));
assert.deepEqual(savedHistory.map(({ role, body }) => [role, body]), [
  ["assistant", "First part"], ["user", "Follow-up"], ["assistant", " and second part"],
  ["user", ""], ["assistant", "and last part"], ["assistant", "First part of a new message"],
]);
assert.deepEqual(savedHistory[3].attachments, attachmentOnlySteer.attachments);

receive(start);
receive(delta("Already shown"));
boundary.markSteered(liveTimeline);
liveTimeline = [];
receive(complete("Already shown"));
assert.deepEqual(liveTimeline, []);

receive(start);
receive(delta("Already shown"));
const savedBeforeRetraction = persistedChatEntries([...liveTimeline, steer]);
boundary.markSteered(liveTimeline);
liveTimeline = [];
receive(delta(" draft continuation"));
const retainedChange = { path: "README.md", kind: "update" } as const;
receive({ ...eventIds, kind: "fileChanged", changes: [retainedChange] });
receive(delta(" more draft continuation"));
receive(complete("Already shown"));
assert.deepEqual(liveTimeline.map(({ body, appliedDiffs }) => [body, appliedDiffs]), [["", [retainedChange]]]);
assert.deepEqual(persistedChatEntries([...savedBeforeRetraction, ...liveTimeline]).map(({ body }) => body), ["Already shown", steer.body, ""]);
assert.equal(boundary.getSteeredResponse("default"), "Already shown");

receive(start);
liveTimeline = [];
receive(delta("Saved prefix"));
boundary.markSteered(liveTimeline);
liveTimeline = [];
receive(delta(" draft suffix"));
receive(complete("Saved prefix final suffix"));
assert.deepEqual(liveTimeline.map(({ body }) => body), ["final suffix"]);

for (const streamedSuffix of ["", " streamed suffix"]) {
  receive(start);
  liveTimeline = [];
  receive(delta("Original wording"));
  const savedPrefix = persistedChatEntries([...liveTimeline, steer]);
  boundary.markSteered(liveTimeline);
  liveTimeline = [];
  if (streamedSuffix) receive(delta(streamedSuffix));
  receive(complete("Revised wording and suffix"));
  const savedResponse = persistedChatEntries([...savedPrefix, ...liveTimeline]);
  assert.deepEqual(savedResponse.map(({ role, body }) => [role, body]), [
    ["assistant", "Original wording"], ["user", "Follow-up"], ["assistant", "Revised wording and suffix"],
  ]);
}

const plan = finalizePlanOutput([entry("<proposed_plan>\n## Plan\n\nShip it.\n</proposed_plan>")]);
assert.equal(plan.isPlan, true);
assert.equal(plan.timeline[0].body, "## Plan\n\nShip it.");
assert.equal(plan.timeline[0].plan, true);
assert.equal(plan.timeline[0].canImplementPlan, true);

const fullPlan = "<proposed_plan>\nFirst step.\nSecond step.\n</proposed_plan>";
for (const [prefix, expectedBody] of [
  ["<proposed", "First step.\nSecond step."],
  ["<proposed_plan>\nFirst step.", "Second step."],
  ["<proposed_plan>\nDraft step.", "First step.\nSecond step."],
  [fullPlan, "See the plan above."],
]) {
  receive(start);
  liveTimeline = [];
  receive(delta(prefix));
  const savedPrefix = persistedChatEntries([...liveTimeline, steer]);
  boundary.markSteered(liveTimeline);
  liveTimeline = [];
  if (prefix === fullPlan) receive(delta("Draft following the plan."));
  receive(complete(fullPlan));
  assert.equal(boundary.getSteeredResponse("plan"), "First step.\nSecond step.");
  const finalized = finalizePlanOutput(liveTimeline, boundary.steeredPlan);
  assert.equal(finalized.isPlan, true);
  assert.deepEqual([...savedPrefix, ...persistedChatEntries(finalized.timeline)].map(({ body }) => body), [prefix, steer.body, expectedBody]);
  assert.equal(finalized.timeline[0].canImplementPlan, true);
}

receive(start);
receive(complete("A later assistant message"));
assert.equal(finalizePlanOutput(liveTimeline, boundary.steeredPlan).isPlan, false);

receive(start);
liveTimeline = [];
receive(delta(fullPlan));
receive(complete(fullPlan));
const savedPlanId = liveTimeline[0].id;
boundary.markSteered(liveTimeline);
liveTimeline = [];
boundary.markSteered(liveTimeline);
const finalizedSavedPlan = finalizePlanOutput(liveTimeline, boundary.steeredPlan);
assert.equal(finalizedSavedPlan.isPlan, true);
assert.deepEqual(finalizedSavedPlan.timeline, []);
assert.equal(finalizedSavedPlan.savedPlan?.id, savedPlanId);
assert.equal(finalizedSavedPlan.savedPlan?.body, "First step.\nSecond step.");
assert.equal(finalizedSavedPlan.savedPlan?.canImplementPlan, true);
assert.equal(boundary.getSteeredResponse("plan"), "First step.\nSecond step.");

receive(start);
receive(complete("A later assistant message"));
assert.equal(finalizePlanOutput(liveTimeline, boundary.steeredPlan).isPlan, false);

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
