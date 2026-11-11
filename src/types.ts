export type RepositoryInfo = {
  rootPath: string;
  name: string;
  currentBranch: string | null;
  hasOrigin: boolean;
};
export type OpenRepositoryResult =
  | { status: "opened"; repository: RepositoryInfo; focusedExisting: boolean }
  | { status: "setupNeeded"; reason: "notRepository" | "noCommits" };

export type ChangedFile = {
  oldPath: string | null;
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  snapshotId: string;
  additions: number | null;
  deletions: number | null;
  binary: boolean;
};

export type Comparison = {
  mode: "workingCopy" | "branch";
  baseRef: string | null;
  compareRef: string | null;
  baseOid: string;
  baseCommitOid: string;
  compareCommitOid: string;
  snapshotId: string;
  files: ChangedFile[];
};
export type BranchRefs = { refs: string[]; remoteRefs: string[]; defaultBase: string | null; pullCount: number | null; pushCount: number | null };
export type TaskGitStatus = {
  repository: RepositoryInfo;
  upstream: string | null;
  pullCount: number | null;
  pushCount: number | null;
  dirty: boolean;
};

export type DiffCell = { lineNumber: number; text: string };
export type DiffRow = {
  kind: "context" | "added" | "removed" | "changed";
  old: DiffCell | null;
  new: DiffCell | null;
};
export type FileDiff = {
  oldPath: string | null;
  path: string;
  hunks: { header: string; rows: DiffRow[] }[];
};

export type CommentSide = "base" | "compare";
export type SelectedLine = {
  lineNumber: number;
  text: string;
};
export type CodeSelection = {
  filePath: string;
  side: CommentSide;
  lines: SelectedLine[];
};
export type ChatContextMode = "auto" | "diff" | "fileDiff" | "lines" | "manual";
export type ChatContextItem =
  | { kind: "fileDiff"; path: string }
  | { kind: "file"; path: string }
  | { kind: "lines"; selection: CodeSelection };
export type ChatContext = {
  scope: ChatContextMode;
  items: ChatContextItem[];
};
export type ChatContextDraftItem = ChatContextItem & { id: string };
export type ChatAttachment =
  | { kind: "reviewDiff" }
  | { kind: "file"; path: string }
  | { kind: "folder"; path: string }
  | { kind: "selectedLines"; selection: CodeSelection }
  | { kind: "reviewComments" }
  | { kind: "reviewComment"; commentId: string }
  | { kind: "image"; path: string; name: string }
  | { kind: "taskAsset"; id: string; name: string; image: boolean };
export type TaskAsset = { id: string; name: string; image: boolean };
export type TaskComment = { id: string; author: "user" | "agent"; body: string; createdAt: number };
export type ChatRequestContext = { mode: "auto"; attachments: ChatAttachment[] };
export type FindingStatus = "open" | "accepted" | "dismissed" | "outdated";
export type ReviewComment = {
  id: string; filePath: string; side: CommentSide; lineNumber: number; code: string;
  body: string; replies: { id: string; body: string; source: "user" | "agent" }[]; source: "user" | "ai" | "agent";
  status: FindingStatus; severity: "info" | "warning" | "error" | null;
  title: string | null; suggestion: string | null; rule: string | null;
  patch: string | null; snapshotId: string | null;
};
export type CommentAnchor = Pick<ReviewComment, "filePath" | "side" | "lineNumber" | "code">;
export type ReviewSession = {
  repoPath: string;
  baseOid: string;
  mode: "workingCopy" | "branch";
  baseRef: string | null;
  compareRef: string | null;
  compareCommitOid: string | null;
  approvedFiles: string[];
  approvedFileSnapshots: Record<string, string>;
  approvedSnapshotId: string | null;
  chatMessages: ChatMessage[];
  agentThreadId: string | null;
  chatAgent?: import("./agents").ChatAgent | null;
  comments: ReviewComment[];
};
export type ReviewContextUse = {
  kind: "search" | "read";
  backend: "ripgrep" | "git" | "filesystem";
  query: string | null;
  path: string | null;
  startLine: number | null;
  endLine: number | null;
};
export type ChatSuggestion = {
  id: string;
  title: string;
  explanation: string;
  codexPrompt: string;
  status: "ready" | "running" | "completed" | "failed";
  error?: string;
  patch?: ChatPatch;
};
export type PatchOperation =
  | { type: "create_file"; path: string; diff: string }
  | { type: "update_file"; path: string; diff: string }
  | { type: "delete_file"; path: string }
  | { type: "rename_file"; from: string; path: string };
export type ChatPatch = {
  id: string; title: string; explanation: string; patch: string; applied: boolean;
  allowedPaths: string[]; files: { path: string; additions: number; deletions: number }[]; operations: PatchOperation[];
};
export type AppliedDiff = { path: string; kind: string; patch?: string };
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  body: string;
  createdAt: string;
  selection: CodeSelection | null;
  snapshotId: string | null;
  suggestions: ChatSuggestion[];
  contexts: ReviewContextUse[];
  attachments?: ChatAttachment[];
  appliedDiffs?: AppliedDiff[];
  final?: boolean;
  runStatus?: "running" | "completed" | "failed" | "cancelled";
  runError?: string;
  plan?: boolean;
  canImplementPlan?: boolean;
};
export type TaskColor = "clear" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
export type TaskCustomField = { id: string; name: string; type: "text" | "select"; options: { id: string; label: string }[]; showOnCards: boolean; multiline: boolean; hyperlink: boolean };
export type RepositoryTask = {
  github?: import("./github").GitHubLink;
  id: string;
  // UTC Unix milliseconds; null when a legacy timestamp is unknown.
  createdAt: number | null;
  updatedAt: number | null;
  title: string;
  description: string;
  drawing?: string;
  sandboxHtml?: string;
  customFields: Record<string, string>;
  startDate: string | null;
  deadline: string | null;
  parentId: string | null;
  color: TaskColor;
  manualStatus: "inbox" | "inProgress" | "inReview" | null;
  completed: boolean;
  attachments: ChatAttachment[];
  assets: TaskAsset[];
  comments: TaskComment[];
  chatMessages: ChatMessage[];
  agentThreadId: string | null;
  chatAgent?: import("./agents").ChatAgent | null;
  planReady: boolean;
  unreadAgentResult: boolean;
  chatMode: AiChatMode;
  chatModel: string;
  chatEffort: "low" | "medium" | "high" | "xhigh";
  location: "workspace" | "worktree";
  newBranchName?: string;
  worktreeStart: { kind: "workspace" } | { kind: "branch" | "remote"; branch: string } | { kind: "existing"; branch: string; remote?: boolean } | null;
  worktree: { branch: string; baseOid: string; baseBranch: string | null } | null;
  started: boolean;
};
export type TaskChanges = { comparison: Comparison; pendingSnapshotId: string; pendingFiles: boolean; committedChanges: boolean; headOid: string; squashMessage: string };
export type AiChatAccepted = { requestId: string; threadId: string; turnId: string };
export type AiChatMode = "default" | "plan";
export type AiChatPlan = { explanation?: string; plan: { step: string; status: "pending" | "inProgress" | "completed" }[] };
export type AgentUserInput = { requestId: number; threadId: string; turnId: string; itemId: string; isBlocking: boolean; questions: { id: string; header: string; question: string; isOther: boolean; isSecret: boolean; options: { label: string; description: string }[] | null }[] };
export type AiChatEvent = { requestId: string; threadId: string; turnId: string; kind: "assistantMessageStarted" | "assistantDelta" | "assistantMessageCompleted" | "toolStarted" | "toolFinished" | "fileChanged" | "planUpdated" | "modelRerouted" | "status" | "completed" | "cancelled" | "failed"; message?: string; delta?: string; finalText?: string; label?: string; changes?: AppliedDiff[]; explanation?: string; plan?: AiChatPlan["plan"] };
export type AgentApproval = { requestId: number; title: string; description: string; command?: string; source: "agent" | "mcp"; serverName: string | null };
export type AgentTurnEvent =
  | { type: "chat"; payload: AiChatEvent }
  | { type: "approvalRequested"; payload: AgentApproval }
  | { type: "approvalResolved"; payload: { requestId: number } }
  | { type: "userInputRequested"; payload: AgentUserInput }
  | { type: "userInputResolved"; payload: { requestId: number } };
export type AiSettings = {
  activeProvider: string;
  providers: { id: string; name: string; baseUrl: string; envKey: string }[];
  repositoryProviders: Record<string, string>;
  ripgrepAvailable: boolean;
  mcpUrl: string;
};
export type McpServerSettings = {
  name: string;
  kind: "http" | "stdio";
  url: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  bearerTokenEnvVar: string;
  oauthClientId: string;
  oauthCallbackUrl: string;
  oauthScopes: string[];
  oauthClientSecret?: string;
  oauthSecretStored: boolean;
  oauthError?: string;
  enabled: boolean;
};
