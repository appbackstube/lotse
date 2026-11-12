import { isChatUpload } from "./chatAttachments";
import {
  Children,
  Fragment,
  isValidElement,
  memo,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type ComponentProps,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal, flushSync } from "react-dom";
import { useTaskFieldDraft } from "./useTaskFieldDraft";
import { readTaskDrawing } from "./taskDrawing";
import { applyTaskSandboxUpdate } from "./taskSandbox";
import { WebsiteCredentialsSettings } from "./components/WebsiteCredentialsSettings";
import { SettingsLayout, type SettingsPage } from "./components/SettingsLayout";
import { TaskBrowser, hideTaskBrowsers } from "./components/TaskBrowser";
import { TaskDrawingPanel, TaskSandboxPanel } from "./components/TaskVisualPanel";
import { Channel, convertFileSrc, invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { ask, open } from "@tauri-apps/plugin-dialog";
import { isPermissionGranted, onAction, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { DragDropProvider, useDroppable, type DragEndEvent, type DragMoveEvent, type DragOverEvent } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { Feedback } from "@dnd-kit/dom";
import { pointerIntersection } from "@dnd-kit/collision";
import { Combobox } from "@base-ui/react/combobox";
import { Tabs } from "@base-ui/react/tabs";
import { MergeView, unifiedMergeView } from "@codemirror/merge";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { openSearchPanel, search, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, RangeSetBuilder, type Extension } from "@codemirror/state";
import { Decoration, EditorView, GutterMarker, gutter, gutterLineClass, keymap, lineNumbers } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XtermTerminal } from "@xterm/xterm";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { NewTaskButton } from "@/components/NewTaskButton";
import { MemoryWorkspace } from "@/components/MemoryWorkspace";
import { TaskGantt, TaskScheduleFields } from "@/components/TaskGantt";
import { TaskAssetThumbnail } from "@/components/TaskAssetThumbnail";
import { TaskGitToolbar } from "@/components/TaskGitToolbar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  ArrowUp,
  ArrowDown,
  Blocks,
  Bot,
  Check,
  CircleAlert,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  CornerDownRight,
  Download,
  Ellipsis,
  ExternalLink as ExternalLinkIcon,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  FolderGit2,
  GitBranch,
  GitCompareArrows,
  GripVertical,
  Info,
  LoaderCircle,
  ListTodo,
  LayoutGrid,
  ChartGantt,
  Maximize2,
  Palette,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Save,
  Settings,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import "@mdxeditor/editor/style.css";
import "./App.css";
import { fileStore } from "./fileStore";
import { agentsStorageKey, defaultAgentStorageKey, newAgent, normalizeAgents, switchChatAgent, type ChatAgent } from "./agents";
import { AgentsDialog } from "./components/AgentsDialog";
import { AgentAttentionStack, type AgentAttentionRequest } from "./components/AgentAttentionStack";
import { useGitHubInbox } from "./useGitHubInbox";
import { previewGitHubImage, type GitHubLink } from "./github";
import { GitHubInbox, GitHubSettings, GitHubTaskLink } from "./components/GitHubInbox";
import { PromptScheduler } from "./components/PromptScheduler";
import { PomodoroProvider, PomodoroSettings, PomodoroTimer } from "./components/PomodoroTimer";
import { normalizePomodoroSettings, pomodoroSettingsKey } from "./pomodoro";
import { usePromptScheduler } from "./usePromptScheduler";
import { useTaskControl } from "./useTaskControl";
import { agentMetadata, argumentsFor, getTask, metadataKeys, playbookMetadata, requiredText, taskMetadata, taskObservation, taskStartPoint, taskSummary } from "./taskControl";
import { laneStatuses } from "./laneAutomation";
import { useLaneAutomation } from "./useLaneAutomation";
import { LaneAutomation } from "./components/LaneAutomation";
import type { LaneRun } from "./laneAutomation";
import { finishSchedule, type PromptSchedule } from "./promptSchedules";
import { chatQueueStorageKey, loadChatQueues, moveQueuedMessage, saveChatQueues, type ChatQueues, type QueuedChatMessage } from "./chatQueue";
import { isLargeCodeDocument } from "./codeMirror";
import { findCodeLanguage } from "./codeLanguage";
import { chatEfforts, chatEffortsLabel, chatModelLabel, normalizeChatDefaults, normalizeChatModelFavorites, validChatModel, type ChatModel, type ChatDefaults, type ChatEffort } from "./chatDefaults";
import { applyChatEvent, carryReviewChat, finalizePlanOutput, persistedChatEntries } from "./chatTimeline";
import { diffChangeBlocks, isVeryLargeChangedFile, isVeryLargeDiff, isVeryLargePatch, parseUnifiedDiff, unchangedLineCount, type DiffChangeBlock } from "./diff";
import { defaultTaskColumnRatios, resizeTaskColumn, taskColumnPixels, type TaskColumnRatios, type TaskDivider } from "./taskColumns";
import { parseFileReference, type FileReference } from "./fileReference";
import { movePlaybook, newPlaybook, normalizePlaybooks, playbookContent, preparePlaybookPrompt, renderPlaybookPrompt, type Playbook } from "./playbooks";
import type {
  AiChatAccepted,
  AiChatEvent,
  AiChatMode,
  AiChatPlan,
  AgentApproval,
  AgentTurnEvent,
  AgentUserInput,
  AppliedDiff,
  ChatMessage,
  ChangedFile,
  CodeSelection,
  CommentSide,
  Comparison,
  DiffCell,
  FileDiff,
  RepositoryInfo,
  OpenRepositoryResult,
  RepositoryTask,
  TaskAsset,
  TaskComment,
  TaskChanges,
  TaskColor,
  TaskCustomField,
  AiSettings,
  McpServerSettings,
  BranchRefs,
  ChatContext,
  ChatAttachment,
  ChatRequestContext,
  ReviewSession,
  ReviewComment,
} from "./types";
import { branchPrefixStorageKey, loadBranchPrefix, saveBranchPrefix, taskNewBranchName, taskColors, taskStorageKey, customFieldsStorageKey, filterVisibleTasks, hasTaskCustomFieldLineBreaks, loadCloseKanbanModalOnOutsideClick, loadCollapsedTaskIds, loadOpenNewTaskInDrawer, loadTaskCustomFields, loadTaskLocationDefault, loadTaskView, loadTasks, mergeMcpTaskUpdates, moveTask, moveTaskCustomField, moveTaskProjected, moveTaskToBoardIndex, moveTaskWithinStatus, normalizeTask, removeTaskCustomFieldValues, saveCloseKanbanModalOnOutsideClick, saveCollapsedTaskIds, saveOpenNewTaskInDrawer, saveTaskCustomFields, saveTaskLocationDefault, saveTaskView, saveTasks, timestampTaskUpdates, taskAssetAttachments, taskBoardStatus, taskCustomFieldUrl, taskListMetadata, taskMcpContext, taskLocationFields, taskStartEditable, taskStartSelected, taskSubtreeIds, toggleTaskCommentCheckbox, type TaskBoardStatus, type TaskLocation, type TaskView } from "./tasks";

const message = (reason: unknown) =>
  reason instanceof Error ? reason.message : String(reason);

function nativeDropHits(elementId: string, position: { x: number; y: number }) {
  const element = document.getElementById(elementId);
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  return [[position.x / scale, position.y / scale], [position.x, position.y]].some(([x, y]) =>
    x >= rect.left && x <= rect.right && [y, y - 52, y + 52].some((candidate) => candidate >= rect.top && candidate <= rect.bottom));
}

function taskCustomFieldLabel(task: RepositoryTask, field: TaskCustomField): string {
  const value = task.customFields[field.id];
  if (!value?.trim()) return "";
  return field.type === "select" ? field.options.find((option) => option.id === value)?.label ?? "" : value;
}
const sidebarStorageKey = "chaoticreview.sidebar-widths";
const simulatorStorageKey = "chaoticreview.simulator-space";
const taskColumnStorageKey = "chaoticreview.task-column-widths";
const boardStatusColumns: { id: TaskBoardStatus; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "clear", label: "Planning" },
  { id: "inProgress", label: "In development" },
  { id: "inReview", label: "In review" },
  { id: "done", label: "Done" },
];
const autoOpenEditedFileStorageKey = "chaoticreview.auto-open-edited-file";
const showFullFileDiffStorageKey = "chaoticreview.show-full-file-diff";
const systemNotificationsStorageKey = "chaoticreview.system-notifications";
const defaultFileViewModeStorageKey = "chaoticreview.default-file-view-mode";
const playbookStorageKey = "chaoticreview.review-playbooks";
const runCommandStorageKey = "chaoticreview.repository-run-commands";
const userRulesStorageKey = "chaoticreview.user-rules";
const chatDefaultsStorageKey = "chaoticreview.chat-defaults";
const chatModelFavoritesStorageKey = "chaoticreview.chat-model-favorites";
const commitMessageModelStorageKey = "chaoticreview.commit-message-model";
const autoClearChatAfterCommitStorageKey = "chaoticreview.auto-clear-chat-after-commit";
const autoFetchPullOnBranchSwitchStorageKey = "chaoticreview.auto-fetch-pull-on-branch-switch";
const approvalReviewerDefaultStorageKey = "chaoticreview.approval-reviewer-default";
const boardTabStorageKey = "chaoticreview.task-board-tabs";
type ApprovalReviewer = "user" | "auto_review" | "yolo";
const approvalReviewerLabels = { user: "Ask for approval", auto_review: "Approve for me", yolo: "YOLO mode" };
type BoardTab = "detail" | "changes" | "draw" | "sandbox" | "browser";
type TaskDetailsTab = "details" | "changes" | "draw" | "sandbox" | "browser";
type NotificationTarget = { windowLabel: string; repositoryRoot: string; taskId: string | null };
function storedApprovalReviewerDefault(): ApprovalReviewer {
  try {
    const value = fileStore.getItem(approvalReviewerDefaultStorageKey);
    return value === "auto_review" || value === "yolo" ? value : "user";
  }
  catch { return "user"; }
}

function storedBoardTab(rootPath: string, taskId: string, sandboxSupported: boolean, browserSupported: boolean): BoardTab {
  try {
    const tabs = JSON.parse(fileStore.getItem(boardTabStorageKey) ?? "{}");
    const tab = tabs?.[rootPath]?.[taskId];
    return tab === "changes" || tab === "draw" || (sandboxSupported && tab === "sandbox") || (browserSupported && tab === "browser") ? tab : "detail";
  } catch { return "detail"; }
}

function saveBoardTab(rootPath: string, taskId: string, tab: BoardTab) {
  try {
    const tabs = JSON.parse(fileStore.getItem(boardTabStorageKey) ?? "{}");
    fileStore.setItem(boardTabStorageKey, JSON.stringify({ ...tabs, [rootPath]: { ...tabs?.[rootPath], [taskId]: tab } }));
  } catch { /* A storage failure must not prevent switching tabs. */ }
}
const authOnboardingStorageKey = "chaoticreview.auth-onboarding-v1";
const maxUserRulesLength = 10_000;
const implementPlanPrompt = "Implement the plan you just proposed. Follow it step by step and verify the result.";
type ProviderSettingsEntry = AiSettings["providers"][number] & { secret?: string };
type ProviderSettings = { activeProvider: string; providers: ProviderSettingsEntry[]; repositoryProviders: Record<string, string> };
type McpServerDraft = Omit<McpServerSettings, "args" | "env" | "oauthScopes"> & { argsText: string; envText: string; oauthScopesText: string };
const mcpDraft = ({ args, env, oauthScopes, ...server }: McpServerSettings): McpServerDraft => ({
  ...server,
  argsText: args.join("\n"),
  envText: Object.entries(env).map(([key, value]) => `${key}=${value}`).join("\n"),
  oauthScopesText: (oauthScopes ?? []).join(" "),
});
const isSlackMcp = (url: string) => {
  try { return new URL(url.trim()).hostname === "mcp.slack.com"; } catch { return false; }
};
const openRouterProvider: ProviderSettingsEntry = { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", envKey: "OPENROUTER_API_KEY" };
type TaskRun = {
  messageId: string;
  coordinationPath?: string[];
  automation?: LaneRun;
  schedule?: Pick<PromptSchedule, "id" | "latestRun">;
  accepted: AiChatAccepted;
  mode: AiChatMode;
  status: string;
  timeline: ChatMessage[];
  plan: AiChatPlan | null;
  input: AgentUserInput | null;
  approval: AgentApproval | null;
};

function taskAttention(task: RepositoryTask, run?: TaskRun): string | null {
  if (run?.input) return "Needs your answer";
  if (run?.approval) return "Approval needed";
  return task.unreadAgentResult ? "New agent result" : null;
}

function storedOnboardingComplete() {
  try {
    return fileStore.getItem(authOnboardingStorageKey) !== null;
  } catch {
    return false;
  }
}

type RunStatus = "idle" | "running" | "stopping" | "success" | "failed";

function storedRunCommands(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(fileStore.getItem(runCommandStorageKey) ?? "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0));
  } catch {
    return {};
  }
}

function storedUserRules(): string {
  try {
    return fileStore.getItem(userRulesStorageKey)?.slice(0, maxUserRulesLength) ?? "";
  } catch {
    return "";
  }
}

function storedChatDefaults(): ChatDefaults {
  try {
    return normalizeChatDefaults(JSON.parse(fileStore.getItem(chatDefaultsStorageKey) ?? "null"));
  } catch {
    return normalizeChatDefaults(null);
  }
}

function storedChatModelFavorites(): string[] {
  try {
    return normalizeChatModelFavorites(JSON.parse(fileStore.getItem(chatModelFavoritesStorageKey) ?? "null"));
  } catch {
    return [];
  }
}

function storedCommitMessageModel(): string {
  try {
    const model = fileStore.getItem(commitMessageModelStorageKey);
    return validChatModel(model) ? model : storedChatDefaults().default.model;
  } catch {
    return storedChatDefaults().default.model;
  }
}

function storedAgents(): ChatAgent[] {
  try { return normalizeAgents(JSON.parse(fileStore.getItem(agentsStorageKey) ?? "null")); }
  catch { return []; }
}

function storedPlaybooks(): Playbook[] {
  try {
    return normalizePlaybooks(JSON.parse(fileStore.getItem(playbookStorageKey) ?? "null"));
  } catch {
    return [];
  }
}

type SidebarWidths = { left: number; right: number };
type FileTree = { folders: Map<string, FileTree>; files: ChangedFile[] };
type BranchTree = { folders: Map<string, BranchTree>; branches: string[] };
type FileViewMode = "split" | "unified" | "edit";
type DiffViewMode = Exclude<FileViewMode, "edit">;
type DiffNavigation = { diff: FileDiff; index: number };
type FileEditDraft = { path: string; original: string; content: string };
type WorkspaceCache = { comparison: Comparison; review: ReviewSession | null; selectedFile: ChangedFile | null; viewMode: FileViewMode; expandedFolders: Set<string> };

function storedDefaultFileViewMode(): DiffViewMode {
  return fileStore.getItem(defaultFileViewModeStorageKey) === "unified" ? "unified" : "split";
}

function storedSidebarWidths(): SidebarWidths {
  try {
    const value = fileStore.getItem(sidebarStorageKey);
    if (!value) return { left: 260, right: 330 };
    const parsed = JSON.parse(value) as Partial<SidebarWidths>;
    return {
      left: typeof parsed.left === "number" ? Math.min(Math.max(parsed.left, 200), 420) : 260,
      right: typeof parsed.right === "number" && Number.isFinite(parsed.right) ? Math.max(parsed.right, 260) : 330,
    };
  } catch {
    return { left: 260, right: 330 };
  }
}

function storedSimulatorSpace(): { enabled: boolean; width: number } {
  try {
    const value = JSON.parse(fileStore.getItem(simulatorStorageKey) ?? "null");
    return {
      enabled: value?.enabled === true,
      width: typeof value?.width === "number" && Number.isFinite(value.width)
        ? Math.min(960, Math.max(200, value.width)) : 360,
    };
  } catch {
    return { enabled: false, width: 360 };
  }
}

function storedTaskColumnRatios(): TaskColumnRatios {
  try {
    const value = JSON.parse(fileStore.getItem(taskColumnStorageKey) ?? "null") as Partial<TaskColumnRatios> | null;
    if (value && Number.isFinite(value.tasks) && Number.isFinite(value.changes)
      && value.tasks! > 0 && value.changes! > 0 && value.tasks! + value.changes! < 1) {
      return { tasks: value.tasks!, changes: value.changes! };
    }
  } catch { /* use equal columns */ }
  return defaultTaskColumnRatios;
}

function buildFileTree(files: ChangedFile[]): FileTree {
  const root: FileTree = { folders: new Map(), files: [] };
  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    if (!parts.pop()) continue;
    let node = root;
    for (const folder of parts) {
      let child = node.folders.get(folder);
      if (!child) {
        child = { folders: new Map(), files: [] };
        node.folders.set(folder, child);
      }
      node = child;
    }
    node.files.push(file);
  }
  return root;
}

function buildBranchTree(branches: string[], prefix = ""): BranchTree {
  const root: BranchTree = { folders: new Map(), branches: [] };
  for (const branch of branches) {
    const parts = branch.slice(prefix.length).split("/").filter(Boolean);
    const name = parts.pop();
    if (!name) continue;
    let node = root;
    for (const folder of parts) {
      let child = node.folders.get(folder);
      if (!child) {
        child = { folders: new Map(), branches: [] };
        node.folders.set(folder, child);
      }
      node = child;
    }
    node.branches.push(branch);
  }
  return root;
}

function branchTreeContains(tree: BranchTree, branch: string | null | undefined): boolean {
  return !!branch && (tree.branches.includes(branch) || [...tree.folders.values()].some((child) => branchTreeContains(child, branch)));
}

function expandedFolderPaths(files: ChangedFile[]) {
  const folders = new Set<string>();
  for (const file of files) {
    const parts = file.path.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      folders.add(parts.slice(0, index).join("/"));
    }
  }
  return folders;
}

function FileTreeView({
  tree,
  parentPath,
  depth,
  expandedFolders,
  approvedFiles,
  onToggle,
  selectedPath,
  onSelect,
}: {
  tree: FileTree;
  parentPath: string;
  depth: number;
  expandedFolders: Set<string>;
  approvedFiles: Set<string>;
  onToggle: (path: string) => void;
  selectedPath: string | undefined;
  onSelect: (file: ChangedFile) => void;
}) {
  return (
    <>
      {[...tree.folders.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, child]) => {
          const path = parentPath ? `${parentPath}/${name}` : name;
          const expanded = expandedFolders.has(path);
          return (
            <Fragment key={path}>
              <button
                type="button"
                onClick={() => onToggle(path)}
                aria-expanded={expanded}
                className="ios-tree-folder group mb-px flex w-full items-center gap-1.5 text-left text-[13px]"
                style={{ paddingLeft: 8 + depth * 16 }}
              >
                <span className="ios-tree-disclosure-slot">
                  {expanded ? <ChevronDown size={12} className="ios-tree-disclosure" /> : <ChevronRight size={12} className="ios-tree-disclosure" />}
                </span>
                {expanded ? <FolderOpen size={15} className="ios-tree-folder-icon" /> : <Folder size={15} className="ios-tree-folder-icon" />}
                <span className="ios-tree-label truncate">{name}</span>
              </button>
              {expanded && (
                <FileTreeView
                  tree={child}
                  parentPath={path}
                  depth={depth + 1}
                  expandedFolders={expandedFolders}
                  approvedFiles={approvedFiles}
                  onToggle={onToggle}
                  selectedPath={selectedPath}
                  onSelect={onSelect}
                />
              )}
            </Fragment>
          );
        })}
      {[...tree.files]
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((file) => {
          const selected = selectedPath === file.path;
          const approved = approvedFiles.has(file.path);
          const parts = file.path.split("/");
          const name = parts[parts.length - 1] ?? file.path;
          return (
            <button
              type="button"
              key={`${file.oldPath ?? ""}-${file.path}`}
              onClick={() => onSelect(file)}
              title={file.path}
              aria-current={selected ? "page" : undefined}
              className={`ios-tree-file mb-px flex w-full items-center gap-1.5 pr-2 text-left text-[13px] ${selected ? "ios-tree-file-selected" : ""} ${approved ? "ios-tree-file-approved" : ""}`}
              style={{ paddingLeft: 8 + depth * 16 }}
            >
              <span aria-hidden className="ios-tree-disclosure-slot" />
              <FileCode2 size={14} className={`ios-tree-file-icon shrink-0 ${approved ? "text-[#39FF88]" : selected ? "text-[#A3FF12]" : ""}`} />
              <span className="ios-tree-label min-w-0 flex-1 truncate">{name}</span>
              <span className="flex shrink-0 items-center gap-0.5">
                {approved ? (
                  <span className="ios-tree-approved flex shrink-0 items-center" aria-label="Approved">
                    <Check size={14} /> <span className="sr-only">Approved</span>
                  </span>
                ) : !file.binary && (!!file.additions || !!file.deletions) && (
                  <span className="ios-tree-stat flex shrink-0 items-center gap-1" aria-label={`${file.additions ?? 0} additions, ${file.deletions ?? 0} deletions`}>
                    {!!file.additions && <span className="ios-tree-additions">+{file.additions}</span>}
                    {!!file.deletions && <span className="ios-tree-deletions">−{file.deletions}</span>}
                  </span>
                )}
              </span>
            </button>
          );
        })}
    </>
  );
}

function BranchTreeView({
  tree,
  parentPath,
  depth,
  expandedFolders,
  forceExpanded,
  currentBranch,
  disabled,
  onToggle,
  onSelect,
}: {
  tree: BranchTree;
  parentPath: string;
  depth: number;
  expandedFolders: Set<string>;
  forceExpanded: boolean;
  currentBranch: string | null | undefined;
  disabled: boolean;
  onToggle: (path: string) => void;
  onSelect: (branch: string) => void;
}) {
  return <>
    {[...tree.folders.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, child]) => {
      const path = `${parentPath}/${name}`;
      const expanded = forceExpanded || expandedFolders.has(path) || branchTreeContains(child, currentBranch);
      return <Fragment key={path}>
        <button type="button" onClick={() => onToggle(path)} aria-expanded={expanded} className="ios-tree-folder mb-px flex w-full items-center gap-1.5 text-left text-[13px]" style={{ paddingLeft: 8 + depth * 16 }}>
          <span className="ios-tree-disclosure-slot">{expanded ? <ChevronDown size={12} className="ios-tree-disclosure" /> : <ChevronRight size={12} className="ios-tree-disclosure" />}</span>
          {expanded ? <FolderOpen size={15} className="ios-tree-folder-icon" /> : <Folder size={15} className="ios-tree-folder-icon" />}
          <span className="ios-tree-label min-w-0 break-all">{name}</span>
        </button>
        {expanded && <BranchTreeView tree={child} parentPath={path} depth={depth + 1} expandedFolders={expandedFolders} forceExpanded={forceExpanded} currentBranch={currentBranch} disabled={disabled} onToggle={onToggle} onSelect={onSelect} />}
      </Fragment>;
    })}
    {[...tree.branches].sort((a, b) => a.localeCompare(b)).map((branch) => {
      const name = branch.slice(branch.lastIndexOf("/") + 1);
      const current = branch === currentBranch;
      return <button type="button" key={branch} className={`ios-tree-file mb-px flex w-full items-center gap-1 pr-2 text-left text-[13px] ${current ? "ios-tree-file-selected" : ""}`} style={{ paddingLeft: 8 + depth * 16 }} disabled={disabled || current} onClick={() => onSelect(branch)} title={branch}>
        <span aria-hidden className="ios-tree-disclosure-slot" />
        <GitBranch size={14} className="shrink-0 ios-tree-file-icon" />
        <span className="ios-tree-label min-w-0 break-all whitespace-normal">{name}</span>
        {current && <Check size={14} className="ml-auto shrink-0 text-[#39FF88]" />}
      </button>;
    })}
  </>;
}

type ReviewCodeLine = { cell: DiffCell; side: CommentSide; kind: "context" | "added" | "removed" | "gap" };

function reviewGap(diff: FileDiff, index: number): ReviewCodeLine[] {
  const count = index > 0 ? unchangedLineCount(diff.hunks[index - 1], diff.hunks[index]) : 0;
  return count ? [{ cell: { lineNumber: 0, text: `${count} unmodified lines` }, side: "compare", kind: "gap" }] : [];
}

function reviewUnifiedLines(diff: FileDiff): ReviewCodeLine[] {
  return diff.hunks.flatMap((hunk, index) => [...reviewGap(diff, index), ...hunk.rows.flatMap((row): ReviewCodeLine[] => row.kind === "changed" ? [{ cell: row.old!, side: "base", kind: "removed" }, { cell: row.new!, side: "compare", kind: "added" }] : row.kind === "removed" ? [{ cell: row.old!, side: "base", kind: "removed" }] : [{ cell: row.new!, side: "compare", kind: row.kind }])]);
}

class ChangeMarker extends GutterMarker {
  constructor(private readonly kind: ReviewCodeLine["kind"]) { super(); }
  toDOM() { const marker = document.createElement("span"); marker.className = `cm-review-change-marker ${this.kind}`; return marker; }
}

class ReviewGutterMarker extends GutterMarker {
  elementClass: string;
  constructor(kind: ReviewCodeLine["kind"]) { super(); this.elementClass = `cm-review-gutter-${kind}`; }
}

function CodeMirrorReviewWorkspace({ mode, diff, changeBlocks, navigation, selection, onSelectLine }: {
  mode: "split" | "unified"; diff: FileDiff; changeBlocks: DiffChangeBlock[]; navigation: DiffNavigation | null; selection: CodeSelection | null; onSelectLine: (side: CommentSide, cell: DiffCell, extend: boolean) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | MergeView | null>(null);
  const selectionCompartment = useRef(new Compartment());
  const onSelectLineRef = useRef(onSelectLine); onSelectLineRef.current = onSelectLine;
  const baseLines = useMemo<ReviewCodeLine[]>(() => diff.hunks.flatMap((hunk, index) => [...reviewGap(diff, index), ...hunk.rows.flatMap((row) => row.old ? [{ cell: row.old, side: "base" as const, kind: row.kind === "changed" || row.kind === "removed" ? "removed" as const : "context" as const }] : [])]), [diff]);
  const compareLines = useMemo<ReviewCodeLine[]>(() => diff.hunks.flatMap((hunk, index) => [...reviewGap(diff, index), ...hunk.rows.flatMap((row) => row.new ? [{ cell: row.new, side: "compare" as const, kind: row.kind === "changed" || row.kind === "added" ? "added" as const : "context" as const }] : [])]), [diff]);
  const unifiedLines = useMemo(() => reviewUnifiedLines(diff), [diff]);
  const documents = useMemo(() => ({ base: baseLines.map((line) => line.cell.text).join("\n"), compare: compareLines.map((line) => line.cell.text).join("\n"), unified: unifiedLines.map((line) => line.cell.text).join("\n") }), [baseLines, compareLines, unifiedLines]);
  const largeFile = isLargeCodeDocument(mode === "unified" ? documents.unified : documents.base) || (mode === "split" && isLargeCodeDocument(documents.compare));
  const language = useCodeMirrorLanguage(diff.path, false, !largeFile);
  useEffect(() => {
    if (!host.current) return;
    const extensions = (lines: ReviewCodeLine[]) => {
      const changeLines = [];
      let lineStart = 0;
      for (const line of lines) {
        if (line.kind !== "context") changeLines.push(Decoration.line({ class: `cm-review-${line.kind}-line` }).range(lineStart));
        lineStart += line.cell.text.length + 1;
      }
      const changeHighlights = changeLines.length ? [EditorView.decorations.of(Decoration.set(changeLines))] : [];
      const gutterColors = new RangeSetBuilder<GutterMarker>();
      let gutterStart = 0;
      for (const line of lines) {
        if (line.kind !== "context") gutterColors.add(gutterStart, gutterStart, new ReviewGutterMarker(line.kind));
        gutterStart += line.cell.text.length + 1;
      }
      const changeGutter = gutter({ class: "cm-review-change-gutter", markers(view) { const markers = new RangeSetBuilder<GutterMarker>(); lines.forEach((line, index) => { if (line.kind === "added" || line.kind === "removed") markers.add(view.state.doc.line(index + 1).from, view.state.doc.line(index + 1).from, new ChangeMarker(line.kind)); }); return markers.finish(); } });
      return [EditorState.readOnly.of(true), EditorView.editable.of(false), changeGutter, lineNumbers({ formatNumber: (number) => String(lines[number - 1]?.cell.lineNumber || "") }), gutterLineClass.of(gutterColors.finish()), selectionCompartment.current.of(EditorView.decorations.of(Decoration.none)), appliedDiffTheme, ...language, ...codeSearch, ...(largeFile ? [] : [EditorView.lineWrapping]), ...changeHighlights, EditorView.domEventHandlers({ mousedown(event, editor) { const position = editor.posAtCoords({ x: event.clientX, y: event.clientY }); const reviewLine = position === null ? null : lines[editor.state.doc.lineAt(position).number - 1]; if (reviewLine && reviewLine.kind !== "gap") onSelectLineRef.current(reviewLine.side, reviewLine.cell, event.shiftKey); return false; } })];
    };
    const view = mode === "unified"
      ? new EditorView({ doc: documents.unified, extensions: extensions(unifiedLines), parent: host.current })
      : new MergeView({ a: { doc: documents.base, extensions: extensions(baseLines) }, b: { doc: documents.compare, extensions: extensions(compareLines) }, parent: host.current, orientation: "a-b", gutter: false, diffConfig: largeFile ? { scanLimit: 200, timeout: 50 } : undefined });
    viewRef.current = view;
    const openSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        const editor = view instanceof MergeView ? (view.a.hasFocus ? view.a : view.b) : view;
        editor.focus();
        openSearchPanel(editor);
      }
    };
    window.addEventListener("keydown", openSearch);
    return () => { window.removeEventListener("keydown", openSearch); viewRef.current = null; view.destroy(); };
  }, [baseLines, compareLines, documents, language, largeFile, mode, unifiedLines]);
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const update = (editor: EditorView, lines: ReviewCodeLine[]) => {
      const marks = [];
      let from = 0;
      for (const line of lines) {
        if (selection?.filePath === diff.path && selection.side === line.side && selection.lines.some((item) => item.lineNumber === line.cell.lineNumber && item.text === line.cell.text)) marks.push(Decoration.line({ class: "cm-review-selected-line" }).range(from));
        from += line.cell.text.length + 1;
      }
      editor.dispatch({ effects: selectionCompartment.current.reconfigure(EditorView.decorations.of(Decoration.set(marks))) });
    };
    if (view instanceof MergeView) { update(view.a, baseLines); update(view.b, compareLines); }
    else update(view, unifiedLines);
  }, [baseLines, compareLines, diff.path, mode, selection, unifiedLines]);
  useEffect(() => {
    if (navigation?.diff !== diff) return;
    const block = changeBlocks[navigation.index];
    const view = viewRef.current;
    if (!block || !view) return;
    const lines = mode === "unified" ? unifiedLines : block.side === "base" ? baseLines : compareLines;
    const lineIndex = lines.findIndex((line) => line.side === block.side && line.cell.lineNumber === block.lineNumber);
    if (lineIndex < 0) return;
    const editor = view instanceof MergeView ? block.side === "base" ? view.a : view.b : view;
    editor.dispatch({ effects: EditorView.scrollIntoView(editor.state.doc.line(lineIndex + 1).from, { y: "center" }) });
  }, [baseLines, changeBlocks, compareLines, diff, mode, navigation, unifiedLines]);
  return <div className="flex h-full min-h-0 flex-col bg-[#111A15]">{largeFile && <div role="status" className="shrink-0 border-b border-[#294536] bg-[#111A15] px-[18px] py-1.5 text-xs text-[#7C9B88]">Performance mode · wrapping is off for this large file.</div>}<div ref={host} className={`codemirror-review codemirror-diff codemirror-review-${mode} min-h-0 flex-1`} /></div>;
}

function CodeMirrorFileEditor({ path, content, onChange, onSave }: { path: string; content: string; onChange: (content: string) => void; onSave: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const documentRef = useRef(content);
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  const onSaveRef = useRef(onSave); onSaveRef.current = onSave;
  const language = useCodeMirrorLanguage(path);
  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      doc: documentRef.current,
      extensions: [lineNumbers(), appliedDiffTheme, ...codeSearch, keymap.of([{ key: "Mod-s", preventDefault: true, run: () => { onSaveRef.current(); return true; } }]), ...language, EditorView.lineWrapping, EditorView.updateListener.of((update) => { if (update.docChanged) { documentRef.current = update.state.doc.toString(); onChangeRef.current(documentRef.current); } })],
      parent: host.current,
    });
    view.focus();
    return () => view.destroy();
  }, [content, language, path]);
  return <div ref={host} className="codemirror-review codemirror-diff codemirror-file-editor h-full min-h-0 bg-[#111A15]" />;
}

function ChatCodeBlock({ code, language }: { code: string; language?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const languageExtensions = useCodeMirrorLanguage(language ?? "", true);
  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      doc: code,
      parent: host.current,
      extensions: [EditorState.readOnly.of(true), EditorView.editable.of(false), lineNumbers(), appliedDiffTheme, ...languageExtensions],
    });
    return () => view.destroy();
  }, [code, languageExtensions]);
  return <div ref={host} className="chat-code-block codemirror-diff" aria-label={language ? `${language} code` : "Code"} />;
}

function ExternalLink({ href, children }: { href?: string; children?: ReactNode }) {
  return <a href={href} onClick={(event) => { event.preventDefault(); event.stopPropagation(); if (href) void openUrl(href); }}>{children}</a>;
}

function TaskCustomFieldValue({ task, field }: { task: RepositoryTask; field: TaskCustomField }) {
  const value = taskCustomFieldLabel(task, field);
  const url = field.hyperlink ? taskCustomFieldUrl(value) : null;
  return url ? <span className="underline underline-offset-2 hover:text-[#A3FF12]"><ExternalLink href={url}>{value}</ExternalLink></span> : value;
}

function ChatTable({ children }: { children?: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return <>
    <div className="chat-table">
      <button type="button" className="chat-table-expand" onClick={() => setExpanded(true)} aria-label="Expand table" title="Expand table"><Maximize2 size={13} /></button>
      <table>{children}</table>
    </div>
    <Dialog open={expanded} onOpenChange={setExpanded}>
      <DialogContent className="grid h-[85vh] w-[90vw] !max-w-none grid-rows-[48px_minmax(0,1fr)] gap-0 overflow-hidden border border-[#294536] bg-[#0B110E] p-0">
        <header className="flex items-center border-b border-[#294536] px-4 pr-12"><DialogTitle>Table</DialogTitle></header>
        <DialogDescription className="sr-only">Expanded chat table</DialogDescription>
        <div className="chat-markdown chat-table-expanded min-h-0 overflow-auto p-4"><table>{children}</table></div>
      </DialogContent>
    </Dialog>
  </>;
}

const ChatMarkdown = memo(function ChatMarkdown({ text, onFileReference, onOpenTask }: { text: string; onFileReference: (reference: FileReference) => void; onOpenTask: (id: string) => void }) {
  const onFileReferenceRef = useRef(onFileReference);
  const onOpenTaskRef = useRef(onOpenTask);
  onFileReferenceRef.current = onFileReference;
  onOpenTaskRef.current = onOpenTask;
  return useMemo(() => <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    table: ChatTable,
    pre: ({ children }) => <>{children}</>,
    code: ({ className, children }) => { const language = /^language-(.+)$/.exec(className ?? "")?.[1]; const value = String(children); return language || value.endsWith("\n") ? <ChatCodeBlock code={value.replace(/\n$/, "")} language={language} /> : <code className={className}>{children}</code>; },
    a: ({ href, children }) => { const taskId = /^#task=([a-zA-Z0-9-]+)$/.exec(href ?? "")?.[1]; if (taskId) return <a href={href} onClick={(event) => { event.preventDefault(); onOpenTaskRef.current(taskId); }}>{children}</a>; const label = String(children ?? ""); const reference = parseFileReference(href ?? "") ?? parseFileReference(label); return reference ? <button type="button" className="chat-file-reference" onClick={() => onFileReferenceRef.current(reference)}>{children}</button> : <ExternalLink href={href}>{children}</ExternalLink>; },
  }}>{text}</ReactMarkdown>, [text]);
});

function TaskCommentMarkdown({ body, onChange }: { body: string; onChange: (body: string) => void }) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  return useMemo(() => <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    a: ({ href, children }) => <ExternalLink href={href}>{children}</ExternalLink>,
    li: ({ node, children, ...props }) => {
      const items = Children.toArray(children);
      const checkbox = items[0];
      const offset = node?.position?.start.offset;
      if (typeof offset !== "number" || !isValidElement<{ checked?: boolean }>(checkbox) || checkbox.type !== "input") return <li {...props}>{children}</li>;
      return <li {...props}><input type="checkbox" checked={Boolean(checkbox.props.checked)} onChange={() => onChangeRef.current(toggleTaskCommentCheckbox(body, offset))} aria-label="Toggle checklist item" />{items.slice(1)}</li>;
    },
  }}>{body}</ReactMarkdown>, [body]);
}

function ChatUploads({ images, removable, onRemove }: { images: ChatAttachment[]; removable?: boolean; onRemove?: (path: string) => void }) {
  const attached = images.filter(isChatUpload);
  return attached.length ? <div className="chat-images">{attached.map((image) => <div key={image.path} className="chat-image">{image.kind === "image" ? <img src={convertFileSrc(image.path)} alt={image.name} /> : <div className="chat-file-icon"><FileText size={28} aria-hidden="true" /></div>}<span title={image.name}>{image.name}</span>{removable && <button type="button" onClick={() => onRemove?.(image.path)} aria-label={`Remove ${image.name}`}><X size={12} /></button>}</div>)}</div> : null;
}

function ChatAssetNames({ attachments }: { attachments: ChatAttachment[] }) {
  const assets = attachments.filter((attachment): attachment is Extract<ChatAttachment, { kind: "taskAsset" }> => attachment.kind === "taskAsset");
  return assets.length ? <div className="flex flex-wrap gap-1.5">{assets.map((asset) => <span key={asset.id} className="rounded-md border border-[#294536] bg-[#111A15] px-2 py-1 text-xs text-[#7C9B88]">{asset.name}</span>)}</div> : null;
}

const taskImagePaths = (task: RepositoryTask) => [...task.attachments, ...task.chatMessages.flatMap((message) => message.attachments ?? [])].flatMap((attachment) => isChatUpload(attachment) ? [attachment.path] : []);
const taskQueueKey = (root: string, taskId: string) => JSON.stringify([root, "task", taskId]);
const reviewQueueKey = (review: ReviewSession) => JSON.stringify([review.repoPath, review.mode, review.baseRef, review.compareRef, ...(review.mode === "workingCopy" ? [review.baseOid] : [])]);

function AppliedDiffs({ changes }: { changes: AppliedDiff[] }) {
  if (!changes.length) return null;
  return <div className="mt-3 space-y-2">{changes.map((change, index) => (
    <section key={`${change.path}-${change.kind}-${index}`} className="overflow-hidden rounded-md border border-[#294536]">
      <div className="flex items-center gap-2 bg-[#111A15] px-2.5 py-2 text-xs"><FileCode2 size={13} className="shrink-0 text-[#39FF88]" /><strong className="min-w-0 flex-1 truncate text-left font-mono text-[#E8FFF0] [direction:rtl]"><bdi dir="ltr">{change.path}</bdi></strong><span className="shrink-0 text-[#7C9B88]">{change.kind}</span></div>
      {change.patch ? isVeryLargePatch(change.patch) ? <p className="px-2.5 py-2 text-xs text-[#7C9B88]">Large diff hidden.</p> : <CodeMirrorDiff path={change.path} patch={change.patch} /> : <p className="px-2.5 py-2 text-xs text-[#7C9B88]">Applied</p>}
    </section>
  ))}</div>;
}

const appliedDiffTheme = EditorView.theme({
  "&": { backgroundColor: "var(--ios-elevated-background)", color: "var(--ios-label)", fontSize: "13px" },
  ".cm-gutters": { backgroundColor: "var(--ios-background)", color: "var(--ios-tertiary-label)", border: "0" },
  ".cm-content": { fontFamily: "var(--font-mono)", lineHeight: "22px", padding: "8px 0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--ios-label)" },
  ".cm-line": { minHeight: "22px", padding: "0 10px" },
}, { dark: true });

const codeHighlightStyle = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier, tags.controlKeyword, tags.definitionKeyword], class: "cm-code-keyword" },
  { tag: [tags.typeName, tags.className, tags.function(tags.variableName), tags.function(tags.propertyName)], class: "cm-code-type" },
  { tag: [tags.string, tags.character, tags.attributeValue, tags.regexp], class: "cm-code-string" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], class: "cm-code-number" },
  { tag: [tags.tagName, tags.attributeName], class: "cm-code-name" },
  { tag: tags.operator, class: "cm-code-type" },
  { tag: tags.comment, class: "cm-code-comment" },
]);

const codeHighlighting = syntaxHighlighting(codeHighlightStyle);
const noCodeMirrorExtensions: Extension[] = [];
const codeSearch = [search({ top: true }), keymap.of(searchKeymap)];

function useCodeMirrorLanguage(value: string, byName = false, enabled = true) {
  const [extensions, setExtensions] = useState<Extension[]>([codeHighlighting]);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    setExtensions([codeHighlighting]);
    const language = findCodeLanguage(value, byName);
    if (language) void language.load().then((support) => { if (current) setExtensions([support, codeHighlighting]); }).catch(() => {});
    return () => { current = false; };
  }, [byName, enabled, value]);
  return enabled ? extensions : noCodeMirrorExtensions;
}

function CodeMirrorFilePreview({ path, content, line }: { path: string; content: string; line: number }) {
  const host = useRef<HTMLDivElement>(null);
  const language = useCodeMirrorLanguage(path);
  useEffect(() => {
    if (!host.current) return;
    const doc = EditorState.create({ doc: content }).doc;
    const target = doc.line(Math.min(line, doc.lines));
    const view = new EditorView({
      doc: content,
      parent: host.current,
      extensions: [EditorState.readOnly.of(true), EditorView.editable.of(false), lineNumbers(), appliedDiffTheme, ...codeSearch, ...language, EditorView.decorations.of(Decoration.set([Decoration.line({ class: "cm-reference-line" }).range(target.from)]))],
    });
    view.dispatch({ selection: { anchor: target.from }, effects: EditorView.scrollIntoView(target.from, { y: "center" }) });
    return () => view.destroy();
  }, [content, language, line]);
  return <div ref={host} className="reference-code codemirror-diff h-full min-h-0" />;
}

function FileReferenceDialog({ reference, compareRef, onClose }: { reference: FileReference | null; compareRef: string | null; onClose: () => void }) {
  const [preview, setPreview] = useState<{ path: string; content: string } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!reference) return;
    let current = true;
    setPreview(null); setError("");
    void invoke<{ path: string; content: string }>("load_repository_file", { path: reference.path, compareRef }).then((result) => { if (current) setPreview(result); }).catch((reason) => { if (current) setError(message(reason)); });
    return () => { current = false; };
  }, [compareRef, reference]);
  return <Dialog open={!!reference} onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="h-[85vh] w-[65vw] max-w-none sm:max-w-none grid-rows-[52px_minmax(0,1fr)] gap-0 overflow-hidden p-0">
    <header className="flex min-w-0 items-center gap-2 border-b border-[#294536] px-4 pr-12"><FileCode2 size={15} className="shrink-0 text-[#A3FF12]" /><DialogTitle className="truncate font-mono text-sm">{preview?.path ?? reference?.path}</DialogTitle>{reference && <span className="shrink-0 text-xs text-[#7C9B88]">Line {reference.line}</span>}</header>
    <DialogDescription className="sr-only">Repository file preview at the referenced line.</DialogDescription>
    <div className="min-h-0 overflow-hidden bg-[#111A15]">{preview && reference ? <CodeMirrorFilePreview path={preview.path} content={preview.content} line={reference.line} /> : error ? <div className="grid h-full place-items-center p-8 text-center text-sm text-[#FB7185]">{error}</div> : <div className="grid h-full place-items-center"><LoaderCircle size={20} className="animate-spin text-[#7C9B88]" /></div>}</div>
  </DialogContent></Dialog>;
}

function CodeMirrorDiff({ path, patch }: { path: string; patch: string }) {
  const host = useRef<HTMLDivElement>(null);
  const language = useCodeMirrorLanguage(path);
  useEffect(() => {
    if (!host.current) return;
    const hunks = parseUnifiedDiff(patch);
    const original = hunks.flatMap((hunk) => hunk.rows.flatMap((row) => row.old ? [row.old.text] : [])).join("\n");
    const modified = hunks.flatMap((hunk) => hunk.rows.flatMap((row) => row.new ? [row.new.text] : [])).join("\n");
    if (!hunks.length) return;
    const view = new EditorView({
      doc: modified,
      parent: host.current,
      extensions: [
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        lineNumbers(),
        appliedDiffTheme,
        ...codeSearch,
        ...language,
        unifiedMergeView({ original, collapseUnchanged: { margin: 2, minSize: 4 }, mergeControls: false }),
      ],
    });
    return () => view.destroy();
  }, [language, patch]);
  return <div ref={host} aria-label="Applied diff" className="applied-diff codemirror-diff" />;
}


function TaskQuestion({ input, onSubmit, onCancel }: { input: AgentUserInput; onSubmit?: (answers: Record<string, string>) => void; onCancel?: () => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  useEffect(() => { setAnswers({}); setStep(0); }, [input.requestId]);
  const question = input.questions[step];
  const ready = !!(answers[question.id] ?? "").trim();
  const last = step === input.questions.length - 1;
  return <form className="rounded-xl border border-[#294536] bg-[#111A15] p-3" onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); event.currentTarget.requestSubmit(); } }} onSubmit={(event) => { event.preventDefault(); if (!ready) return; if (last) onSubmit?.(answers); else setStep((current) => current + 1); }}>
    <p className="mb-3 text-sm font-semibold text-[#E8FFF0]">Agent question</p>
    <fieldset><legend className="text-sm font-semibold text-[#E8FFF0]">{question.header}</legend><p className="mt-1 text-xs text-[#7C9B88]">{question.question}</p>{question.options ? <div className="mt-2 space-y-1">{question.options.map((option) => <label key={option.label} className="flex cursor-pointer items-center gap-2 text-sm text-[#E8FFF0]"><input type="radio" name={question.id} checked={answers[question.id] === option.label} onChange={() => setAnswers((current) => ({ ...current, [question.id]: option.label }))} /><span>{option.label}{option.description && <span className="block text-xs text-[#7C9B88]">{option.description}</span>}</span></label>)}{question.isOther && <Input type={question.isSecret ? "password" : "text"} maxLength={20_000} value={answers[question.id] ?? ""} placeholder="Other" onChange={(event) => { const value = event.currentTarget.value; setAnswers((current) => ({ ...current, [question.id]: value })); }} />}</div> : <Input required maxLength={20_000} value={answers[question.id] ?? ""} type={question.isSecret ? "password" : "text"} onChange={(event) => { const value = event.currentTarget.value; setAnswers((current) => ({ ...current, [question.id]: value })); }} className="mt-2" />}</fieldset>
    <div className="mt-3 flex items-center justify-end gap-2"><span className="mr-auto text-xs text-[#7C9B88]">{step + 1} / {input.questions.length}</span><button type="button" className="quiet-button" onClick={onCancel}>Stop</button><button type="submit" disabled={!ready} className="accent-button">{last ? "Continue" : "Next"}</button></div>
  </form>;
}


function PlaybookQuestion({ playbook, onSubmit, onCancel }: { playbook: Playbook; onSubmit: (answers: Record<string, string>) => Promise<void>; onCancel: () => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const variable = playbook.variables[step];
  const ready = !!answers[variable.name]?.trim();
  const last = step === playbook.variables.length - 1;
  return <form className="rounded-xl border border-[#294536] bg-[#111A15] p-3" onSubmit={(event) => { event.preventDefault(); if (!ready || submitting) return; if (last) { setSubmitting(true); void onSubmit(answers).finally(() => setSubmitting(false)); } else setStep(step + 1); }}>
    <p className="mb-3 text-sm font-semibold text-[#E8FFF0]">Playbook · {playbook.title}</p>
    <label className="block text-sm font-semibold text-[#E8FFF0]">{variable.label}
      {variable.type === "singleLine"
        ? <Input required value={answers[variable.name] ?? ""} onChange={(event) => { const value = event.currentTarget.value; setAnswers((current) => ({ ...current, [variable.name]: value })); }} className="mt-2" />
        : <Textarea required value={answers[variable.name] ?? ""} onChange={(event) => { const value = event.currentTarget.value; setAnswers((current) => ({ ...current, [variable.name]: value })); }} rows={5} className="mt-2 resize-y" />}
    </label>
    <div className="mt-3 flex items-center justify-end gap-2"><span className="mr-auto text-xs text-[#7C9B88]">{step + 1} / {playbook.variables.length}</span><button type="button" className="quiet-button" disabled={submitting} onClick={onCancel}>Cancel</button><button type="submit" disabled={!ready || submitting} className="accent-button">{last ? "Send" : "Next"}</button></div>
  </form>;
}

function TaskApproval({ approval, responding = false, onRespond }: { approval: AgentApproval; responding?: boolean; onRespond?: (approved: boolean) => void }) {
  return <section className="rounded-xl border border-[#294536] bg-[#111A15] p-3">
    <p className="text-sm font-semibold text-[#E8FFF0]">{approval.title}</p>
    {approval.source === "mcp" && approval.serverName && <p className="mt-1 text-xs text-[#A9C8B5]">Server: {approval.serverName}</p>}
    <p className="mt-1 whitespace-pre-wrap text-xs text-[#7C9B88]">{approval.description}</p>
    {approval.command && <pre className="mt-3 max-h-40 w-full min-w-0 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-md border border-[#294536] bg-[#050807] p-3 font-mono text-xs leading-5 text-[#E8FFF0]"><span className="select-none text-[#7C9B88]">$ </span>{approval.command}</pre>}
    <div className="mt-3 flex justify-end gap-2"><button type="button" className="quiet-button" disabled={responding} onClick={() => onRespond?.(false)}>Deny</button><button type="button" className="accent-button" disabled={responding} onClick={() => onRespond?.(true)}>Allow</button></div>
  </section>;
}

function TaskTitle({ value, completed, placeholder, onChange, onFocus, onSubmit }: { value: string; completed: boolean; placeholder?: string; onChange: (value: string) => void; onFocus: () => void; onSubmit?: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = useCallback(() => {
    const field = ref.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  }, []);
  useLayoutEffect(() => { resize(); }, [resize, value]);
  useEffect(() => {
    const field = ref.current;
    if (!field) return;
    let width = field.clientWidth;
    const observer = new ResizeObserver(() => {
      if (field.clientWidth === width) return;
      width = field.clientWidth;
      resize();
    });
    observer.observe(field);
    return () => observer.disconnect();
  }, [resize]);
  return <textarea ref={ref} rows={1} value={value} placeholder={placeholder} onChange={(event) => onChange(event.currentTarget.value)} onFocus={onFocus} onKeyDown={(event) => { if (onSubmit && event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onSubmit(); } }} className={`task-title min-h-8 min-w-0 flex-1 resize-none overflow-hidden border-0 bg-transparent px-0 py-1.5 text-sm leading-5 text-[#E8FFF0] ${completed ? "line-through opacity-60" : ""}`} aria-label={placeholder ?? "Task title"} />;
}

function TaskCreateRow({ depth, value, parent, onChange, onSubmit }: { depth: number; value: string; parent: boolean; onChange: (value: string) => void; onSubmit: () => void }) {
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }} style={{ paddingLeft: `${12 + depth * 16}px` }} className="task-create-row grid gap-2 py-2 pr-3">
    <span className="task-drag-handle"><Plus size={14} /></span>
    <span className="size-6 shrink-0 rounded-full border border-dashed border-[#294536]" />
    <TaskTitle value={value} completed={false} placeholder={parent ? "Add subtask…" : "Add task…"} onChange={onChange} onFocus={() => {}} onSubmit={onSubmit} />
  </form>;
}

function SortableTask({ id, index, children }: { id: string; index: number; children: (bindings: { ref: (element: Element | null) => void; handleRef: (element: Element | null) => void; isDragging: boolean }) => ReactNode }) {
  const { ref, handleRef, isDragging } = useSortable({ id, index, group: "repository-tasks", type: "repository-task", transition: { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)", idle: true } });
  return children({ ref, handleRef, isDragging });
}

function SortableBoardTask({ id, index, group, children }: { id: string; index: number; group: string; children: (bindings: { ref: (element: Element | null) => void; isDragging: boolean }) => ReactNode }) {
  const { ref, isDragging } = useSortable({ id, index, group, type: "repository-task", collisionDetector: pointerIntersection, plugins: (defaults) => [...defaults, Feedback.configure({ feedback: "clone" })], transition: { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)", idle: true } });
  return children({ ref, isDragging });
}

function BoardColumnTarget({ id, board = false, children }: { id: string; board?: boolean; children: (bindings: { ref: (element: Element | null) => void; isDropTarget: boolean }) => ReactNode }) {
  const { ref, isDropTarget } = useDroppable({ id, type: "board-column", accept: "repository-task", collisionPriority: 1, collisionDetector: board ? pointerIntersection : undefined });
  return children({ ref, isDropTarget });
}

function TaskSurface({ board, target, children }: { board: boolean; target: HTMLElement | null; children: ReactNode }) {
  return board ? target ? createPortal(children, target) : null : children;
}

function ModelPicker({ value, models, onChange, className, ariaLabel, disabled }: { value: string; models: ChatModel[]; onChange: (model: string) => void; className?: string; ariaLabel: string; disabled?: boolean }) {
  const filter = Combobox.useFilter();
  const modelById = useMemo(() => new Map(models.map((entry) => [entry.model, entry])), [models]);
  const modelIds = useMemo(() => [...modelById.keys()], [modelById]);
  return (
    <Combobox.Root
      disabled={disabled}
      items={modelIds}
      value={value}
      onValueChange={(model) => { if (model) onChange(model); }}
      itemToStringLabel={(model) => modelById.get(model)?.displayName ?? model}
      filter={(model, query) => filter.contains(`${model} ${modelById.get(model)?.displayName ?? ""}`, query)}
    >
      <Combobox.Label className="sr-only">{ariaLabel}</Combobox.Label>
      <Combobox.Trigger className={`${className ?? ""} model-picker-trigger`}>
        <span className="model-picker-value"><Combobox.Value placeholder="Select model" /></span>
        <Combobox.Icon className="shrink-0"><ChevronDown size={14} /></Combobox.Icon>
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={4} className="isolate z-[110]">
          <Combobox.Popup className="ios-select-content model-picker-popup outline-none" aria-label={ariaLabel}>
            <Combobox.Input placeholder="Filter models" aria-label={`Filter ${ariaLabel}`} spellCheck={false} autoCorrect="off" autoCapitalize="none" className="model-picker-input" />
            <Combobox.Empty className="model-picker-empty">No models match.</Combobox.Empty>
            <Combobox.List className="model-picker-list outline-none">
              {(model: string) => {
                const entry = modelById.get(model);
                return <Combobox.Item key={model} value={model} className="model-picker-item grid w-full grid-cols-[14px_1fr] items-center gap-2 rounded px-2 py-1.5 text-left text-sm"><Combobox.ItemIndicator className="col-start-1"><Check size={14} /></Combobox.ItemIndicator><span className="col-start-2 truncate">{entry?.displayName ?? model}{entry ? chatEffortsLabel(entry) : ""}</span></Combobox.Item>;
              }}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

function AiChatPanel({
  messages,
  draft,
  running,
  status,
  streamingEntries,
  comparison,
  model,
  models,
  favoriteModels,
  modelsStatus,
  serverModel,
  effort,
  mode,
  plan,
  centered,
  zenMode,
  hideHeader = false,
  approvalReviewer,
  error,
  images,
  taskAssets = [],
  selectedAssetIds = [],
  onToggleTaskAsset,
  onDraftChange,
  onModelChange,
  onEffortChange,
  onModeChange,
  onResetConfig,
  onDismissError,
  onZenModeChange,
  onApprovalReviewerChange,
  onSend,
  queuedMessages = [],
  queuePaused = false,
  canSteerQueued = false,
  onSteerQueued,
  onDeleteQueued,
  onEditQueued,
  onMoveQueued,
  onResumeQueue,
  onImplementPlan,
  onCancel,
  onClear,
  onAddFiles,
  onPasteImage,
  onRemoveImage,
  onOpenTask,
  taskMode = false,
  taskLocation,
  taskLocationLocked = false,
  taskWorktreeStart,
  agentInput = null,
  agentApproval = null,
  approvalResponding = false,
  onAnswerInput,
  onCancelInput,
  onRespondApproval,
  playbooks,
  canRunPlaybooks,
  variablePrompt,
  onRunPlaybook,
  onManagePlaybooks,
  agents,
  chatAgent,
  onAgentChange,
  onManageAgents,
  onSubmitPlaybookValues,
  onCancelPlaybook,
  taskSelected = true,
  active = true,
}: {
  messages: ChatMessage[];
  draft: string;
  running: boolean;
  status: string;
  streamingEntries: ChatMessage[];
  comparison: Comparison | null;
  model: string;
  models: ChatModel[];
  favoriteModels: string[];
  modelsStatus: string;
  serverModel: string | null;
  effort: ChatEffort;
  mode: AiChatMode;
  plan: AiChatPlan | null;
  centered: boolean;
  zenMode: boolean;
  hideHeader?: boolean;
  approvalReviewer: ApprovalReviewer;
  error: string;
  images: ChatAttachment[];
  taskAssets?: TaskAsset[];
  selectedAssetIds?: string[];
  onToggleTaskAsset?: (id: string) => void;
  onDraftChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onEffortChange: (value: ChatEffort) => void;
  onModeChange: (value: AiChatMode) => void;
  onResetConfig: () => void;
  onDismissError: () => void;
  onZenModeChange: (enabled: boolean) => void;
  onApprovalReviewerChange: (value: ApprovalReviewer) => void;
  onSend: (draft: string) => Promise<boolean>;
  queuedMessages?: QueuedChatMessage[];
  queuePaused?: boolean;
  canSteerQueued?: boolean;
  onSteerQueued: (id: string) => void;
  onDeleteQueued: (id: string) => void;
  onEditQueued: (id: string, body: string) => void;
  onMoveQueued: (id: string, offset: -1 | 1) => void;
  onResumeQueue: () => void;
  onImplementPlan: () => void;
  onCancel: () => void;
  onClear: () => void;
  onAddFiles: (paths: string[]) => void;
  onPasteImage: (image: File) => void;
  onRemoveImage: (path: string) => void;
  onOpenTask: (id: string) => void;
  taskMode?: boolean;
  taskLocation?: RepositoryTask["location"];
  taskLocationLocked?: boolean;
  taskWorktreeStart?: RepositoryTask["worktreeStart"];
  agentInput?: AgentUserInput | null;
  agentApproval?: AgentApproval | null;
  approvalResponding?: boolean;
  onAnswerInput?: (answers: Record<string, string>) => void;
  onCancelInput?: () => void;
  onRespondApproval?: (approved: boolean) => void;
  playbooks: Playbook[];
  canRunPlaybooks: boolean;
  variablePrompt?: Playbook | null;
  onRunPlaybook: (playbook: Playbook) => void;
  onManagePlaybooks: () => void;
  agents: ChatAgent[];
  chatAgent: ChatAgent | null;
  onAgentChange: (agent: ChatAgent | null) => void;
  onManageAgents: () => void;
  onSubmitPlaybookValues: (answers: Record<string, string>) => Promise<void>;
  onCancelPlaybook: () => void;
  taskSelected?: boolean;
  active?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const followChatRef = useRef(true);
  const wasRunningRef = useRef(running);
  const [fileReference, setFileReference] = useState<FileReference | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const [addMenuPage, setAddMenuPage] = useState<"main" | "playbooks" | "assets">("main");
  const [showDebug, setShowDebug] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [composerDraft, setComposerDraft] = useState(draft);
  const sendPendingRef = useRef(false);
  const [sendPending, setSendPending] = useState(false);
  const [editingQueued, setEditingQueued] = useState<QueuedChatMessage | null>(null);
  const [queuedEditDraft, setQueuedEditDraft] = useState("");
  const addFilesRef = useRef(onAddFiles);
  const dropEnabledRef = useRef({ comparison: !!comparison && active, running: sendPending });
  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (running && !wasRunningRef.current) {
      followChatRef.current = true;
      if (scroll) scroll.scrollTop = scroll.scrollHeight;
    }
    wasRunningRef.current = running;
  }, [running]);
  useEffect(() => {
    const scroll = scrollRef.current;
    const content = scroll?.firstElementChild;
    if (!scroll || !content) return;
    const observer = new ResizeObserver(() => {
      if (followChatRef.current) scroll.scrollTop = scroll.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);
  const canSend = !!comparison && !sendPending && (!!composerDraft.trim() || images.some(isChatUpload) || selectedAssetIds.length > 0) && !variablePrompt
    && (!taskMode || taskSelected);
  const send = async () => {
    if (sendPendingRef.current) return;
    sendPendingRef.current = true;
    setSendPending(true);
    const submitted = composerDraft;
    try {
      if (await onSend(submitted)) {
        onDraftChange("");
        setComposerDraft((current) => current === submitted ? "" : current);
      }
    } finally { sendPendingRef.current = false; setSendPending(false); }
  };
  useEffect(() => { setComposerDraft(draft); }, [draft]);
  useEffect(() => { addFilesRef.current = onAddFiles; }, [onAddFiles]);
  useEffect(() => { dropEnabledRef.current = { comparison: !!comparison && active, running: sendPending }; }, [comparison, sendPending, active]);
  useEffect(() => { if (active && followChatRef.current) requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }); }, [active]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void getCurrentWindow().onDragDropEvent((event) => {
      if (event.payload.type === "leave") { setDragging(false); return; }
      if (nativeDropHits("task-assets-dropzone", event.payload.position)) { setDragging(false); return; }
      const enabled = dropEnabledRef.current.comparison && !dropEnabledRef.current.running;
      setDragging(enabled);
      // Native drop coordinates are window-relative and vary with title-bar mode;
      // accept drops while Agent Chat is visible instead of rejecting valid drops.
      if (event.payload.type === "drop" && enabled) addFilesRef.current(event.payload.paths);
    }).then((stop) => { if (disposed) stop(); else unlisten = stop; });
    return () => { disposed = true; unlisten?.(); };
  }, []);

  const emptyCenteredChat = centered && !messages.length && !running && !queuedMessages.length && !variablePrompt && !agentInput && !agentApproval;
  const availableFavoriteModels = favoriteModels.filter((id) => models.some((entry) => entry.model === id));

  return (
    <aside className={`ios-chat-panel relative flex min-h-0 flex-1 flex-col bg-[#050807] ${zenMode ? "border-0" : "border-l border-[#294536]"}`}>
      {!hideHeader && <div
        data-tauri-drag-region
        onMouseDown={(event) => {
          if ((event.target as HTMLElement).closest("button, input, select, textarea")) return;
          void getCurrentWindow().startDragging().catch(() => {});
        }}
        className={`ios-chat-header flex shrink-0 items-center justify-between border-b border-[#294536] ${zenMode ? "h-[52px] pl-[88px] pr-4" : "h-12 px-4"}`}
      >
        {taskMode && <span className="text-sm font-semibold text-[#E8FFF0]">Chat</span>}
        {taskMode && !zenMode ? <DropdownMenu>
          <DropdownMenuTrigger className="task-modal-icon ml-auto" aria-label="Chat actions" title="Chat actions"><Ellipsis size={18} /></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => onZenModeChange(true)}><Maximize2 size={14} /> Enter Zen Mode</DropdownMenuItem>
            <DropdownMenuItem disabled={running || (!messages.length && !queuedMessages.length)} onClick={onClear} aria-label="Clear Agent Chat conversation"><RotateCcw size={14} /> Clear conversation</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu> : <div className="ml-auto flex items-center">{(!!messages.length || !!queuedMessages.length) && <button type="button" onClick={onClear} disabled={running} className="quiet-button h-7 px-2 disabled:opacity-40" aria-label="Clear Agent Chat conversation">
          Clear
        </button>}
        <button
          type="button"
          onClick={() => onZenModeChange(!zenMode)}
          aria-label={zenMode ? "Exit Zen Mode" : "Enter Zen Mode"}
          aria-pressed={zenMode}
          title={zenMode ? "Exit Zen Mode" : "Enter Zen Mode"}
          className="ios-chat-plan-toggle ml-1"
        >
          Zen <span>{zenMode ? "On" : "Off"}</span>
        </button>
        </div>}
      </div>}
      {centered && !taskMode && error && <div role="alert" className="ios-error-banner flex min-h-12 shrink-0 items-center gap-3 border-b border-[#482631] bg-[#25151b] px-4 py-2 text-sm font-medium text-[#FB7185]"><CircleAlert size={16} className="shrink-0" /><span className="min-w-0 flex-1 break-words">{error}</span><button type="button" onClick={onDismissError} className="shrink-0 text-[#fb7185]">Dismiss</button></div>}
      <div
        ref={scrollRef}
        onScroll={(event) => {
          const scroll = event.currentTarget;
          followChatRef.current = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 2;
        }}
        className={`ios-chat-scroll min-h-0 flex-1 overflow-y-auto ${emptyCenteredChat ? "invisible" : ""}`}
      >
        <div className="ios-chat-thread mx-auto w-full max-w-[960px]">
          {!messages.length && !running && !variablePrompt && <div className="ios-chat-intro">
            <Sparkles size={16} className="shrink-0 text-[#A3FF12]" />
            <p className="whitespace-pre-wrap text-sm leading-5 text-[#7C9B88]">
              {taskMode ? taskSelected ? "Send a message to start working on this task." : "Select a task to continue planning." : "I can inspect the repository, investigate selected lines, and make precise changes."}
            </p>
          </div>}
          {messages.map((entry) => entry.role === "user" ? (
              <div key={entry.id} className="ios-chat-user-turn">
                <article className="ios-chat-user">
                  <ChatUploads images={entry.attachments ?? []} />
                  <ChatAssetNames attachments={entry.attachments ?? []} />
                  {entry.body && <div className="chat-markdown text-[#E8FFF0]"><ChatMarkdown text={entry.body} onFileReference={setFileReference} onOpenTask={onOpenTask} /></div>}
                </article>
                <div className="ios-chat-user-meta">
                  <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                </div>
              </div>
            ) : (
              <article key={entry.id} className={`ios-chat-assistant ${entry.plan ? "ios-chat-plan" : ""}`}>
                {entry.plan && <div className="ios-chat-plan-header"><span>Plan ready</span>{entry.canImplementPlan && <button type="button" onClick={onImplementPlan} disabled={running} className="accent-button h-8 px-3 text-xs disabled:opacity-50">Implement now <ArrowUp size={12} /></button>}</div>}
                <div className="chat-markdown text-[#E8FFF0]"><ChatMarkdown text={entry.body} onFileReference={setFileReference} onOpenTask={onOpenTask} /></div>
                <AppliedDiffs changes={entry.appliedDiffs ?? []} />
                <div className="ios-chat-message-actions">
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(entry.body)}
                    className="ios-chat-copy-button"
                    aria-label="Copy response"
                  >
                    <Copy size={13} />
                  </button>
                </div>
              </article>
            ))}
          {running && (
            <div className="ios-chat-thinking text-sm text-[#7C9B88]">
              {plan && <div className="mb-3 rounded-md border border-[#294536] bg-[#0B110E] p-3 text-left"><p className="mb-2 text-[#E8FFF0]">{plan.explanation}</p>{plan.plan.map((step) => <div key={step.step} className="flex gap-2 py-0.5"><span className={step.status === "completed" ? "text-[#39FF88]" : step.status === "inProgress" ? "text-[#A3FF12]" : "text-[#7C9B88]"}>{step.status === "completed" ? "✓" : step.status === "inProgress" ? "•" : "○"}</span><span>{step.step}</span></div>)}</div>}
              {streamingEntries.map((entry) => <article key={entry.id} className="ios-chat-assistant"><div className="ios-chat-streaming-text text-[#E8FFF0]">{entry.body}</div><AppliedDiffs changes={entry.appliedDiffs ?? []} /></article>)}
              <span className="inline-flex items-center gap-2"><LoaderCircle size={14} className="animate-spin" /> {status || "Thinking…"}</span>
            </div>
          )}
        </div>
      </div>
      <div className={`ios-chat-composer-wrap z-10 shrink-0 ${emptyCenteredChat ? "absolute inset-x-0 top-1/2 -translate-y-1/2" : "relative"}`}>
        {(agentInput || agentApproval || variablePrompt) && <div className="pointer-events-none absolute inset-x-3 bottom-[calc(100%+8px)]">
          <div className="pointer-events-auto mx-auto max-h-[45vh] w-full max-w-[960px] space-y-2 overflow-y-auto rounded-xl shadow-[0_12px_36px_rgba(0,0,0,0.18)]">
            {agentInput && <TaskQuestion input={agentInput} onSubmit={onAnswerInput} onCancel={onCancelInput} />}
            {agentApproval && <TaskApproval approval={agentApproval} responding={approvalResponding} onRespond={onRespondApproval} />}
            {variablePrompt && <PlaybookQuestion key={variablePrompt.id} playbook={variablePrompt} onSubmit={onSubmitPlaybookValues} onCancel={onCancelPlaybook} />}
          </div>
        </div>}
        {emptyCenteredChat && <><h1 className="mb-1 text-center text-[28px] font-bold tracking-tight text-[#E8FFF0]">What's next?</h1><p className="mb-4 text-center text-sm text-[#7C9B88]">Tip: Use Plan mode first for better results, or start iterating on your idea right away.</p></>}
        {taskMode && error && <div role="alert" className="ios-error-callout mx-auto mb-3 flex w-full max-w-[960px] items-start gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium"><CircleAlert size={17} className="mt-0.5 shrink-0" /><span className="min-w-0 flex-1 break-words">{error}</span><button type="button" onClick={onDismissError} aria-label="Dismiss error" className="grid size-6 shrink-0 place-items-center rounded hover:bg-black/5"><X size={15} /></button></div>}
        {taskMode && taskSelected && taskLocation === "worktree" && !taskLocationLocked && !taskStartSelected(taskWorktreeStart) && <p className="mx-auto mb-2 w-full max-w-[960px] px-3 text-xs text-[#7C9B88]">Choose a start branch or the current workspace in Details before sending.</p>}
        {!!queuedMessages.length && <div className="ios-chat-stack mx-auto mb-1 max-h-[35vh] w-full max-w-[960px] space-y-1 overflow-y-auto px-4 pb-1" aria-label="Queued messages">
          {queuedMessages.map((item, index) => <div key={item.id} className="ios-chat-stack-item flex items-center gap-2 rounded-[18px] border px-4 py-3 text-sm">
            <ListTodo size={15} className="shrink-0 opacity-60" />
            <span className="min-w-0 flex-1 truncate" title={item.body}>{item.body || `${item.context.attachments.length} attachment${item.context.attachments.length === 1 ? "" : "s"}`}</span>
            {item.context.attachments.length > 0 && <span className="shrink-0 text-xs opacity-60">+{item.context.attachments.length}</span>}
            {running ? canSteerQueued && <button type="button" onClick={() => onSteerQueued(item.id)} className="ios-chat-stack-action" title="Send into the current response"><CornerDownRight size={15} /> Steer</button>
              : index === 0 && <button type="button" onClick={onResumeQueue} className="ios-chat-stack-action">{queuePaused ? "Resume" : "Send now"}</button>}
            <button type="button" onClick={() => onDeleteQueued(item.id)} className="ios-chat-stack-icon" aria-label="Delete queued message" title="Delete queued message"><Trash2 size={15} /></button>
            <DropdownMenu><DropdownMenuTrigger className="ios-chat-stack-icon" aria-label="More queued message actions"><Ellipsis size={16} /></DropdownMenuTrigger>
              <DropdownMenuContent align="end"><DropdownMenuItem onClick={() => { setEditingQueued(item); setQueuedEditDraft(item.body); }}><Pencil size={14} /> Edit</DropdownMenuItem>
                <DropdownMenuItem disabled={index === 0} onClick={() => onMoveQueued(item.id, -1)}><ArrowUp size={14} /> Move up</DropdownMenuItem>
                <DropdownMenuItem disabled={index === queuedMessages.length - 1} onClick={() => onMoveQueued(item.id, 1)}><ArrowDown size={14} /> Move down</DropdownMenuItem>
              </DropdownMenuContent></DropdownMenu>
          </div>)}
        </div>}
        <div className={`ios-chat-composer mx-auto w-full max-w-[960px] ${dragging ? "ios-chat-composer-dropping" : ""}`}>
          <ChatUploads images={images} removable onRemove={onRemoveImage} />
          <ChatAssetNames attachments={taskAssets.filter((asset) => selectedAssetIds.includes(asset.id)).map((asset) => ({ kind: "taskAsset", id: asset.id, name: asset.name, image: asset.image }))} />
          <Textarea
            value={composerDraft}
            onChange={(event) => setComposerDraft(event.currentTarget.value)}
            onBlur={() => onDraftChange(composerDraft)}
            onPaste={(event) => {
              const image = Array.from(event.clipboardData.files).find((file) => file.type.startsWith("image/"));
              if (!image) return;
              event.preventDefault();
              onPasteImage(image);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (canSend) void send();
              }
            }}
            disabled={!comparison || sendPending || !!variablePrompt || (taskMode && !taskSelected)}
            placeholder={comparison?.files.length ? "Ask about the current context…" : "Describe the change you want to make…"}
            aria-label="Review Agent message"
            className="ios-chat-textarea w-full resize-none border-0 bg-transparent text-sm leading-5 text-[#E8FFF0] shadow-none placeholder:text-[#7C9B88] disabled:opacity-50"
          />
          <div className="flex min-w-0 items-center gap-2">
            <Popover open={addMenuOpen} onOpenChange={(open) => { setAddMenuOpen(open); setAddMenuPage("main"); }}>
              <PopoverTrigger disabled={sendPending} className="ios-chat-add-image" aria-label="Add to chat" title="Add to chat"><Plus size={14} /></PopoverTrigger>
              <PopoverContent side="top" align="start" className="w-72 overflow-hidden border border-[#294536] bg-[#111A15] p-1.5 shadow-2xl shadow-black/60">
                <PopoverTitle className="sr-only">Add to chat</PopoverTitle>
                {addMenuPage === "main" ? <>
                  <button type="button" disabled={!comparison || sendPending || (taskMode && !taskSelected)} onClick={() => { setAddMenuOpen(false); void open({ multiple: true }).then((paths) => { if (Array.isArray(paths)) onAddFiles(paths); else if (paths) onAddFiles([paths]); }); }} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-[#183522] disabled:opacity-40"><FileText size={15} className="text-[#7C9B88]" /><span className="flex-1">File</span></button>
                  <button type="button" onClick={() => setAddMenuPage("playbooks")} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-[#183522]"><Blocks size={15} className="text-[#7C9B88]" /><span className="flex-1">Playbook</span><ChevronRight size={14} className="text-[#7C9B88]" /></button>
                  {taskMode && <button type="button" disabled={!taskSelected || !taskAssets.length} onClick={() => setAddMenuPage("assets")} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-[#183522] disabled:opacity-40"><Folder size={15} className="text-[#7C9B88]" /><span className="flex-1">Assets</span>{selectedAssetIds.length > 0 && <span className="text-xs text-[#7C9B88]">{selectedAssetIds.length}</span>}<ChevronRight size={14} className="text-[#7C9B88]" /></button>}
                  <button type="button" role="switch" aria-checked={mode === "plan"} disabled={running || (taskMode && !taskSelected)} onClick={() => { onModeChange(mode === "plan" ? "default" : "plan"); setAddMenuOpen(false); }} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-[#183522] disabled:opacity-40"><ListTodo size={15} className="text-[#7C9B88]" /><span className="flex-1">Plan</span><span className="text-xs text-[#7C9B88]">{mode === "plan" ? "On" : "Off"}</span></button>
                </> : <>
                  <button type="button" onClick={() => setAddMenuPage("main")} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-[#7C9B88] hover:bg-[#183522]"><ChevronLeft size={14} /> {addMenuPage === "playbooks" ? "Playbooks" : "Assets"}</button>
                  {addMenuPage === "playbooks" ? <>
                    <button type="button" onClick={() => { setAddMenuOpen(false); onManagePlaybooks(); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-bold hover:bg-[#183522]"><Settings size={13} className="text-[#7C9B88]" /> Manage playbooks</button>
                    <div className="max-h-72 overflow-y-auto">
                      {playbooks.map((playbook) => <button key={playbook.id} type="button" disabled={!canRunPlaybooks || !!variablePrompt || (taskMode && !taskSelected)} onClick={() => { setAddMenuOpen(false); onRunPlaybook(playbook); }} className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-[#183522] disabled:opacity-40"><Blocks size={14} className="mt-0.5 shrink-0 text-[#A3FF12]" /><span className="min-w-0"><span className="block truncate text-xs font-bold text-[#E8FFF0]">{playbook.title}</span><span className="mt-0.5 block truncate text-[10px] text-[#7C9B88]">{playbook.description || "Custom Agent Chat prompt"}</span></span></button>)}
                      {!playbooks.length && <p className="px-3 py-5 text-center text-xs text-[#7C9B88]">No saved playbooks</p>}
                    </div>
                  </> : <div className="max-h-64 overflow-y-auto">
                    {taskAssets.map((asset) => <button key={asset.id} type="button" role="checkbox" aria-checked={selectedAssetIds.includes(asset.id)} onClick={() => onToggleTaskAsset?.(asset.id)} className="model-picker-item flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm"><span className="grid size-4 shrink-0 place-items-center">{selectedAssetIds.includes(asset.id) && <Check size={14} />}</span><span className="truncate">{asset.name}</span></button>)}
                  </div>}
                </>}
              </PopoverContent>
            </Popover>
            <div className="ios-chat-controls">
              <Popover open={configOpen} onOpenChange={setConfigOpen}>
                <PopoverTrigger className="ios-chat-config-trigger" aria-label="Model and effort">
                  <strong className="truncate font-medium">{chatModelLabel(model, models)}</strong> <span className="truncate">{effort[0].toUpperCase() + effort.slice(1)}</span><ChevronDown size={14} />
                </PopoverTrigger>
                <PopoverContent side="top" align="start" className="ios-chat-config-popover">
                  <PopoverTitle className="sr-only">Model and effort</PopoverTitle>
                  <div className="ios-chat-config-row"><span className="inline-flex items-center gap-2">Model{modelsStatus === "Loading models…" && <LoaderCircle size={13} className="animate-spin text-[#7C9B88]" aria-label="Loading models" />}{!taskMode && <button type="button" onClick={() => setShowDebug((visible) => !visible)} className="text-[#7C9B88] hover:text-[#2B2B2B]" aria-label="Toggle App Server model debug" title="Show App Server model"><Info size={13} /></button>}</span>
                    <ModelPicker value={model} models={models} onChange={onModelChange} className="ios-chat-config-select" ariaLabel="Model" />
                  </div>
                  {availableFavoriteModels.length > 0 && <div className="ios-chat-config-favorites" aria-label="Favorite models">
                    <p>Favorites</p>
                    <div>
                      {availableFavoriteModels.map((id) => <button key={id} type="button" onClick={() => { onModelChange(id); setConfigOpen(false); }} aria-current={model === id ? "true" : undefined} title={chatModelLabel(id, models)}><span>{chatModelLabel(id, models)}</span>{model === id && <Check size={14} />}</button>)}
                    </div>
                  </div>}
                  {modelsStatus && modelsStatus !== "Loading models…" && <p role="status" className="text-xs text-[#7C9B88]">{modelsStatus}</p>}
                  {!taskMode && showDebug && <p className="px-1 text-xs text-[#7C9B88]">App Server: {serverModel ? chatModelLabel(serverModel, models) : "No turn started"}</p>}
                  <div className="ios-chat-config-row">Effort
                    <Select value={effort} onValueChange={(value) => { if (value) onEffortChange(value as ChatEffort); }}>
                      <SelectTrigger className="ios-chat-config-select" aria-label="Effort"><SelectValue /></SelectTrigger>
                      <SelectContent side="right" className="ios-select-content">
                        {chatEfforts.map((value) => <SelectItem key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <button type="button" onClick={() => { onResetConfig(); setConfigOpen(false); }} className="ios-chat-config-reset"><span>Reset to default</span><RotateCcw size={15} /></button>
                </PopoverContent>
              </Popover>
              <Popover open={agentMenuOpen} onOpenChange={setAgentMenuOpen}>
                <PopoverTrigger className="ios-chat-config-trigger max-w-[200px]" aria-label="Agent role" disabled={running || sendPending || !comparison || (taskMode && !taskSelected)}><span className="truncate">{chatAgent?.title ?? "None"}</span><ChevronDown size={14} className="shrink-0" /></PopoverTrigger>
                <PopoverContent side="top" align="start" className="w-72 overflow-hidden border border-[#294536] bg-[#111A15] p-1.5 shadow-2xl shadow-black/60">
                  <PopoverTitle className="px-2 py-2 text-xs font-bold text-[#7C9B88]">Agents</PopoverTitle>
                  <button type="button" onClick={() => { setAgentMenuOpen(false); onManageAgents(); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-bold hover:bg-[#183522]"><Settings size={13} className="text-[#7C9B88]" /> Manage agents</button>
                  <div className="max-h-72 overflow-y-auto">
                    <button type="button" aria-pressed={!chatAgent} onClick={() => { setAgentMenuOpen(false); onAgentChange(null); }} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs font-bold text-[#E8FFF0] hover:bg-[#183522]"><X size={14} className="shrink-0 text-[#7C9B88]" /><span className="flex-1">None</span>{!chatAgent && <Check size={14} className="shrink-0" />}</button>
                    {agents.map((agent) => <button key={agent.id} type="button" aria-pressed={chatAgent?.id === agent.id && chatAgent.prompt === agent.prompt} onClick={() => { setAgentMenuOpen(false); onAgentChange(agent); }} className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-[#183522]"><Bot size={14} className="mt-0.5 shrink-0 text-[#A3FF12]" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-[#E8FFF0]">{agent.title}</span><span className="mt-0.5 block truncate text-[10px] text-[#7C9B88]">{agent.prompt}</span></span>{chatAgent?.id === agent.id && chatAgent.prompt === agent.prompt && <Check size={14} className="mt-0.5 shrink-0" />}</button>)}
                  </div>
                  <p className="px-2.5 pb-1 text-[10px] text-[#7C9B88]">Switching starts a new chat.</p>
                </PopoverContent>
              </Popover>
              <Select value={approvalReviewer} disabled={running || (taskMode && !taskSelected)} onValueChange={(value) => { if (value === "user" || value === "auto_review" || value === "yolo") onApprovalReviewerChange(value); }}>
                <SelectTrigger className="ios-chat-config-trigger" aria-label="Approval mode"><SelectValue>{(value) => approvalReviewerLabels[value as ApprovalReviewer]}</SelectValue></SelectTrigger>
                <SelectContent side="top" className="ios-select-content"><SelectItem value="user">Ask for approval</SelectItem><SelectItem value="auto_review">Approve for me</SelectItem><SelectItem value="yolo" title="Full access without approval prompts">YOLO mode</SelectItem></SelectContent>
              </Select>
              {mode === "plan" && <button type="button" className="ios-chat-plan-toggle" aria-label="Disable Plan mode" aria-pressed="true" title="Disable Plan mode" disabled={running || (taskMode && !taskSelected)} onClick={() => onModeChange("default")}>Plan <span>On</span></button>}
            </div>
            {running ? (
              <><button type="button" disabled={!canSend} onClick={send} className="accent-button ml-auto !size-[30px] shrink-0 !p-0 disabled:opacity-40" aria-label="Queue Review Agent message" title="Queue message"><ArrowUp size={14} /></button><button
                type="button"
                onClick={onCancel}
                disabled={status === "Stopping…" || status === "Starting…"}
                className="grid size-[30px] shrink-0 place-items-center rounded-lg border border-[#a74458] bg-[#5a1e2a] text-[#FFB5BF] hover:bg-[#702536] disabled:opacity-50"
                aria-label="Stop Review Agent response"
                title="Stop Review Agent response"
              >
                <Square size={14} />
              </button></>
            ) : (
              <button
                type="button"
                disabled={!canSend}
                onClick={send}
                className="accent-button ml-auto !size-[30px] shrink-0 !p-0 disabled:opacity-40"
                aria-label="Send Review Agent message"
              >
                <ArrowUp size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
      <Dialog open={!!editingQueued} onOpenChange={(open) => { if (!open) setEditingQueued(null); }}><DialogContent className="ios-sheet w-[min(480px,94vw)] border border-[#294536] bg-[#111A15] p-5"><DialogTitle>Edit queued message</DialogTitle><DialogDescription>Changes apply before this message is sent.</DialogDescription><Textarea value={queuedEditDraft} onChange={(event) => setQueuedEditDraft(event.currentTarget.value)} maxLength={taskMode ? undefined : 20_000} rows={5} className="mt-4" /><div className="mt-4 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setEditingQueued(null)}>Cancel</Button><Button type="button" disabled={!queuedEditDraft.trim() && !editingQueued?.context.attachments.some((attachment) => isChatUpload(attachment) || attachment.kind === "taskAsset")} onClick={() => { if (editingQueued) onEditQueued(editingQueued.id, queuedEditDraft); setEditingQueued(null); }}>Save</Button></div></DialogContent></Dialog>
      <FileReferenceDialog reference={fileReference} compareRef={comparison?.mode === "branch" ? comparison.compareRef : null} onClose={() => setFileReference(null)} />
    </aside>
  );
}

type TerminalOutput = { sessionId: string; data: number[] };
type TerminalExit = { sessionId: string; exitCode: number; signal: string | null };

function TerminalPanel({ rootPath, taskId, visible, onClose }: { rootPath: string; taskId?: string; visible: boolean; onClose: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XtermTerminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionRef = useRef<string | null>(null);
  const activeRef = useRef(false);
  const readyRef = useRef(false);
  const visibleRef = useRef(visible);
  const startRef = useRef<() => void>(() => {});
  const inputQueueRef = useRef(Promise.resolve());

  useEffect(() => { visibleRef.current = visible; }, [visible]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let unlistenOutput: (() => void) | undefined;
    let unlistenExit: (() => void) | undefined;
    const theme = () => {
      const styles = getComputedStyle(document.documentElement);
      return {
        background: styles.getPropertyValue("--ios-grouped-background").trim(),
        foreground: styles.getPropertyValue("--ios-label").trim(),
        cursor: styles.getPropertyValue("--ios-label").trim(),
        selectionBackground: styles.getPropertyValue("--ios-fill-strong").trim(),
      };
    };
    const terminal = new XtermTerminal({
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 12,
      minimumContrastRatio: 7,
      scrollback: 10_000,
      theme: theme(),
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host);
    terminalRef.current = terminal;
    fitRef.current = fit;

    const sendInput = (data: Uint8Array) => {
      const sessionId = sessionRef.current;
      if (!sessionId || !activeRef.current) return;
      inputQueueRef.current = inputQueueRef.current
        .then(() => invoke("write_terminal", { sessionId, data: [...data] }))
        .then(() => undefined)
        .catch(() => undefined);
    };
    const input = terminal.onData((data) => sendInput(new TextEncoder().encode(data)));
    const binary = terminal.onBinary((data) => sendInput(Uint8Array.from([...data], (value) => value.charCodeAt(0))));
    const resize = terminal.onResize(({ rows, cols }) => {
      const sessionId = sessionRef.current;
      if (sessionId && activeRef.current) void invoke("resize_terminal", { sessionId, rows, cols }).catch(() => {});
    });
    const appearance = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => { terminal.options.theme = theme(); };
    appearance.addEventListener("change", updateTheme);
    const start = () => {
      if (disposed || !readyRef.current || activeRef.current) return;
      terminal.reset();
      fit.fit();
      const sessionId = crypto.randomUUID();
      sessionRef.current = sessionId;
      activeRef.current = true;
      void invoke("start_terminal", { sessionId, rows: terminal.rows, cols: terminal.cols, taskId }).then(() => {
        if (disposed) void invoke("stop_terminal", { sessionId }).catch(() => {});
      }).catch((reason) => {
        if (sessionRef.current !== sessionId) return;
        activeRef.current = false;
        sessionRef.current = null;
        terminal.writeln(`\r\n[Cannot start terminal: ${message(reason)}]`);
      });
    };
    startRef.current = start;

    void Promise.all([
      listen<TerminalOutput>("terminal-output", (event) => {
        if (event.payload.sessionId === sessionRef.current) terminal.write(new Uint8Array(event.payload.data));
      }),
      listen<TerminalExit>("terminal-exit", (event) => {
        if (event.payload.sessionId !== sessionRef.current) return;
        activeRef.current = false;
        sessionRef.current = null;
        terminal.writeln(`\r\n[Terminal exited${event.payload.signal ? `: ${event.payload.signal}` : ` with code ${event.payload.exitCode}`}]`);
      }),
    ]).then(([stopOutput, stopExit]) => {
      if (disposed) {
        stopOutput();
        stopExit();
        return;
      }
      unlistenOutput = stopOutput;
      unlistenExit = stopExit;
      readyRef.current = true;
      if (visibleRef.current) start();
    });

    const observer = new ResizeObserver(() => { if (visibleRef.current) fit.fit(); });
    observer.observe(host);
    return () => {
      disposed = true;
      readyRef.current = false;
      observer.disconnect();
      appearance.removeEventListener("change", updateTheme);
      input.dispose();
      binary.dispose();
      resize.dispose();
      unlistenOutput?.();
      unlistenExit?.();
      const sessionId = sessionRef.current;
      sessionRef.current = null;
      activeRef.current = false;
      if (sessionId) void invoke("stop_terminal", { sessionId }).catch(() => {});
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, [rootPath, taskId]);

  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(() => {
      fitRef.current?.fit();
      startRef.current();
      terminalRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  return <section className={`ios-terminal-panel flex h-[clamp(180px,32vh,300px)] shrink-0 flex-col border-t border-[#294536] bg-[#0B110E] p-2 ${visible ? "" : "hidden"}`} aria-label={taskId ? "Task worktree terminal" : "Repository terminal"}><div className="flex shrink-0 items-center justify-between pb-1 text-xs text-[#7C9B88]"><span>Terminal</span><button type="button" onClick={onClose} aria-label="Close terminal session" title="End this terminal session and its running commands" className="quiet-button grid size-6 place-items-center"><X size={14} /></button></div><div ref={hostRef} className="min-h-0 flex-1" /></section>;
}

function TaskDescriptionEditor({ value, onChange, github }: { value: string; onChange: (value: string) => void; github?: GitHubLink }) {
  const [imageError, setImageError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(value);
  const [dirty, setDirty] = useState(false);
  const draftRef = useRef(value);
  const dirtyRef = useRef(false);
  const editingRef = useRef(false);
  const latestRef = useRef({ value, onChange });
  useLayoutEffect(() => { latestRef.current = { value, onChange }; });
  const change = useCallback((next: string) => {
    draftRef.current = next;
    dirtyRef.current = next !== latestRef.current.value;
    setDraft(next);
    setDirty(dirtyRef.current);
  }, []);
  const flush = useCallback(() => {
    if (!dirtyRef.current) return;
    // The local draft wins over external edits received during this editing session.
    latestRef.current.onChange(draftRef.current);
    dirtyRef.current = false;
    setDirty(false);
  }, []);
  const acceptExternal = useCallback(() => {
    if (editingRef.current || dirtyRef.current || draftRef.current === latestRef.current.value) return;
    const form = containerRef.current?.closest<HTMLElement>(".task-details-form");
    const top = form?.scrollTop;
    draftRef.current = latestRef.current.value;
    setDraft(draftRef.current);
    // Importing an external description scrolls the Markdown editor back to its selection.
    const frame = requestAnimationFrame(() => { if (form && top !== undefined) form.scrollTop = top; });
    return () => cancelAnimationFrame(frame);
  }, []);
  useLayoutEffect(() => acceptExternal(), [value, acceptExternal]);
  useEffect(() => {
    const save = () => flushSync(flush);
    window.addEventListener("beforeunload", save);
    window.addEventListener("flush-task-fields", save);
    return () => {
      window.removeEventListener("beforeunload", save);
      window.removeEventListener("flush-task-fields", save);
      flush();
    };
  }, [flush]);
  const imagePreviewHandler = useMemo(() => {
    if (!github) return undefined;
    const previews = new Map<string, Promise<string>>();
    return (source: string) => {
      if (!previews.has(source)) previews.set(source, previewGitHubImage(source, github).catch((error) => { setImageError(message(error)); return source; }));
      return previews.get(source)!;
    };
  }, [github]);
  return <div ref={containerRef} className="task-details-control task-description-editor min-w-0" role="group" aria-label="Issue description" onFocusCapture={() => { editingRef.current = true; }} onBlurCapture={(event) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    editingRef.current = false;
    if (dirtyRef.current) flush(); else acceptExternal();
  }}>
    <MarkdownEditor value={draft} onChange={change} imagePreviewHandler={imagePreviewHandler} placeholder="What needs to be done?" contentClassName="chat-markdown task-description-content" maxLength={20_000} />
    <div className="flex justify-end"><button type="button" aria-label="Save description" disabled={!dirty} onClick={flush} className="quiet-button px-3 py-1 text-xs disabled:opacity-40">Save</button></div>
    {imageError && <p role="alert" className="mt-2 text-xs text-[#FB7185]">Could not load a GitHub image: {imageError}</p>}
  </div>;
}

function TaskTextField({ value, onChange, multiline, type, linkLabel, ...props }: Pick<ComponentProps<typeof Input>, "id" | "aria-label" | "className" | "maxLength" | "disabled" | "type"> & { value: string; onChange: (value: string) => void; multiline?: boolean; linkLabel?: string }) {
  const [draft, change, flush] = useTaskFieldDraft(value, onChange);
  const [linkError, setLinkError] = useState("");
  const input = multiline
    ? <Textarea {...props} value={draft} onChange={(event) => change(event.currentTarget.value)} onBlur={flush} rows={3} />
    : <Input {...props} type={type} value={draft} onChange={(event) => change(event.currentTarget.value)} onBlur={flush} />;
  if (!linkLabel) return input;
  const url = taskCustomFieldUrl(draft);
  return <div><div className="flex gap-2">{input}<button type="button" disabled={!url} title={url ? `Open ${linkLabel} in browser` : "Enter a full http:// or https:// URL"} aria-label={`Open ${linkLabel} in browser`} onClick={() => { if (!url) return; setLinkError(""); void openUrl(url).catch((reason) => setLinkError(`Could not open ${linkLabel}: ${message(reason)}`)); }} className="grid size-10 shrink-0 place-items-center bg-transparent text-[var(--ios-label)] hover:text-[var(--ios-tint)] focus-visible:outline-2 focus-visible:outline-[var(--ios-tint)] disabled:opacity-40"><ExternalLinkIcon size={16} /></button></div>{linkError && <p role="alert" className="mt-2 text-xs text-[#FB7185]">{linkError}</p>}</div>;
}

function TaskDetailsTitleInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return <Input value={draft} onChange={(event) => setDraft(event.currentTarget.value)} onBlur={() => { const title = draft.trim(); if (title && title !== value) onChange(title); else setDraft(value); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} maxLength={500} className="task-details-title-input" />;
}

function TaskCommentForm({ onAdd }: { onAdd: (body: string) => void }) {
  const [draft, setDraft] = useState("");
  const submit = () => { const body = draft.trim(); if (!body) return; onAdd(body); setDraft(""); };
  return <form onSubmit={(event) => { event.preventDefault(); submit(); }} className="space-y-2"><Textarea value={draft} onChange={(event) => setDraft(event.currentTarget.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} maxLength={5_000} rows={3} placeholder="Write a comment…" aria-label="Write a task comment" className="task-details-control min-h-20 w-full resize-y px-3 py-2 text-sm" /><div className="flex justify-end"><button type="submit" disabled={!draft.trim()} className="quiet-button text-xs disabled:opacity-40">Add comment</button></div></form>;
}

type TaskAssetPreview = { kind: "image" | "pdf" | "video"; path: string } | { kind: "text"; content: string; truncated: boolean } | { kind: "unsupported" };

function TaskDetailsPanel({ task, branchPrefix, onBranchNameChange, customFields, branches, remoteBranches, workspaceBranch, startLocked, assetBusy, onTitleChange, onDescriptionChange, onScheduleChange, onCustomFieldChange, onStatusChange, onColorChange, onLocationChange, onStartChange, onStartOpen, onAddAssets, onRemoveAsset, onAddComment, onUpdateComment, onDeleteComment }: {
  task: RepositoryTask | null;
  branchPrefix: string;
  onBranchNameChange: (name: string) => void;
  customFields: TaskCustomField[];
  branches: string[];
  remoteBranches: string[];
  workspaceBranch: string | null;
  startLocked: boolean;
  assetBusy: boolean;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void;
  onScheduleChange: (schedule: Pick<RepositoryTask, "startDate" | "deadline">) => void;
  onCustomFieldChange: (id: string, value: string | null) => void;
  onStatusChange: (status: TaskBoardStatus) => void;
  onColorChange: (color: TaskColor) => void;
  onLocationChange: (location: TaskLocation) => void;
  onStartChange: (start: NonNullable<RepositoryTask["worktreeStart"]>) => void;
  onStartOpen: () => void;
  onAddAssets: (paths: string[]) => void;
  onRemoveAsset: (id: string) => void;
  onAddComment: (body: string) => void;
  onUpdateComment: (id: string, body: string) => void;
  onDeleteComment: (id: string) => void;
}) {
  const [copyError, setCopyError] = useState<string | null>(null);
  const [draggingAssets, setDraggingAssets] = useState(false);
  const [assetDownloadError, setAssetDownloadError] = useState<string | null>(null);
  const [downloadingAssetId, setDownloadingAssetId] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<{ taskId: string; assetId: string; preview?: TaskAssetPreview; error?: string } | null>(null);
  const addAssetsRef = useRef(onAddAssets);
  const dropEnabledRef = useRef(!!task && !assetBusy);
  const branchFilter = Combobox.useFilter();
  useEffect(() => { setCopyError(null); }, [task?.id]);
  useEffect(() => { setAssetDownloadError(null); }, [task?.id]);
  useEffect(() => { addAssetsRef.current = onAddAssets; dropEnabledRef.current = !!task && !assetBusy; if (assetBusy || !task) setDraggingAssets(false); }, [onAddAssets, assetBusy, task]);
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void getCurrentWindow().onDragDropEvent((event) => {
      if (event.payload.type === "leave") { setDraggingAssets(false); return; }
      const inside = dropEnabledRef.current && nativeDropHits("task-assets-dropzone", event.payload.position);
      setDraggingAssets(inside);
      if (inside && event.payload.type === "drop") addAssetsRef.current(event.payload.paths);
    }).then((stop) => { if (disposed) stop(); else unlisten = stop; });
    return () => { disposed = true; unlisten?.(); };
  }, []);
  const pickAssets = () => { void open({ multiple: true }).then((paths) => { if (Array.isArray(paths)) onAddAssets(paths); else if (paths) onAddAssets([paths]); }); };
  const status = task ? taskBoardStatus(task) : "clear";
  const color = taskColors.find((item) => item.value === task?.color);
  const openAssetPreview = (asset: TaskAsset) => {
    if (!task) return;
    const taskId = task.id;
    setPreviewAsset({ taskId, assetId: asset.id });
    void invoke<TaskAssetPreview>("task_asset_preview", { taskId, assetId: asset.id }).then((preview) => {
      setPreviewAsset((current) => current?.taskId === taskId && current.assetId === asset.id ? { ...current, preview } : current);
    }).catch((reason) => {
      setPreviewAsset((current) => current?.taskId === taskId && current.assetId === asset.id ? { ...current, error: message(reason) } : current);
    });
  };
  const expandedAsset = task && previewAsset && task.id === previewAsset.taskId ? task.assets.find((asset) => asset.id === previewAsset.assetId) : null;
  const downloadAsset = async (asset: TaskAsset) => {
    if (!task) return;
    setAssetDownloadError(null);
    setDownloadingAssetId(asset.id);
    try { await invoke("download_task_asset", { taskId: task.id, assetId: asset.id, name: asset.name }); }
    catch (reason) { setAssetDownloadError(message(reason)); }
    finally { setDownloadingAssetId(null); }
  };
  const start = task?.worktreeStart;
  const startValue = start?.kind === "workspace" ? "workspace" : start?.branch ? `${start.kind === "existing" && start.remote ? "existing-remote" : start.kind}:${start.branch}` : null;
  const startOptionLabel = (value: string) => {
    if (value === "workspace") return `Current workspace (${workspaceBranch ?? "HEAD"})`;
    const branch = value.slice(value.indexOf(":") + 1);
    if ((value.startsWith("branch:") || value.startsWith("existing:")) && remoteBranches.includes(branch)) return `${branch} (local)`;
    if ((value.startsWith("remote:") || value.startsWith("existing-remote:")) && branches.includes(branch)) return `${branch} (remote)`;
    return branch;
  };
  return <section className="relative flex h-full min-h-0 min-w-0 flex-col border-l border-[#294536] bg-[var(--ios-grouped-background)]" aria-label="Task details">
    {!task ? <p className="p-5 text-sm text-[#7C9B88]">Select a task to see its details.</p> : <div className="task-details-form min-h-0 flex-1 overflow-y-auto">
      <label className="task-details-title"><span className="sr-only">Task title</span><TaskDetailsTitleInput key={task.id} value={task.title} onChange={onTitleChange} /></label>
      <GitHubTaskLink key={`github-${task.id}`} task={task} />
      <div className="task-details-description space-y-2"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-[#7C9B88]">Description</span><div className="flex items-center gap-1"><button type="button" disabled={!task.description} onClick={() => { void navigator.clipboard.writeText(task.description).then(() => setCopyError(null)).catch((reason) => setCopyError(message(reason))); }} className="task-details-copy quiet-button h-7 px-2 text-xs disabled:opacity-40" aria-label="Copy issue description" title="Copy description"><Copy size={13} /></button></div></div><TaskDescriptionEditor key={task.id} github={task.github} value={task.description} onChange={onDescriptionChange} />{copyError && <p role="alert" className="text-xs text-[#FB7185]">Could not copy description: {copyError}</p>}</div>
      <section aria-label="Task properties">
        <h3 className="task-details-heading">Properties</h3>
        <div className="task-details-properties">
          <div className="task-details-row"><span className="text-xs font-semibold text-[#7C9B88]">Status</span><Select value={status} onValueChange={(value) => value && onStatusChange(value as TaskBoardStatus)}><SelectTrigger className="task-details-control h-10 w-full px-3" aria-label="Task status"><SelectValue>{(value) => value === "inbox" ? "Inbox" : value === "inProgress" ? "In development" : value === "inReview" ? "In review" : value === "done" ? "Done" : "Needs planning"}</SelectValue></SelectTrigger><SelectContent className="ios-select-content"><SelectItem value="inbox">Inbox</SelectItem><SelectItem value="clear">Needs planning</SelectItem><SelectItem value="inProgress">In development</SelectItem><SelectItem value="inReview">In review</SelectItem><SelectItem value="done">Done</SelectItem></SelectContent></Select></div>
          <div className="task-details-row">
            <span className="text-xs font-semibold text-[#7C9B88]">Color</span>
            <Select value={task.color} onValueChange={(value) => value && onColorChange(value as TaskColor)}>
              <SelectTrigger className="task-details-control h-10 w-full px-3" aria-label="Task color"><SelectValue>{() => <><span aria-hidden="true" className={`task-color-dot ${task.color === "clear" ? "task-color-dot-clear" : ""}`} style={{ backgroundColor: color?.color }} />{color?.label}</>}</SelectValue></SelectTrigger>
              <SelectContent className="ios-select-content">{taskColors.map((item) => <SelectItem key={item.value} value={item.value}><span aria-hidden="true" className={`task-color-dot ${item.value === "clear" ? "task-color-dot-clear" : ""}`} style={{ backgroundColor: item.color }} />{item.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="task-details-row"><span className="text-xs font-semibold text-[#7C9B88]">Location</span><Select value={task.location === "workspace" ? "workspace" : task.worktreeStart?.kind === "existing" ? "existing" : "worktree"} onValueChange={(value) => value && onLocationChange(value as TaskLocation)} disabled={startLocked}><SelectTrigger className="task-details-control h-10 w-full px-3" aria-label="Where the agent works"><SelectValue>{(value) => value === "workspace" ? "Workspace" : value === "existing" ? "Work on existing" : "New Branch"}</SelectValue></SelectTrigger><SelectContent className="ios-select-content"><SelectItem value="workspace">Workspace</SelectItem><SelectItem value="worktree">New Branch</SelectItem><SelectItem value="existing">Work on existing</SelectItem></SelectContent></Select></div>
          {task.location === "worktree" && task.worktreeStart?.kind !== "existing" && <div className="task-details-row">
            <label htmlFor={`task-branch-name-${task.id}`} className="text-xs font-semibold text-[#7C9B88]">Branch name</label>
            <TaskTextField key={task.id} id={`task-branch-name-${task.id}`} aria-label="Branch name" value={task.worktree?.branch ?? taskNewBranchName(task, branchPrefix)} onChange={onBranchNameChange} disabled={startLocked} className="task-details-control h-10 w-full px-3 font-mono" />
          </div>}
          {task.location === "worktree" && <div className="task-details-row">
            <span className="text-xs font-semibold text-[#7C9B88]">{task.worktreeStart?.kind === "existing" ? "Branch" : "Start from"}</span>
            {startLocked ? <p className="task-details-control truncate px-3 py-2 text-sm">{startValue && startValue !== "workspace" ? startOptionLabel(startValue) : `Current workspace (${task.worktree?.baseBranch ?? workspaceBranch ?? "HEAD"})`}</p> : <Combobox.Root items={task.worktreeStart?.kind === "existing" ? [...branches.map((branch) => `existing:${branch}`), ...remoteBranches.map((branch) => `existing-remote:${branch}`)] : ["workspace", ...branches.map((branch) => `branch:${branch}`), ...remoteBranches.map((branch) => `remote:${branch}`)]} value={startValue} onOpenChange={(open) => { if (open) onStartOpen(); }} onValueChange={(value) => { if (value === "workspace") onStartChange({ kind: "workspace" }); else if (value?.startsWith("branch:")) onStartChange({ kind: "branch", branch: value.slice(7) }); else if (value?.startsWith("remote:")) onStartChange({ kind: "remote", branch: value.slice(7) }); else if (value?.startsWith("existing-remote:")) onStartChange({ kind: "existing", branch: value.slice(16), remote: true }); else if (value?.startsWith("existing:")) onStartChange({ kind: "existing", branch: value.slice(9) }); }} filter={(value, query) => branchFilter.contains(value === "workspace" ? `Current workspace ${workspaceBranch ?? "HEAD"}` : value.slice(value.indexOf(":") + 1), query)}>
              <Combobox.Label className="sr-only">{task.worktreeStart?.kind === "existing" ? "Branch" : "Start from"}</Combobox.Label>
              <Combobox.Trigger className="task-details-control model-picker-trigger flex h-10 w-full min-w-0 justify-between px-3 text-sm"><span className="truncate"><Combobox.Value placeholder="Choose a branch">{(value) => typeof value === "string" ? startOptionLabel(value) : "Choose a branch"}</Combobox.Value></span><ChevronDown size={14} /></Combobox.Trigger>
              <Combobox.Portal><Combobox.Positioner align="start" side="bottom" sideOffset={4} className="isolate z-[110]"><Combobox.Popup className="ios-select-content model-picker-popup outline-none" aria-label="Start from"><Combobox.Input autoFocus placeholder="Search branches" aria-label="Search branches" className="model-picker-input" /><Combobox.Empty className="model-picker-empty">No matching branches.</Combobox.Empty><Combobox.List className="model-picker-list outline-none">{(value: string) => <Combobox.Item key={value} value={value} className="model-picker-item grid w-full grid-cols-[14px_1fr] items-center gap-2 rounded px-2 py-1.5 text-left text-sm"><Combobox.ItemIndicator className="col-start-1"><Check size={14} /></Combobox.ItemIndicator><span className="col-start-2 truncate">{startOptionLabel(value)}</span></Combobox.Item>}</Combobox.List></Combobox.Popup></Combobox.Positioner></Combobox.Portal>
            </Combobox.Root>}
          </div>}
        </div>
        <TaskScheduleFields key={task.id} task={task} onChange={onScheduleChange} />
      </section>
      {customFields.length > 0 && <details key={task.id} className="task-details-custom group">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-[#E8FFF0] [&::-webkit-details-marker]:hidden"><ChevronRight size={14} className="transition-transform group-open:rotate-90" />Custom fields</summary>
        <div className="mt-4 space-y-4">{customFields.map((field) => <div key={field.id} className="space-y-2"><label htmlFor={`task-custom-${field.id}`} className="text-xs font-semibold text-[#7C9B88]">{field.name}</label>{field.type === "text"
          ? <TaskTextField key={task.id} multiline={field.multiline} id={`task-custom-${field.id}`} type={field.hyperlink ? "url" : "text"} linkLabel={field.hyperlink ? field.name : undefined} value={task.customFields[field.id] ?? ""} onChange={(value) => onCustomFieldChange(field.id, value || null)} maxLength={5_000} className={field.multiline ? "task-details-control w-full resize-y px-3 py-2 text-sm" : "task-details-control h-10 min-w-0 w-full px-3 text-sm"} />
          : <Select value={task.customFields[field.id] ?? "none"} onValueChange={(value) => onCustomFieldChange(field.id, value === "none" ? null : value)}><SelectTrigger id={`task-custom-${field.id}`} className="task-details-control h-10 w-full px-3" aria-label={field.name}><SelectValue>{(value) => field.options.find((option) => option.id === value)?.label ?? "No value"}</SelectValue></SelectTrigger><SelectContent className="ios-select-content"><SelectItem value="none">No value</SelectItem>{field.options.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent></Select>}</div>)}</div>
      </details>}
      <div className="space-y-2">
        <h3 className="task-details-heading">Attachments</h3>
        <button id="task-assets-dropzone" type="button" disabled={assetBusy} data-dragging={draggingAssets} onClick={pickAssets} className="task-assets-dropzone flex w-full items-center gap-3 px-4 py-3 text-left text-xs disabled:opacity-40"><Plus size={17} className="shrink-0" /><span className="min-w-0"><strong className="block text-[13px] font-medium text-[#E8FFF0]">Add files or screenshots</strong><span className="mt-0.5 block">Drop here or browse</span></span></button>
        
        {task.assets.length > 0 && <ul className="task-asset-grid">{task.assets.map((asset) => <li key={asset.id} className="task-asset-card">
          <button type="button" className="task-asset-thumbnail" onClick={() => openAssetPreview(asset)} aria-label={`Preview ${asset.name}`}>{asset.image ? <TaskAssetThumbnail taskId={task.id} assetId={asset.id} /> : <FileText size={28} />}</button>
          <span className="task-asset-name" title={asset.name}>{asset.name}</span>
          <button type="button" disabled={assetBusy || downloadingAssetId !== null} onClick={() => { void downloadAsset(asset); }} aria-label={`Download ${asset.name}`} title="Download file" className="task-asset-download">{downloadingAssetId === asset.id ? <LoaderCircle size={13} className="animate-spin" /> : <Download size={13} />}</button>
          <button type="button" disabled={assetBusy} onClick={() => onRemoveAsset(asset.id)} aria-label={`Remove ${asset.name}`} className="task-asset-remove"><X size={13} /></button>
        </li>)}</ul>}
        {assetDownloadError && <p role="alert" className="text-xs text-[#FB7185]">Could not download file: {assetDownloadError}</p>}
      </div>
      <section className="space-y-3" aria-label="Task comments">
        <h3 className="task-details-heading">Comments</h3>
        {task.comments.length === 0 ? <p className="text-xs text-[#7C9B88]">No comments yet.</p> : <ol className="space-y-2">{task.comments.map((comment) => <li key={comment.id} className="task-details-control px-3 py-2.5"><div className="mb-2 flex items-center justify-between gap-2 text-xs text-[#7C9B88]"><span className="font-semibold">{comment.author === "agent" ? "Agent" : "You"}</span><div className="flex items-center gap-2"><time dateTime={new Date(comment.createdAt).toISOString()}>{new Date(comment.createdAt).toLocaleString()}</time><button type="button" onClick={() => onDeleteComment(comment.id)} aria-label={`Delete ${comment.author} comment`} title="Delete comment" className="grid size-6 place-items-center rounded-md text-[#7C9B88] hover:bg-[#294536] hover:text-[#FB7185]"><Trash2 size={13} /></button></div></div><div className="chat-markdown task-comment-markdown text-sm text-[#E8FFF0]"><TaskCommentMarkdown body={comment.body} onChange={(body) => onUpdateComment(comment.id, body)} /></div></li>)}</ol>}
        <TaskCommentForm key={task.id} onAdd={onAddComment} />
      </section>
    </div>}
    <Dialog open={!!expandedAsset} onOpenChange={(open) => { if (!open) setPreviewAsset(null); }}>
      <DialogContent className="grid h-[85vh] w-[min(900px,90vw)] !max-w-none grid-rows-[48px_minmax(0,1fr)] gap-0 overflow-hidden border border-[#294536] bg-[#0B110E] p-0">
        <header className="flex min-w-0 items-center border-b border-[#294536] px-4 pr-12"><DialogTitle className="truncate text-sm">{expandedAsset?.name}</DialogTitle></header>
        <DialogDescription className="sr-only">Task asset preview</DialogDescription>
        <div className="flex min-h-0 min-w-0 items-center justify-center overflow-hidden p-4">
          {previewAsset?.error ? <p role="alert" className="text-[#FB7185]">{previewAsset.error}</p>
            : !previewAsset?.preview ? <LoaderCircle size={20} className="animate-spin text-[#7C9B88]" />
              : previewAsset.preview.kind === "image" ? <img src={convertFileSrc(previewAsset.preview.path)} alt={expandedAsset?.name ?? ""} className="max-h-full max-w-full object-contain" />
                : previewAsset.preview.kind === "pdf" ? <iframe src={convertFileSrc(previewAsset.preview.path)} title={expandedAsset?.name ?? "PDF preview"} className="h-full w-full rounded bg-white" />
                  : previewAsset.preview.kind === "video" ? <video src={convertFileSrc(previewAsset.preview.path)} controls playsInline preload="metadata" className="h-full w-full min-h-0 min-w-0 rounded bg-black object-contain" aria-label={expandedAsset?.name ?? "Video preview"} />
                  : previewAsset.preview.kind === "text" ? <div className="h-full w-full overflow-auto"><pre className="whitespace-pre-wrap break-words font-mono text-xs text-[#E8FFF0]">{previewAsset.preview.content || "This file is empty."}</pre>{previewAsset.preview.truncated && <p className="mt-4 text-xs text-[#7C9B88]">Showing the first 1 MB.</p>}</div>
                    : <p className="text-[#7C9B88]">Preview unavailable for this file type.</p>}
        </div>
      </DialogContent>
    </Dialog>
  </section>;
}

function CodeMirrorTaskDiff({ diff }: { diff: FileDiff }) {
  const host = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => reviewUnifiedLines(diff), [diff]);
  const language = useCodeMirrorLanguage(diff.path);
  useEffect(() => {
    if (!host.current) return;
    const decorations = [];
    const colors = new RangeSetBuilder<GutterMarker>();
    let from = 0;
    for (const line of lines) {
      if (line.kind !== "context") {
        decorations.push(Decoration.line({ class: `cm-review-${line.kind}-line` }).range(from));
        colors.add(from, from, new ReviewGutterMarker(line.kind));
      }
      from += line.cell.text.length + 1;
    }
    const view = new EditorView({
      doc: lines.map((line) => line.cell.text).join("\n"),
      parent: host.current,
      extensions: [EditorState.readOnly.of(true), EditorView.editable.of(false), lineNumbers({ formatNumber: (number) => String(lines[number - 1]?.cell.lineNumber || "") }), gutterLineClass.of(colors.finish()), appliedDiffTheme, ...language, EditorView.lineWrapping, EditorView.decorations.of(Decoration.set(decorations))],
    });
    return () => view.destroy();
  }, [language, lines]);
  return <div ref={host} className="codemirror-diff codemirror-task-diff" />;
}

function TaskChangesPanel({ task, repository, model, revision, active, taskRunning, runningBranches, onMerged, onWorkspaceCommit, onPendingChange }: {
  task: RepositoryTask | null;
  repository: RepositoryInfo;
  model: string;
  revision: number;
  active: boolean;
  taskRunning: boolean;
  runningBranches: ReadonlySet<string>;
  onMerged: () => void;
  onWorkspaceCommit: (repo: RepositoryInfo) => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const [changes, setChanges] = useState<TaskChanges | null>(null);
  const reportPendingChange = useEffectEvent(onPendingChange);
  const [diffs, setDiffs] = useState<Record<string, FileDiff>>({});
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(() => new Set());
  const [diffErrors, setDiffErrors] = useState<Record<string, string>>({});
  const snapshotIdRef = useRef<string | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [localRevision, setLocalRevision] = useState(0);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeMessage, setMergeMessage] = useState("");
  const [targets, setTargets] = useState<[string, string][]>([]);
  const [target, setTarget] = useState("");
  const [merging, setMerging] = useState(false);
  const [mergedOid, setMergedOid] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);
  const comparisonBranchKey = `chaoticreview.task-comparison-base:${repository.rootPath}:${task?.id ?? ""}`;
  const [comparisonBranch, setComparisonBranch] = useState<string | null>(() => fileStore.getItem(comparisonBranchKey));
  const [comparisonBranches, setComparisonBranches] = useState<BranchRefs | null>(null);
  const taskId = task?.id;
  const location = task?.location;
  const baseOid = task?.worktree?.baseOid;

  useEffect(() => { setComparisonBranch(fileStore.getItem(comparisonBranchKey)); setComparisonBranches(null); }, [comparisonBranchKey]);
  useEffect(() => { snapshotIdRef.current = null; setChanges(null); setDiffs({}); setExpandedFiles(new Set()); setDiffErrors({}); setCommitMessage(""); setError(""); }, [taskId, location, baseOid, repository.rootPath]);

  useEffect(() => {
    if (!active) return;
    let disposed = false;
    let loading = false;
    const load = async () => {
      if (!taskId || (location === "worktree" && !baseOid)) { if (!disposed) { setChanges(null); reportPendingChange(false); } return; }
      if (loading || document.hidden) return;
      loading = true;
      try {
        const next = location === "worktree"
          ? await invoke<TaskChanges>("load_task_changes", { taskId, baseOid, baseRef: comparisonBranch })
          : await invoke<Comparison>("compare_working_copy").then((comparison) => ({ comparison, pendingSnapshotId: comparison.snapshotId, pendingFiles: comparison.files.length > 0, committedChanges: false, headOid: comparison.baseOid, squashMessage: "" }));
        if (!disposed) {
          reportPendingChange(next.pendingFiles);
          if (snapshotIdRef.current !== next.comparison.snapshotId) {
            snapshotIdRef.current = next.comparison.snapshotId;
            setDiffs({});
            setExpandedFiles(new Set());
            setDiffErrors({});
          }
          setChanges(next);
        }
      } catch (reason) { if (!disposed) setError(message(reason)); }
      finally { loading = false; }
    };
    void load();
    const timer = window.setInterval(() => void load(), 2500);
    document.addEventListener("visibilitychange", load);
    return () => { disposed = true; window.clearInterval(timer); document.removeEventListener("visibilitychange", load); };
  }, [active, taskId, location, baseOid, repository.rootPath, revision, localRevision, comparisonBranch]);

  const loadFile = async (file: ChangedFile) => {
    if (!task || !changes) return;
    if (file.binary) return;
    const snapshotId = changes.comparison.snapshotId;
    setDiffErrors((current) => { const next = { ...current }; delete next[file.path]; return next; });
    try {
      const diff = task.location === "worktree"
        ? await invoke<FileDiff>("load_task_file_diff", { input: { taskId: task.id, baseOid: task.worktree!.baseOid, baseRef: comparisonBranch, snapshotId, path: file.path, oldPath: file.oldPath } })
        : await invoke<FileDiff>("load_working_file_diff", { baseOid: changes.comparison.baseOid, oldPath: file.oldPath, path: file.path, fullFile: false });
      if (snapshotIdRef.current === snapshotId) setDiffs((current) => ({ ...current, [file.path]: diff }));
    } catch (reason) { if (snapshotIdRef.current === snapshotId) setDiffErrors((current) => ({ ...current, [file.path]: message(reason) })); }
  };

  const toggleFile = (file: ChangedFile) => {
    if (!active) return;
    const expanded = expandedFiles.has(file.path);
    setExpandedFiles((current) => { const next = new Set(current); if (expanded) next.delete(file.path); else next.add(file.path); return next; });
    if (!expanded && !file.binary && !diffs[file.path]) void loadFile(file);
  };

  const commit = async () => {
    if (!task || !changes || !commitMessage.trim() || busy || taskRunning) return;
    setBusy(true); setError("");
    try {
      if (task.location === "worktree") await invoke("commit_task_changes", { taskId: task.id, message: commitMessage, snapshotId: changes.pendingSnapshotId });
      else onWorkspaceCommit(await invoke<RepositoryInfo>("commit_working_copy", { message: commitMessage, snapshotId: changes.pendingSnapshotId }));
      setCommitMessage(""); setLocalRevision((value) => value + 1);
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  };

  const generate = async () => {
    if (!task || !changes || generating) return;
    setGenerating(true); setError("");
    try { setCommitMessage(await invoke<string>("generate_commit_message", { snapshotId: changes.pendingSnapshotId, model, taskId: task.location === "worktree" ? task.id : undefined })); }
    catch (reason) { setError(message(reason)); }
    finally { setGenerating(false); }
  };

  const openMerge = async () => {
    if (!task?.worktree || !changes?.committedChanges) return;
    try {
      const options = (await invoke<[string, string][]>("list_merge_targets")).filter(([branch]) => branch !== task.worktree?.branch);
      setTargets(options);
      const preferredTarget = (comparisonBranch ?? task.worktree.baseBranch ?? changes.comparison.baseRef)?.replace(/^origin\//, "");
      setTarget(options.some(([branch]) => branch === preferredTarget) ? preferredTarget! : options[0]?.[0] ?? "");
      setMergeMessage(changes.squashMessage);
      setMergedOid(null);
      setMergeOpen(true); setError("");
    } catch (reason) { setError(message(reason)); }
  };

  const merge = async () => {
    if (!task?.worktree || !changes?.committedChanges || !target || !mergeMessage.trim() || merging || taskRunning || runningBranches.has(target)) return;
    const targetOid = targets.find(([branch]) => branch === target)?.[1];
    if (!targetOid) return;
    setMerging(true); setError("");
    try {
      const oid = await invoke<string>("merge_task_worktree", { input: { taskId: task.id, targetBranch: target, sourceOid: changes.headOid, targetOid, message: mergeMessage } });
      if (repository.hasOrigin) setMergedOid(oid);
      else setMergeOpen(false);
      onMerged(); setLocalRevision((value) => value + 1);
    } catch (reason) { setError(message(reason)); }
    finally { setMerging(false); }
  };

  const pushMerged = async () => {
    if (!mergedOid || pushing) return;
    setPushing(true); setError("");
    try {
      await invoke("push_merged_task_branch", { targetBranch: target, mergedOid });
      setMergeOpen(false); setMergedOid(null);
    } catch (reason) { setError(message(reason)); }
    finally { setPushing(false); }
  };

  const files = changes?.comparison.files ?? [];
  const hasPending = changes?.pendingFiles ?? false;
  const sourceBranch = task?.worktree?.branch ?? repository.currentBranch ?? "Detached HEAD";
  const selectedComparisonBase = comparisonBranch ?? task?.worktree?.baseBranch;
  const comparisonBase = changes ? changes.comparison.baseRef ?? changes.comparison.baseOid.slice(0, 7) : comparisonBranch ?? task?.worktree?.baseBranch ?? task?.worktree?.baseOid.slice(0, 7);
  const comparisonBaseHint = changes?.comparison.baseRef && selectedComparisonBase && changes.comparison.baseRef !== selectedComparisonBase
    ? `${selectedComparisonBase} is behind; comparing with ${changes.comparison.baseRef}.`
    : `Compare with ${comparisonBase}`;
  return <aside className="task-changes-panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-l border-[#294536] bg-[#0B110E]" aria-label="Task changes">
    {task && <header className="task-changes-header">
      <div className="task-changes-toolbar">
      <div className="task-changes-branches" aria-label="Change comparison">
        <GitCompareArrows size={14} className="shrink-0" aria-hidden="true" />
        {task.worktree && comparisonBase ? <><Select value={changes?.comparison.baseRef ?? selectedComparisonBase} onOpenChange={(open) => {
          if (open) void invoke<BranchRefs>("list_branch_refs").then(setComparisonBranches).catch((reason) => setError(message(reason)));
        }} onValueChange={(value) => {
          if (!value) return;
          fileStore.setItem(comparisonBranchKey, value);
          snapshotIdRef.current = null; setChanges(null); setDiffs({}); setExpandedFiles(new Set()); setDiffErrors({}); setError("");
          setComparisonBranch(value);
        }}><SelectTrigger className="task-changes-branch" aria-label="Comparison base branch" title={comparisonBaseHint}><SelectValue>{() => comparisonBase}</SelectValue></SelectTrigger><SelectContent>
          {!comparisonBranches && <SelectItem value={comparisonBase} disabled>{comparisonBase}</SelectItem>}
          <SelectGroup><SelectLabel>Local branches</SelectLabel>{comparisonBranches?.refs.filter((branch) => branch !== sourceBranch).map((branch) => <SelectItem key={branch} value={branch}>{branch}</SelectItem>)}</SelectGroup>
          <SelectGroup><SelectLabel>Remote branches</SelectLabel>{comparisonBranches?.remoteRefs.filter((branch) => branch !== `origin/${sourceBranch}`).map((branch) => <SelectItem key={branch} value={branch}>{branch}</SelectItem>)}</SelectGroup>
        </SelectContent></Select><span aria-label="Changes from">←</span></> : <span>{task.location === "worktree" ? "Worktree not started" : "Uncommitted changes in"}</span>}
        <button type="button" className="task-changes-source" aria-label="Copy source branch name" title={`Copy branch name: ${sourceBranch}`} onClick={() => { void navigator.clipboard.writeText(sourceBranch).catch((reason) => setError(`Could not copy branch name: ${message(reason)}`)); }}><span>{sourceBranch.startsWith("lotse/task/") ? "Task branch" : sourceBranch}</span><Copy size={12} /></button>
      </div>
      {task.worktree && changes?.committedChanges && <button type="button" className="task-changes-merge" disabled={busy || merging || taskRunning} onClick={() => void openMerge()}>Merge…</button>}
      </div>
      {task.worktree && changes && !changes.comparison.baseRef && <p className="task-changes-hint">Choose a base branch to compare.</p>}
    </header>}
    {error && <p role="alert" className="border-b border-[#482631] px-3 py-2 text-xs text-[#FB7185]">{error}</p>}
    <div className="min-h-0 flex-1 overflow-y-auto">
      {!task ? <p className="p-4 text-sm text-[#7C9B88]">Select a task to review its changes.</p> : !changes ? <p className="p-4 text-sm text-[#7C9B88]">{task.location === "worktree" && !task.worktree ? "Send a message to start this task’s worktree." : "Loading changes…"}</p> : !files.length ? <p className="p-4 text-sm text-[#7C9B88]">{task.location === "worktree" ? "No changes in this task yet." : "Your workspace has no uncommitted changes."}</p> : <>
        <div className="task-changes-summary"><span>{files.length} changed {files.length === 1 ? "file" : "files"}</span><span className="ml-auto font-mono"><span className="ios-tree-additions">+{files.reduce((sum, file) => sum + (file.additions ?? 0), 0)}</span> <span className="ios-tree-deletions">−{files.reduce((sum, file) => sum + (file.deletions ?? 0), 0)}</span></span></div>
        {files.map((file) => <div key={file.path} className="task-changes-file"><button type="button" aria-expanded={expandedFiles.has(file.path)} onClick={() => toggleFile(file)} className="task-changes-file-toggle"><ChevronRight size={14} className={`shrink-0 transition-transform ${expandedFiles.has(file.path) ? "rotate-90" : ""}`} /><FileCode2 size={14} className="shrink-0 text-[#7C9B88]" /><span className="min-w-0 flex-1 truncate font-medium" title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}>{file.path}</span><span className="task-changes-status">{{ added: "Added", modified: "Modified", deleted: "Deleted", renamed: "Renamed" }[file.status]}</span><span className="shrink-0 font-mono">{file.binary ? <span className="text-[#7C9B88]">Binary</span> : <><span className="ios-tree-additions">+{file.additions ?? 0}</span> <span className="ios-tree-deletions">−{file.deletions ?? 0}</span></>}</span></button>
          {expandedFiles.has(file.path) && <div className="diff-content border-t border-[#294536] bg-[#0B110E]">{file.binary ? <p className="p-3 text-[#7C9B88]">Binary change</p> : diffErrors[file.path] ? <p role="alert" className="p-3 text-[#FB7185]">{diffErrors[file.path]}</p> : diffs[file.path] ? <CodeMirrorTaskDiff diff={diffs[file.path]} /> : <p className="p-3 text-[#7C9B88]">Loading diff…</p>}</div>}
        </div>)}</>}
    </div>
    {task && changes && hasPending && <section className="ios-commit-section" aria-label="Commit task changes">
      <div className="ios-chat-composer">
        <textarea className="ios-chat-textarea ios-commit-message" rows={2} maxLength={4000} value={commitMessage} onChange={(event) => setCommitMessage(event.currentTarget.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void commit(); } }} placeholder={task.location === "worktree" ? "Describe this task’s changes…" : "Describe your workspace changes…"} aria-label="Task commit message" />
        <div className="ios-commit-actions">
          <button type="button" className="ios-commit-generate" disabled={busy || generating || taskRunning} onClick={() => void generate()}><Sparkles size={13} /> {generating ? "Writing…" : "Suggest message"}</button>
          <button type="button" className="accent-button ios-commit-button" disabled={!commitMessage.trim() || busy || generating || taskRunning} onClick={() => void commit()}>{busy ? "Committing…" : task.location === "worktree" ? "Commit" : repository.hasOrigin ? "Commit & Push" : "Commit"}</button>
        </div>
      </div>
    </section>}
    {mergeOpen && <Dialog open onOpenChange={(open) => { if (!open && !merging && !pushing) { setMergeOpen(false); setMergedOid(null); } }}><DialogContent className="ios-sheet grid-cols-[minmax(0,1fr)] w-[min(440px,94vw)] border border-[#294536] bg-[#111A15] p-5"><DialogTitle>{mergedOid ? "Push merged branch?" : "Squash and merge task"}</DialogTitle><DialogDescription>{mergedOid ? <>The task is merged into <strong>{target}</strong>. Push this branch to origin?</> : "Combine the task's committed changes into one commit on a local branch. The task worktree stays available."}</DialogDescription>{!mergedOid && <><Select value={target} disabled={merging || pushing} onValueChange={(value) => value && setTarget(value)}><SelectTrigger className="mt-4 w-full min-w-0 border-[#294536] bg-[#050807] [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate" aria-label="Target branch"><SelectValue /></SelectTrigger><SelectContent>{targets.map(([branch]) => <SelectItem key={branch} value={branch}>{branch}</SelectItem>)}</SelectContent></Select><label className="mt-4 block min-w-0 space-y-2"><span className="text-xs font-semibold text-[#7C9B88]">Commit message</span><Textarea value={mergeMessage} onChange={(event) => setMergeMessage(event.currentTarget.value)} disabled={merging} maxLength={4000} rows={3} className="w-full resize-y border-[#294536] bg-[#050807] px-3 py-2 text-sm" /></label>{runningBranches.has(target) && <p className="mt-2 text-xs text-[#FB7185]">An agent is working in this target branch.</p>}</>}{error && <p role="alert" className="mt-2 text-xs text-[#FB7185]">{error}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" className="quiet-button" disabled={merging || pushing} onClick={() => { setMergeOpen(false); setMergedOid(null); }}>{mergedOid ? "Not now" : "Cancel"}</button><button type="button" className="accent-button" disabled={mergedOid ? pushing : !target || !mergeMessage.trim() || merging || taskRunning || runningBranches.has(target)} onClick={() => void (mergedOid ? pushMerged() : merge())}>{mergedOid ? pushing ? "Pushing…" : "Push" : merging ? "Merging…" : "Squash & merge"}</button></div></DialogContent></Dialog>}
  </aside>;
}

function App() {
  const [completedOnboarding] = useState(storedOnboardingComplete);
  useEffect(() => {
    try {
      fileStore.removeItem("chaoticreview.repository-detective-catalogs");
      fileStore.removeItem("chaoticreview.repository-interrogation-configs");
    } catch { /* Storage may be unavailable. */ }
  }, []);
  const [repository, setRepository] = useState<RepositoryInfo | null>(null);
  const repositoryRoot = repository?.rootPath ?? null;
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [comparisonMode, setComparisonMode] = useState<"workingCopy" | "branch">("workingCopy");
  const [branchRefs, setBranchRefs] = useState<BranchRefs | null>(null);
  const [branchFilter, setBranchFilter] = useState("");
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
  const [expandedBranchFolders, setExpandedBranchFolders] = useState<Set<string>>(() => new Set());
  const [branchSwitching, setBranchSwitching] = useState(false);
  const [branchesFetching, setBranchesFetching] = useState(false);
  const [branchPulling, setBranchPulling] = useState(false);
  const [branchPushing, setBranchPushing] = useState(false);
  const [autoFetchPullOnBranchSwitch, setAutoFetchPullOnBranchSwitch] = useState(() => fileStore.getItem(autoFetchPullOnBranchSwitchStorageKey) === "true");
  const [baseRef, setBaseRef] = useState("");
  const [compareRef, setCompareRef] = useState("");
  const [selectedFile, setSelectedFile] = useState<ChangedFile | null>(null);
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const largeDiff = !!selectedFile && (isVeryLargeChangedFile(selectedFile) || !!diff && isVeryLargeDiff(diff));
  const changeBlocks = useMemo(() => diff?.path === selectedFile?.path && diff && !largeDiff ? diffChangeBlocks(diff) : [], [diff, largeDiff, selectedFile?.path]);
  const [changeNavigation, setChangeNavigation] = useState<DiffNavigation | null>(null);
  const activeChangeNavigation = changeNavigation?.diff === diff && diff?.path === selectedFile?.path ? changeNavigation : null;
  const [review, setReview] = useState<ReviewSession | null>(null);
  const [filter, setFilter] = useState("");
  const [selection, setSelection] = useState<CodeSelection | null>(null);
  const [loading, setLoading] = useState(false);
  const [diffLoading, setDiffLoading] = useState(false);
  const [defaultFileViewMode, setDefaultFileViewMode] = useState(storedDefaultFileViewMode);
  const [fileViewMode, setFileViewMode] = useState<FileViewMode>(storedDefaultFileViewMode);
  const [fileEditDraft, setFileEditDraft] = useState<FileEditDraft | null>(null);
  const [fileEditLoading, setFileEditLoading] = useState(false);
  const [fileEditSaving, setFileEditSaving] = useState(false);
  const [fileEditRevision, setFileEditRevision] = useState(0);
  const [commitMessage, setCommitMessage] = useState("");
  const [commitRunning, setCommitRunning] = useState(false);
  const [revertRunning, setRevertRunning] = useState(false);
  const [commitGenerating, setCommitGenerating] = useState(false);
  const [error, setError] = useState("");
  const [sidebarWidths, setSidebarWidths] = useState(storedSidebarWidths);
  const [simulatorSpace, setSimulatorSpace] = useState(storedSimulatorSpace);
  const [taskColumnRatios, setTaskColumnRatios] = useState(storedTaskColumnRatios);
  const [taskDetailsTab, setTaskDetailsTab] = useState<TaskDetailsTab>("details");
  const [sandboxSupported, setSandboxSupported] = useState<boolean | null>(null);
  const [browserSupported, setBrowserSupported] = useState(false);
  useEffect(() => { void invoke<boolean>("task_browser_supported").then((supported) => setBrowserSupported(supported === true)).catch(() => setBrowserSupported(false)); }, []);
  useEffect(() => { void invoke<boolean>("task_sandbox_supported").then(setSandboxSupported).catch(() => setSandboxSupported(false)); }, []);
  useEffect(() => {
    if (sandboxSupported === false) {
      setTaskDetailsTab((tab) => tab === "sandbox" ? "details" : tab);
      setBoardTab((tab) => tab === "sandbox" ? "detail" : tab);
    }
  }, [sandboxSupported]);
  const [taskView, setTaskView] = useState<TaskView>("list");
  const [boardDrawerOpen, setBoardDrawerOpen] = useState(false);
  const [boardFolderError, setBoardFolderError] = useState("");
  const [boardTab, setBoardTab] = useState<BoardTab>("detail");
  const [approvalReviewerDefault, setApprovalReviewerDefault] = useState<ApprovalReviewer>(storedApprovalReviewerDefault);
  const [approvalReviewerOverrides, setApprovalReviewerOverrides] = useState<Record<string, ApprovalReviewer>>({});
  const [boardAddingSubtaskId, setBoardAddingSubtaskId] = useState<string | null>(null);
  const [boardDrawHost, setBoardDrawHost] = useState<HTMLDivElement | null>(null);
  const [boardSandboxHost, setBoardSandboxHost] = useState<HTMLDivElement | null>(null);
  const [boardBrowserHost, setBoardBrowserHost] = useState<HTMLDivElement | null>(null);
  const [boardDetailHost, setBoardDetailHost] = useState<HTMLDivElement | null>(null);
  const [boardChangesHost, setBoardChangesHost] = useState<HTMLDivElement | null>(null);
  const [boardChatHost, setBoardChatHost] = useState<HTMLDivElement | null>(null);
  const [taskPendingChanges, setTaskPendingChanges] = useState<{ taskId: string; location: RepositoryTask["location"]; pending: boolean } | null>(null);
  const [taskAssetSelections, setTaskAssetSelections] = useState<Record<string, string[]>>({});
  const [taskGridWidth, setTaskGridWidth] = useState(window.innerWidth);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState<SettingsPage>("general");
  const [pomodoroSettings, setPomodoroSettings] = useState(() => {
    try { return normalizePomodoroSettings(JSON.parse(fileStore.getItem(pomodoroSettingsKey) ?? "null")); }
    catch { return normalizePomodoroSettings(null); }
  });
  const [pomodoroRevision, setPomodoroRevision] = useState(0);
  useEffect(() => { fileStore.setItem(pomodoroSettingsKey, JSON.stringify(pomodoroSettings)); }, [pomodoroSettings]);
  const [terminalMounted, setTerminalMounted] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [taskTerminals, setTaskTerminals] = useState<{ key: string; rootPath: string; taskId?: string }[]>([]);
  const [confirmation, setConfirmation] = useState<{ title: string; description: string; details?: string; actionLabel: string; action: () => void; cancel?: () => void } | null>(null);
  const [agentApproval, setAgentApproval] = useState<AgentApproval | null>(null);
  const [mcpApprovals, setMcpApprovals] = useState<(AgentApproval & { taskId: string | null })[]>([]);
  const [mcpRespondingRequestId, setMcpRespondingRequestId] = useState<number | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [providerSettingsDraft, setProviderSettingsDraft] = useState<ProviderSettings>({ activeProvider: "", providers: [], repositoryProviders: {} });
  const [onboardingProviderDraft, setOnboardingProviderDraft] = useState<ProviderSettingsEntry>(openRouterProvider);
  const [providerSettingsSaving, setProviderSettingsSaving] = useState(false);
  const [mcpServers, setMcpServers] = useState<McpServerDraft[]>([]);
  const [expandedMcpServer, setExpandedMcpServer] = useState<number | null>(null);
  const [mcpServersLoaded, setMcpServersLoaded] = useState(false);
  const [mcpServersSaving, setMcpServersSaving] = useState(false);
  const [mcpServersError, setMcpServersError] = useState("");
  const [mcpServersSaved, setMcpServersSaved] = useState(false);
  const [mcpServersDirty, setMcpServersDirty] = useState(false);
  const [mcpAuthStatuses, setMcpAuthStatuses] = useState<Record<string, string>>({});
  const mcpStatusRevision = useRef(0);
  const [mcpLoginPending, setMcpLoginPending] = useState<string | null>(null);
  const [mcpLoginStarted, setMcpLoginStarted] = useState<string | null>(null);
  const mcpLoginRef = useRef<string | null>(null);
  const [mcpLoginCancelling, setMcpLoginCancelling] = useState(false);
  const [chatModels, setChatModels] = useState<ChatModel[]>([]);
  const [modelsStatus, setModelsStatus] = useState("Loading models…");
  const [modelsRevision, setModelsRevision] = useState(0);
  const [aiSettingsError, setAiSettingsError] = useState("");
  const [authOnboardingOpen, setAuthOnboardingOpen] = useState(!completedOnboarding);
  const [authOnboardingLoading, setAuthOnboardingLoading] = useState(!completedOnboarding);
  const [providerTestLoading, setProviderTestLoading] = useState(false);
  const [providerTestResult, setProviderTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [runCommands, setRunCommands] = useState<Record<string, string>>(storedRunCommands);
  const [runCommandDraft, setRunCommandDraft] = useState("");
  const [runCommandPromptOpen, setRunCommandPromptOpen] = useState(false);
  const [settingsRunCommandDraft, setSettingsRunCommandDraft] = useState("");
  const [worktreeCleanupBusy, setWorktreeCleanupBusy] = useState(false);
  const [worktreeCleanupStatus, setWorktreeCleanupStatus] = useState<{ message: string; error: boolean } | null>(null);
  const [userRules, setUserRules] = useState(storedUserRules);
  const [userRulesDraft, setUserRulesDraft] = useState(userRules);
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [runOutputOpen, setRunOutputOpen] = useState(false);
  const [runOutput, setRunOutput] = useState("");
  const [runError, setRunError] = useState("");
  const [runExitCode, setRunExitCode] = useState<number | null>(null);
  const [chatDefaults, setChatDefaults] = useState(storedChatDefaults);
  const [agents, setAgents] = useState<ChatAgent[]>(storedAgents);
  const [defaultAgentId, setDefaultAgentId] = useState(() => fileStore.getItem(defaultAgentStorageKey) ?? "");
  const defaultAgent = agents.find((agent) => agent.id === defaultAgentId) ?? null;
  const [favoriteModels, setFavoriteModels] = useState(storedChatModelFavorites);
  const [commitMessageModel, setCommitMessageModel] = useState(storedCommitMessageModel);
  const [autoClearChatAfterCommit, setAutoClearChatAfterCommit] = useState(() => fileStore.getItem(autoClearChatAfterCommitStorageKey) === "true");
  const [autoOpenEditedFile, setAutoOpenEditedFile] = useState(
    () => fileStore.getItem(autoOpenEditedFileStorageKey) === "true",
  );
  const [showFullFileDiff, setShowFullFileDiff] = useState(
    () => fileStore.getItem(showFullFileDiffStorageKey) === "true",
  );
  const [systemNotifications, setSystemNotifications] = useState(
    () => fileStore.getItem(systemNotificationsStorageKey) !== "false",
  );
  const [aiChatRunning, setAiChatRunning] = useState(false);
  const [aiChatStatus, setAiChatStatus] = useState("");
  const [aiChatDraft, setAiChatDraft] = useState("");
  const [chatQueues, setChatQueues] = useState<ChatQueues>(loadChatQueues);
  const chatQueuesRef = useRef(chatQueues);
  const [pausedQueueKeys, setPausedQueueKeys] = useState<Set<string>>(() => new Set(Object.keys(loadChatQueues())));
  const pausedQueueKeysRef = useRef(pausedQueueKeys);
  const [automationStatus, setAutomationStatus] = useState<TaskBoardStatus | null>(null);
  const queueDispatchRef = useRef<(key: string) => void>(() => {});
  const queueBusyRef = useRef(new Set<string>());
  const aiChatRunningRef = useRef(false);
  const reviewRunQueueKeyRef = useRef<string | null>(null);
  const reviewRunSessionRef = useRef<ReviewSession | null>(null);
  const reviewSteerSaveRef = useRef<Promise<unknown> | null>(null);
  const [aiChatUploads, setAiChatUploads] = useState<ChatAttachment[]>([]);
  const [aiChatModel, setAiChatModel] = useState(chatDefaults.default.model);
  const [aiChatServerModel, setAiChatServerModel] = useState<string | null>(null);
  const [aiChatEffort, setAiChatEffort] = useState<ChatEffort>(chatDefaults.default.effort);
  const [aiChatMode, setAiChatMode] = useState<AiChatMode>("default");
  const [aiChatPlan, setAiChatPlan] = useState<AiChatPlan | null>(null);
  const [agentUserInput, setAgentUserInput] = useState<AgentUserInput | null>(null);
  const [zenMode, setZenMode] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<"workspace" | "tasks" | "memory">("workspace");
  const tasksTabActive = workspaceMode === "tasks";
  const taskMode = tasksTabActive || (workspaceMode === "workspace" && boardDrawerOpen);
  const boardMode = taskMode && !zenMode;
  const memoryMode = workspaceMode === "memory";
  const memoryFlushRef = useRef<(() => Promise<boolean>) | null>(null);
  const modeSwitchRef = useRef<(mode: "workspace" | "tasks" | "memory") => void>(() => {});
  const [branchPrefix, setBranchPrefix] = useState(() => repository ? loadBranchPrefix(repository.rootPath) : "feature/");
  useEffect(() => { setBranchPrefix(repositoryRoot ? loadBranchPrefix(repositoryRoot) : "feature/"); }, [repositoryRoot]);
  const [taskLocationDefault, setTaskLocationDefault] = useState(loadTaskLocationDefault);
  const [openNewTaskInDrawer, setOpenNewTaskInDrawer] = useState(loadOpenNewTaskInDrawer);
  const [closeKanbanModalOnOutsideClick, setCloseKanbanModalOnOutsideClick] = useState(loadCloseKanbanModalOnOutsideClick);
  const [taskChangesRevision, setTaskChangesRevision] = useState(0);
  const [taskGitAction, setTaskGitAction] = useState<"fetch" | "pull" | "push" | null>(null);
  const [tasks, replaceTasks] = useState<RepositoryTask[]>([]);
  const setTasks = useCallback((update: RepositoryTask[] | ((current: RepositoryTask[]) => RepositoryTask[])) => {
    const now = Date.now();
    replaceTasks((current) => timestampTaskUpdates(current, typeof update === "function" ? update(current) : update, now));
  }, []);
  const [boardDropTarget, setBoardDropTarget] = useState<{ status: TaskBoardStatus; taskId: string | null; position: "before" | "after" } | null>(null);
  const [customFields, setCustomFields] = useState(loadTaskCustomFields);
  const [customFieldError, setCustomFieldError] = useState("");
  const tasksRef = useRef(tasks);
  const syncMcpContextRef = useRef<() => Promise<void>>(async () => {});
  const mcpContextRootRef = useRef<string | null | undefined>(undefined);
  const repositoryRef = useRef(repository);
  repositoryRef.current = repository;
  const taskDeletionBusyRef = useRef(false);
  const [taskStorageRoot, setTaskStorageRoot] = useState<string | null>(null);
  const githubInbox = useGitHubInbox({
    rootPath: repository?.rootPath, ready: !!repository && taskStorageRoot === repository.rootPath, tasks, setTasks,
    makeTask: (item) => normalizeTask({ id: crypto.randomUUID(), title: item.title, ...taskLocationFields(taskLocationDefault),
      chatMode: "default", chatAgent: defaultAgent }, chatDefaults)!,
  });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(() => new Set());
  const [taskDrafts, setTaskDrafts] = useState<Record<string, string>>({});
  const [taskRuns, setTaskRuns] = useState<Record<string, TaskRun>>({});
  const [taskStartingIds, setTaskStartingIds] = useState<Set<string>>(() => new Set());
  const [newTaskDrafts, setNewTaskDrafts] = useState<Record<string, string>>({});
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [playbooks, setPlaybooks] = useState<Playbook[]>(storedPlaybooks);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState(playbooks[0]?.id ?? "");
  const [playbookDraft, setPlaybookDraft] = useState<Playbook>(() => ({ ...(playbooks[0] ?? newPlaybook()) }));
  const [playbooksOpen, setPlaybooksOpen] = useState(false);
  const [playbookError, setPlaybookError] = useState("");
  const [playbookSaveNotice, setPlaybookSaveNotice] = useState("");
  const [variablePrompt, setVariablePrompt] = useState<{ playbook: Playbook; taskId: string | null } | null>(null);
  useEffect(() => { setVariablePrompt(null); }, [workspaceMode, taskMode, selectedTaskId, repository?.rootPath, review?.baseOid, review?.mode, review?.baseRef, review?.compareRef]);
  const workspaceCacheRef = useRef<Partial<Record<Comparison["mode"], WorkspaceCache>>>({});
  const taskGridRef = useRef<HTMLDivElement>(null);
  const comparisonLoadRef = useRef(0);
  const fileLoadRef = useRef(0);
  const fileEditLoadRef = useRef(0);
  const aiChatCancelRequested = useRef(false);
  const agentApprovalRef = useRef<AgentApproval | null>(null);
  const agentInputRef = useRef<AgentUserInput | null>(null);
  const aiChatTurnRef = useRef<AiChatAccepted | null>(null);
  const aiChatTurnModeRef = useRef<AiChatMode>("default");
  const aiChatTimelineRef = useRef<ChatMessage[]>([]);
  const aiChatDeltaBufferRef = useRef("");
  const aiChatDeltaFrameRef = useRef<number | null>(null);
  const aiChatImageImportingRef = useRef(false);
  const taskRunsRef = useRef<Record<string, TaskRun>>({});
  const taskDeltaBufferRef = useRef(new Map<string, string>());
  const taskDeltaFrameRef = useRef<number | null>(null);
  const taskControlConfirmationRef = useRef<(() => void) | null>(null);
  const systemNotificationsRef = useRef(systemNotifications);
  systemNotificationsRef.current = systemNotifications;
  const notificationListenerReadyRef = useRef<Promise<void> | null>(null);
  const notificationPermissionRef = useRef<Promise<boolean> | null>(null);
  const notificationPermissionRequestedRef = useRef(false);
  const openNotificationRef = useRef<(target: NotificationTarget) => void>(() => {});
  const taskStartingRef = useRef(new Set<string>());
  const [aiChatTimeline, setAiChatTimeline] = useState<ChatMessage[]>([]);
  const runTaskRef = useRef<string | null>(null);
  const runStopRequestedRef = useRef(false);
  const runOutputBufferRef = useRef("");
  const runOutputFrameRef = useRef<number | null>(null);
  const runSuccessTimerRef = useRef<number | null>(null);
  const runOutputBottomRef = useRef<HTMLDivElement>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const reviewRef = useRef<ReviewSession | null>(null);
  const changedPathsRef = useRef<string[]>([]);

  const activeChatContext = useMemo<ChatContext>(() => ({ scope: "diff", items: [] }), []);

  useEffect(() => {
    let disposed = false;
    let unregister: (() => void) | null = null;
    const ready = onAction((event) => {
      if (event.actionId !== "tap") return;
      const extra = event.notification?.extra;
      if (extra?.windowLabel !== getCurrentWindow().label || typeof extra.repositoryRoot !== "string") return;
      if (extra.taskId !== null && typeof extra.taskId !== "string") return;
      openNotificationRef.current(extra as NotificationTarget);
    }).then((listener) => {
      if (disposed) return listener.unregister();
      unregister = () => { void listener.unregister(); };
    });
    notificationListenerReadyRef.current = ready;
    void ready.catch((reason) => setError(message(reason)));
    return () => { disposed = true; unregister?.(); notificationListenerReadyRef.current = null; };
  }, []);

  const notificationAllowed = async () => {
    await notificationListenerReadyRef.current;
    if (!notificationPermissionRef.current) {
      notificationPermissionRef.current = (async () => {
        if (await isPermissionGranted()) return true;
        if (notificationPermissionRequestedRef.current) return false;
        notificationPermissionRequestedRef.current = true;
        return await requestPermission() === "granted";
      })().finally(() => { notificationPermissionRef.current = null; });
    }
    return await notificationPermissionRef.current;
  };

  const notifyPomodoro = (body: string) => {
    if (!systemNotificationsRef.current) return;
    void (async () => {
      if (await notificationAllowed() && systemNotificationsRef.current) sendNotification({ title: "Pomodoro", body });
    })().catch((reason) => setError(message(reason)));
  };

  const notifyAgent = (taskId: string | null, body: string) => {
    const currentRepository = repositoryRef.current;
    if (!systemNotificationsRef.current || !currentRepository) return;
    const target: NotificationTarget = { windowLabel: getCurrentWindow().label, repositoryRoot: currentRepository.rootPath, taskId };
    const taskTitle = taskId ? tasksRef.current.find((task) => task.id === taskId)?.title ?? "Task" : "Workspace";
    void (async () => {
      if (!await notificationAllowed()) return;
      if (!systemNotificationsRef.current || repositoryRef.current?.rootPath !== target.repositoryRoot) return;
      sendNotification({ title: `${currentRepository.name} · ${taskTitle}`, body, extra: target });
    })().catch((reason) => setError(message(reason)));
  };

  const loadOnboardingAuth = async () => {
    setAuthOnboardingLoading(true);
    setAiSettingsError("");
    setProviderTestResult(null);
    try {
      const settings = await invoke<AiSettings>("load_ai_settings");
      setAiSettings(settings);
      setProviderSettingsDraft({ activeProvider: settings.activeProvider, providers: settings.providers, repositoryProviders: settings.repositoryProviders });
      setOnboardingProviderDraft(settings.providers.find((provider) => provider.id === (settings.repositoryProviders[repository?.rootPath ?? ""] ?? settings.activeProvider)) ?? openRouterProvider);
      if (!settings.providers.length) setAuthOnboardingOpen(true);
    } catch (reason) {
      setAiSettingsError(message(reason));
    } finally {
      setAuthOnboardingLoading(false);
    }
  };

  const chatRequestContext = useMemo<ChatRequestContext>(() => {
    let attachments: ChatAttachment[] = [];
    if (selection) attachments = [{ kind: "selectedLines", selection }];
    else if (selectedFile && !selectedFile.binary) attachments = [{ kind: "file", path: selectedFile.path }];
    return { mode: "auto", attachments: [...attachments, ...aiChatUploads] };
  }, [selectedFile, selection, aiChatUploads]);
  const activeQueueKey = taskMode ? selectedTaskId && repository ? taskQueueKey(repository.rootPath, selectedTaskId) : null : review ? reviewQueueKey(review) : null;
  const changeQueue = (key: string, change: (items: QueuedChatMessage[]) => QueuedChatMessage[]) => {
    const next = { ...chatQueuesRef.current, [key]: change(chatQueuesRef.current[key] ?? []) };
    if (!next[key].length) delete next[key];
    chatQueuesRef.current = next;
    setChatQueues(next);
    saveChatQueues(next);
  };
  const setQueuePaused = (key: string, paused: boolean) => {
    const next = new Set(pausedQueueKeysRef.current);
    if (paused) next.add(key); else next.delete(key);
    pausedQueueKeysRef.current = next;
    setPausedQueueKeys(next);
  };
  const removeQueued = (key: string, id: string, deleteImages = false) => {
    const item = chatQueuesRef.current[key]?.find((entry) => entry.id === id);
    if (!item) return;
    changeQueue(key, (items) => items.filter((entry) => entry.id !== id));
    if (deleteImages) for (const attachment of item.context.attachments) if (isChatUpload(attachment)) void invoke("remove_chat_image", { path: attachment.path }).catch((reason) => setError(message(reason)));
  };

  const runCommand = repository ? runCommands[repository.rootPath] ?? "" : "";

  const resetRunOutput = () => {
    runOutputBufferRef.current = "";
    if (runOutputFrameRef.current !== null) cancelAnimationFrame(runOutputFrameRef.current);
    runOutputFrameRef.current = null;
    setRunOutput("");
    setRunError("");
    setRunExitCode(null);
  };

  const appendRunOutput = (data: string) => {
    runOutputBufferRef.current = `${runOutputBufferRef.current}${data}`.slice(-200_000);
    if (runOutputFrameRef.current !== null) return;
    runOutputFrameRef.current = requestAnimationFrame(() => {
      runOutputFrameRef.current = null;
      setRunOutput(runOutputBufferRef.current);
    });
  };

  const flushRunOutput = () => {
    if (runOutputFrameRef.current !== null) cancelAnimationFrame(runOutputFrameRef.current);
    runOutputFrameRef.current = null;
    setRunOutput(runOutputBufferRef.current);
  };

  const clearRunSuccessTimer = () => {
    if (runSuccessTimerRef.current !== null) window.clearTimeout(runSuccessTimerRef.current);
    runSuccessTimerRef.current = null;
  };

  const saveRunCommand = (command: string) => {
    if (!repository) return;
    const value = command.trim();
    setRunCommands((current) => {
      const next = { ...current, ...storedRunCommands() };
      if (value) next[repository.rootPath] = value;
      else delete next[repository.rootPath];
      return next;
    });
    clearRunSuccessTimer();
    setRunStatus("idle");
    resetRunOutput();
  };

  const startRepositoryRun = async (command = runCommand) => {
    if (!repository || runStatus === "running") return;
    const value = command.trim();
    if (!value) {
      setRunCommandDraft("");
      setRunCommandPromptOpen(true);
      return;
    }
    clearRunSuccessTimer();
    resetRunOutput();
    const taskId = crypto.randomUUID();
    runTaskRef.current = taskId;
    runStopRequestedRef.current = false;
    setRunStatus("running");
    try {
      await invoke("run_repository_command", { taskId, command: value });
    } catch (reason) {
      if (runTaskRef.current !== taskId) return;
      runTaskRef.current = null;
      setRunStatus("failed");
      setRunError(message(reason));
    }
  };

  const stopRepositoryRun = async () => {
    if (runStatus !== "running") return;
    runStopRequestedRef.current = true;
    setRunStatus("stopping");
    try {
      await invoke("cancel_repository_run");
    } catch (reason) {
      runStopRequestedRef.current = false;
      setRunStatus("running");
      setRunError(message(reason));
    }
  };

  const saveAndRunCommand = () => {
    const value = runCommandDraft.trim();
    if (!value) return;
    saveRunCommand(value);
    setRunCommandPromptOpen(false);
    void startRepositoryRun(value);
  };

  const appendAiChatTimeline = (entry: ChatMessage) => {
    aiChatTimelineRef.current = [...aiChatTimelineRef.current, entry];
    setAiChatTimeline(aiChatTimelineRef.current);
  };

  const flushAiChatDeltas = () => {
    if (aiChatDeltaFrameRef.current !== null) cancelAnimationFrame(aiChatDeltaFrameRef.current);
    aiChatDeltaFrameRef.current = null;
    const delta = aiChatDeltaBufferRef.current;
    aiChatDeltaBufferRef.current = "";
    if (!delta) return;
    const timeline = [...aiChatTimelineRef.current];
    const current = timeline[timeline.length - 1];
    if (!current || current.appliedDiffs?.length) appendAiChatTimeline({ id: crypto.randomUUID(), role: "assistant", body: delta, createdAt: new Date().toISOString(), selection: null, snapshotId: null, suggestions: [], contexts: [] });
    else {
      timeline[timeline.length - 1] = { ...current, body: `${current.body}${delta}` };
      aiChatTimelineRef.current = timeline;
      setAiChatTimeline(timeline);
    }
  };

  const appendAiChatDelta = (delta: string) => {
    aiChatDeltaBufferRef.current += delta;
    if (aiChatDeltaFrameRef.current !== null) return;
    aiChatDeltaFrameRef.current = requestAnimationFrame(flushAiChatDeltas);
  };

  const resetAiChatTimeline = () => {
    aiChatDeltaBufferRef.current = "";
    if (aiChatDeltaFrameRef.current !== null) cancelAnimationFrame(aiChatDeltaFrameRef.current);
    aiChatDeltaFrameRef.current = null;
    aiChatTimelineRef.current = [];
    setAiChatTimeline([]);
  };

  const persistAiChatTimeline = async () => {
    const entries = persistedChatEntries(aiChatTimelineRef.current);
    const current = reviewRunSessionRef.current ?? reviewRef.current;
    if (reviewSteerSaveRef.current) await reviewSteerSaveRef.current.catch(() => {});
    let saved = true;
    if (entries.length && current) {
      const next = { ...current, chatMessages: [...current.chatMessages, ...entries].slice(-100) };
      if (reviewRef.current && reviewQueueKey(reviewRef.current) === reviewQueueKey(next)) { reviewRef.current = next; setReview(next); }
      try { await invoke("save_review", { session: next }); }
      catch (reason) { setError(message(reason)); saved = false; }
      await refreshRef.current().catch((reason) => { setError(message(reason)); saved = false; });
    } else {
      await refreshRef.current().catch((reason) => { setError(message(reason)); saved = false; });
    }
    return saved;
  };

  useEffect(() => {
    fileStore.setItem(sidebarStorageKey, JSON.stringify(sidebarWidths));
  }, [sidebarWidths]);

  useEffect(() => {
    fileStore.setItem(simulatorStorageKey, JSON.stringify(simulatorSpace));
  }, [simulatorSpace]);

  useEffect(() => {
    fileStore.setItem(taskColumnStorageKey, JSON.stringify(taskColumnRatios));
  }, [taskColumnRatios]);

  useLayoutEffect(() => {
    const grid = taskGridRef.current;
    if (!grid) return;
    const observer = new ResizeObserver(() => { if (grid.clientWidth) setTaskGridWidth(grid.clientWidth); });
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    fileStore.setItem(autoOpenEditedFileStorageKey, String(autoOpenEditedFile));
  }, [autoOpenEditedFile]);

  useEffect(() => {
    fileStore.setItem(showFullFileDiffStorageKey, String(showFullFileDiff));
  }, [showFullFileDiff]);

  useEffect(() => {
    fileStore.setItem(systemNotificationsStorageKey, String(systemNotifications));
  }, [systemNotifications]);

  useEffect(() => {
    fileStore.setItem(defaultFileViewModeStorageKey, defaultFileViewMode);
  }, [defaultFileViewMode]);

  useEffect(() => {
    fileStore.setItem(agentsStorageKey, JSON.stringify(agents));
  }, [agents]);

  useEffect(() => {
    fileStore.setItem(defaultAgentStorageKey, defaultAgentId);
  }, [defaultAgentId]);

  useEffect(() => {
    fileStore.setItem(playbookStorageKey, JSON.stringify(playbooks));
  }, [playbooks]);

  useEffect(() => {
    fileStore.setItem(runCommandStorageKey, JSON.stringify(runCommands));
  }, [runCommands]);

  useEffect(() => {
    fileStore.setItem(chatDefaultsStorageKey, JSON.stringify(chatDefaults));
  }, [chatDefaults]);

  useEffect(() => {
    fileStore.setItem(chatModelFavoritesStorageKey, JSON.stringify(favoriteModels));
  }, [favoriteModels]);

  useEffect(() => {
    fileStore.setItem(commitMessageModelStorageKey, commitMessageModel);
  }, [commitMessageModel]);

  useEffect(() => { fileStore.setItem(autoClearChatAfterCommitStorageKey, String(autoClearChatAfterCommit)); }, [autoClearChatAfterCommit]);
  useEffect(() => { fileStore.setItem(autoFetchPullOnBranchSwitchStorageKey, String(autoFetchPullOnBranchSwitch)); }, [autoFetchPullOnBranchSwitch]);

  useEffect(() => { fileStore.setItem(approvalReviewerDefaultStorageKey, approvalReviewerDefault); }, [approvalReviewerDefault]);

  useEffect(() => { saveTaskLocationDefault(taskLocationDefault); }, [taskLocationDefault]);
  useEffect(() => { saveOpenNewTaskInDrawer(openNewTaskInDrawer); }, [openNewTaskInDrawer]);
  useEffect(() => { saveCloseKanbanModalOnOutsideClick(closeKanbanModalOnOutsideClick); }, [closeKanbanModalOnOutsideClick]);

  const resetRepositoryTasks = useEffectEvent((root: string | null) => {
    setTaskStorageRoot(null);
    setAutomationStatus(null);
    setApprovalReviewerOverrides({});
    setTaskView(root ? loadTaskView(root) : "list");
    setBoardDrawerOpen(false);
    setBoardAddingSubtaskId(null);
    replaceTasks(root ? loadTasks(root, chatDefaults) : []);
    setTaskStorageRoot(root);
    setSelectedTaskId(null);
    setTaskAssetSelections({});
    setCollapsedTaskIds(root ? loadCollapsedTaskIds(root) : new Set());
    setTaskRuns({});
    taskRunsRef.current = {};
    taskDeltaBufferRef.current.clear();
    if (taskDeltaFrameRef.current !== null) cancelAnimationFrame(taskDeltaFrameRef.current);
    taskDeltaFrameRef.current = null;
    taskStartingRef.current.clear();
    setTaskStartingIds(new Set());
  });
  useEffect(() => { resetRepositoryTasks(repositoryRoot); }, [repositoryRoot]);

  useEffect(() => {
    if (repositoryRoot && taskStorageRoot === repositoryRoot) saveTasks(repositoryRoot, tasks);
  }, [repositoryRoot, taskStorageRoot, tasks]);

  useEffect(() => {
    if (repositoryRoot && taskStorageRoot === repositoryRoot) saveTaskView(repositoryRoot, taskView);
  }, [repositoryRoot, taskStorageRoot, taskView]);

  useEffect(() => { tasksRef.current = tasks; }, [tasks]);

  useEffect(() => {
    if (repositoryRoot && taskStorageRoot === repositoryRoot) saveCollapsedTaskIds(repositoryRoot, collapsedTaskIds);
  }, [repositoryRoot, taskStorageRoot, collapsedTaskIds]);

  useEffect(() => { taskRunsRef.current = taskRuns; }, [taskRuns]);

  useEffect(() => {
    if (!review?.agentThreadId) return;
    if (!tasks.some((task) => task.agentThreadId === review.agentThreadId)) return;
    const detached = { ...review, agentThreadId: null };
    reviewRef.current = detached;
    setReview(detached);
    void invoke("save_review", { session: detached }).catch((reason) => setError(message(reason)));
  }, [review, tasks]);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === agentsStorageKey) setAgents(storedAgents());
      if (event.key === defaultAgentStorageKey) setDefaultAgentId(fileStore.getItem(defaultAgentStorageKey) ?? "");
      if (event.key === playbookStorageKey) setPlaybooks(storedPlaybooks());
      if (event.key === runCommandStorageKey) setRunCommands(storedRunCommands());
      if (event.key === chatDefaultsStorageKey) setChatDefaults(storedChatDefaults());
      if (event.key === chatQueueStorageKey) {
        const queues = loadChatQueues();
        chatQueuesRef.current = queues; setChatQueues(queues);
        pausedQueueKeysRef.current = new Set([...pausedQueueKeysRef.current, ...Object.keys(queues)]);
        setPausedQueueKeys(pausedQueueKeysRef.current);
      }
      if (event.key === chatModelFavoritesStorageKey) setFavoriteModels(storedChatModelFavorites());
      if (event.key === commitMessageModelStorageKey) setCommitMessageModel(storedCommitMessageModel());
      if (event.key === autoClearChatAfterCommitStorageKey) setAutoClearChatAfterCommit(event.newValue === "true");
      if (event.key === autoFetchPullOnBranchSwitchStorageKey) setAutoFetchPullOnBranchSwitch(event.newValue === "true");
      if (event.key === defaultFileViewModeStorageKey) setDefaultFileViewMode(storedDefaultFileViewMode());
      if (event.key === systemNotificationsStorageKey) {
        const enabled = event.newValue !== "false";
        systemNotificationsRef.current = enabled;
        setSystemNotifications(enabled);
      }
      if (repositoryRoot && event.key === branchPrefixStorageKey(repositoryRoot)) setBranchPrefix(loadBranchPrefix(repositoryRoot));
      if (event.key === "chaoticreview.task-location-default") setTaskLocationDefault(loadTaskLocationDefault());
      if (event.key === "chaoticreview.open-new-task-in-drawer") setOpenNewTaskInDrawer(loadOpenNewTaskInDrawer());
      if (event.key === "chaoticreview.close-kanban-modal-on-outside-click") setCloseKanbanModalOnOutsideClick(loadCloseKanbanModalOnOutsideClick());
      if (event.key === customFieldsStorageKey) setCustomFields(loadTaskCustomFields());
      if (event.key === authOnboardingStorageKey && event.newValue !== null) setAuthOnboardingOpen(false);
      if (repositoryRoot && event.key === taskStorageKey(repositoryRoot)) replaceTasks(loadTasks(repositoryRoot, chatDefaults));
      if (repositoryRoot && event.key === "chaoticreview.task-view") {
        const view = loadTaskView(repositoryRoot);
        setTaskView(view);
        if (view === "list") setBoardDrawerOpen(false);
      }
      if (repositoryRoot && event.key === "chaoticreview.collapsed-tasks") setCollapsedTaskIds(loadCollapsedTaskIds(repositoryRoot));
    };
    const storageError = (event: Event) => setError((event as CustomEvent<string>).detail);
    window.addEventListener("storage", sync);
    window.addEventListener("frontend-storage-error", storageError);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("frontend-storage-error", storageError);
    };
  }, [repositoryRoot, chatDefaults]);

  useEffect(() => () => {
    if (runOutputFrameRef.current !== null) cancelAnimationFrame(runOutputFrameRef.current);
    if (aiChatDeltaFrameRef.current !== null) cancelAnimationFrame(aiChatDeltaFrameRef.current);
    if (taskDeltaFrameRef.current !== null) cancelAnimationFrame(taskDeltaFrameRef.current);
    taskDeltaBufferRef.current.clear();
    clearRunSuccessTimer();
  }, []);

  useEffect(() => {
    reviewRef.current = review;
  }, [review]);

  const initializeAuth = useEffectEvent(() => { void loadOnboardingAuth(); });
  useEffect(() => { initializeAuth(); }, []);

  useEffect(() => {
    const root = repository?.rootPath ?? null;
    if (root && taskStorageRoot !== root) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let published: Promise<void> | undefined;
    const publish = () => {
      clearTimeout(timer);
      return published ??= invoke<void>("set_mcp_context", { input: { repositoryRoot: root, context: activeChatContext, baseOid: review?.baseOid ?? null, mode: comparison?.mode ?? null, baseRef: comparison?.baseRef ?? null, compareRef: comparison?.compareRef ?? null, comments: review?.comments ?? [], customFields, tasks: tasks.map(taskMcpContext), githubNotifications: githubInbox.notificationsContext } }).catch((reason) => { published = undefined; throw reason; });
    };
    syncMcpContextRef.current = publish;
    if (mcpContextRootRef.current !== root) {
      mcpContextRootRef.current = root;
      void publish().catch((reason) => setError(message(reason)));
    } else timer = setTimeout(() => { void publish().catch((reason) => setError(message(reason))); }, 150);
    return () => clearTimeout(timer);
  }, [repository?.rootPath, taskStorageRoot, activeChatContext, review?.baseOid, review?.comments, comparison?.mode, comparison?.baseRef, comparison?.compareRef, tasks, customFields, githubInbox.notificationsContext]);

  useEffect(() => {
    const clear = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSelection(null);
    };
    window.addEventListener("keydown", clear);
    return () => window.removeEventListener("keydown", clear);
  }, []);

  useEffect(() => {
    const switchWorkspace = (event: KeyboardEvent) => {
      if (!repository || settingsOpen || !(event.metaKey || event.ctrlKey)) return;
      if (event.key !== "1" && event.key !== "2" && event.key !== "3") return;
      event.preventDefault();
      modeSwitchRef.current(event.key === "1" ? "workspace" : event.key === "2" ? "tasks" : "memory");
    };
    window.addEventListener("keydown", switchWorkspace);
    return () => window.removeEventListener("keydown", switchWorkspace);
  }, [repository, settingsOpen]);

  const flushTaskDeltas = (taskId?: string) => {
    let next = taskRunsRef.current;
    for (const [id, delta] of taskDeltaBufferRef.current) {
      if (taskId !== undefined && taskId !== id) continue;
      taskDeltaBufferRef.current.delete(id);
      const run = next[id];
      if (run) next = { ...next, [id]: { ...run, timeline: applyChatEvent(run.timeline, { ...run.accepted, kind: "assistantDelta", delta }) } };
    }
    if (!taskDeltaBufferRef.current.size && taskDeltaFrameRef.current !== null) {
      cancelAnimationFrame(taskDeltaFrameRef.current);
      taskDeltaFrameRef.current = null;
    }
    if (next !== taskRunsRef.current) { taskRunsRef.current = next; setTaskRuns(next); }
  };

  const handleTaskEvent = (taskId: string, update: AiChatEvent) => {
    if (update.kind === "fileChanged" || update.kind === "completed") setTaskChangesRevision((value) => value + 1);
    const run = taskRunsRef.current[taskId];
    if (!run) return;
    if (update.kind === "assistantDelta") {
      if (!update.delta) return;
      taskDeltaBufferRef.current.set(taskId, (taskDeltaBufferRef.current.get(taskId) ?? "") + update.delta);
      if (taskDeltaFrameRef.current === null) taskDeltaFrameRef.current = requestAnimationFrame(() => {
        taskDeltaFrameRef.current = null;
        flushTaskDeltas();
      });
      return;
    }
    const replaceRun = (next: TaskRun) => {
      taskRunsRef.current = { ...taskRunsRef.current, [taskId]: next };
      setTaskRuns(taskRunsRef.current);
    };
    if (update.kind === "planUpdated") { replaceRun({ ...run, plan: { explanation: update.explanation, plan: update.plan ?? [] } }); return; }
    let timeline = applyChatEvent(run.timeline, update);
    if (update.kind === "fileChanged") {
      replaceRun({ ...run, timeline });
      return;
    }
    if (update.kind === "toolStarted") { replaceRun({ ...run, status: update.label ?? "Using repository tools…", timeline }); return; }
    if (update.kind === "toolFinished") {
      replaceRun({ ...run, status: "Continuing…", timeline });
      return;
    }
    if (update.kind === "completed" || update.kind === "cancelled" || update.kind === "failed") {
      const runStatus = update.kind;
      const plan = run.mode === "plan" && update.kind === "completed" ? finalizePlanOutput(timeline) : null;
      timeline = plan?.timeline ?? timeline;
      const messages = update.kind === "failed" ? [] : persistedChatEntries(timeline);
      const updateTasks = (current: RepositoryTask[]) => current.map((task) => task.id === taskId ? {
        ...task,
        chatMessages: [...task.chatMessages.map((entry) => entry.id === run.messageId ? { ...entry, runStatus, runError: update.kind === "failed" ? update.message : undefined } : entry), ...messages].slice(-100),
        planReady: run.automation ? task.planReady : plan?.isPlan ?? false,
        unreadAgentResult: update.kind !== "cancelled",
      } : task);
      setTasks(updateTasks);
      if (run.automation) void laneAutomation.finish(run.automation, update.kind, update.kind === "failed" ? update.message ?? "Agent failed" : null);
      if (run.schedule) void finishSchedule(run.schedule, update.kind, update.kind === "failed" ? update.message ?? "Agent failed" : null).catch((reason) => setError(message(reason)));
      const nextRuns = { ...taskRunsRef.current }; delete nextRuns[taskId]; taskRunsRef.current = nextRuns; setTaskRuns(nextRuns);
      const key = repositoryRef.current ? taskQueueKey(repositoryRef.current.rootPath, taskId) : null;
      if (key && update.kind === "completed") window.setTimeout(() => queueDispatchRef.current(key), 0);
      else if (key) setQueuePaused(key, true);
      if (run.mode === "default") void refreshRef.current();
      if (update.kind === "failed" && update.message) setError(update.message);
      if (update.kind !== "cancelled" && (update.kind === "failed" || !key || !chatQueuesRef.current[key]?.length)) notifyAgent(taskId, update.kind === "failed" ? "Agent failed. Open the task to check the error." : "Agent finished. Open the task to view the result.");
      return;
    }
    replaceRun({ ...run, timeline });
  };

  const handleMainChatEvent = (update: AiChatEvent) => {
    if (update.kind !== "assistantDelta") flushAiChatDeltas();
    if (update.kind === "modelRerouted") { if (update.label) setAiChatServerModel(update.label); return; }
    if (update.kind === "status") { if (update.label) setAiChatStatus(update.label); return; }
    if (update.kind === "planUpdated") { setAiChatPlan({ explanation: update.explanation, plan: update.plan ?? [] }); return; }
    if (update.kind === "assistantMessageStarted" || update.kind === "fileChanged" || update.kind === "assistantMessageCompleted") {
      const timeline = applyChatEvent(aiChatTimelineRef.current, update);
      aiChatTimelineRef.current = timeline;
      setAiChatTimeline(timeline);
      return;
    }
    if (update.kind === "assistantDelta") {
      const delta = update.delta ?? "";
      if (delta) appendAiChatDelta(delta);
      return;
    }
    if (update.kind === "toolStarted") setAiChatStatus(update.label ?? "Using repository tools…");
    if (update.kind === "toolFinished") setAiChatStatus("Continuing…");
    if (update.kind === "completed") {
      if (aiChatTurnModeRef.current === "plan") {
        const plan = finalizePlanOutput(aiChatTimelineRef.current);
        aiChatTimelineRef.current = plan.timeline;
        setAiChatTimeline(plan.timeline);
      }
      const saved = persistAiChatTimeline();
      aiChatTimelineRef.current = [];
      setAiChatTimeline([]);
      aiChatRunningRef.current = false;
      setAiChatRunning(false); setAiChatStatus(""); setAiChatPlan(null); setAgentUserInput(null); aiChatTurnRef.current = null;
      const key = reviewRunQueueKeyRef.current;
      void saved.then((ok) => { reviewRunSessionRef.current = null; if (key) { if (ok) window.setTimeout(() => queueDispatchRef.current(key), 0); else setQueuePaused(key, true); } });
      if (!key || !chatQueuesRef.current[key]?.length) notifyAgent(null, "Agent finished. Open the workspace to view the result.");
      return saved;
    }
    if (update.kind === "failed") {
      resetAiChatTimeline(); aiChatTurnRef.current = null; aiChatRunningRef.current = false; setAiChatRunning(false); setAiChatStatus(""); setAiChatPlan(null); setAgentUserInput(null);
      if (reviewRunQueueKeyRef.current) setQueuePaused(reviewRunQueueKeyRef.current, true);
      reviewRunSessionRef.current = null;
      if (update.message) setError(update.message);
      void refreshRef.current();
      notifyAgent(null, "Agent failed. Open the workspace to check the error.");
    }
    if (update.kind === "cancelled") {
      const saved = persistAiChatTimeline(); aiChatTimelineRef.current = []; setAiChatTimeline([]); aiChatTurnRef.current = null;
      aiChatRunningRef.current = false;
      setAiChatRunning(false); setAiChatStatus(""); setAiChatPlan(null); setAgentUserInput(null);
      if (reviewRunQueueKeyRef.current) setQueuePaused(reviewRunQueueKeyRef.current, true);
      reviewRunSessionRef.current = null;
      return saved;
    }
  };

  const handleTurnEvent = (event: AgentTurnEvent, taskId?: string) => {
    if (!(event.type === "chat" && event.payload.kind === "assistantDelta")) {
      if (taskId) flushTaskDeltas(taskId); else flushAiChatDeltas();
    }
    if (event.type === "chat") {
      if (event.payload.kind === "completed" || event.payload.kind === "cancelled" || event.payload.kind === "failed") {
        setMcpApprovals((current) => current.filter((approval) => approval.taskId !== (taskId ?? null)));
        if (!taskId) {
          agentApprovalRef.current = null; agentInputRef.current = null;
          setAgentApproval(null); setAgentUserInput(null);
        }
      }
      if (taskId) {
        if (event.payload.kind === "status") {
          const run = taskRunsRef.current[taskId];
          if (run && event.payload.label) {
            const next = { ...run, status: event.payload.label };
            taskRunsRef.current = { ...taskRunsRef.current, [taskId]: next }; setTaskRuns(taskRunsRef.current);
          }
        } else handleTaskEvent(taskId, event.payload);
      } else handleMainChatEvent(event.payload);
      return;
    }
    if (event.type === "approvalRequested") {
      if (event.payload.source === "mcp") {
        setMcpApprovals((current) => current.some((approval) => approval.requestId === event.payload.requestId) ? current : [...current, { ...event.payload, taskId: taskId ?? null }]);
      }
      if (taskId) {
        const run = taskRunsRef.current[taskId];
        if (run) {
          const next = { ...run, approval: event.payload, status: "Waiting for your approval…" };
          taskRunsRef.current = { ...taskRunsRef.current, [taskId]: next }; setTaskRuns(taskRunsRef.current);
        }
      } else { agentApprovalRef.current = event.payload; setAgentApproval(event.payload); setAiChatStatus("Waiting for your approval…"); }
      notifyAgent(taskId ?? null, "Agent needs your approval.");
      return;
    }
    if (event.type === "approvalResolved") {
      if (agentApprovalRef.current?.requestId === event.payload.requestId) agentApprovalRef.current = null;
      setMcpApprovals((current) => current.filter((approval) => approval.requestId !== event.payload.requestId));
      setMcpRespondingRequestId((current) => current === event.payload.requestId ? null : current);
      if (taskId) {
        const run = taskRunsRef.current[taskId];
        if (run?.approval?.requestId === event.payload.requestId) {
          const next = { ...run, approval: null, status: "Continuing…" };
          taskRunsRef.current = { ...taskRunsRef.current, [taskId]: next }; setTaskRuns(taskRunsRef.current);
        }
      } else {
        setAgentApproval((current) => current?.requestId === event.payload.requestId ? null : current);
        setAiChatStatus("Continuing…");
      }
      return;
    }
    if (event.type === "userInputRequested") {
      if (taskId) {
        const run = taskRunsRef.current[taskId];
        if (run) {
          const next = { ...run, input: event.payload, status: "Waiting for your answer…" };
          taskRunsRef.current = { ...taskRunsRef.current, [taskId]: next }; setTaskRuns(taskRunsRef.current);
        }
      } else { agentInputRef.current = event.payload; setAgentUserInput(event.payload); setAiChatStatus("Waiting for your answer…"); }
      notifyAgent(taskId ?? null, "Agent has a question for you.");
      return;
    }
    if (taskId) {
      const run = taskRunsRef.current[taskId];
      if (run?.input?.requestId === event.payload.requestId) {
        const next = { ...run, input: null, status: "Continuing…" };
        taskRunsRef.current = { ...taskRunsRef.current, [taskId]: next }; setTaskRuns(taskRunsRef.current);
      }
    } else if (agentInputRef.current?.requestId === event.payload.requestId) { agentInputRef.current = null; setAgentUserInput(null); }
  };

  useEffect(() => {
    let cancelled = false;
    setChatModels([]);
    setModelsStatus("Loading models…");
    void invoke<ChatModel[]>("agent_models").then((models) => {
      if (cancelled) return;
      setChatModels(models);
      setModelsStatus(models.length ? "" : "No models available.");
    }).catch((reason) => {
      if (!cancelled) setModelsStatus(`Could not load models: ${message(reason)}`);
    });
    return () => { cancelled = true; };
  }, [modelsRevision, repository?.rootPath]);

  useEffect(() => {
    const completed = listen<{ name: string; success: boolean; cancelled?: boolean; error?: string }>("mcp-oauth-completed", (event) => {
      if (mcpLoginRef.current !== event.payload.name) return;
      mcpStatusRevision.current += 1;
      mcpLoginRef.current = null;
      setMcpLoginStarted(null);
      setMcpLoginPending(null);
      setMcpLoginCancelling(false);
      if (event.payload.success) {
        setMcpAuthStatuses((current) => ({ ...current, [event.payload.name]: "oauth" }));
        setMcpServersError("");
      } else if (!event.payload.cancelled) {
        setMcpServersError(`${event.payload.name}: ${event.payload.error || "MCP sign-in failed."}`);
      }
    });
    return () => void completed.then((unlisten) => unlisten());
  }, []);

  useEffect(() => {
    const output = listen<{ taskId: string; data: string }>("repository-run-output", (event) => {
      if (event.payload.taskId === runTaskRef.current) appendRunOutput(event.payload.data);
    });
    const finished = listen<{ taskId: string; success: boolean; exitCode: number | null }>("repository-run-finished", (event) => {
      if (event.payload.taskId !== runTaskRef.current) return;
      flushRunOutput();
      runTaskRef.current = null;
      setRunExitCode(event.payload.exitCode);
      if (runStopRequestedRef.current) {
        runStopRequestedRef.current = false;
        setRunStatus("idle");
        return;
      }
      if (!event.payload.success) {
        setRunStatus("failed");
        setRunError(event.payload.exitCode === null ? "Run command did not finish." : `Exited with code ${event.payload.exitCode}.`);
        return;
      }
      setRunStatus("success");
      clearRunSuccessTimer();
      runSuccessTimerRef.current = window.setTimeout(() => {
        setRunStatus("idle");
        runSuccessTimerRef.current = null;
      }, 3_000);
    });
    return () => {
      void output.then((unlisten) => unlisten());
      void finished.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    runOutputBottomRef.current?.scrollIntoView({ block: "end" });
  }, [runOutput]);

  useEffect(() => {
    const added = listen<ReviewComment>("mcp-comment-added", (event) => {
      setReview((current) => {
        if (!current || current.comments.some((comment) => comment.id === event.payload.id)) return current;
        return { ...current, comments: [...current.comments, event.payload] };
      });
    });
    const updated = listen<ReviewComment>("mcp-comment-updated", (event) => {
      setReview((current) => current && ({
        ...current,
        comments: current.comments.map((comment) => comment.id === event.payload.id ? event.payload : comment),
      }));
    });
    return () => {
      void added.then((unlisten) => unlisten());
      void updated.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    const drawingUpdated = listen<{ repositoryRoot: string; taskId: string; requestId: string; update: unknown }>("mcp-task-drawing-update", (event) => {
      const { repositoryRoot, taskId, requestId, update } = event.payload;
      void (async () => {
        try {
          const { applyTaskDrawingUpdate } = await import("./editTaskDrawing");
          if (repositoryRef.current?.rootPath !== repositoryRoot) throw new Error("Repository changed. Read the task again.");
          flushSync(() => window.dispatchEvent(new Event("flush-task-drawing")));
          const task = tasksRef.current.find((task) => task.id === taskId);
          if (!task) throw new Error("The task no longer exists.");
          const drawing = applyTaskDrawingUpdate(task.drawing, update);
          const next = timestampTaskUpdates(tasksRef.current, tasksRef.current.map((current) => current.id === taskId ? { ...current, drawing } : current));
          tasksRef.current = next;
          saveTasks(repositoryRoot, next);
          flushSync(() => setTasks(next));
          await fileStore.flush();
          await emit(`task-drawing-result-${requestId}`, { drawing });
        } catch (reason) {
          await emit(`task-drawing-result-${requestId}`, { error: message(reason) });
        }
      })();
    });
    return () => { void drawingUpdated.then((unlisten) => unlisten()); };
  }, [setTasks]);

  useEffect(() => {
    let queue = Promise.resolve();
    const acceptSaved = ({ repositoryRoot, taskId, html, updatedAt = Date.now() }: { repositoryRoot: string; taskId: string; html: string; updatedAt?: number }) => {
      fileStore.acceptTaskSandbox(taskStorageKey(repositoryRoot), taskId, html, updatedAt);
      if (repositoryRef.current?.rootPath !== repositoryRoot) return;
      flushSync(() => replaceTasks((current) => {
        if (!current.some((task) => task.id === taskId && (task.sandboxHtml !== html || (task.updatedAt ?? 0) < updatedAt))) return current;
        const next = current.map((task) => task.id === taskId ? { ...task, sandboxHtml: html, updatedAt: Math.max(updatedAt, task.updatedAt ?? 0) } : task);
        tasksRef.current = next;
        return next;
      }));
    };
    const saved = listen<{ repositoryRoot: string; taskId: string; html: string; updatedAt: number }>("task-sandbox-saved", (event) => {
      try { acceptSaved(event.payload); } catch (reason) { setError(message(reason)); }
    });
    const updated = listen<{ repositoryRoot: string; taskId: string; requestId: string; update: unknown }>("mcp-task-sandbox-update", (event) => {
      const { repositoryRoot, taskId, requestId, update } = event.payload;
      queue = queue.then(async () => {
        try {
          if (repositoryRef.current?.rootPath !== repositoryRoot) throw new Error("Repository changed. Read the task again.");
          const task = tasksRef.current.find((task) => task.id === taskId);
          if (!task) throw new Error("The task no longer exists.");
          const html = await applyTaskSandboxUpdate(task.sandboxHtml, update);
          await fileStore.flush();
          const updatedAt = await invoke<number>("save_task_sandbox", { repositoryRoot, taskId, update });
          acceptSaved({ repositoryRoot, taskId, html, updatedAt });
          await emit(`task-sandbox-result-${requestId}`, { saved: true, updatedAt });
        } catch (reason) {
          setError(message(reason));
          await emit(`task-sandbox-result-${requestId}`, { error: message(reason) });
        }
      }).catch((reason) => setError(message(reason)));
    });
    return () => { void updated.then((unlisten) => unlisten()); void saved.then((unlisten) => unlisten()); };
  }, []);

  useEffect(() => {
    const added = listen<{ repositoryRoot: string; task: unknown }>("mcp-task-added", (event) => {
      if (event.payload.repositoryRoot !== repository?.rootPath) return;
      const task = normalizeTask(event.payload.task, chatDefaults);
      if (task) {
        setTasks((current) => current.some((currentTask) => currentTask.id === task.id) ? current : [...current, { ...task, chatAgent: task.chatAgent ?? defaultAgent, ...taskLocationFields(taskLocationDefault) }]);
      }
    });
    const updated = listen<{ repositoryRoot: string; tasks: Pick<RepositoryTask, "id" | "createdAt" | "updatedAt" | "title" | "parentId" | "color" | "manualStatus" | "completed" | "planReady">[]; fieldChanges?: { taskId: string; values: Record<string, string | null> }; descriptionChange?: { taskId: string; description: string } }>("mcp-tasks-updated", (event) => {
      if (event.payload.repositoryRoot !== repository?.rootPath) return;
      setTasks((current) => mergeMcpTaskUpdates(current, event.payload.tasks, event.payload.fieldChanges, event.payload.descriptionChange));
    });
    const assetsAdded = listen<{ repositoryRoot: string; taskId: string; assets: TaskAsset[]; updatedAt: number }>("mcp-task-assets-added", (event) => {
      if (event.payload.repositoryRoot !== repository?.rootPath) return;
      setTasks((current) => current.map((task) => task.id === event.payload.taskId
        ? { ...task, updatedAt: event.payload.updatedAt, assets: [...task.assets, ...event.payload.assets.filter((asset) => !task.assets.some((existing) => existing.id === asset.id))] } : task));
    });
    const commentAdded = listen<{ repositoryRoot: string; taskId: string; comment: TaskComment; updatedAt: number }>("mcp-task-comment-added", (event) => {
      if (event.payload.repositoryRoot !== repository?.rootPath) return;
      setTasks((current) => current.map((task) => task.id === event.payload.taskId && !task.comments.some((comment) => comment.id === event.payload.comment.id)
        ? { ...task, updatedAt: event.payload.updatedAt, comments: [...task.comments, event.payload.comment] } : task));
    });
    const commentUpdated = listen<{ repositoryRoot: string; taskId: string; comment: TaskComment; updatedAt: number }>("mcp-task-comment-updated", (event) => {
      if (event.payload.repositoryRoot !== repository?.rootPath) return;
      setTasks((current) => current.map((task) => task.id === event.payload.taskId
        ? { ...task, updatedAt: event.payload.updatedAt, comments: task.comments.map((comment) => comment.id === event.payload.comment.id && comment.author === "agent" ? event.payload.comment : comment) } : task));
    });
    return () => { void added.then((unlisten) => unlisten()); void updated.then((unlisten) => unlisten()); void assetsAdded.then((unlisten) => unlisten()); void commentAdded.then((unlisten) => unlisten()); void commentUpdated.then((unlisten) => unlisten()); };
  }, [repository?.rootPath, chatDefaults, defaultAgent, taskLocationDefault, setTasks]);

  const visibleFiles = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return comparison?.files.filter((file) => file.path.toLowerCase().includes(query)) ?? [];
  }, [comparison, filter]);
  const fileTree = useMemo(() => buildFileTree(visibleFiles), [visibleFiles]);
  const approvedFiles = useMemo(
    () => new Set(comparison?.files
      .filter((file) => review?.approvedFiles.includes(file.path)
        && (review.approvedFileSnapshots?.[file.path] === file.snapshotId
          || review.approvedSnapshotId === comparison.snapshotId))
      .map((file) => file.path) ?? []),
    [comparison, review],
  );
  const fileEditDirty = !!fileEditDraft && fileEditDraft.content !== fileEditDraft.original;

  const discardFileEdit = (action: () => void) => {
    void (async () => {
      if (memoryMode && memoryFlushRef.current && !await memoryFlushRef.current()) return;
      if (!fileEditDirty) { setFileEditDraft(null); action(); return; }
      setConfirmation({
        title: "Discard unsaved file edits?",
        description: "Your changes have not been saved to disk.",
        actionLabel: "Discard edits",
        action: () => { setFileEditDraft(null); action(); },
      });
    })();
  };
  const selectWorkspaceMode = (mode: "workspace" | "tasks" | "memory") => {
    if (mode === workspaceMode) return;
    discardFileEdit(() => { setZenMode(false); setBoardDrawerOpen(false); setWorkspaceMode(mode); });
  };
  modeSwitchRef.current = selectWorkspaceMode;

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (fileEditDirty) { event.preventDefault(); event.returnValue = ""; } };
    let unlisten: (() => void) | undefined;
    let disposed = false;
    window.addEventListener("beforeunload", warn);
    void getCurrentWindow().onCloseRequested((event) => {
      event.preventDefault();
      window.dispatchEvent(new Event("flush-task-fields"));
      window.dispatchEvent(new Event("flush-task-drawing"));
      if (!fileEditDirty) {
        void fileStore.flush().then(() => getCurrentWindow().destroy()).catch((reason) => setError(message(reason)));
        return;
      }
      setConfirmation({ title: "Discard unsaved file edits?", description: "Your changes have not been saved to disk.", actionLabel: "Discard edits", action: () => void getCurrentWindow().destroy() });
    }).then((stop) => { if (disposed) stop(); else unlisten = stop; });
    return () => { disposed = true; unlisten?.(); window.removeEventListener("beforeunload", warn); };
  }, [fileEditDirty, memoryMode]);

  useEffect(() => {
    if (fileViewMode !== "edit" || !selectedFile || comparison?.mode !== "workingCopy" || selectedFile.binary || selectedFile.status === "deleted" || fileEditDraft?.path === selectedFile.path) return;
    const requestId = ++fileEditLoadRef.current;
    setFileEditLoading(true);
    void invoke<{ path: string; content: string }>("load_repository_file", { path: selectedFile.path, compareRef: null })
      .then((result) => { if (requestId === fileEditLoadRef.current) { setFileEditDraft({ path: result.path, original: result.content, content: result.content }); setFileEditRevision((current) => current + 1); } })
      .catch((reason) => { if (requestId === fileEditLoadRef.current) { setFileEditDraft(null); setError(message(reason)); } })
      .finally(() => { if (requestId === fileEditLoadRef.current) setFileEditLoading(false); });
  }, [comparison?.mode, fileEditDraft?.path, fileViewMode, selectedFile]);

  const toggleFolder = (path: string) => {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const cacheWorkspace = () => {
    if (!comparison) return;
    workspaceCacheRef.current[comparison.mode] = {
      comparison,
      review,
      selectedFile,
      viewMode: fileViewMode,
      expandedFolders: new Set(expandedFolders),
    };
  };

  const loadFile = async (
    file: ChangedFile,
    current = comparison,
    preserveDraft = false,
    silent = false,
    fullFile = showFullFileDiff,
  ) => {
    const requestId = ++fileLoadRef.current;
    const sameFile = selectedFile?.path === file.path;
    setSelectedFile(file);
    if (!sameFile) {
      setSelection(null);
    }
    if (!current || file.binary || isVeryLargeChangedFile(file)) {
      setSelection(null);
      setDiff(null);
      setChangeNavigation(null);
      setDiffLoading(false);
      return null;
    }
    if (!silent) setDiffLoading(true);
    try {
      const nextDiff = await invoke<FileDiff>(current.mode === "branch" ? "load_branch_file_diff" : "load_working_file_diff", current.mode === "branch"
        ? { baseRef: current.baseRef, compareRef: current.compareRef, oldPath: file.oldPath, path: file.path, fullFile }
        : { baseOid: current.baseOid, oldPath: file.oldPath, path: file.path, fullFile });
      if (requestId !== fileLoadRef.current) return null;
      if (!preserveDraft || !sameFile || JSON.stringify(diff) !== JSON.stringify(nextDiff)) {
        setSelection(null);
      }
      const blockCount = isVeryLargeDiff(nextDiff) ? 0 : diffChangeBlocks(nextDiff).length;
      setChangeNavigation((previous) => blockCount ? {
        diff: nextDiff,
        index: sameFile && comparison?.mode === current.mode && comparison.snapshotId === current.snapshotId
          && selectedFile?.snapshotId === file.snapshotId && previous?.diff === diff
          ? Math.min(previous.index, blockCount - 1)
          : 0,
      } : null);
      setDiff(nextDiff);
      return nextDiff;
    } catch (reason) {
      if (requestId !== fileLoadRef.current) return null;
      setDiff(null);
      setChangeNavigation(null);
      setError(message(reason));
      return null;
    } finally {
      if (!silent && requestId === fileLoadRef.current) setDiffLoading(false);
    }
  };

  const changeFullFileDiff = (fullFile: boolean) => {
    setShowFullFileDiff(fullFile);
    if (selectedFile && comparison && fileViewMode !== "edit" && !selectedFile.binary) {
      void loadFile(selectedFile, comparison, false, false, fullFile);
    }
  };

  const navigateChange = (direction: -1 | 1) => {
    if (!diff || !changeBlocks.length) return;
    setChangeNavigation((current) => ({
      diff,
      index: current?.diff === diff
        ? (current.index + direction + changeBlocks.length) % changeBlocks.length
        : direction === 1 ? 0 : changeBlocks.length - 1,
    }));
  };

  const selectFileViewMode = (mode: FileViewMode) => {
    if (!selectedFile || !comparison || diffLoading || mode === fileViewMode) return;
    const change = () => {
      setSelection(null);
      setFileViewMode(mode);
      if (mode !== "edit") {
        ++fileEditLoadRef.current;
        setFileEditDraft(null);
        void loadFile(selectedFile, comparison, true);
      }
    };
    if (fileViewMode === "edit") discardFileEdit(change); else change();
  };

  const selectChangedFile = (file: ChangedFile) => {
    if (file.path === selectedFile?.path) return;
    discardFileEdit(() => {
      const canEdit = comparison?.mode === "workingCopy" && !file.binary && file.status !== "deleted";
      if (fileViewMode === "edit" && !canEdit) setFileViewMode(defaultFileViewMode);
      void loadFile(file, comparison);
    });
  };

  const discardCurrentFileEdit = () => {
    if (!fileEditDraft) return;
    setFileEditDraft(null);
  };

  const saveCurrentFileEdit = async () => {
    if (!fileEditDraft || fileEditDraft.path !== selectedFile?.path || !fileEditDirty || fileEditSaving) return;
    setFileEditSaving(true);
    setError("");
    try {
      await invoke("save_repository_file", { path: fileEditDraft.path, content: fileEditDraft.content, expectedContent: fileEditDraft.original });
      setFileEditDraft((current) => current ? { ...current, original: current.content } : null);
      await refreshRef.current();
    } catch (reason) {
      setError(message(reason));
    } finally {
      setFileEditSaving(false);
    }
  };

  const openSelectedFileInEditor = async () => {
    if (!selectedFile || comparison?.mode !== "workingCopy") return;
    try {
      await invoke("open_repository_file", { path: selectedFile.path });
    } catch (reason) {
      setError(message(reason));
    }
  };

  const loadComparison = async (repo: RepositoryInfo, refresh = false, mode = comparisonMode, branchBaseRef = baseRef, branchCompareRef = compareRef) => {
    const requestId = ++comparisonLoadRef.current;
    ++fileLoadRef.current;
    if (!refresh) {
      setLoading(true);
      setError("");
      setFileViewMode(defaultFileViewMode);
      setComparison(null);
      setReview(null);
      setDiff(null);
      setSelectedFile(null);
      setSelection(null);
    }
    try {
      const result = await invoke<Comparison>(mode === "branch" ? "compare_branches" : "compare_working_copy", mode === "branch" ? { baseRef: branchBaseRef, compareRef: branchCompareRef } : {});
      if (requestId !== comparisonLoadRef.current) return;
      setComparison(result);
      setExpandedFolders(expandedFolderPaths(result.files));
      const sameReview = result.mode === "workingCopy" && review?.baseOid === result.baseOid;
      const stored = sameReview
        ? review
        : await invoke<ReviewSession | null>("load_review", { baseOid: result.baseOid, mode: result.mode, baseRef: result.baseRef, compareRef: result.compareRef });
      if (requestId !== comparisonLoadRef.current) return;
      let nextReview = stored ? { ...stored } : {
          repoPath: repo.rootPath,
          baseOid: result.baseOid,
          mode: result.mode,
          baseRef: result.baseRef,
          compareRef: result.compareRef,
          compareCommitOid: result.mode === "branch" ? result.compareCommitOid : null,
          comments: [],
          chatMessages: [],
          agentThreadId: null,
          chatAgent: defaultAgent,
          approvedFiles: [],
          approvedFileSnapshots: {},
          approvedSnapshotId: result.snapshotId,
        };
      const previousReview = reviewRef.current;
      let carriedChat = false;
      if (!stored && refresh && !autoClearChatAfterCommit) {
        const carried = carryReviewChat(previousReview, nextReview);
        carriedChat = carried !== nextReview;
        nextReview = carried;
      }
      const resetApprovals = nextReview.approvedSnapshotId === result.snapshotId;
      if (nextReview.approvedSnapshotId === result.snapshotId) {
        nextReview.approvedFileSnapshots = Object.fromEntries(result.files
          .filter((file) => nextReview.approvedFiles.includes(file.path))
          .map((file) => [file.path, file.snapshotId]));
        nextReview.approvedSnapshotId = null;
      }
      if (resetApprovals || carriedChat) {
        await invoke("save_review", { session: nextReview });
        if (requestId !== comparisonLoadRef.current) return;
      }
      if (carriedChat) {
        const oldKey = reviewQueueKey(previousReview!);
        const newKey = reviewQueueKey(nextReview);
        const queued = chatQueuesRef.current[oldKey];
        if (queued?.length) {
          const nextQueues = { ...chatQueuesRef.current, [newKey]: [...queued, ...(chatQueuesRef.current[newKey] ?? [])] };
          delete nextQueues[oldKey];
          chatQueuesRef.current = nextQueues;
          setChatQueues(nextQueues);
          saveChatQueues(nextQueues);
          setQueuePaused(newKey, true);
        }
      }
      setReview(nextReview);
      const editedPath =
        refresh && autoOpenEditedFile && !fileEditDirty
          ? [...changedPathsRef.current]
              .reverse()
              .find((path) => result.files.some((file) => file.path === path))
          : undefined;
      if (refresh) changedPathsRef.current = [];
      const nextFile =
        result.files.find((file) => file.path === editedPath) ??
        result.files.find((file) => file.path === selectedFile?.path) ??
        result.files[0] ??
        null;
      if (nextFile) {
        if (fileViewMode === "edit" && (result.mode !== "workingCopy" || nextFile.binary || nextFile.status === "deleted")) {
          setFileViewMode(defaultFileViewMode);
          setFileEditDraft(null);
        }
        await loadFile(nextFile, result, refresh, refresh);
        if (requestId !== comparisonLoadRef.current) return;
      } else {
        setSelectedFile(null);
        setDiff(null);
        setSelection(null);
        setFileEditDraft(null);
        setFileViewMode(defaultFileViewMode);
      }
    } catch (reason) {
      if (requestId !== comparisonLoadRef.current) return;
      if (!refresh) {
        setComparison(null);
        setReview(null);
        delete workspaceCacheRef.current[mode];
      }
      setError(message(reason));
    } finally {
      if (requestId === comparisonLoadRef.current) setLoading(false);
    }
  };

  const activateRepository = async (repo: RepositoryInfo) => {
    setRepository(repo);
    const refs = await invoke<BranchRefs>("list_branch_refs");
    setBranchRefs(refs);
    setCompareRef(repo.currentBranch ?? "");
    setBaseRef(refs.defaultBase ?? "");
    setFilter("");
    await loadComparison(repo, false, "workingCopy");
  };

  const initializeRepository = useEffectEvent(activateRepository);
  useEffect(() => {
    void invoke<RepositoryInfo | null>("current_repository").then((repo) => {
      if (repo) return initializeRepository(repo);
    }).catch((reason) => setError(message(reason)));
  }, []);

  const switchComparisonMode = (next: Comparison["mode"]) => {
    if (next === comparisonMode) return;
    discardFileEdit(() => {
      cacheWorkspace();
      ++comparisonLoadRef.current;
      ++fileLoadRef.current;
      setComparisonMode(next);
      setLoading(false);
      setDiffLoading(false);
      setError("");
      setSelection(null);
      const cached = workspaceCacheRef.current[next];
      if (cached) {
        setComparison(cached.comparison);
        setReview(cached.review);
        setSelectedFile(cached.selectedFile);
        setDiff(null);
        setFileViewMode(cached.viewMode);
        setExpandedFolders(new Set(cached.expandedFolders));
        if (cached.selectedFile && cached.viewMode !== "edit") void loadFile(cached.selectedFile, cached.comparison);
        return;
      }
      setComparison(null);
      setReview(null);
      setSelectedFile(null);
      setDiff(null);
      setFileViewMode(defaultFileViewMode);
      setExpandedFolders(new Set());
    });
  };

  const selectBranchComparison = (nextBaseRef: string) => {
    if (!repository || !repository.currentBranch || !nextBaseRef || nextBaseRef === repository.currentBranch) return;
    const nextCompareRef = repository.currentBranch;
    const cached = workspaceCacheRef.current.branch;
    if (cached?.comparison.baseRef === nextBaseRef && cached.comparison.compareRef === nextCompareRef) {
      setBaseRef(nextBaseRef);
      setCompareRef(nextCompareRef);
      switchComparisonMode("branch");
      return;
    }
    discardFileEdit(() => {
      setBaseRef(nextBaseRef);
      setCompareRef(nextCompareRef);
      cacheWorkspace();
      delete workspaceCacheRef.current.branch;
      ++comparisonLoadRef.current;
      ++fileLoadRef.current;
      setComparisonMode("branch");
      setLoading(false);
      setDiffLoading(false);
      setError("");
      setSelection(null);
      void loadComparison(repository, false, "branch", nextBaseRef, nextCompareRef);
    });
  };

  const workspaceOperationBusy = !!taskGitAction || commitRunning || commitGenerating || runStatus === "running" || runStatus === "stopping" || branchSwitching || branchesFetching || branchPulling || branchPushing;
  const branchActionBusy = workspaceOperationBusy || aiChatRunning || Object.values(taskRuns).some((run) => run.mode === "default");
  const branchFilterTerm = branchFilter.trim().toLowerCase();
  const localBranches = (branchRefs?.refs ?? []).filter((branch) => branch.toLowerCase().includes(branchFilterTerm));
  const remoteBranches = (branchRefs?.remoteRefs ?? []).filter((branch) =>
    !branchRefs?.refs.includes(branch.slice("origin/".length)) && branch.toLowerCase().includes(branchFilterTerm),
  );
  const localBranchTree = buildBranchTree(localBranches);
  const remoteBranchTree = buildBranchTree(remoteBranches, "origin/");

  const toggleBranchFolder = (path: string) => {
    setExpandedBranchFolders((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const fetchBranches = async () => {
    if (branchActionBusy) return;
    setBranchesFetching(true);
    setError("");
    try {
      setBranchRefs(await invoke<BranchRefs>("fetch_branches"));
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBranchesFetching(false);
    }
  };

  const pullBranch = async () => {
    if (!repository || branchActionBusy) return;
    setBranchPulling(true);
    setError("");
    workspaceCacheRef.current = {};
    ++comparisonLoadRef.current;
    ++fileLoadRef.current;
    setComparisonMode("workingCopy");
    try {
      const repo = await invoke<RepositoryInfo>("pull_current_branch");
      await activateRepository(repo);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBranchPulling(false);
    }
  };

  const pushBranch = async () => {
    if (!repository || branchActionBusy) return;
    setBranchPushing(true);
    setError("");
    try {
      setBranchRefs(await invoke<BranchRefs>("push_current_branch"));
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBranchPushing(false);
    }
  };

  const switchBranch = async (branch: string) => {
    if (!repository || branch === repository.currentBranch || branchActionBusy) return;
    setBranchPickerOpen(false);
    setBranchSwitching(true);
    setError("");
    workspaceCacheRef.current = {};
    ++comparisonLoadRef.current;
    ++fileLoadRef.current;
    setComparisonMode("workingCopy");
    try {
      const repo = await invoke<RepositoryInfo>("switch_branch", { branch });
      await activateRepository(repo);
      if (autoFetchPullOnBranchSwitch && repo.hasOrigin) {
        const refs = await invoke<BranchRefs>("fetch_branches");
        setBranchRefs(refs);
        if (refs.pullCount && refs.pullCount > 0) {
          await activateRepository(await invoke<RepositoryInfo>("pull_current_branch"));
        }
      }
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBranchSwitching(false);
    }
  };

  const commitChanges = async () => {
    if (!repository || !comparison || comparison.mode !== "workingCopy" || !commitMessage.trim() || commitRunning || aiChatRunning || fileEditDirty) return;
    setCommitRunning(true);
    setError("");
    try {
      const repo = await invoke<RepositoryInfo>("commit_working_copy", {
        message: commitMessage,
        snapshotId: comparison.snapshotId,
      });
      workspaceCacheRef.current = {};
      setRepository(repo);
      setCommitMessage("");
      await loadComparison(repo, true, "workingCopy");
    } catch (reason) {
      setError(message(reason));
    } finally {
      setCommitRunning(false);
    }
  };

  const generateCommitMessage = async () => {
    if (!comparison || comparison.mode !== "workingCopy" || commitGenerating || commitRunning || fileEditDirty) return;
    setCommitGenerating(true);
    setError("");
    try {
      setCommitMessage(await invoke<string>("generate_commit_message", { snapshotId: comparison.snapshotId, model: commitMessageModel }));
    } catch (reason) {
      setError(message(reason));
    } finally {
      setCommitGenerating(false);
    }
  };

  const chooseRepository = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Open Git repository",
    });
    if (typeof selected !== "string") return;
    workspaceCacheRef.current = {};
    ++comparisonLoadRef.current;
    ++fileLoadRef.current;
    setComparisonMode("workingCopy");
    setLoading(true);
    setError("");
    try {
      let result = await invoke<OpenRepositoryResult>("open_repository", { path: selected, initialize: false });
      if (result.status === "setupNeeded") {
        const setup = await ask(
          result.reason === "notRepository"
            ? "Dieser Ordner ist noch kein Git-Repository. Soll Lotse ihn auf main mit einem leeren Initial commit einrichten?"
            : "Dieses Git-Repository hat noch keinen Commit. Soll Lotse main mit einem leeren Initial commit einrichten?",
          { title: "Repository einrichten?", kind: "info", okLabel: "Einrichten", cancelLabel: "Abbrechen" },
        );
        if (!setup) return;
        result = await invoke<OpenRepositoryResult>("open_repository", { path: selected, initialize: true });
      }
      if (result.status !== "opened") return;
      if (result.focusedExisting) {
        await getCurrentWindow().close();
        return;
      }
      await activateRepository(result.repository);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setLoading(false);
    }
  };

  const openRequestedRepository = useEffectEvent(() => { discardFileEdit(() => void chooseRepository()); });
  useEffect(() => {
    const requested = listen("open-repository-requested", () => openRequestedRepository());
    return () => void requested.then((unlisten) => unlisten());
  }, []);

  refreshRef.current = async () => {
    if (!repository) return;
    const repo = await invoke<RepositoryInfo>("refresh_repository");
    setRepository(repo);
    const branchChanged = repo.currentBranch !== repository.currentBranch;
    const refs = branchChanged || comparisonMode === "branch"
      ? await invoke<BranchRefs>("list_branch_refs")
      : null;
    if (refs) setBranchRefs(refs);
    if (branchChanged) {
      workspaceCacheRef.current = {};
      setCompareRef(repo.currentBranch ?? "");
    }
    if (comparisonMode === "branch") {
      const nextCompareRef = repo.currentBranch ?? "";
      setCompareRef(nextCompareRef);
      if (!baseRef || !nextCompareRef || baseRef === nextCompareRef || !refs?.refs.includes(baseRef)) {
        ++comparisonLoadRef.current;
        ++fileLoadRef.current;
        workspaceCacheRef.current = {};
        setComparisonMode("workingCopy");
        setError("");
        await loadComparison(repo, false, "workingCopy");
        return;
      }
      await loadComparison(repo, true, "branch", baseRef, nextCompareRef);
      return;
    }
    await loadComparison(repo, true, comparisonMode);
  };

  useEffect(() => {
    const root = repository?.rootPath;
    if (!root) return;
    let active = true;
    let timer: number | undefined;
    let running = false;
    let pending = false;
    const refresh = async () => {
      if (running) {
        pending = true;
        return;
      }
      running = true;
      do {
        pending = false;
        try {
          await refreshRef.current();
        } catch (reason) {
          setError(message(reason));
        }
      } while (active && pending);
      running = false;
    };
    const schedule = () => {
      if (timer !== undefined) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        void refresh();
      }, 250);
    };
    const changed = listen<{ rootPath: string; paths: string[] }>("repository-changed", (event) => {
      if (active && event.payload.rootPath === root) {
        if (comparisonMode === "branch" && event.payload.paths.length && !event.payload.paths.includes(".git/HEAD")) return;
        changedPathsRef.current.push(...event.payload.paths);
        schedule();
      }
    });
    const failed = listen<string>("repository-watch-error", (event) => {
      if (active) setError(`Repository watcher: ${event.payload}`);
    });
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      void changed.then((unlisten) => unlisten());
      void failed.then((unlisten) => unlisten());
    };
  }, [repository?.rootPath, comparisonMode]);

  const persistReview = async (next: ReviewSession) => {
    reviewRef.current = next;
    setReview(next);
    try {
      await invoke("save_review", { session: next });
      return true;
    } catch (reason) {
      setError(message(reason));
      return false;
    }
  };

  const toggleFileApproval = () => {
    if (!review || !comparison || !selectedFile) return;
    const current = [...approvedFiles];
    const next = current.includes(selectedFile.path)
      ? current.filter((path) => path !== selectedFile.path)
      : [...current, selectedFile.path];
    const approvedFileSnapshots = Object.fromEntries(next.map((path) => [
      path,
      comparison.files.find((file) => file.path === path)?.snapshotId,
    ]).filter((entry): entry is [string, string] => !!entry[1]));
    void persistReview({ ...review, approvedFiles: next, approvedFileSnapshots, approvedSnapshotId: null });
  };

  const revertFile = async () => {
    if (!comparison || !selectedFile || comparison.mode !== "workingCopy" || revertRunning) return;
    setRevertRunning(true);
    setError("");
    try {
      await invoke("revert_working_file", { path: selectedFile.path, snapshotId: comparison.snapshotId });
      await refreshRef.current();
    } catch (reason) {
      setError(message(reason));
    } finally {
      setRevertRunning(false);
    }
  };

  const selectLine = (side: CommentSide, cell: DiffCell, extend: boolean) => {
    if (!diff) return;
    const cells = diff.hunks.flatMap((hunk) => hunk.rows.flatMap((row) => {
      const candidate = side === "base" ? row.old : row.new;
      return candidate ? [candidate] : [];
    }));
    if (!extend || selection?.filePath !== diff.path || selection.side !== side) {
      setSelection({ filePath: diff.path, side, lines: [cell] });
      return;
    }
    const anchor = selection.lines[0];
    const from = cells.findIndex((item) => item.lineNumber === anchor.lineNumber && item.text === anchor.text);
    const to = cells.findIndex((item) => item.lineNumber === cell.lineNumber && item.text === cell.text);
    if (from >= 0 && to >= 0) setSelection({ filePath: diff.path, side, lines: cells.slice(Math.min(from, to), Math.max(from, to) + 1) });
  };

  const discardPlaybookDraft = (action: () => void) => {
    const saved = playbooks.find((playbook) => playbook.id === playbookDraft.id);
    if (playbookContent(playbookDraft) === playbookContent(saved ?? newPlaybook())) return action();
    setConfirmation({
      title: "Discard unsaved changes?",
      description: "Your changes to this playbook have not been saved.",
      actionLabel: "Discard",
      action,
    });
  };

  const selectPlaybook = (playbook: Playbook) => discardPlaybookDraft(() => {
    setSelectedPlaybookId(playbook.id);
    setPlaybookDraft({ ...playbook });
    setPlaybookError("");
    setPlaybookSaveNotice("");
  });

  const savePlaybook = () => {
    const title = playbookDraft.title.trim();
    const prompt = playbookDraft.prompt.trim();
    if (!title || title.length > 200) {
      setPlaybookError("Add a title of at most 200 characters.");
      return null;
    }
    if (!prompt || prompt.length > 20_000) {
      setPlaybookError("Add a prompt of at most 20,000 characters.");
      return null;
    }
    const variableNames = playbookDraft.variables.map((variable) => variable.name.trim());
    if (variableNames.some((name) => !/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) || new Set(variableNames).size !== variableNames.length) {
      setPlaybookError("Variable names must be unique and use letters, numbers, and underscores.");
      return null;
    }
    if (playbookDraft.variables.some((variable) => !variable.label.trim())) {
      setPlaybookError("Add a label for every variable.");
      return null;
    }
    const saved = {
      ...playbookDraft,
      title,
      prompt,
      description: playbookDraft.description.trim(),
      variables: playbookDraft.variables.map((variable) => ({ ...variable, name: variable.name.trim(), label: variable.label.trim() })),
    };
    setPlaybooks((current) => current.some((item) => item.id === saved.id)
      ? current.map((item) => item.id === saved.id ? saved : item)
      : [...current, saved]);
    setSelectedPlaybookId(saved.id);
    setPlaybookDraft(saved);
    setPlaybookError("");
    setPlaybookSaveNotice("Saved");
    window.setTimeout(() => setPlaybookSaveNotice(""), 2_000);
    return saved;
  };

  const createPlaybook = () => discardPlaybookDraft(() => {
    const next = newPlaybook();
    setSelectedPlaybookId(next.id);
    setPlaybookDraft(next);
    setPlaybookError("");
    setPlaybookSaveNotice("");
  });

  const deletePlaybook = () => {
    const existing = playbooks.find((playbook) => playbook.id === playbookDraft.id);
    if (!existing) {
      createPlaybook();
      return;
    }
    setConfirmation({
      title: `Delete “${existing.title}”?`,
      description: "This removes the saved playbook. This action cannot be undone.",
      actionLabel: "Delete",
      action: () => {
        const next = playbooks.filter((playbook) => playbook.id !== existing.id);
        const selected = next[0] ?? newPlaybook();
        setPlaybooks(next);
        setSelectedPlaybookId(selected.id);
        setPlaybookDraft({ ...selected });
        setPlaybookError("");
        setPlaybookSaveNotice("");
      },
    });
  };

  const addChatFiles = async (paths: string[], taskId?: string) => {
    if (!comparison || aiChatImageImportingRef.current) return;
    aiChatImageImportingRef.current = true;
    const task = taskId ? tasks.find((task) => task.id === taskId) : undefined;
    const currentAttachments = task ? [...task.attachments, ...taskAssetAttachments(task, taskAssetSelections[task.id] ?? [])] : chatRequestContext.attachments;
    const remaining = 12 - currentAttachments.length;
    if (paths.length > remaining) { setError("Attach up to 12 items per message."); aiChatImageImportingRef.current = false; return; }
    try {
      const imported = await invoke<ChatAttachment[]>("import_chat_files", { paths });
      if (taskId) {
        await invoke("retain_task_images", { paths: imported.flatMap((attachment) => isChatUpload(attachment) ? [attachment.path] : []) });
        updateTask(taskId, (task) => ({ ...task, attachments: [...task.attachments, ...imported] }));
      } else setAiChatUploads((current) => [...current, ...imported]);
    } catch (reason) { setError(message(reason)); }
    finally { aiChatImageImportingRef.current = false; }
  };

  const pasteChatImage = async (image: File, taskId?: string) => {
    if (!comparison || aiChatImageImportingRef.current) return;
    const task = taskId ? tasks.find((task) => task.id === taskId) : undefined;
    const currentAttachments = task ? [...task.attachments, ...taskAssetAttachments(task, taskAssetSelections[task.id] ?? [])] : chatRequestContext.attachments;
    if (currentAttachments.length >= 12) { setError("Attach up to 12 items per message."); return; }
    aiChatImageImportingRef.current = true;
    try {
      const imported = await invoke<ChatAttachment>("import_pasted_chat_image", {
        bytes: Array.from(new Uint8Array(await image.arrayBuffer())),
        name: image.name,
      });
      if (taskId && imported.kind === "image") {
        await invoke("retain_task_images", { paths: [imported.path] });
        updateTask(taskId, (task) => ({ ...task, attachments: [...task.attachments, imported] }));
      } else setAiChatUploads((current) => [...current, imported]);
    } catch (reason) { setError(message(reason)); }
    finally { aiChatImageImportingRef.current = false; }
  };

  const removeChatImage = (path: string, taskId?: string) => {
    if (taskId) updateTask(taskId, (task) => ({ ...task, attachments: task.attachments.filter((attachment) => !isChatUpload(attachment) || attachment.path !== path) }));
    else setAiChatUploads((current) => current.filter((attachment) => !isChatUpload(attachment) || attachment.path !== path));
    void invoke("remove_chat_image", { path }).catch((reason) => setError(message(reason)));
  };

  const removeTaskImages = async (tasksToRemove: RepositoryTask | RepositoryTask[]) => {
    const items = Array.isArray(tasksToRemove) ? tasksToRemove : [tasksToRemove];
    for (const path of new Set(items.flatMap(taskImagePaths))) await invoke("remove_chat_image", { path }).catch(() => {});
  };

  const addTaskAssets = async (taskId: string, paths: string[]) => {
    if (taskRunsRef.current[taskId] || taskStartingRef.current.has(taskId)) return;
    try {
      const assets = await invoke<TaskAsset[]>("import_task_assets", { taskId, paths });
      updateTask(taskId, (task) => ({ ...task, assets: [...task.assets, ...assets] }));
    } catch (reason) { setError(message(reason)); }
  };

  const removeTaskAsset = async (task: RepositoryTask, assetId: string) => {
    if (taskRunsRef.current[task.id] || taskStartingRef.current.has(task.id)) return;
    const queued = repository ? chatQueuesRef.current[taskQueueKey(repository.rootPath, task.id)] ?? [] : [];
    const usedInChat = task.chatMessages.some((entry) => entry.attachments?.some((attachment) => attachment.kind === "taskAsset" && attachment.id === assetId))
      || queued.some((entry) => entry.context.attachments.some((attachment) => attachment.kind === "taskAsset" && attachment.id === assetId));
    try {
      if (!usedInChat) await invoke("remove_task_asset", { taskId: task.id, assetId });
      updateTask(task.id, (current) => ({ ...current, assets: current.assets.filter((asset) => asset.id !== assetId) }));
      setTaskAssetSelections((current) => ({ ...current, [task.id]: (current[task.id] ?? []).filter((id) => id !== assetId) }));
    } catch (reason) { setError(message(reason)); }
  };

  const startChatTurn = async (request: {
    threadId: string | null;
    chatAgent?: ChatAgent | null;
    model: string;
    effort: ChatEffort;
    mode: AiChatMode;
    prompt: string;
    context: ChatRequestContext;
    allowLongPrompt?: boolean;
    taskId?: string;
    taskLocation?: RepositoryTask["location"];
    taskTitle?: string;
    taskDescription?: string;
    }, onEvent: (event: AgentTurnEvent) => void) => {
    await syncMcpContextRef.current();
    return invoke<AiChatAccepted>("ai_chat_send", { input: { baseOid: comparison!.baseOid, mode: comparison!.mode, baseRef: comparison!.baseRef, compareRef: comparison!.compareRef, snapshotId: comparison!.snapshotId, agentThreadId: request.threadId, model: request.model, effort: request.effort, collaborationMode: request.mode, prompt: request.prompt, userRules, agentPrompt: request.chatAgent?.prompt ?? "", chatContext: request.context, comments: review!.comments, allowLongPrompt: request.allowLongPrompt, taskId: request.taskId, taskLocation: request.taskLocation, taskTitle: request.taskTitle, taskDescription: request.taskDescription, approvalMode: approvalReviewerOverrides[request.taskId ?? "review"] ?? approvalReviewerDefault }, events: new Channel<AgentTurnEvent>(onEvent) });
  };

  const sendAiChat = async (promptOverride?: string, requestContext = chatRequestContext, modeOverride?: AiChatMode, configurationOverride?: ChatDefaults[AiChatMode], queuedItem?: QueuedChatMessage): Promise<boolean> => {
    const turnMode = modeOverride ?? aiChatMode;
    const prompt = (promptOverride ?? aiChatDraft).trim();
    const currentReview = reviewRef.current;
    if (!comparison || !currentReview || aiChatRunningRef.current || (!prompt && !requestContext.attachments.some(isChatUpload))) return false;
    const currentSelection = queuedItem ? queuedItem.selection : selection;
    const previous = currentReview.chatMessages ?? [];
    const userMessage: ChatMessage = {
      id: queuedItem?.id ?? crypto.randomUUID(),
      role: "user",
      body: prompt,
      createdAt: new Date().toISOString(),
      selection: currentSelection,
      snapshotId: comparison.snapshotId,
      suggestions: [],
      contexts: [],
      attachments: requestContext.attachments,
    };
    const pendingReview = { ...currentReview, chatMessages: [...previous.filter((entry) => entry.id !== userMessage.id).slice(-98), userMessage] };
    aiChatCancelRequested.current = false;
    aiChatTurnModeRef.current = turnMode;
    resetAiChatTimeline();
    setAiChatPlan(null);
    if (!queuedItem) { setAiChatDraft(""); setAiChatUploads([]); }
    aiChatRunningRef.current = true;
    reviewRunQueueKeyRef.current = reviewQueueKey(currentReview);
    reviewRunSessionRef.current = pendingReview;
    setAiChatRunning(true);
    setAiChatStatus("Preparing the current review context…");
    setError("");
    try {
      if (!await persistReview(pendingReview)) throw new Error("Could not save the message before sending.");
      if (aiChatCancelRequested.current) {
        aiChatRunningRef.current = false; setAiChatRunning(false); setAiChatStatus(""); reviewRunSessionRef.current = null;
        if (reviewRef.current && reviewQueueKey(reviewRef.current) === reviewQueueKey(currentReview)) void persistReview(currentReview);
        if (!queuedItem) { setAiChatDraft(promptOverride ?? aiChatDraft); setAiChatUploads(requestContext.attachments.filter(isChatUpload)); }
        return false;
      }
      const requestedModel = configurationOverride?.model ?? aiChatModel;
      setAiChatServerModel(requestedModel);
      const earlyEvents: AgentTurnEvent[] = [];
      let runReady = false;
      const result = await startChatTurn({
        threadId: currentReview.agentThreadId,
        chatAgent: currentReview.chatAgent,
        model: requestedModel,
        effort: configurationOverride?.effort ?? aiChatEffort,
        mode: turnMode,
        prompt,
        context: requestContext,
      }, (event) => { if (runReady) handleTurnEvent(event); else earlyEvents.push(event); });
      aiChatTurnRef.current = result;
      reviewRunSessionRef.current = {
        ...pendingReview,
        agentThreadId: result.threadId,
      };
      if (reviewRef.current && reviewQueueKey(reviewRef.current) === reviewRunQueueKeyRef.current) await persistReview(reviewRunSessionRef.current);
      else try { await invoke("save_review", { session: reviewRunSessionRef.current }); } catch (reason) { setError(message(reason)); }
      runReady = true;
      earlyEvents.forEach((event) => handleTurnEvent(event));
      return true;
    } catch (reason) {
      const error = message(reason);
      setError(error);
      setAiChatRunning(false);
      aiChatRunningRef.current = false;
      setAiChatStatus("");
      aiChatTurnRef.current = null;
      reviewRunSessionRef.current = null;
      if (!queuedItem) { setAiChatDraft(promptOverride ?? aiChatDraft); setAiChatUploads(requestContext.attachments.filter(isChatUpload)); }
      const visibleReview = reviewRef.current && reviewQueueKey(reviewRef.current) === reviewQueueKey(currentReview) ? reviewRef.current : null;
      if (visibleReview) void persistReview({ ...visibleReview, chatMessages: visibleReview.chatMessages.filter((entry) => entry.id !== userMessage.id) });
      else void invoke("save_review", { session: currentReview }).catch((reason) => setError(message(reason)));
      return false;
    } finally {
      // Completion arrives through the turn channel so text can stream into the panel.
    }
  };

  const updateTask = (id: string, update: (task: RepositoryTask) => RepositoryTask) => setTasks((current) => current.map((task) => task.id === id ? update(task) : task));
  const updateTaskAtRoot = (rootPath: string, id: string, change: (task: RepositoryTask) => RepositoryTask) => {
    const update = (task: RepositoryTask) => task.id === id ? change(task) : task;
    const active = repositoryRef.current?.rootPath === rootPath;
    // Persist before a repository switch can replace React's task state.
    const previous = active ? tasksRef.current : loadTasks(rootPath, chatDefaults);
    const next = timestampTaskUpdates(previous, previous.map(update));
    saveTasks(rootPath, next);
    if (active) { tasksRef.current = next; setTasks((current) => current.map(update)); }
    void fileStore.flush().catch((reason) => setError(message(reason)));
  };

  const updateCustomFields = (fields: TaskCustomField[]) => { setCustomFields(fields); saveTaskCustomFields(fields); setCustomFieldError(""); };
  const clearCustomFieldValues = (fieldId: string, optionId?: string): boolean => {
    try { removeTaskCustomFieldValues(fieldId, optionId); }
    catch (reason) { setCustomFieldError(`Could not remove task values: ${message(reason)}`); return false; }
    setTasks((current) => current.map((task) => {
    if (!Object.prototype.hasOwnProperty.call(task.customFields, fieldId) || (optionId !== undefined && task.customFields[fieldId] !== optionId)) return task;
      const customFields = { ...task.customFields };
      delete customFields[fieldId];
      return { ...task, customFields };
    }));
    return true;
  };
  const changeTaskCustomField = (rootPath: string, taskId: string, fieldId: string, value: string | null) => updateTaskAtRoot(rootPath, taskId, (task) => {
    const customFields = { ...task.customFields };
    if (value === null) delete customFields[fieldId];
    else customFields[fieldId] = value;
    return { ...task, customFields };
  });

  const deleteTasks = async (ids: Set<string>) => {
    if (taskDeletionBusyRef.current) return false;
    const deletionRoot = repository?.rootPath;
    const removed = tasksRef.current.filter((task) => ids.has(task.id));
    if (!removed.length) return true;
    taskDeletionBusyRef.current = true;
    try {
      for (const task of removed) {
        if (repositoryRef.current?.rootPath !== deletionRoot) throw new Error("Repository changed during deletion. Inspect the original tasks before retrying.");
        if (taskRunsRef.current[task.id] || taskStartingRef.current.has(task.id)) throw new Error("Task is running.");
        await invoke("delete_task_worktree", { taskId: task.id });
      }
      if (repositoryRef.current?.rootPath !== deletionRoot) throw new Error("Repository changed during deletion. Inspect the original tasks before retrying.");
    } catch (reason) {
      setError(`Could not delete the task worktree: ${message(reason)}. Tasks were kept; try deleting them again.`);
      taskDeletionBusyRef.current = false;
      return false;
    }
    void removeTaskImages(removed);
    if (repository) for (const task of removed) {
      const key = taskQueueKey(repository.rootPath, task.id);
      for (const item of chatQueuesRef.current[key] ?? []) removeQueued(key, item.id, true);
    }
    removed.forEach((task) => { void invoke("delete_task_assets", { taskId: task.id }).catch((reason) => setError(message(reason))); });
    setTaskTerminals((current) => current.filter((terminal) => !terminal.taskId || !ids.has(terminal.taskId)));
    const remaining = tasksRef.current.filter((task) => !ids.has(task.id));
    tasksRef.current = remaining; setTasks(remaining);
    if (repository) saveTasks(repository.rootPath, remaining);
    setTaskDrafts((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !ids.has(id))));
    setTaskAssetSelections((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !ids.has(id))));
    setNewTaskDrafts((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id === "root" || !ids.has(id))));
    setCollapsedTaskIds((current) => new Set([...current].filter((id) => !ids.has(id))));
    if (selectedTaskId && ids.has(selectedTaskId)) setSelectedTaskId(null);
    if (selectedTaskId && ids.has(selectedTaskId)) setBoardDrawerOpen(false);
    taskDeletionBusyRef.current = false;
    try { await fileStore.flush(); return true; } catch (reason) { setError(message(reason)); return false; }
  };

  const taskWithChatMode = (task: RepositoryTask, mode: AiChatMode): RepositoryTask => task.chatMode === mode ? task : {
    ...task,
    chatMode: mode,
    chatModel: chatDefaults[mode].model,
    chatEffort: chatDefaults[mode].effort,
  };

  const selectTaskChatMode = (taskId: string, mode: AiChatMode) => updateTask(taskId, (task) => taskWithChatMode(task, mode));

  const setTaskStatus = (id: string, status: TaskBoardStatus) => updateTask(id, (task) => status === "done"
    ? { ...task, completed: true, manualStatus: null }
    : { ...task, completed: false, manualStatus: status === "clear" ? null : status, planReady: false });

  const newRepositoryTask = (parentId: string | null, boardStatus: TaskBoardStatus, draft: Pick<RepositoryTask, "title" | "description">): RepositoryTask => {
    const title = draft.title.trim();
    const chatMode = "default";
    const now = Date.now();
    const task: RepositoryTask = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, title, description: draft?.description ?? "", customFields: {}, startDate: null, deadline: null, parentId, color: "clear", manualStatus: boardStatus === "inProgress" || boardStatus === "inReview" ? boardStatus : boardStatus === "clear" ? null : "inbox", completed: boardStatus === "done", attachments: [], assets: [], comments: [], chatMessages: [], agentThreadId: null, chatAgent: defaultAgent, planReady: false, unreadAgentResult: false, chatMode, chatModel: chatDefaults[chatMode].model, chatEffort: chatDefaults[chatMode].effort, ...taskLocationFields(taskLocationDefault), worktree: null, started: false };
    return task;
  };

  const createTask = (parentId: string | null, boardStatus: TaskBoardStatus, draft?: Pick<RepositoryTask, "title" | "description">) => {
    const key = parentId ?? `status:${boardStatus}`;
    const title = (draft?.title ?? newTaskDrafts[key] ?? "").trim();
    if (!title) return;
    const task = newRepositoryTask(parentId, boardStatus, { title, description: draft?.description ?? "" });
    setTasks((current) => parentId ? moveTask([...current, task], task.id, parentId, "inside") : [...current, task]);
    setSelectedTaskId(task.id);
    { setBoardFolderError(""); if (openNewTaskInDrawer) setBoardTab("detail"); setBoardDrawerOpen(openNewTaskInDrawer); }
    if (!draft) setNewTaskDrafts((current) => ({ ...current, [key]: "" }));
    setBoardAddingSubtaskId(null);
  };

  const selectTask = (task: RepositoryTask, markRead = true) => {
    setSelectedTaskId(task.id);
    if (markRead && task.unreadAgentResult) updateTask(task.id, (current) => ({ ...current, unreadAgentResult: false }));
  };
  const openBoardTask = (task: RepositoryTask, tab: BoardTab = repository ? storedBoardTab(repository.rootPath, task.id, sandboxSupported === true, browserSupported) : "detail") => {
    selectTask(task);
    setBoardTab(tab);
    setBoardFolderError("");
    setBoardDrawerOpen(true);
  };

  openNotificationRef.current = (target) => {
    if (repositoryRef.current?.rootPath !== target.repositoryRoot) return;
    const window = getCurrentWindow();
    void window.show().then(() => window.unminimize()).then(() => window.setFocus()).catch((reason) => setError(message(reason)));
    discardFileEdit(() => {
      setSettingsOpen(false);
      setZenMode(false);
      setTerminalOpen(false);
      if (target.taskId === null) {
        setWorkspaceMode("workspace");
        setBoardDrawerOpen(false);
        return;
      }
      setWorkspaceMode("tasks");
      const task = tasksRef.current.find((current) => current.id === target.taskId);
      if (!task) { setSelectedTaskId(null); setBoardDrawerOpen(false); return; }
      openBoardTask(task);
    });
  };

  const clearTaskChat = (task: RepositoryTask) => {
    void removeTaskImages(task);
    if (repository) {
      const key = taskQueueKey(repository.rootPath, task.id);
      for (const item of chatQueuesRef.current[key] ?? []) removeQueued(key, item.id, true);
    }
    updateTask(task.id, (current) => ({ ...current, attachments: [], chatMessages: [], planReady: false, agentThreadId: null }));
  };

  const sendTaskMessage = async (task: RepositoryTask, mode = task.chatMode, promptOverride?: string, queuedItem?: QueuedChatMessage, schedule?: PromptSchedule, automation?: LaneRun): Promise<boolean> => {
    if (taskGitAction) { setError("Wait for the task Git operation to finish before starting an agent."); return false; }
    const prompt = (promptOverride ?? taskDrafts[task.id] ?? "").trim();
    const selectedAssets = taskAssetAttachments(task, taskAssetSelections[task.id] ?? []);
    const attachments = queuedItem?.context.attachments ?? [...task.attachments, ...selectedAssets];
    if (!comparison || !review || (!prompt && !attachments.length) || taskRunsRef.current[task.id] || taskStartingRef.current.has(task.id)) return false;
    if (attachments.length > 12) { setError("Attach up to 12 items per message."); return false; }
    if (task.location === "worktree" && !task.worktree && !taskStartSelected(task.worktreeStart)) {
      selectTask(task);
      setError("Choose the Worktree start point before starting this task.");
      return false;
    }
    const root = repositoryRef.current?.rootPath;
    if (!root) return false;
    const prefix = loadBranchPrefix(root);
    const newBranchName = taskNewBranchName(task, prefix, !!automation || !!schedule);
    if (task.location === "worktree" && !task.worktree && task.worktreeStart?.kind !== "existing"
      && (!newBranchName.trim() || newBranchName === prefix || newBranchName.endsWith("/"))) {
      selectTask(task);
      setError("Enter a complete Branch name before starting this task.");
      return false;
    }
    taskStartingRef.current.add(task.id);
    setTaskStartingIds((current) => new Set(current).add(task.id));
    const configuredTask = automation ? task : taskWithChatMode(task, mode);
    const userMessage: ChatMessage = { id: queuedItem?.id ?? crypto.randomUUID(), role: "user", runStatus: "running", body: prompt, createdAt: new Date().toISOString(), selection: queuedItem ? queuedItem.selection : selection, snapshotId: comparison.snapshotId, suggestions: [], contexts: [], attachments };
    setError("");
    const earlyEvents: AgentTurnEvent[] = [];
    let runReady = false;
    let acceptedRequestId: string | null = null;
    let createdWorktree = false;
    const runRepositoryRoot = repositoryRef.current?.rootPath;
    const onTaskEvent = (event: AgentTurnEvent) => {
      if (!runReady) earlyEvents.push(event);
      else if (repositoryRef.current?.rootPath === runRepositoryRoot && taskRunsRef.current[task.id]?.accepted.requestId === acceptedRequestId) handleTurnEvent(event, task.id);
      else if (automation && event.type === "chat" && ["completed", "failed", "cancelled"].includes(event.payload.kind)) {
        void laneAutomation.finish(automation, event.payload.kind as "completed" | "failed" | "cancelled", event.payload.message ?? null);
      }
    };
    try {
      if (!schedule) await fileStore.flush();
      if (repositoryRef.current?.rootPath !== runRepositoryRoot || !tasksRef.current.some((current) => current.id === task.id)) throw new Error("Task or repository changed before the prompt could start.");
      let worktree = task.worktree;
      if (task.location === "worktree" && !worktree) {
        const prepared = await invoke<NonNullable<RepositoryTask["worktree"]> & { created: boolean }>("prepare_task_worktree", { taskId: task.id, startPoint: task.worktreeStart, newBranchName: task.worktreeStart?.kind === "existing" ? null : newBranchName, autoSync: autoFetchPullOnBranchSwitch });
        createdWorktree = prepared.created;
        worktree = { branch: prepared.branch, baseOid: prepared.baseOid, baseBranch: prepared.baseBranch };
        if (prepared.created && autoFetchPullOnBranchSwitch && task.worktreeStart?.kind !== "workspace") {
          void invoke<BranchRefs>("list_branch_refs").then(setBranchRefs).catch((reason) => setError(message(reason)));
        }
      }
      if (repositoryRef.current?.rootPath !== runRepositoryRoot || !tasksRef.current.some((current) => current.id === task.id && (!schedule || !current.completed))) {
        throw new Error("Task or repository changed before the prompt could start.");
      }
      const accepted = await startChatTurn({
        threadId: task.agentThreadId,
        chatAgent: task.chatAgent,
        model: queuedItem?.model ?? configuredTask.chatModel,
        effort: queuedItem?.effort ?? configuredTask.chatEffort,
        mode,
        prompt,
        context: { mode: "auto", attachments },
        allowLongPrompt: true,
        taskId: task.id,
        taskLocation: task.location,
        taskTitle: task.title,
        taskDescription: task.description,
      }, onTaskEvent);
      if (repositoryRef.current?.rootPath !== runRepositoryRoot) {
        await invoke("ai_chat_cancel", { requestId: accepted.requestId });
        throw new Error("Repository changed before the agent started.");
      }
      createdWorktree = false;
      acceptedRequestId = accepted.requestId;
      updateTask(task.id, (current) => ({
        ...(automation ? current : taskWithChatMode(current, mode)),
        ...(queuedItem && !automation ? { chatMode: mode, chatModel: queuedItem.model, chatEffort: queuedItem.effort } : {}),
        location: task.location,
        worktreeStart: task.worktreeStart,
        ...(worktree && task.worktreeStart?.kind !== "existing" ? { newBranchName: worktree.branch } : {}),
        agentThreadId: accepted.threadId,
        started: true,
        worktree,
        unreadAgentResult: false,
        attachments: queuedItem ? current.attachments : [],
        chatMessages: [...current.chatMessages.map((message) => message.plan ? { ...message, canImplementPlan: false } : message), userMessage].slice(-100),
        planReady: automation ? current.planReady : false,
      }));
      if (!queuedItem) { setTaskDrafts((current) => ({ ...current, [task.id]: "" })); setTaskAssetSelections((current) => ({ ...current, [task.id]: [] })); }
      setTaskChangesRevision((value) => value + 1);
      const run: TaskRun = { messageId: userMessage.id, coordinationPath: queuedItem?.coordinationPath ?? [task.id], schedule, automation, accepted, mode, status: mode === "plan" ? "Planning…" : "Implementing…", timeline: [], plan: null, input: null, approval: null };
      taskRunsRef.current = { ...taskRunsRef.current, [task.id]: run };
      setTaskRuns(taskRunsRef.current);
      runReady = true;
      earlyEvents.forEach(onTaskEvent);
      return true;
    } catch (reason) {
      let errorMessage = message(reason);
      if (createdWorktree && repositoryRef.current?.rootPath === runRepositoryRoot) {
        try { await invoke("cleanup_unstarted_task_worktree", { taskId: task.id }); }
        catch (cleanupError) { errorMessage += ` The prepared worktree was kept: ${message(cleanupError)}`; }
      }
      setError(errorMessage);
      if (schedule) await finishSchedule(schedule, "failed", errorMessage).catch((reason) => setError(message(reason)));
      return false;
    }
    finally { taskStartingRef.current.delete(task.id); setTaskStartingIds((current) => { const next = new Set(current); next.delete(task.id); return next; }); }
  };

  const sendComposerMessage = async (draft: string): Promise<boolean> => {
    const task = taskMode ? tasksRef.current.find((item) => item.id === selectedTaskId) : null;
    const key = activeQueueKey;
    if (!comparison || !review || !key || (taskMode && !task)) return false;
    const attachments = task ? [...task.attachments, ...taskAssetAttachments(task, taskAssetSelections[task.id] ?? [])] : chatRequestContext.attachments;
    const prompt = draft.trim();
    if (!prompt && !attachments.some((attachment) => isChatUpload(attachment) || attachment.kind === "taskAsset")) return false;
    if (!task && prompt.length > 20_000) { setError("Messages can be up to 20,000 characters."); return false; }
    if (task && attachments.length > 12) { setError("Attach up to 12 items per message."); return false; }
    if (task?.location === "worktree" && !task.worktree && !taskStartSelected(task.worktreeStart)) { setError("Choose the Worktree start point before starting this task."); return false; }
    const running = task ? !!taskRunsRef.current[task.id] || taskStartingRef.current.has(task.id) : aiChatRunningRef.current;
    if (!running && !chatQueuesRef.current[key]?.length) return task ? sendTaskMessage(task, task.chatMode, draft) : sendAiChat(draft);
    const item: QueuedChatMessage = { id: crypto.randomUUID(), body: prompt, context: { mode: "auto", attachments }, selection, mode: task?.chatMode ?? aiChatMode, model: task?.chatModel ?? aiChatModel, effort: task?.chatEffort ?? aiChatEffort };
    const imagePaths = attachments.flatMap((attachment) => isChatUpload(attachment) ? [attachment.path] : []);
    if (!task && imagePaths.length) {
      try { await invoke("retain_task_images", { paths: imagePaths }); }
      catch (reason) { setError(message(reason)); return false; }
    }
    changeQueue(key, (items) => [...items, item]);
    if (running) setQueuePaused(key, false);
    if (task) {
      updateTask(task.id, (current) => ({ ...current, attachments: [] }));
      setTaskAssetSelections((current) => ({ ...current, [task.id]: [] }));
    } else setAiChatUploads([]);
    return true;
  };

  queueDispatchRef.current = (key) => {
    if (pausedQueueKeysRef.current.has(key) || queueBusyRef.current.has(key)) return;
    const item = chatQueuesRef.current[key]?.[0];
    if (!item || !repositoryRef.current) return;
    const task = tasksRef.current.find((entry) => taskQueueKey(repositoryRef.current!.rootPath, entry.id) === key);
    if (task ? !!taskRunsRef.current[task.id] || taskStartingRef.current.has(task.id) : aiChatRunningRef.current || !reviewRef.current || reviewQueueKey(reviewRef.current) !== key) return;
    queueBusyRef.current.add(key);
    void (async () => {
      const accepted = task ? await sendTaskMessage(task, item.mode, item.body, item)
        : await sendAiChat(item.body, item.context, item.mode, { model: item.model, effort: item.effort }, item);
      if (accepted) {
        removeQueued(key, item.id);
        if (!task) for (const attachment of item.context.attachments) if (isChatUpload(attachment)) void invoke("release_chat_image_reference", { path: attachment.path }).catch((reason) => setError(message(reason)));
      } else {
        setQueuePaused(key, true);
      }
    })().catch((reason) => { setError(message(reason)); setQueuePaused(key, true); }).finally(() => {
      queueBusyRef.current.delete(key);
      if (chatQueuesRef.current[key]?.length && !pausedQueueKeysRef.current.has(key)) queueMicrotask(() => queueDispatchRef.current(key));
    });
  };

  const automationDirectory = (task: RepositoryTask) => {
    const branch = task.worktree?.branch ?? (task.worktreeStart?.kind === "existing" ? task.worktreeStart.remote ? task.worktreeStart.branch.replace(/^origin\//, "") : task.worktreeStart.branch : null);
    return task.location === "workspace" || branch === repository?.currentBranch ? "workspace" : branch ? `branch:${branch}` : `task:${task.id}`;
  };
  const laneAutomation = useLaneAutomation({
    root: repository?.rootPath,
    ready: !!repository && taskStorageRoot === repository.rootPath,
    tasks,
    activity: JSON.stringify([Object.keys(taskRuns), [...taskStartingIds], chatQueues, workspaceOperationBusy, !!comparison, !!review]),
    busy: (task) => {
      if (!comparison || !review || taskDeletionBusyRef.current || taskGitAction || taskRunsRef.current[task.id] || taskStartingRef.current.has(task.id)) return true;
      if (repository && chatQueuesRef.current[taskQueueKey(repository.rootPath, task.id)]?.length) return true;
      return automationDirectory(task) === "workspace" && workspaceOperationBusy;
    },
    send: (task, item, run) => sendTaskMessage(task, "default", item.body, item, undefined, run),
  });

  const promptScheduler = usePromptScheduler({
    rootPath: repository?.rootPath,
    ready: !!repository && taskStorageRoot === repository.rootPath,
    tasks,
    activity: JSON.stringify([Object.keys(taskRuns), [...taskStartingIds], Object.entries(chatQueues).map(([key, items]) => [key, items.length]), workspaceOperationBusy, !!comparison, !!review, taskDeletionBusyRef.current]),
    busy: (task) => !comparison || !review || taskDeletionBusyRef.current || !!taskGitAction || !!taskRunsRef.current[task.id] || taskStartingRef.current.has(task.id) || (automationDirectory(task) === "workspace" && workspaceOperationBusy),
    queued: (task) => !!repository && !!chatQueuesRef.current[taskQueueKey(repository.rootPath, task.id)]?.length,
    send: (task, item, schedule) => sendTaskMessage(task, item.mode, item.body, item, schedule),
  });

  const steerQueued = async (key: string, id: string) => {
    const item = chatQueuesRef.current[key]?.find((entry) => entry.id === id);
    const task = taskMode ? tasksRef.current.find((entry) => entry.id === selectedTaskId) : null;
    const accepted = task ? taskRunsRef.current[task.id]?.accepted : aiChatTurnRef.current;
    if (!item || !accepted || (!task && reviewRunQueueKeyRef.current !== key) || queueBusyRef.current.has(key)) return;
    queueBusyRef.current.add(key);
    try {
      await invoke("ai_chat_steer", { input: { requestId: accepted.requestId, prompt: item.body, chatContext: item.context, taskId: task?.id ?? null, allowLongPrompt: !!task, comments: review?.comments ?? [] } });
      const userMessage: ChatMessage = { id: item.id, role: "user", body: item.body, createdAt: new Date().toISOString(), selection: item.selection, snapshotId: comparison?.snapshotId ?? null, suggestions: [], contexts: [], attachments: item.context.attachments };
      let saved = true;
      if (task) updateTask(task.id, (current) => ({ ...current, chatMessages: [...current.chatMessages, userMessage].slice(-100) }));
      else {
        const visibleReview = reviewRef.current && reviewQueueKey(reviewRef.current) === key ? reviewRef.current : null;
        const source = visibleReview ?? reviewRunSessionRef.current;
        if (!source) throw new Error("The review conversation is unavailable.");
        const next = { ...source, chatMessages: [...source.chatMessages, userMessage].slice(-100) };
        reviewRunSessionRef.current = next;
        const saving = visibleReview ? persistReview(next) : invoke("save_review", { session: next });
        reviewSteerSaveRef.current = saving;
        try { saved = (await saving) !== false; }
        finally { if (reviewSteerSaveRef.current === saving) reviewSteerSaveRef.current = null; }
      }
      removeQueued(key, id);
      if (!task && saved) for (const attachment of item.context.attachments) if (isChatUpload(attachment)) void invoke("release_chat_image_reference", { path: attachment.path }).catch((reason) => setError(message(reason)));
    } catch (reason) { setError(message(reason)); }
    finally {
      queueBusyRef.current.delete(key);
      if (chatQueuesRef.current[key]?.length && !pausedQueueKeysRef.current.has(key)) queueMicrotask(() => queueDispatchRef.current(key));
    }
  };

  const answerTaskQuestion = async (taskId: string, answers: Record<string, string>) => {
    const input = taskRunsRef.current[taskId]?.input;
    if (!input || input.questions.some((question) => !(answers[question.id] ?? "").trim())) return;
    try {
      await invoke("agent_user_input_respond", { requestId: input.requestId, answers: Object.fromEntries(input.questions.map((question) => [question.id, [answers[question.id].trim()]])) });
      const run = taskRunsRef.current[taskId];
      if (run) {
        const next = { ...run, input: null, status: "Continuing…" };
        taskRunsRef.current = { ...taskRunsRef.current, [taskId]: next };
        setTaskRuns(taskRunsRef.current);
      }
    } catch (reason) { setError(message(reason)); }
  };

  const cancelTaskPlan = async (taskId: string) => {
    const run = taskRunsRef.current[taskId];
    if (!run) return;
    try { await invoke("ai_chat_cancel", { requestId: run.accepted.requestId }); } catch (reason) { setError(message(reason)); }
  };

  const implementTask = async (task: RepositoryTask) => {
    if (!task.planReady || !task.agentThreadId) return;
    void sendTaskMessage(task, "default", implementPlanPrompt);
  };

  const answerReviewQuestion = async (answers: Record<string, string>) => {
    if (!agentUserInput || agentUserInput.questions.some((question) => !(answers[question.id] ?? "").trim())) return;
    try {
      await invoke("agent_user_input_respond", { requestId: agentUserInput.requestId, answers: Object.fromEntries(agentUserInput.questions.map((question) => [question.id, [answers[question.id].trim()]])) });
      setAgentUserInput(null);
      setAiChatStatus("Continuing…");
    } catch (reason) { setError(message(reason)); }
  };

  const cancelAgentQuestion = async () => {
    if (!agentUserInput) return;
    try {
      await invoke("agent_turn_cancel", { threadId: agentUserInput.threadId, turnId: agentUserInput.turnId });
      setAgentUserInput(null);
      setAiChatStatus("");
    } catch (reason) { setError(message(reason)); }
  };

  const respondToApproval = (approval: AgentApproval | null, approved: boolean) => {
    if (!approval) return;
    if (approval.source === "mcp") setMcpRespondingRequestId(approval.requestId);
    void invoke<boolean>("agent_approve", { requestId: approval.requestId, approved }).then((accepted) => {
      if (!accepted) {
        setMcpApprovals((current) => current.filter((item) => item.requestId !== approval.requestId));
        setMcpRespondingRequestId((current) => current === approval.requestId ? null : current);
      }
    }).catch((reason) => {
      setError(message(reason));
      setMcpRespondingRequestId((current) => current === approval.requestId ? null : current);
    });
  };

  const sendPlaybookPrompt = async (playbook: Playbook, values: Record<string, string>, taskId: string | null): Promise<boolean> => {
    const prompt = renderPlaybookPrompt(playbook, values).trim();
    if (!prompt || prompt.length > 20_000) {
      setError("This playbook prompt must be between 1 and 20,000 characters.");
      return false;
    }
    if (taskId && !tasksRef.current.some((task) => task.id === taskId)) return false;
    return sendComposerMessage(prompt);
  };

  const runPlaybook = (playbook: Playbook, task: RepositoryTask | null) => {
    if (!comparison || !review || variablePrompt) return;
    if (task?.location === "worktree" && !task.worktree && !taskStartSelected(task.worktreeStart)) {
      setError("Choose the Worktree start point before starting this task.");
      return;
    }
    if (!playbook.variables.length) {
      void sendPlaybookPrompt(playbook, {}, task?.id ?? null);
      return;
    }
    setVariablePrompt({ playbook, taskId: task?.id ?? null });
  };

  const confirmVariablePrompt = async (answers: Record<string, string>) => {
    if (!variablePrompt || variablePrompt.playbook.variables.some((variable) => !answers[variable.name]?.trim())) return;
    if (await sendPlaybookPrompt(variablePrompt.playbook, answers, variablePrompt.taskId)) setVariablePrompt(null);
  };

  const cancelAiChat = async () => {
    if (!aiChatRunning || aiChatCancelRequested.current) return;
    aiChatCancelRequested.current = true;
    setAiChatStatus("Stopping…");
    try {
      await invoke("ai_chat_cancel", { requestId: aiChatTurnRef.current?.requestId ?? null });
    } catch (reason) {
      setError(message(reason));
    }
  };

  const clearAiChat = () => {
    if (!review || (!review.chatMessages.length && !chatQueuesRef.current[reviewQueueKey(review)]?.length)) return;
    setConfirmation({
      title: "Clear this Review Agent conversation?",
      description: "The conversation for this comparison will be removed.",
      actionLabel: "Clear",
      action: () => {
        const current = reviewRef.current;
        if (current) void persistReview({ ...current, chatMessages: [], agentThreadId: null });
        const key = reviewQueueKey(review);
        for (const item of chatQueuesRef.current[key] ?? []) removeQueued(key, item.id, true);
      },
    });
  };

  const selectChatAgent = (agent: ChatAgent | null) => {
    const task = taskMode ? selectedTask : null;
    const current = task ?? reviewRef.current;
    if (!current || (taskMode && !task) || JSON.stringify(current.chatAgent ?? null) === JSON.stringify(agent)) return;
    if (task ? !!taskRunsRef.current[task.id] || taskStartingRef.current.has(task.id) : aiChatRunningRef.current) return;
    const key = task && repository ? taskQueueKey(repository.rootPath, task.id) : reviewQueueKey(reviewRef.current!);
    if (queueBusyRef.current.has(key)) return;
    for (const item of chatQueuesRef.current[key] ?? []) removeQueued(key, item.id, true);
    setVariablePrompt(null);
    setError("");
    if (task) {
      void removeTaskImages(task);
      updateTask(task.id, (current) => ({ ...switchChatAgent(current, agent), attachments: [], planReady: false, unreadAgentResult: false }));
      setTaskDrafts((current) => ({ ...current, [task.id]: "" }));
      setTaskAssetSelections((current) => ({ ...current, [task.id]: [] }));
    } else {
      void persistReview(switchChatAgent(reviewRef.current!, agent));
      setAiChatDraft("");
      setAiChatPlan(null);
      setAiChatServerModel(null);
      resetAiChatTimeline();
      for (const image of aiChatUploads) if (isChatUpload(image)) void invoke("remove_chat_image", { path: image.path }).catch(() => {});
      setAiChatUploads([]);
    }
  };

  const selectAiChatMode = (mode: AiChatMode) => {
    setAiChatMode(mode);
    setAiChatModel(chatDefaults[mode].model);
    setAiChatEffort(chatDefaults[mode].effort);
  };

  const updateChatDefault = (mode: AiChatMode, value: Partial<ChatDefaults[AiChatMode]>) => {
    setChatDefaults((current) => ({ ...current, [mode]: { ...current[mode], ...value } }));
    if (mode !== aiChatMode) return;
    if (value.model) setAiChatModel(value.model);
    if (value.effort) setAiChatEffort(value.effort);
  };

  const refreshMcpAuthStatuses = async () => {
    const revision = ++mcpStatusRevision.current;
    try {
      const statuses = await invoke<Record<string, string>>("mcp_auth_statuses");
      if (revision === mcpStatusRevision.current) setMcpAuthStatuses(statuses);
    } catch (reason) {
      if (revision === mcpStatusRevision.current) setMcpServersError(message(reason));
    }
  };

  const openSettings = async (page: SettingsPage = "general") => {
    if (mcpServersSaving) return;
    setSettingsPage(page);
    setSettingsOpen(true);
    setExpandedMcpServer(null);
    setBoardDrawerOpen(false);
    setAiSettingsError("");
    setMcpServersError("");
    setMcpServersSaved(false);
    setMcpServersDirty(false);
    setMcpAuthStatuses({});
    setMcpServersLoaded(false);
    setWorktreeCleanupStatus(null);
    setSettingsRunCommandDraft(runCommand);
    setUserRulesDraft(userRules);
    void invoke<McpServerSettings[]>("load_mcp_servers")
      .then((servers) => {
        setMcpServers(servers.map(mcpDraft));
        setMcpServersLoaded(true);
        if (servers.length) void refreshMcpAuthStatuses();
      })
      .catch((reason) => setMcpServersError(message(reason)));
    try {
      const settings = await invoke<AiSettings>("load_ai_settings");
      setAiSettings(settings);
      setProviderSettingsDraft({ activeProvider: settings.activeProvider, providers: settings.providers, repositoryProviders: settings.repositoryProviders });
    } catch (reason) {
      setAiSettingsError(message(reason));
    }
  };

  const openPomodoroSettings = () => {
    void openSettings("pomodoro");
  };

  const saveMcpServers = async () => {
    if (mcpServersSaving || mcpLoginRef.current) return;
    setMcpServersSaving(true);
    setMcpServersError("");
    setMcpServersSaved(false);
    try {
      const servers = mcpServers.map(({ argsText, envText, oauthScopesText, ...server }) => {
        const env: Record<string, string> = {};
        for (const line of envText.split("\n").map((item) => item.replace(/\r$/, "")).filter((item) => item.trim())) {
          const equals = line.indexOf("=");
          if (equals < 1) throw new Error(`Invalid environment variable for ${server.name || "MCP server"}. Use KEY=value.`);
          env[line.slice(0, equals).trim()] = line.slice(equals + 1);
        }
        return { ...server, args: argsText.split("\n").filter((item) => item.length > 0), env, oauthScopes: oauthScopesText.split(/[\s,]+/).filter(Boolean) };
      });
      const saved = await invoke<McpServerSettings[]>("save_mcp_servers", { servers });
      setMcpServers(saved.map(mcpDraft));
      setMcpServersSaved(true);
      setMcpServersDirty(false);
      setMcpAuthStatuses({});
      if (saved.length) void refreshMcpAuthStatuses();
    } catch (reason) {
      setMcpServersError(message(reason));
    } finally {
      setMcpServersSaving(false);
    }
  };

  const updateMcpServer = (index: number, change: Partial<McpServerDraft>) => {
    if (!mcpServersLoaded || mcpServersSaving || mcpLoginRef.current) return;
    setMcpServers((current) => current.map((server, itemIndex) => itemIndex === index ? { ...server, ...change } : server));
    setMcpServersSaved(false);
    setMcpServersDirty(true);
  };

  const loginMcp = async (name: string) => {
    if (mcpLoginRef.current || mcpServersSaving) return;
    mcpLoginRef.current = name;
    mcpStatusRevision.current += 1;
    setMcpLoginPending(name);
    setMcpLoginStarted(null);
    setMcpServersError("");
    try {
      await invoke("agent_login_mcp", { name });
      if (mcpLoginRef.current === name) setMcpLoginStarted(name);
    } catch (reason) {
      mcpLoginRef.current = null;
      setMcpLoginStarted(null);
      setMcpLoginPending(null);
      setMcpServersError(message(reason));
    }
  };

  const cancelMcpLogin = async () => {
    setMcpLoginCancelling(true);
    try {
      await invoke("agent_cancel_mcp_login");
      mcpLoginRef.current = null;
      setMcpLoginStarted(null);
      setMcpLoginPending(null);
      setMcpServersError("");
    } catch (reason) {
      setMcpServersError(message(reason));
    } finally {
      setMcpLoginCancelling(false);
    }
  };

  const cleanUpOrphanedWorktrees = async () => {
    if (!repository || worktreeCleanupBusy || taskStorageRoot !== repository.rootPath) return;
    const rootPath = repository.rootPath;
    const currentTaskIds = () => new Set([
      ...tasksRef.current.map((task) => task.id),
      ...loadTasks(rootPath, chatDefaults).map((task) => task.id),
    ]);
    setWorktreeCleanupBusy(true);
    setWorktreeCleanupStatus(null);
    try {
      const ids = await invoke<string[]>("list_orphaned_task_worktrees", { taskIds: [...currentTaskIds()] });
      if (!ids.length) {
        setWorktreeCleanupStatus({ message: "No orphaned Lotse worktrees found.", error: false });
        return;
      }
      setConfirmation({
        title: `Remove ${ids.length} orphaned worktree${ids.length === 1 ? "" : "s"}?`,
        description: "These Lotse worktrees no longer belong to a task. Their uncommitted changes will be deleted. Git branches will remain.",
        actionLabel: "Remove worktrees",
        action: () => { void (async () => {
          setWorktreeCleanupBusy(true);
          let removed = 0;
          const removedIds: string[] = [];
          try {
            for (const id of ids) {
              if (repositoryRef.current?.rootPath !== rootPath) throw new Error("The open repository changed. Run cleanup again.");
              if (currentTaskIds().has(id)) continue;
              await invoke("delete_task_worktree", { taskId: id });
              removed++;
              removedIds.push(id);
            }
            setWorktreeCleanupStatus({ message: `Removed ${removed} orphaned worktree${removed === 1 ? "" : "s"}.`, error: false });
          } catch (reason) {
            setWorktreeCleanupStatus({ message: `Removed ${removed} worktree${removed === 1 ? "" : "s"}. Cleanup stopped: ${message(reason)}`, error: true });
          } finally {
            setTaskTerminals((current) => current.filter((terminal) => !terminal.taskId || !removedIds.includes(terminal.taskId)));
            setWorktreeCleanupBusy(false);
          }
        })(); },
      });
    } catch (reason) {
      setWorktreeCleanupStatus({ message: `Could not check worktrees: ${message(reason)}`, error: true });
    } finally {
      setWorktreeCleanupBusy(false);
    }
  };

  const saveUserRules = () => {
    const rules = userRulesDraft.trim();
    fileStore.setItem(userRulesStorageKey, rules);
    setUserRules(rules);
    setUserRulesDraft(rules);
  };

  const clearUserRules = () => {
    fileStore.removeItem(userRulesStorageKey);
    setUserRules("");
    setUserRulesDraft("");
  };

  const saveProviderSettings = async (draft: ProviderSettings = providerSettingsDraft) => {
    setProviderSettingsSaving(true);
    setAiSettingsError("");
    try {
      const settings = await invoke<AiSettings>("save_ai_provider_settings", draft);
      setAiSettings(settings);
      setProviderSettingsDraft({ activeProvider: settings.activeProvider, providers: settings.providers, repositoryProviders: settings.repositoryProviders });
      if (settings.providers.length) fileStore.setItem(authOnboardingStorageKey, "complete");
      setModelsRevision((value) => value + 1);
      return settings;
    } catch (reason) {
      setAiSettingsError(message(reason));
    } finally {
      setProviderSettingsSaving(false);
    }
  };

  const selectProvider = async (activeProvider: string) => {
    if (activeProvider === providerSettingsDraft.activeProvider) return;
    const draft = { ...providerSettingsDraft, activeProvider };
    setProviderSettingsDraft(draft);
    if (!await saveProviderSettings(draft)) {
      setProviderSettingsDraft((current) => ({ ...current, activeProvider: aiSettings?.activeProvider ?? "" }));
    }
  };

  const selectRepositoryProvider = async (provider: string) => {
    const root = repository?.rootPath;
    if (!root) return;
    if (provider === (providerSettingsDraft.repositoryProviders[root] ?? "*")) return;
    const repositoryProviders = { ...providerSettingsDraft.repositoryProviders };
    if (provider === "*") delete repositoryProviders[root];
    else repositoryProviders[root] = provider;
    const draft = { ...providerSettingsDraft, repositoryProviders };
    setProviderSettingsDraft(draft);
    if (!await saveProviderSettings(draft)) {
      setProviderSettingsDraft((current) => ({ ...current, repositoryProviders: aiSettings?.repositoryProviders ?? {} }));
    }
  };

  const effectiveProvider = aiSettings?.repositoryProviders[repository?.rootPath ?? ""] ?? aiSettings?.activeProvider ?? "";
  const providerAvailable = !!aiSettings?.providers.some((provider) => provider.id === effectiveProvider);
  const updateOnboardingProvider = (value: Partial<ProviderSettingsEntry>) => {
    setOnboardingProviderDraft((current) => ({ ...current, ...value }));
    setProviderTestResult(null);
  };
  const testOnboardingProvider = async () => {
    setProviderTestLoading(true);
    setProviderTestResult(null);
    try {
      const result = await invoke<string>("test_ai_provider", { provider: onboardingProviderDraft });
      setProviderTestResult({ ok: true, message: result });
    } catch (reason) {
      setProviderTestResult({ ok: false, message: message(reason) });
    } finally {
      setProviderTestLoading(false);
    }
  };
  const saveOnboardingProvider = async () => {
    if (!aiSettings) return;
    setProviderTestResult(null);
    const settings = await saveProviderSettings({
      activeProvider: repository && aiSettings.activeProvider ? aiSettings.activeProvider : onboardingProviderDraft.id,
      providers: [...aiSettings.providers.filter((provider) => provider.id !== onboardingProviderDraft.id), onboardingProviderDraft],
      repositoryProviders: repository ? { ...aiSettings.repositoryProviders, [repository.rootPath]: onboardingProviderDraft.id } : aiSettings.repositoryProviders,
    });
    if (settings) setOnboardingProviderDraft((current) => ({ ...current, secret: undefined }));
  };
  const completeAuthOnboarding = () => {
    if (!providerAvailable) return;
    try {
      fileStore.setItem(authOnboardingStorageKey, "complete");
      setAuthOnboardingOpen(false);
    } catch (reason) {
      setAiSettingsError(message(reason));
    }
  };

  const resizeSidebar = (side: keyof SidebarWidths, width: number) => {
    const other = side === "left" ? sidebarWidths.right : sidebarWidths.left;
    const limit = Math.max(200, window.innerWidth - other - 360);
    const minimum = side === "left" ? 200 : 260;
    const maximum = side === "left" ? Math.min(420, limit) : window.innerWidth - sidebarWidths.left;
    setSidebarWidths((current) => ({
      ...current,
      [side]: Math.min(Math.max(width, minimum), Math.max(minimum, maximum)),
    }));
  };

  const startResizing = (
    side: keyof SidebarWidths,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = side === "right" ? Math.min(sidebarWidths.right, window.innerWidth - sidebarWidths.left) : sidebarWidths.left;
    const direction = side === "left" ? 1 : -1;
    const onMove = (move: PointerEvent) =>
      resizeSidebar(side, startWidth + (move.clientX - startX) * direction);
    const onUp = () => {
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  const resizeSimulator = (width: number) => setSimulatorSpace((current) => ({
    ...current,
    width: Math.min(Math.max(200, width), Math.max(200, Math.min(960, window.innerWidth - 320))),
  }));
  const startSimulatorResizing = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = simulatorSpace.width;
    const pointerId = event.pointerId;
    const onMove = (move: PointerEvent) => {
      if (move.pointerId === pointerId) resizeSimulator(startWidth - (move.clientX - startX));
    };
    const stop = () => {
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("blur", stop);
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
  };

  const taskColumns = taskColumnPixels(taskGridWidth, taskColumnRatios);
  const adjustTaskDivider = (divider: TaskDivider, direction: number) => {
    const width = taskGridRef.current?.clientWidth || taskGridWidth;
    setTaskColumnRatios((current) => {
      const pixels = taskColumnPixels(width, current)[divider];
      return resizeTaskColumn(width, current, divider, pixels + (divider === "tasks" ? direction : -direction));
    });
  };
  const startTaskResizing = (divider: TaskDivider, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const width = taskGridRef.current?.clientWidth || taskGridWidth;
    const startWidth = taskColumnPixels(width, taskColumnRatios)[divider];
    const startX = event.clientX;
    const pointerId = event.pointerId;
    const onMove = (move: PointerEvent) => {
      if (move.pointerId !== pointerId) return;
      const delta = move.clientX - startX;
      setTaskColumnRatios(resizeTaskColumn(width, taskColumnRatios, divider, startWidth + (divider === "tasks" ? delta : -delta)));
    };
    const stop = () => {
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("blur", stop);
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
  };

  const startDragging = (event: MouseEvent<HTMLElement>) => {
    if (
      event.button !== 0 ||
      (event.target as HTMLElement).closest("button, input, select, textarea")
    ) {
      return;
    }
    void getCurrentWindow().startDragging().catch((reason) => setError(message(reason)));
  };

  const agentChatExpanded = !zenMode && workspaceMode === "workspace" && !!repository && !terminalOpen && comparison?.mode === "workingCopy" && !comparison.files.length;
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const taskVisualSessionOpen = !!selectedTask && taskMode && !settingsOpen && !zenMode && (!boardMode || boardDrawerOpen);
  const activeApprovalReviewer = approvalReviewerOverrides[taskMode ? selectedTask?.id ?? "" : "review"] ?? approvalReviewerDefault;
  const selectedTaskHasPendingChanges = !!selectedTask && taskPendingChanges?.taskId === selectedTask.id && taskPendingChanges.location === selectedTask.location && taskPendingChanges.pending;
  const activeTaskTerminalKey = terminalMounted && terminalOpen && taskMode && !settingsOpen && !zenMode && repository && selectedTask
    && (selectedTask.location === "workspace" || selectedTask.worktree)
    ? `${repository.rootPath}:${selectedTask.location === "workspace" ? "workspace" : selectedTask.id}` : null;
  useEffect(() => {
    if (!activeTaskTerminalKey || !repository || !selectedTask) return;
    if (taskTerminals.some((terminal) => terminal.key === activeTaskTerminalKey)) return;
    if (taskTerminals.length >= 5) {
      setError("Five task terminals are already open. Return to a task with an open terminal and close its session before opening another.");
      setTerminalOpen(false);
      return;
    }
    setTaskTerminals((current) => [...current, { key: activeTaskTerminalKey, rootPath: repository.rootPath, taskId: selectedTask.location === "worktree" ? selectedTask.id : undefined }]);
  }, [activeTaskTerminalKey, repository, selectedTask, taskTerminals]);
  const boardGroups = useMemo(() => boardStatusColumns.map(({ id, label }) => ({ key: `board-status:${id}`, label, status: id, tasks: tasks.filter((task) => taskBoardStatus(task) === id) })), [tasks]);
  const statusDeletionIds = useMemo(() => new Map(boardGroups.map((group) => [group.status, taskSubtreeIds(tasks, group.tasks.map((task) => task.id))])), [tasks, boardGroups]);
  const renderStatusOptions = (status: TaskBoardStatus, label: string) => {
    const ids = statusDeletionIds.get(status)!;
    const deletionLocked = !ids.size || [...ids].some((id) => protectedTaskIds.has(id));
    return <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Options for ${label} column`} className="flex h-7 items-center gap-1 px-1 text-[#7C9B88]">{laneAutomation.lanes[status].enabled && <span className="size-1.5 rounded-full bg-[#A3FF12]" aria-label="Automation enabled" />}<Ellipsis size={15} /></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44 whitespace-nowrap">
        <DropdownMenuItem onClick={() => { setAutomationStatus(status); void invoke<BranchRefs>("list_branch_refs").then(setBranchRefs).catch((reason) => setError(message(reason))); }}><Play size={14} /> Automation…</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" disabled={deletionLocked} onClick={() => confirmDeleteTasks(ids)}><Trash2 size={14} /> Delete all cards</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>;
  };
  const taskGroups = useMemo(() => boardGroups.map((group) => ({ ...group, tasks: filterVisibleTasks(group.tasks, collapsedTaskIds) })), [boardGroups, collapsedTaskIds]);
  const visibleTasks = useMemo(() => taskGroups.flatMap((group) => collapsedTaskIds.has(group.key) ? [] : group.tasks), [taskGroups, collapsedTaskIds]);
  const taskLayout = useMemo(() => taskListMetadata(tasks, taskGroups, collapsedTaskIds), [tasks, taskGroups, collapsedTaskIds]);
  const visibleTaskIndexes = useMemo(() => new Map(visibleTasks.map((task, index) => [task.id, index])), [visibleTasks]);
  const selectedTaskRun = selectedTask ? taskRuns[selectedTask.id] : null;
  const visibleAgentApproval = taskMode ? selectedTaskRun?.approval ?? null : agentApproval;
  const inlineMcpApproval = mcpApprovals.find((approval) => taskMode ? approval.taskId === selectedTask?.id : approval.taskId === null);
  const inlineAgentApproval = inlineMcpApproval ?? (visibleAgentApproval?.source === "mcp" ? null : visibleAgentApproval);
  const attentionRequests: AgentAttentionRequest[] = [];
  const addAttention = (taskId: string | null, input: AgentUserInput | null, approval: AgentApproval | null) => {
    const taskTitle = tasks.find((task) => task.id === taskId)?.title || "Workspace";
    if (input) attentionRequests.push({ id: `question:${input.requestId}`, requestId: input.requestId, taskId, taskTitle, kind: "question", title: input.questions[0].question });
    if (approval) attentionRequests.push({ id: `approval:${approval.requestId}`, requestId: approval.requestId, taskId, taskTitle, kind: "approval", title: approval.title });
  };
  addAttention(null, agentUserInput, agentApproval?.source === "mcp" ? null : agentApproval);
  for (const task of tasks) {
    const run = taskRuns[task.id];
    if (run) addAttention(task.id, run.input, run.approval?.source === "mcp" ? null : run.approval);
  }
  for (const approval of mcpApprovals) addAttention(approval.taskId, null, approval);
  attentionRequests.sort((a, b) => a.requestId - b.requestId);
  const selectedTaskRootBusy = !!taskGitAction || !!selectedTaskRun || !!(selectedTask && taskStartingIds.has(selectedTask.id))
    || (selectedTask?.location === "workspace" && (aiChatRunning || tasks.some((task) => task.location === "workspace" && (!!taskRuns[task.id] || taskStartingIds.has(task.id)))));
  const taskGitToolbar = selectedTask && repository ? <TaskGitToolbar
    key={`${repository.rootPath}:${selectedTask.id}:${selectedTask.location}:${selectedTask.worktree?.branch ?? ""}`}
    task={selectedTask}
    running={selectedTaskRootBusy || (selectedTask.location === "workspace" && branchActionBusy)}
    revision={taskChangesRevision}
    busy={taskGitAction}
    compact={!zenMode}
    onDirtyChange={(pending) => setTaskPendingChanges({ taskId: selectedTask.id, location: selectedTask.location, pending })}
    onBusyChange={setTaskGitAction}
    onPull={(pull) => { if (selectedTask.location === "workspace") discardFileEdit(pull); else pull(); }}
    onSynced={() => {
      setTaskChangesRevision((value) => value + 1);
      void invoke<BranchRefs>("list_branch_refs").then(setBranchRefs).catch((reason) => setError(message(reason)));
      if (selectedTask.location === "workspace") void refreshRef.current().catch((reason) => setError(message(reason)));
    }}
  /> : null;
  const protectedTaskIds = useMemo(() => {
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const ids = new Set([...Object.keys(taskRuns), ...taskStartingIds]);
    for (const id of ids) {
      let parentId = byId.get(id)?.parentId;
      while (parentId && !ids.has(parentId)) { ids.add(parentId); parentId = byId.get(parentId)?.parentId; }
    }
    return ids;
  }, [tasks, taskRuns, taskStartingIds]);
  useTaskControl({
    root: repository?.rootPath,
    ready: !!repository && taskStorageRoot === repository.rootPath,
    callerRunId: (id) => id ? taskRunsRef.current[id]?.accepted.requestId : aiChatRunningRef.current ? aiChatTurnRef.current?.requestId : undefined,
    onError: setError,
    cancelConfirmation: () => { if (taskControlConfirmationRef.current) { taskControlConfirmationRef.current(); taskControlConfirmationRef.current = null; setConfirmation(null); } },
    execute: async (request, active) => {
      const toolKeys: Record<string, string[]> = {
        get_agents: ["query"], get_agent: ["agentId"], create_agent: ["title", "prompt"], update_agent: ["agentId", "title", "prompt"],
        create_playbook: ["title", "description", "prompt", "variables"], update_playbook: ["playbookId", "title", "description", "prompt", "variables"],
        get_playbooks: ["query"], get_playbook: ["playbookId"], run_task_playbook: ["taskId", "playbookId", "values"], get_tasks: ["query", "status"], add_task: metadataKeys, update_task_comment: ["taskId", "commentId", "body"], get_github_notifications: [], get_task: ["taskId"], get_task_execution: ["taskId"], create_task: metadataKeys, update_task: ["taskId", ...metadataKeys], add_task_comment: ["taskId", "body"], delete_task: ["taskId"], start_task_run: ["taskId", "prompt", "startPoint", "mode"], stop_task_run: ["taskId"], update_task_queue: ["taskId", "paused", "removeMessageIds"], get_lanes: [], update_lane: ["status", "enabled", "prompt", "baseBranch", "baseKind", "workers"], retry_lane_task: ["status", "taskId"], get_task_start_context: [] };
      if (!Object.prototype.hasOwnProperty.call(toolKeys, request.name)) throw new Error("Unknown task control tool.");
      const args = argumentsFor(request.arguments, toolKeys[request.name]);
      const ensureActive = async () => { if (!await active()) throw new Error("Task control stopped or repository changed."); };
      const commit = async (update: (current: RepositoryTask[]) => RepositoryTask[]) => {
        await ensureActive();
        let next = update(tasksRef.current);
        for (const task of next) {
          const previous = tasksRef.current.find((entry) => entry.id === task.id);
          const status = taskBoardStatus(task);
          if ((!previous || taskBoardStatus(previous) !== status) && !await laneAutomation.hold(status, task.id, request.operationId)) throw new Error("Could not save lane start hold. No task change was applied.");
        }
        await ensureActive(); next = timestampTaskUpdates(tasksRef.current, update(tasksRef.current));
        tasksRef.current = next; setTasks(next); saveTasks(request.repositoryRoot, next);
        try { await fileStore.flush(); } catch (error) { throw new Error(`Operation outcome uncertain: ${message(error)}`); }
        return next;
      };
      const snapshot = (task: RepositoryTask) => taskObservation(task, { starting: taskStartingRef.current.has(task.id), running: !!taskRunsRef.current[task.id], approvalId: taskRunsRef.current[task.id]?.approval?.requestId, inputId: taskRunsRef.current[task.id]?.input?.requestId,
        queuePaused: pausedQueueKeysRef.current.has(taskQueueKey(request.repositoryRoot, task.id)), queueIds: (chatQueuesRef.current[taskQueueKey(request.repositoryRoot, task.id)] ?? []).map((item) => item.id) });
      if (request.name === "get_playbooks") {
        if (args.query !== undefined && typeof args.query !== "string") throw new Error("Query must be text.");
        const query = String(args.query ?? "").toLowerCase();
        return storedPlaybooks().filter((playbook) => `${playbook.title}\n${playbook.description}`.toLowerCase().includes(query)).map(({ id, title, description, variables }) => ({ id, title, description, variables }));
      }
      if (request.name === "get_playbook") {
        const matches = storedPlaybooks().filter((playbook) => playbook.id === args.playbookId);
        if (matches.length !== 1) throw new Error("Playbook not found or ID is ambiguous. Read playbooks again.");
        const playbook = matches[0];
        return playbook;
      }
      if (request.name === "get_agents") {
        if (args.query !== undefined && typeof args.query !== "string") throw new Error("Query must be text.");
        const query = String(args.query ?? "").toLowerCase();
        return storedAgents().filter((agent) => agent.title.toLowerCase().includes(query)).map(({ id, title }) => ({ id, title }));
      }
      if (request.name === "get_agent") {
        const agent = storedAgents().find((agent) => agent.id === args.agentId);
        if (!agent) throw new Error("Agent not found. Read agents again.");
        return agent;
      }
      if (request.name === "create_agent" || request.name === "update_agent") {
        await ensureActive();
        const current = storedAgents();
        const original = request.name === "create_agent" ? newAgent() : current.find((agent) => agent.id === args.agentId);
        if (!original) throw new Error("Agent not found. Read agents again.");
        if (request.name === "update_agent" && Object.keys(args).length < 2) throw new Error("Provide at least one agent change.");
        const saved = agentMetadata(original, args);
        const next = request.name === "create_agent" ? [...current, saved] : current.map((agent) => agent.id === saved.id ? saved : agent);
        fileStore.setItem(agentsStorageKey, JSON.stringify(next)); setAgents(next);
        try { await fileStore.flush(); } catch (error) { throw new Error(`Operation outcome uncertain: ${message(error)}`); }
        return saved;
      }
      if (request.name === "create_playbook" || request.name === "update_playbook") {
        await ensureActive();
        const current = storedPlaybooks();
        const matches = current.filter((playbook) => playbook.id === args.playbookId);
        const original = request.name === "create_playbook" ? newPlaybook() : matches.length === 1 ? matches[0] : undefined;
        if (!original) throw new Error("Playbook not found or ID is ambiguous. Read playbooks again.");
        if (request.name === "update_playbook" && Object.keys(args).length < 2) throw new Error("Provide at least one playbook change.");
        const saved = playbookMetadata(original, args);
        const next = request.name === "create_playbook" ? [...current, saved] : current.map((playbook) => playbook.id === saved.id ? saved : playbook);
        fileStore.setItem(playbookStorageKey, JSON.stringify(next)); setPlaybooks(next);
        try { await fileStore.flush(); } catch (error) { throw new Error(`Operation outcome uncertain: ${message(error)}`); }
        return saved;
      }
      if (request.name === "get_github_notifications") return githubInbox.notificationsContext;
      if (request.name === "get_tasks") {
        if (args.query !== undefined && typeof args.query !== "string") throw new Error("Query must be text.");
        if (args.status !== undefined && !laneStatuses.includes(args.status as TaskBoardStatus)) throw new Error("Invalid task status.");
        const query = String(args.query ?? "").toLowerCase();
        return { repositoryRoot: request.repositoryRoot, customFields, tasks: tasksRef.current.filter((task) => (!args.status || taskBoardStatus(task) === args.status) && `${task.title}\n${task.description}`.toLowerCase().includes(query)).map(taskSummary) };
      }
      if (request.name === "get_task_execution") { const task = getTask(tasksRef.current, args.taskId); return { id: task.id, execution: snapshot(task) }; }
      if (request.name === "get_task") { const task = getTask(tasksRef.current, args.taskId); return { ...taskSummary(task), agent: task.chatAgent ?? null, drawing: readTaskDrawing(task.drawing), comments: task.comments, assets: task.assets, chatMessages: task.chatMessages, model: task.chatModel, effort: task.chatEffort, mode: task.chatMode, worktree: task.worktree, queue: (chatQueuesRef.current[taskQueueKey(request.repositoryRoot, task.id)] ?? []).map(({ id, body, mode, model, effort }) => ({ id, body, mode, model, effort })), execution: { ...snapshot(task), progress: taskRunsRef.current[task.id]?.status ?? null, liveMessages: taskRunsRef.current[task.id]?.timeline ?? [], question: taskRunsRef.current[task.id]?.input ?? null, approval: taskRunsRef.current[task.id]?.approval ?? null } }; }
      if (request.name === "get_task_start_context") { const branches = await invoke<BranchRefs>("list_branch_refs"); return { branches: branches.refs, remoteBranches: branches.remoteRefs, customFields, defaultLocation: taskLocationDefault, newBranchPrefix: loadBranchPrefix(repositoryRef.current!.rootPath), defaultPlanMode: false, locations: ["workspace", "worktree", "existing"], startKinds: ["workspace", "branch", "remote", "existing"] }; }
      if (request.name === "create_task" || request.name === "add_task") {
        const title = requiredText(args.title, "Title", 500);
        const task = newRepositoryTask(null, (args.status as TaskBoardStatus) ?? "inbox", { title, description: "" });
        const next = await commit((current) => taskMetadata([...current, task], task, args, customFields, storedAgents())); return taskSummary(getTask(next, task.id));
      }
      if (request.name === "update_task") {
        const task = getTask(tasksRef.current, args.taskId);
        if (Object.keys(args).length < 2) throw new Error("Provide at least one task change.");
        const next = await commit((current) => {
          const original = getTask(current, task.id);
          const updated = taskMetadata(current, original, args, customFields, storedAgents());
          if (JSON.stringify(original.chatAgent ?? null) !== JSON.stringify(getTask(updated, task.id).chatAgent ?? null)) {
            const key = taskQueueKey(request.repositoryRoot, task.id);
            if (taskRunsRef.current[task.id] || taskStartingRef.current.has(task.id) || queueBusyRef.current.has(key) || chatQueuesRef.current[key]?.length) throw new Error("Task is running or has queued prompts. Finish or stop its work and clear its queue before changing the agent role.");
          }
          return updated;
        }); return taskSummary(getTask(next, task.id));
      }
      if (request.name === "update_task_comment") {
        const task = getTask(tasksRef.current, args.taskId);
        const comment = task.comments.find((entry) => entry.id === args.commentId);
        if (!comment || comment.author !== "agent") throw new Error("Only existing agent comments can be updated.");
        const updated = { ...comment, body: requiredText(args.body, "Comment", 5000) };
        await commit((current) => current.map((entry) => entry.id === task.id ? { ...entry, comments: entry.comments.map((item) => item.id === comment.id ? updated : item) } : entry));
        return updated;
      }
      if (request.name === "add_task_comment") {
        const task = getTask(tasksRef.current, args.taskId); const comment: TaskComment = { id: crypto.randomUUID(), author: "agent", body: requiredText(args.body, "Comment", 5000), createdAt: Date.now() };
        await commit((current) => current.map((entry) => entry.id === task.id ? { ...entry, comments: [...entry.comments, comment] } : entry)); return comment;
      }
      if (request.name === "delete_task") {
        const task = getTask(tasksRef.current, args.taskId); const ids = taskSubtreeIds(tasksRef.current, [task.id]);
        if ([...ids].some((id) => taskRunsRef.current[id] || taskStartingRef.current.has(id))) throw new Error("A task or subtask is running. Stop it before deleting.");
        if (confirmation) throw new Error("Finish the open confirmation first.");
        return new Promise<unknown>((resolve, reject) => {
          taskControlConfirmationRef.current = () => resolve({ deleted: false, reason: "Deletion cancelled" });
          setConfirmation({ title: `Delete ${ids.size} task${ids.size === 1 ? "" : "s"}?`, description: "The saved plans, images, task chats, and any associated Git worktrees will be deleted, including uncommitted worktree changes. Git branches will remain. This cannot be undone.", actionLabel: "Delete", cancel: () => { taskControlConfirmationRef.current = null; resolve({ deleted: false, reason: "Deletion declined" }); }, action: () => {
            void (async () => { try { await ensureActive(); if ([...ids].some((id) => taskRunsRef.current[id] || taskStartingRef.current.has(id))) throw new Error("Task is now running."); const deleted = await deleteTasks(ids); if (!deleted) throw new Error("Operation outcome uncertain: deletion failed; inspect the task and worktree before retrying."); resolve({ deleted, taskIds: [...ids] }); } catch (error) { reject(error); } finally { taskControlConfirmationRef.current = null; } })();
          } });
        });
      }
      if (request.name === "start_task_run" || request.name === "run_task_playbook") {
        let task = getTask(tasksRef.current, args.taskId);
        const coordinationPath = request.callerTaskId ? taskRunsRef.current[request.callerTaskId]?.coordinationPath ?? [request.callerTaskId] : [];
        if (coordinationPath.includes(task.id)) throw new Error("Cannot dispatch work to this task: it would create a task coordination cycle.");
        const playbook = request.name === "run_task_playbook" ? storedPlaybooks().find((entry) => entry.id === args.playbookId) : undefined;
        if (request.name === "run_task_playbook" && !playbook) throw new Error("Playbook not found. Read playbooks again.");
        const prompt = requiredText(playbook ? preparePlaybookPrompt(playbook, args.values).prompt : args.prompt, "Prompt");
        if (args.mode !== undefined && args.mode !== "default" && args.mode !== "plan") throw new Error("Invalid task chat mode.");
        if (args.startPoint !== undefined) {
          if (task.location !== "worktree" || !taskStartEditable(task, taskStartingRef.current.has(task.id))) throw new Error("The existing task start cannot be changed.");
          const branches = await invoke<BranchRefs>("list_branch_refs");
          const worktreeStart = taskStartPoint(args.startPoint, branches.refs, branches.remoteRefs);
          await commit((current) => { const fresh = getTask(current, task.id); if (!taskStartEditable(fresh, taskStartingRef.current.has(fresh.id))) throw new Error("Task has already started."); return current.map((entry) => entry.id === task.id ? { ...entry, worktreeStart } : entry); }); task = getTask(tasksRef.current, task.id);
        }
        if (task.location === "worktree" && !task.worktree && !taskStartSelected(task.worktreeStart)) throw new Error("Choose a worktree start point explicitly before starting this task.");
        await ensureActive();
        task = getTask(tasksRef.current, task.id);
        if (task.location === "worktree" && !task.worktree && task.worktreeStart?.kind !== "existing") {
          const newBranchName = taskNewBranchName(task, loadBranchPrefix(request.repositoryRoot), true);
          if (task.newBranchName !== newBranchName) await commit((current) => current.map((entry) => entry.id === task.id ? { ...entry, newBranchName } : entry));
          task = getTask(tasksRef.current, task.id);
        }
        const key = taskQueueKey(request.repositoryRoot, task.id);
        const item: QueuedChatMessage = { id: request.operationId, body: prompt, coordinationPath: [...coordinationPath, task.id], context: { mode: "auto", attachments: [] }, selection: null, mode: (args.mode as AiChatMode) ?? task.chatMode, model: task.chatModel, effort: task.chatEffort };
        const wasPaused = pausedQueueKeysRef.current.has(key);
        // Keep uncertain or cancelled submissions from dispatching when another turn completes.
        setQueuePaused(key, true);
        if (!task.chatMessages.some((message) => message.id === item.id) && !(chatQueuesRef.current[key] ?? []).some((message) => message.id === item.id)) changeQueue(key, (items) => [...items, item]);
        try { await fileStore.flush(); } catch (error) { throw new Error(`Operation outcome uncertain: ${message(error)}`); } await ensureActive();
        if (!wasPaused) { setQueuePaused(key, false); queueDispatchRef.current(key); }
        return { taskId: task.id, messageId: item.id, status: "queued", paused: pausedQueueKeysRef.current.has(key), ...(playbook ? { playbook: { id: playbook.id, title: playbook.title } } : {}) };
      }
      if (request.name === "update_task_queue") {
        const task = getTask(tasksRef.current, args.taskId);
        if (args.paused !== undefined && typeof args.paused !== "boolean") throw new Error("Paused must be a boolean.");
        if (args.removeMessageIds !== undefined && (!Array.isArray(args.removeMessageIds) || args.removeMessageIds.length > 100 || args.removeMessageIds.some((id) => typeof id !== "string" || !id))) throw new Error("Provide up to 100 queued message IDs.");
        if (args.paused === undefined && args.removeMessageIds === undefined) throw new Error("Provide a queue change.");
        const key = taskQueueKey(request.repositoryRoot, task.id);
        const removed = (args.removeMessageIds ?? []) as string[];
        if (removed.some((id) => !(chatQueuesRef.current[key] ?? []).some((item) => item.id === id))) throw new Error("Queued message not found. Read the task again.");
        await ensureActive();
        const wasPaused = pausedQueueKeysRef.current.has(key);
        setQueuePaused(key, true);
        for (const id of removed) removeQueued(key, id, true);
        try { await fileStore.flush(); } catch (error) { throw new Error(`Operation outcome uncertain: ${message(error)}`); }
        await ensureActive();
        const paused = (args.paused as boolean | undefined) ?? wasPaused;
        setQueuePaused(key, paused);
        if (!paused) queueDispatchRef.current(key);
        return { taskId: task.id, queuePaused: paused, queuedMessageIds: (chatQueuesRef.current[key] ?? []).map((item) => item.id) };
      }
      if (request.name === "stop_task_run") {
        const task = getTask(tasksRef.current, args.taskId);
        const run = taskRunsRef.current[task.id];
        if (!run && taskStartingRef.current.has(task.id)) throw new Error("Task is still starting. Retry stop once its run is accepted.");
        await ensureActive();
        setQueuePaused(taskQueueKey(request.repositoryRoot, task.id), true);
        if (run) await invoke("ai_chat_cancel", { requestId: run.accepted.requestId });
        await fileStore.flush();
        return { taskId: task.id, cancellationRequested: !!run, queuePaused: true };
      }
      if (request.name === "get_lanes") return laneStatuses.map((status) => ({ status, ...laneAutomation.lanes[status], taskIds: tasksRef.current.filter((task) => taskBoardStatus(task) === status).map((task) => task.id) }));
      const status = args.status as TaskBoardStatus;
      if (!laneStatuses.includes(status)) throw new Error("Invalid lane status.");
      if (request.name === "retry_lane_task") { const task = getTask(tasksRef.current, args.taskId); const attempt = laneAutomation.lanes[status].attempts[task.id]; if (!attempt || !["failed", "interrupted", "held"].includes(attempt.status)) throw new Error("Only failed, interrupted or held attempts can be released."); await ensureActive(); if (!await laneAutomation.retry(status, task.id)) throw new Error("Could not save the lane retry."); return { taskIds: [task.id] }; }
      if (request.name === "update_lane") {
        const current = laneAutomation.lanes[status];
        for (const field of ["prompt", "baseBranch"] as const) if (field in args && typeof args[field] !== "string") throw new Error(`${field} must be text.`);
        if ("enabled" in args && typeof args.enabled !== "boolean") throw new Error("Enabled must be a boolean.");
        if ("workers" in args && (typeof args.workers !== "number" || !Number.isSafeInteger(args.workers) || args.workers < 1)) throw new Error("Workers must be a positive whole number.");
        const config = { ...current, ...args } as typeof current;
        if (config.baseKind !== "branch" && config.baseKind !== "remote") throw new Error("Invalid base branch kind.");
        if (config.enabled) { const branches = await invoke<BranchRefs>("list_branch_refs"); if (!(config.baseKind === "remote" ? branches.remoteRefs : branches.refs).includes(config.baseBranch)) throw new Error("Choose an available base branch."); }
        await ensureActive(); if (!await laneAutomation.save(status, config)) throw new Error("Could not save lane configuration.");
        return { status, taskIds: tasksRef.current.filter((task) => taskBoardStatus(task) === status && (current.attempts[task.id]?.status === "running" || (config.enabled && !current.attempts[task.id]))).map((task) => task.id) };
      }
      throw new Error("Unknown task control tool.");
    },
  });
  const confirmDeleteTasks = (ids: Set<string>) => {
    if (!ids.size) return;
    setConfirmation({
      title: `Delete ${ids.size} task${ids.size === 1 ? "" : "s"}?`,
      description: "The saved plans, images, task chats, and any associated Git worktrees will be deleted, including uncommitted worktree changes. Git branches will remain. This cannot be undone.",
      actionLabel: "Delete",
      action: () => { void deleteTasks(ids); },
    });
  };
  const openTaskFolder = (terminal: boolean) => {
    if (!selectedTask) return;
    setBoardFolderError("");
    void invoke("open_task_folder", { taskId: selectedTask.worktree ? selectedTask.id : null, terminal }).catch((reason) => setBoardFolderError(message(reason)));
  };
  const renderTaskOptions = (task: RepositoryTask) => <DropdownMenu>
    <DropdownMenuTrigger aria-label={`Options for ${task.title}`} title="Task options" className="grid size-6 shrink-0 place-items-center rounded text-[#7C9B88] hover:bg-[#294536]"><Ellipsis size={14} /></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-44">
      <DropdownMenuItem onClick={() => openBoardTask(task, "detail")}><Pencil size={14} /> Edit task</DropdownMenuItem>
      {taskView === "kanban" && <DropdownMenuItem onClick={() => { setBoardAddingSubtaskId(task.id); setNewTaskDrafts((current) => ({ ...current, [task.id]: "" })); }}><Plus size={14} /> Add subtask</DropdownMenuItem>}
      <DropdownMenuGroup><DropdownMenuLabel>Status</DropdownMenuLabel>{boardStatusColumns.map(({ id, label }) => <DropdownMenuItem key={id} onClick={() => setTaskStatus(task.id, id)}>{id === "clear" ? "Needs planning" : label}{taskBoardStatus(task) === id && <Check className="ml-auto" />}</DropdownMenuItem>)}</DropdownMenuGroup>
      <DropdownMenuGroup><DropdownMenuLabel>Color</DropdownMenuLabel>{taskColors.map((item) => <DropdownMenuItem key={item.value} onClick={() => updateTask(task.id, (current) => ({ ...current, color: item.value }))}><span className={`task-color-dot ${item.value === "clear" ? "task-color-dot-clear" : ""}`} style={{ backgroundColor: item.color }} />{item.label}{task.color === item.value && <Check className="ml-auto" />}</DropdownMenuItem>)}</DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" disabled={protectedTaskIds.has(task.id)} onClick={() => confirmDeleteTasks(taskSubtreeIds(tasks, [task.id]))}><Trash2 size={14} /> Delete task</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
  const endTaskDrag = (event: DragEndEvent) => {
    const { source, target, position } = event.operation;
    if (event.canceled || !source || !target) return;
    const task = tasks.find((item) => item.id === String(source.id));
    const overId = isSortable(source) ? visibleTasks[source.index]?.id : null;
    const targetTask = tasks.find((item) => item.id === (source.id === target.id ? overId : String(target.id)));
    const status = String(target.id).startsWith("board-status:") ? String(target.id).slice("board-status:".length) : targetTask ? taskBoardStatus(targetTask) : null;
    if (!task || !boardStatusColumns.some((column) => column.id === status)) return;
    if (taskBoardStatus(task) !== status) {
      setTaskStatus(task.id, status as TaskBoardStatus);
      if (targetTask) setTasks((current) => moveTaskWithinStatus(current, task.id, targetTask.id, "before"));
      return;
    }
    if (!targetTask) return;
    const horizontalOffset = position.current.x - position.initial.x;
    if (Math.abs(horizontalOffset) >= 14) {
      setTasks((current) => moveTaskProjected(current, task.id, current.findIndex((item) => item.id === targetTask.id), horizontalOffset));
    } else {
      const dropPosition = visibleTasks.findIndex((item) => item.id === task.id) < visibleTasks.findIndex((item) => item.id === targetTask.id) ? "after" : "before";
      setTasks((current) => moveTaskWithinStatus(current, task.id, targetTask.id, dropPosition));
    }
  };
  const boardDragTarget = ({ source, target, position }: DragEndEvent["operation"]) => {
    if (!source || !target) return null;
    const sourceTask = tasks.find((task) => task.id === String(source.id));
    if (!sourceTask) return null;
    if (source.id === target.id) return { status: taskBoardStatus(sourceTask), taskId: null, position: "after" as const };
    let targetTask = tasks.find((task) => task.id === String(target.id));
    const group = boardGroups.find((group) => group.key === target.id);
    const status = group?.status ?? (targetTask ? taskBoardStatus(targetTask) : null);
    if (!status) return null;
    let dropPosition: "before" | "after" = "before";
    if (group) {
      const siblings = group.tasks.filter((task) => task.id !== sourceTask.id && task.parentId === sourceTask.parentId);
      const next = siblings.find((task) => {
        const rect = source.manager?.registry.droppables.get(task.id)?.element?.getBoundingClientRect();
        return rect && position.current.y < rect.top + rect.height / 2;
      });
      targetTask = next ?? siblings[siblings.length - 1];
      dropPosition = next ? "before" : "after";
    } else {
      const rect = target.element?.getBoundingClientRect();
      if (rect && position.current.y > rect.top + rect.height / 2) dropPosition = "after";
    }
    return { status, taskId: targetTask?.parentId === sourceTask.parentId ? targetTask.id : null, position: dropPosition };
  };
  const previewBoardDrag = (event: DragMoveEvent | DragOverEvent) => {
    const next = boardDragTarget(event.operation);
    setBoardDropTarget((current) => current?.status === next?.status && current?.taskId === next?.taskId && current?.position === next?.position ? current : next);
  };
  const overBoardDrag = (event: DragOverEvent) => {
    const { source, target } = event.operation;
    // React owns card parents; let dnd-kit preview sorting only within the same column.
    if (isSortable(source) && isSortable(target) && source.group !== target.group) event.preventDefault();
    previewBoardDrag(event);
  };
  // Commit only on drop; hover updates remount cards, persist intermediate statuses and trigger lane automation.
  const endBoardDrag = (event: DragEndEvent) => {
    const { source, target } = event.operation;
    setBoardDropTarget(null);
    if (event.canceled || !source || !target) return;
    if (source.id === target.id) {
      if (!isSortable(source) || source.index === source.initialIndex && source.group === source.initialGroup) return;
      const group = boardGroups.find((item) => item.key === source.group);
      if (!group) return;
      const status = group.status;
      if (tasks.find((task) => task.id === String(source.id) && taskBoardStatus(task) !== status)) setTaskStatus(String(source.id), status);
      setTasks((current) => moveTaskToBoardIndex(current, String(source.id), { status }, source.index));
      return;
    }
    const destination = boardDragTarget(event.operation);
    const sourceTask = tasks.find((task) => task.id === String(source.id));
    if (!sourceTask || !destination) return;
    if (taskBoardStatus(sourceTask) !== destination.status) setTaskStatus(sourceTask.id, destination.status);
    const { taskId, position } = destination;
    if (taskId) setTasks((current) => moveTaskWithinStatus(current, sourceTask.id, taskId, position));
  };

  return (
    <PomodoroProvider settings={pomodoroSettings} revision={pomodoroRevision} onComplete={notifyPomodoro}>
    <TooltipProvider>
    <main className="ios-app flex h-screen min-h-0 flex-col overflow-hidden bg-[#050807] text-[#E8FFF0]">
      <header
        style={zenMode ? { display: "none" } : undefined}
        data-tauri-drag-region
        onMouseDown={startDragging}
        className="ios-navigation-bar relative flex shrink-0 items-center justify-end border-b border-[#294536] px-3"
      >
        {!settingsOpen && repository && <div className="workspace-mode-switch" role="group" aria-label="Workspace mode">
          <button
            type="button"
            onClick={() => selectWorkspaceMode("workspace")}
            aria-pressed={workspaceMode === "workspace"}
            aria-keyshortcuts="Meta+1 Control+1"
            className="workspace-mode-button"
            title="Workspace (⌘1 / Ctrl+1)"
          >
            {aiChatRunning ? <LoaderCircle size={14} className="animate-spin" /> : <GitCompareArrows size={14} />} Workspace
          </button>
          <button
            type="button"
            onClick={() => selectWorkspaceMode("tasks")}
            aria-pressed={tasksTabActive}
            aria-keyshortcuts="Meta+2 Control+2"
            className="workspace-mode-button"
            title="Tasks (⌘2 / Ctrl+2)"
          >
            {Object.keys(taskRuns).length ? <LoaderCircle size={14} className="animate-spin" /> : <ListTodo size={14} />} Tasks
          </button>
          <button type="button" onClick={() => selectWorkspaceMode("memory")} aria-pressed={memoryMode} aria-keyshortcuts="Meta+3 Control+3" className="workspace-mode-button" title="Memory (⌘3 / Ctrl+3)"><FileText size={14} /> Memory</button>
        </div>}
        <div className="ios-nav-actions relative flex shrink-0 items-center justify-end gap-1">
          <PomodoroTimer onSettings={openPomodoroSettings} />
          {!settingsOpen && <>
          <span aria-hidden className="ios-nav-divider" />
          <GitHubInbox github={githubInbox} onSettings={() => { void openSettings("github"); }} />
          <span aria-hidden className="ios-nav-divider" />
          <PromptScheduler key={repository?.rootPath ?? "no-repository"} scheduler={promptScheduler} tasks={tasks} onOpenTask={(task) => { selectWorkspaceMode("tasks"); if (taskView !== "list") openBoardTask(task); else selectTask(task); }} />
          </>}
          {!settingsOpen && <>
          <span aria-hidden className="ios-nav-divider" />
          {!runCommand ? (
            <Popover open={runCommandPromptOpen} onOpenChange={(open) => {
              setRunCommandPromptOpen(open);
              if (open) setRunCommandDraft(runCommand);
            }}>
              <PopoverTrigger disabled={!repository} className="top-button" aria-label="Configure Run command" title={repository ? "Configure Run command" : "Open a repository to configure Run"}>
                <Play size={14} fill="currentColor" /> Run
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 border border-[#294536] bg-[#111A15] p-3">
                <PopoverTitle className="font-semibold text-[#E8FFF0]">Run command</PopoverTitle>
                <p className="mt-1 text-xs text-[#7C9B88]">Runs from the repository root.</p>
                <form className="mt-3" onSubmit={(event) => { event.preventDefault(); saveAndRunCommand(); }}>
                  <Input
                    autoFocus
                    value={runCommandDraft}
                    onChange={(event) => setRunCommandDraft(event.currentTarget.value)}
                    placeholder="npm test"
                    className="h-8 w-full rounded border border-[#294536] bg-[#050807] px-2 text-[#E8FFF0] outline-none placeholder:text-[#7C9B88] focus:border-[#A3FF12]"
                  />
                  <div className="mt-3 flex justify-end gap-2">
                    <button type="button" onClick={() => setRunCommandPromptOpen(false)} className="quiet-button">Cancel</button>
                    <button type="submit" disabled={!runCommandDraft.trim()} className="accent-button"><Play size={13} fill="currentColor" /> Save & Run</button>
                  </div>
                </form>
              </PopoverContent>
            </Popover>
          ) : (
            <Button
              type="button"
              onClick={() => {
                if (runStatus === "idle") void startRepositoryRun();
                else setRunOutputOpen(true);
              }}
              className="top-button"
              aria-label={runStatus === "idle" ? "Run" : "Open Run output"}
              title={runStatus === "idle" ? "Run" : "Open Run output"}
            >
              {runStatus === "running" || runStatus === "stopping" ? <><LoaderCircle size={15} className="animate-spin" /> {runStatus === "stopping" ? "Stopping…" : "In progress…"}</> : runStatus === "success" ? <Check size={16} /> : runStatus === "failed" ? <><X size={16} /> Run failed</> : <><Play size={14} fill="currentColor" /> Run</>}
            </Button>
          )}
          {(runStatus === "running" || runStatus === "stopping") && <Button type="button" onClick={() => void stopRepositoryRun()} disabled={runStatus === "stopping"} variant="ghost" className="top-button ios-nav-icon text-[#7C9B88] hover:text-[#E8FFF0]" aria-label="Stop Run command" title="Stop Run command"><Square size={12} /></Button>}
          <span aria-hidden className="ios-nav-divider" />
          <Button
            type="button"
            disabled={!repository}
            onClick={() => {
              if (!repository) return;
              setTerminalMounted(true);
              setTerminalOpen((open) => settingsOpen ? true : !open);
              setSettingsOpen(false);
            }}
            aria-label="Toggle terminal"
            aria-pressed={terminalOpen && !settingsOpen}
            title={repository ? "Toggle Terminal" : "Open a repository to use Terminal"}
            className={`top-button ios-nav-icon ${terminalOpen && !settingsOpen ? "bg-[#183522] text-[#A3FF12]" : ""}`}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <path d="M9 16h6" />
            </svg>
          </Button>
          </>}
          <Button
            type="button"
            onClick={() => settingsOpen ? setSettingsOpen(false) : void openSettings()}
            aria-label="Settings"
            aria-pressed={settingsOpen}
            title="Settings"
            className={`top-button ios-nav-icon ${settingsOpen ? "bg-[#183522] text-[#A3FF12]" : ""}`}
          >
            <Settings size={14} />
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {settingsOpen && (
        <SettingsLayout page={settingsPage} onPageChange={setSettingsPage} onClose={() => setSettingsOpen(false)} browserSupported={browserSupported}>
          <div hidden={settingsPage !== "general"} data-settings-page="general">
            <section className="mt-10">
              <h2 className="mb-4 text-[17px] font-semibold text-[#E8FFF0]">Notifications</h2>
              <div className="overflow-hidden rounded-xl border border-[#294536] bg-[#111A15] px-5">
                <label className="flex cursor-pointer items-center justify-between gap-5 py-5 text-[#E8FFF0]">
                  <span><span className="block font-semibold">System notifications</span><span className="mt-1 block text-sm text-[#7C9B88]">Alert when an agent finishes, fails, or needs your input, and when a Pomodoro phase ends. Click an agent alert to open the chat.</span></span>
                  <Switch checked={systemNotifications} onCheckedChange={(enabled) => { systemNotificationsRef.current = enabled; setSystemNotifications(enabled); }} aria-label="System notifications" className="shrink-0" />
                </label>
              </div>
            </section>
            <section className="mt-10">
              <h2 className="mb-4 text-[17px] font-semibold text-[#E8FFF0]">Review</h2>
              <div className="overflow-hidden rounded-xl border border-[#294536] bg-[#111A15] px-5">
                <div className="flex flex-wrap items-center justify-between gap-5 py-5 text-[#E8FFF0]">
                  <div><h3 className="font-semibold">Default diff view</h3><p className="mt-1 text-sm text-[#7C9B88]">Used when opening a repository or comparison.</p></div>
                  <Select value={defaultFileViewMode} onValueChange={(value) => { if (value === "split" || value === "unified") setDefaultFileViewMode(value); }}><SelectTrigger className="h-9 w-40 border-[#294536] bg-[#050807] text-[#E8FFF0]" aria-label="Default diff view"><SelectValue>{(value) => value === "unified" ? "Unified" : "Split"}</SelectValue></SelectTrigger><SelectContent><SelectItem value="split">Split</SelectItem><SelectItem value="unified">Unified</SelectItem></SelectContent></Select>
                </div>
                <div className="border-t border-[#294536]" />
                <label className="flex cursor-pointer items-center justify-between gap-5 py-5 text-[#E8FFF0]">
                  <span><span className="block font-semibold">Show entire file in diffs</span><span className="mt-1 block text-sm text-[#7C9B88]">Applies to Split and Unified. Turn off to show changes with one context line.</span></span>
                  <Switch checked={showFullFileDiff} onCheckedChange={changeFullFileDiff} className="shrink-0" />
                </label>
                <div className="border-t border-[#294536]" />
                <label className="flex cursor-pointer items-center justify-between gap-5 py-5 text-[#E8FFF0]">
                  <span><span className="block font-semibold">Auto-open edited file</span><span className="mt-1 block text-sm text-[#7C9B88]">Only while viewing Working Copy.</span></span>
                  <Switch checked={autoOpenEditedFile} onCheckedChange={setAutoOpenEditedFile} className="shrink-0" />
                </label>
              </div>
            </section>
            <section className="mt-10">
              <h2 className="mb-4 text-[17px] font-semibold text-[#E8FFF0]">Workspace</h2>
              <div className="overflow-hidden rounded-xl border border-[#294536] bg-[#111A15] px-5">
                <label className="flex cursor-pointer items-center justify-between gap-5 py-5 text-[#E8FFF0]">
                  <span><span className="block font-semibold">Reserve space for simulator</span><span className="mt-1 block text-sm text-[#7C9B88]">Keep a resizable area on the right across all tabs.</span></span>
                  <Switch checked={simulatorSpace.enabled} onCheckedChange={(enabled) => setSimulatorSpace((current) => ({ ...current, enabled }))} className="shrink-0" />
                </label>
              </div>
            </section>
          </div>
          <div hidden={settingsPage !== "tasks"} data-settings-page="tasks">
            {repository && <section className="mt-10">
              <h2 className="mb-4 text-[17px] font-semibold text-[#E8FFF0]">Tasks</h2>
              <div className="divide-y divide-[var(--ios-separator)] rounded-xl border border-[#294536] bg-[#111A15] px-5">
                <div className="flex flex-wrap items-center justify-between gap-4 py-5">
                  <div><h3 className="font-semibold text-[#E8FFF0]">Task view</h3><p className="mt-1 text-sm text-[#7C9B88]">Saved for this repository.</p></div>
                  <Select value={taskView} onValueChange={(value) => { if (value === "list" || value === "kanban" || value === "gantt") { setTaskView(value); if (value === "list") setBoardDrawerOpen(false); } }}><SelectTrigger className="h-9 w-40 border-[#294536] bg-[#050807] text-[#E8FFF0]" aria-label="Task view"><SelectValue>{(value) => value === "kanban" ? "Kanban" : value === "gantt" ? "Gantt" : "List"}</SelectValue></SelectTrigger><SelectContent><SelectItem value="list">List</SelectItem><SelectItem value="kanban">Kanban</SelectItem><SelectItem value="gantt">Gantt</SelectItem></SelectContent></Select>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-4 py-5">
                  <div><h3 className="font-semibold text-[#E8FFF0]">Open new tasks in modal</h3><p className="mt-1 text-sm text-[#7C9B88]">Open a new task or subtask after creating it in Kanban or Gantt.</p></div>
                  <Switch checked={openNewTaskInDrawer} onCheckedChange={setOpenNewTaskInDrawer} aria-label="Open new tasks in modal" />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-4 py-5">
                  <div><h3 className="font-semibold text-[#E8FFF0]">Close Kanban modal on outside click</h3><p className="mt-1 text-sm text-[#7C9B88]">When off, close the modal with Escape or its close button.</p></div>
                  <Switch checked={closeKanbanModalOnOutsideClick} onCheckedChange={setCloseKanbanModalOnOutsideClick} aria-label="Close Kanban modal on outside click" />
                </div>
              </div>
            </section>}

            <section className="mt-10" aria-labelledby="custom-fields-title">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 id="custom-fields-title" className="text-[17px] font-semibold text-[#E8FFF0]">Task custom fields</h2><p className="mt-1 text-sm text-[#7C9B88]">Available in every repository. Values belong to individual tasks.</p></div><div className="flex gap-2">{(["text", "select"] as const).map((type) => <button key={type} type="button" className="quiet-button" onClick={() => { const name = `New ${type === "text" ? "text" : "selection"} field`; const names = new Set(customFields.map((field) => field.name.toLowerCase())); let candidate = name; for (let number = 2; names.has(candidate.toLowerCase()); number++) candidate = `${name} ${number}`; updateCustomFields([...customFields, { id: crypto.randomUUID(), name: candidate, type, options: [], showOnCards: false, multiline: type === "text", hyperlink: false }]); }}><Plus size={14} /> {type === "text" ? "Text field" : "Selection field"}</button>)}</div></div>
              {customFieldError && <p role="alert" className="mb-3 text-sm text-[#FB7185]">{customFieldError}</p>}
              <div className="divide-y divide-[var(--ios-separator)] overflow-hidden rounded-xl border border-[#294536] bg-[#111A15] px-5">{customFields.length === 0 && <p className="py-5 text-sm text-[#7C9B88]">No custom fields yet.</p>}{customFields.map((field, index) => <div key={field.id} className="space-y-3 py-5">
                <div className="flex flex-wrap items-end gap-3"><label className="min-w-48 flex-1 space-y-1 text-xs font-semibold text-[#7C9B88]">Field name<Input key={`${field.id}:${field.name}`} defaultValue={field.name} maxLength={80} className="mt-1 h-9 border-[#294536] bg-[#050807] text-[#E8FFF0]" onBlur={(event) => { const name = event.currentTarget.value.trim(); if (!name || customFields.some((other) => other.id !== field.id && other.name.toLowerCase() === name.toLowerCase())) { event.currentTarget.value = field.name; setCustomFieldError("Field names must be non-empty and unique."); return; } if (name !== field.name) updateCustomFields(customFields.map((item) => item.id === field.id ? { ...item, name } : item)); }} /></label><span className="pb-2 text-xs text-[#7C9B88]">{field.type === "text" ? "Text" : "Selection"}</span><div className="flex gap-1"><button type="button" className="quiet-button h-9 px-2 disabled:opacity-40" aria-label={`Move ${field.name} up`} disabled={index === 0} onClick={() => updateCustomFields(moveTaskCustomField(customFields, field.id, -1))}><ArrowUp size={15} /></button><button type="button" className="quiet-button h-9 px-2 disabled:opacity-40" aria-label={`Move ${field.name} down`} disabled={index === customFields.length - 1} onClick={() => updateCustomFields(moveTaskCustomField(customFields, field.id, 1))}><ArrowDown size={15} /></button></div><button type="button" className="quiet-button h-9 px-2 text-[#FB7185]" aria-label={`Delete field ${field.name}`} onClick={() => setConfirmation({ title: `Delete ${field.name}?`, description: "This removes the field and its values from tasks in every repository. This cannot be undone.", actionLabel: "Delete field", action: () => { if (clearCustomFieldValues(field.id)) updateCustomFields(customFields.filter((item) => item.id !== field.id)); } })}><Trash2 size={15} /></button></div>
                {field.type === "text" && <label className="flex items-center justify-between gap-3 text-sm text-[#E8FFF0]">Allow multiple lines<Switch checked={field.multiline} onCheckedChange={(multiline) => {
                  if (!multiline) {
                    try {
                      if (hasTaskCustomFieldLineBreaks(field.id) || tasks.some((task) => /[\r\n\u2028\u2029]/.test(task.customFields[field.id] ?? ""))) { setCustomFieldError(`Remove line breaks from existing ${field.name} values before switching to a single line.`); return; }
                    } catch (reason) { setCustomFieldError(`Could not check task values: ${message(reason)}`); return; }
                  }
                  updateCustomFields(customFields.map((item) => item.id === field.id ? { ...item, multiline, hyperlink: multiline ? false : item.hyperlink } : item));
                }} aria-label={`Allow multiple lines for ${field.name}`} /></label>}
                {field.type === "text" && !field.multiline && <label className="flex items-center justify-between gap-3 text-sm text-[#E8FFF0]"><span>Open as hyperlink<span className="mt-1 block text-xs text-[#7C9B88]">Requires a full http:// or https:// URL.</span></span><Switch checked={field.hyperlink} onCheckedChange={(hyperlink) => updateCustomFields(customFields.map((item) => item.id === field.id ? { ...item, hyperlink } : item))} aria-label={`Open ${field.name} as hyperlink`} /></label>}
                <label className="flex items-center justify-between gap-3 text-sm text-[#E8FFF0]">Show filled values in list and Kanban<Switch checked={field.showOnCards} onCheckedChange={(showOnCards) => updateCustomFields(customFields.map((item) => item.id === field.id ? { ...item, showOnCards } : item))} aria-label={`Show ${field.name} in list and Kanban`} /></label>
                {field.type === "select" && <div className="space-y-2"><p className="text-xs font-semibold text-[#7C9B88]">Options</p>{field.options.map((option) => <div key={option.id} className="flex items-center gap-2"><Input key={`${option.id}:${option.label}`} defaultValue={option.label} maxLength={80} aria-label={`Option ${option.label}`} className="h-9 border-[#294536] bg-[#050807] text-[#E8FFF0]" onBlur={(event) => { const label = event.currentTarget.value.trim(); if (!label || field.options.some((other) => other.id !== option.id && other.label.toLowerCase() === label.toLowerCase())) { event.currentTarget.value = option.label; setCustomFieldError("Option names must be non-empty and unique within a field."); return; } if (label !== option.label) updateCustomFields(customFields.map((item) => item.id === field.id ? { ...item, options: item.options.map((entry) => entry.id === option.id ? { ...entry, label } : entry) } : item)); }} /><button type="button" className="quiet-button h-9 px-2 text-[#FB7185]" aria-label={`Delete option ${option.label}`} onClick={() => setConfirmation({ title: `Delete ${option.label}?`, description: "Tasks using this option will have an empty value in this field across every repository. This cannot be undone.", actionLabel: "Delete option", action: () => { if (clearCustomFieldValues(field.id, option.id)) updateCustomFields(customFields.map((item) => item.id === field.id ? { ...item, options: item.options.filter((entry) => entry.id !== option.id) } : item)); } })}><X size={14} /></button></div>)}<button type="button" className="quiet-button text-xs" onClick={() => { const labels = new Set(field.options.map((option) => option.label.toLowerCase())); let label = "New option"; for (let number = 2; labels.has(label.toLowerCase()); number++) label = `New option ${number}`; updateCustomFields(customFields.map((item) => item.id === field.id ? { ...item, options: [...item.options, { id: crypto.randomUUID(), label }] } : item)); }}><Plus size={13} /> Add option</button></div>}
              </div>)}</div>
            </section>
          </div>
          <div hidden={settingsPage !== "pomodoro"} data-settings-page="pomodoro">
            <PomodoroSettings settings={pomodoroSettings} onSave={(settings) => { setPomodoroSettings(settings); setPomodoroRevision((revision) => revision + 1); }} />
          </div>
          <div hidden={settingsPage !== "providers"} data-settings-page="providers">
            <section className="mt-10">
              <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-[17px] font-semibold text-[#E8FFF0]">Provider defaults & credentials</h2><button type="button" onClick={() => setModelsRevision((value) => value + 1)} className="quiet-button h-8 px-3"><RefreshCw size={14} /> Refresh models</button></div>
              {aiSettingsError && <p role="alert" className="mb-4 text-sm text-[#FB7185]">{aiSettingsError}</p>}
              <div className="flex flex-col overflow-hidden rounded-xl border border-[#294536] bg-[#111A15] px-5">
                <div className="contents">
                  <div className="order-1 flex flex-wrap items-start justify-between gap-3 py-5">
                    <div><h3 className="font-semibold text-[#E8FFF0]">Global default provider</h3></div>
                    <Select value={providerSettingsDraft.activeProvider} disabled={providerSettingsSaving} onValueChange={(value) => { if (value) void selectProvider(value); }}>
                      <SelectTrigger className="h-9 w-52 border-[#294536] bg-[#050807] text-[#E8FFF0]" aria-label="Active model provider"><SelectValue>{(value) => providerSettingsDraft.providers.find((provider) => provider.id === value)?.name || value || "Choose a provider"}</SelectValue></SelectTrigger>
                      <SelectContent className="ios-select-content">{providerSettingsDraft.providers.map((provider) => <SelectItem key={provider.id} value={provider.id}>{provider.name || provider.id}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {repository && <div className="order-2 flex flex-wrap items-start justify-between gap-3 border-t border-[#294536] py-5">
                    <div><h3 className="font-semibold text-[#E8FFF0]">Repository default provider</h3><p className="mt-1 max-w-md truncate text-xs text-[#7C9B88]" title={repository.rootPath}>{repository.rootPath}</p></div>
                    <Select value={providerSettingsDraft.repositoryProviders[repository.rootPath] ?? "*"} disabled={providerSettingsSaving} onValueChange={(value) => { if (value) void selectRepositoryProvider(value); }}>
                      <SelectTrigger className="h-9 w-52 border-[#294536] bg-[#050807] text-[#E8FFF0]" aria-label="Repository default model provider"><SelectValue>{(value) => value === "*" ? "Use global default" : providerSettingsDraft.providers.find((provider) => provider.id === value)?.name || value || "Choose a provider"}</SelectValue></SelectTrigger>
                      <SelectContent className="ios-select-content"><SelectItem value="*">Use global default</SelectItem>{providerSettingsDraft.providers.map((provider) => <SelectItem key={provider.id} value={provider.id}>{provider.name || provider.id}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>}
                  <div className="order-4 space-y-3 border-t border-[#294536] py-5">
                    <div className="mb-4"><h3 className="font-semibold text-[#E8FFF0]">Model providers</h3><p className="mt-1 text-sm text-[#7C9B88]">OpenAI-compatible providers use an environment variable or a secret stored as plaintext in ~/.lotse/credentials.json.</p></div>
                    {providerSettingsDraft.providers.map((provider, index) => <div key={`${provider.id}-${index}`} className="rounded-lg border border-[#294536] bg-[#0B110E] p-3">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="grid gap-1 text-xs font-medium text-[#7C9B88]">Provider ID<Input value={provider.id} onChange={(event) => { const value = event.currentTarget.value; setProviderSettingsDraft((current) => ({ ...current, activeProvider: current.activeProvider === provider.id ? value : current.activeProvider, repositoryProviders: Object.fromEntries(Object.entries(current.repositoryProviders).map(([root, id]) => [root, id === provider.id ? value : id])), providers: current.providers.map((item, itemIndex) => itemIndex === index ? { ...item, id: value } : item) })); }} placeholder="Provider ID" aria-label="Provider ID" className="h-9 border-[#294536] bg-[#050807] text-[#E8FFF0]" /></label>
                        <label className="grid gap-1 text-xs font-medium text-[#7C9B88]">Display name<Input value={provider.name} onChange={(event) => { const value = event.currentTarget.value; setProviderSettingsDraft((current) => ({ ...current, providers: current.providers.map((item, itemIndex) => itemIndex === index ? { ...item, name: value } : item) })); }} placeholder="Display name" aria-label="Provider display name" className="h-9 border-[#294536] bg-[#050807] text-[#E8FFF0]" /></label>
                        <label className="grid gap-1 text-xs font-medium text-[#7C9B88]">Base URL<Input value={provider.baseUrl} onChange={(event) => { const value = event.currentTarget.value; setProviderSettingsDraft((current) => ({ ...current, providers: current.providers.map((item, itemIndex) => itemIndex === index ? { ...item, baseUrl: value } : item) })); }} placeholder="https://provider.example/v1" aria-label="Provider base URL" className="h-9 border-[#294536] bg-[#050807] text-[#E8FFF0]" /></label>
                        <label className="grid gap-1 text-xs font-medium text-[#7C9B88]">API key<Input type="password" value={provider.secret ?? ""} onChange={(event) => { const value = event.currentTarget.value; setProviderSettingsDraft((current) => ({ ...current, providers: current.providers.map((item, itemIndex) => itemIndex === index ? { ...item, secret: value } : item) })); }} placeholder="Stored in ~/.lotse/credentials.json" aria-label={`API key for ${provider.name || provider.id || "provider"}`} className="h-9 border-[#294536] bg-[#050807] font-mono text-[#E8FFF0]" /></label>
                        <button type="button" className="quiet-button h-9 px-3 text-[#FB7185]" aria-label={`Remove ${provider.name || provider.id || "provider"}`} onClick={() => setProviderSettingsDraft((current) => ({ activeProvider: current.activeProvider === provider.id ? current.providers.find((_, itemIndex) => itemIndex !== index)?.id ?? "" : current.activeProvider, repositoryProviders: Object.fromEntries(Object.entries(current.repositoryProviders).filter(([, id]) => id !== provider.id)), providers: current.providers.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 size={14} /></button>
                      </div>
                    </div>)}
                  </div>
                  <div className="order-5 flex flex-wrap justify-end gap-2 pb-5">
                    <button type="button" className="quiet-button" onClick={() => setProviderSettingsDraft((current) => current.providers.some((provider) => provider.id === "openrouter") ? current : ({ ...current, activeProvider: "openrouter", providers: [...current.providers, openRouterProvider] }))}>Add OpenRouter</button>
                    <button type="button" className="quiet-button" onClick={() => setProviderSettingsDraft((current) => ({ ...current, activeProvider: current.activeProvider || `provider${current.providers.length + 1}`, providers: [...current.providers, { id: `provider${current.providers.length + 1}`, name: "", baseUrl: "", envKey: "" }] }))}><Plus size={14} /> Custom provider</button>
                    <button type="button" className="accent-button" disabled={providerSettingsSaving} onClick={() => void saveProviderSettings()}>{providerSettingsSaving ? "Saving…" : "Save providers"}</button>
                  </div>
                </div>
              </div>
            </section>
            <section className="mt-10">
              <h2 className="mb-4 text-[17px] font-semibold text-[#E8FFF0]">Setup</h2>
              <div className="rounded-xl border border-[#294536] bg-[#111A15] px-5">
                <div className="flex flex-wrap items-center justify-between gap-5 py-5 text-[#E8FFF0]">
                  <div><h3 className="font-semibold">Onboarding</h3><p className="mt-1 text-sm text-[#7C9B88]">Review model provider setup and API key settings.</p></div>
                  <button type="button" className="quiet-button" onClick={() => { setAuthOnboardingOpen(true); void loadOnboardingAuth(); }}>Show onboarding</button>
                </div>
              </div>
            </section>
          </div>
          <div hidden={settingsPage !== "agent"} data-settings-page="agent">
            <section className="mt-10">
              <h2 className="mb-4 text-[17px] font-semibold text-[#E8FFF0]">Defaults & personalization</h2>
              <div className="overflow-hidden rounded-xl border border-[#294536] bg-[#111A15] px-5">
                <div className="py-5">
                  <div className="mb-5 grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center">
                    <div><p className="text-sm font-semibold text-[#E8FFF0]">Default agent</p><p className="mt-1 text-xs text-[#7C9B88]">For new tasks and review chats.</p></div>
                    <Select value={defaultAgent?.id ?? ""} onValueChange={(value) => setDefaultAgentId(value ?? "")}>
                      <SelectTrigger className="h-9 w-full border-[#294536] bg-[#050807] text-[#E8FFF0]" aria-label="Default agent"><SelectValue>{() => defaultAgent?.title ?? "None"}</SelectValue></SelectTrigger>
                      <SelectContent className="ios-select-content"><SelectItem value="">None</SelectItem>{agents.map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.title}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <h3 className="font-semibold text-[#E8FFF0]">Mode defaults</h3>
                  <p className="mt-1 text-sm text-[#7C9B88]">Applied whenever you switch modes.</p>
                  {modelsStatus && <p role="status" className="mt-2 text-sm text-[#7C9B88]">{modelsStatus} <button type="button" className="underline" onClick={() => setModelsRevision((value) => value + 1)}>Refresh</button></p>}
                  <div className="mt-4 divide-y divide-[var(--ios-separator)] border-y border-[#294536]">
                    <div className="grid gap-2 py-4 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center"><p className="text-sm font-semibold text-[#E8FFF0]">New task location</p><Select value={taskLocationDefault} onValueChange={(value) => value && setTaskLocationDefault(value as TaskLocation)}><SelectTrigger className="h-9 w-full border-[#294536] bg-[#050807] text-[#E8FFF0]" aria-label="Default task location"><SelectValue>{(value) => value === "workspace" ? "Workspace" : value === "existing" ? "Work on existing" : "New Branch"}</SelectValue></SelectTrigger><SelectContent><SelectItem value="workspace">Workspace</SelectItem><SelectItem value="worktree">New Branch</SelectItem><SelectItem value="existing">Work on existing</SelectItem></SelectContent></Select></div>
                    <div className="grid gap-2 py-4 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center"><label htmlFor="new-branch-prefix" className="text-sm font-semibold text-[#E8FFF0]">New branch prefix</label><div><Input id="new-branch-prefix" aria-label="New branch prefix" value={branchPrefix} disabled={!repository} onChange={(event) => { if (repository) { const prefix = event.currentTarget.value; saveBranchPrefix(repository.rootPath, prefix); setBranchPrefix(prefix); } }} className="h-9 w-full border-[#294536] bg-[#050807] font-mono text-[#E8FFF0]" /><p className="mt-1 text-xs text-[#7C9B88]">{repository ? `Default for new branches in ${repository.name}.` : "Open a repository to set its branch prefix."}</p></div></div>
                    <div className="grid gap-2 py-4 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center"><div><p className="text-sm font-semibold text-[#E8FFF0]">Default approval mode</p><p className="mt-1 text-xs text-[#7C9B88]">Used until changed in the composer.</p></div><Select value={approvalReviewerDefault} onValueChange={(value) => { if (value === "user" || value === "auto_review" || value === "yolo") setApprovalReviewerDefault(value); }}><SelectTrigger className="h-9 w-full border-[#294536] bg-[#050807] text-[#E8FFF0]" aria-label="Default approval mode"><SelectValue>{(value) => approvalReviewerLabels[value as ApprovalReviewer]}</SelectValue></SelectTrigger><SelectContent className="ios-select-content"><SelectItem value="user">Ask for approval</SelectItem><SelectItem value="auto_review">Approve for me</SelectItem><SelectItem value="yolo" title="Full access without approval prompts">YOLO mode</SelectItem></SelectContent></Select></div>
                    {(["default", "plan"] as const).map((mode) => <div key={mode} className="grid gap-2 py-4 sm:grid-cols-[140px_minmax(0,1fr)_160px] sm:items-center">
                      <p className="text-sm font-semibold text-[#E8FFF0]">{mode === "default" ? "Default mode" : "Plan mode"}</p>
                        <ModelPicker value={chatDefaults[mode].model} models={chatModels} onChange={(value) => updateChatDefault(mode, { model: value })} className="h-9 w-full truncate rounded-md border border-[#294536] bg-[#050807] px-3 text-[#E8FFF0] outline-none focus:border-[var(--ios-label)]" ariaLabel={`${mode} mode model`} />
                        <Select value={chatDefaults[mode].effort} onValueChange={(value) => { if (value) updateChatDefault(mode, { effort: value as ChatEffort }); }}>
                          <SelectTrigger className="h-9 w-full border-[#294536] bg-[#050807] text-[#E8FFF0]" aria-label={`${mode} mode effort`}><SelectValue>{() => chatDefaults[mode].effort[0].toUpperCase() + chatDefaults[mode].effort.slice(1)}</SelectValue></SelectTrigger>
                          <SelectContent className="ios-select-content">{chatEfforts.map((value) => <SelectItem key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>)}
                    <div className="grid gap-2 py-4 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center">
                      <p className="text-sm font-semibold text-[#E8FFF0]">Commit messages</p>
                      <ModelPicker value={commitMessageModel} models={chatModels} onChange={setCommitMessageModel} className="h-9 w-full truncate rounded-md border border-[#294536] bg-[#050807] px-3 text-[#E8FFF0] outline-none focus:border-[var(--ios-label)]" ariaLabel="Commit message model" />
                    </div>
                    <label className="flex items-center justify-between gap-5 py-4"><span><span className="block text-sm font-semibold text-[#E8FFF0]">Clear chat after commit</span><span className="mt-1 block text-xs text-[#7C9B88]">Off keeps the Working Copy conversation after a commit.</span></span><Switch checked={autoClearChatAfterCommit} onCheckedChange={setAutoClearChatAfterCommit} aria-label="Clear chat after commit" className="shrink-0" /></label>
                  </div>
                  <div className="mt-5">
                    <h3 className="font-semibold text-[#E8FFF0]">Favorite models</h3>
                    <p className="mt-1 text-sm text-[#7C9B88]">Quickly select these models from the chat composer.</p>
                    <div className="mt-4 max-w-sm"><ModelPicker value="" models={chatModels.filter((entry) => !favoriteModels.includes(entry.model))} onChange={(id) => setFavoriteModels((current) => current.includes(id) ? current : [...current, id])} className="h-9 w-full rounded-md border border-[#294536] bg-[#050807] px-3 text-[#E8FFF0] outline-none focus:border-[var(--ios-label)]" ariaLabel="Add favorite model" /></div>
                    {favoriteModels.length > 0 && <div className="mt-3 max-w-sm divide-y divide-[var(--ios-separator)] rounded-md border border-[#294536]">
                      {favoriteModels.map((id) => <div key={id} className="flex min-h-10 items-center gap-2 px-3 text-sm font-normal text-[#E8FFF0]"><span className="min-w-0 flex-1 truncate" title={id}>{chatModelLabel(id, chatModels)}</span><button type="button" onClick={() => setFavoriteModels((current) => current.filter((value) => value !== id))} aria-label={`Remove ${chatModelLabel(id, chatModels)} from favorites`} className="grid size-7 shrink-0 place-items-center rounded text-[#7C9B88] hover:bg-[var(--ios-fill)] hover:text-[#E8FFF0]"><X size={14} /></button></div>)}
                    </div>}
                  </div>
                </div>
                <div className="border-t border-[#294536] py-5"><div className="sm:flex sm:items-start sm:justify-between sm:gap-5"><div><h3 className="font-semibold text-[#E8FFF0]">User rules</h3><p className="mt-1 text-sm text-[#7C9B88]">Saved on this device and applied to the next message in every review conversation.</p></div><span className="mt-2 block shrink-0 text-sm text-[#7C9B88] sm:mt-0">All chats</span></div><Textarea value={userRulesDraft} onChange={(event) => setUserRulesDraft(event.currentTarget.value)} maxLength={maxUserRulesLength} placeholder="Explain everything in plain language, assuming I’m new to the topic." className="mt-4 min-h-32 resize-y rounded-md border border-[#294536] bg-[#050807] px-3 py-2 text-sm text-[#E8FFF0] outline-none placeholder:text-[#7C9B88] focus:border-[var(--ios-label)]" /><div className="mt-3 flex flex-wrap justify-end gap-2">{!!userRulesDraft && <button type="button" onClick={clearUserRules} className="quiet-button text-[#fb7185]">Clear</button>}<button type="button" disabled={userRulesDraft.trim() === userRules} onClick={saveUserRules} className="accent-button">Save rules</button></div></div>
              </div>
            </section>
          </div>
          <div hidden={settingsPage !== "mcp"} data-settings-page="mcp">
            <section className="mt-10" aria-labelledby="mcp-settings-title">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div><h2 id="mcp-settings-title" className="text-[17px] font-semibold text-[#E8FFF0]">MCP servers</h2><p className="mt-1 text-sm text-[#7C9B88]">Available to the Codex agent in new and resumed chats. Lotse's built-in server is always available. For Figma, add its MCP URL and sign in. For Slack, enter the required app credentials and user token scopes, save, then copy the generated callback URL into your Slack app.</p></div>
                <button type="button" className="quiet-button shrink-0" disabled={!mcpServersLoaded || mcpServersSaving || mcpLoginPending !== null} onClick={() => { setExpandedMcpServer(mcpServers.length); setMcpServers((current) => [...current, mcpDraft({ name: "", kind: "http", url: "", command: "", args: [], env: {}, bearerTokenEnvVar: "", oauthClientId: "", oauthCallbackUrl: "", oauthScopes: [], oauthSecretStored: false, enabled: true })]); setMcpServersSaved(false); setMcpServersDirty(true); }}><Plus size={14} /> Add server</button>
              </div>
              <fieldset disabled={!mcpServersLoaded || mcpServersSaving || mcpLoginPending !== null} className="space-y-2 min-w-0">
                {mcpServers.map((server, index) => <div key={index} className="overflow-hidden rounded-xl border border-[#294536] bg-[#111A15]">
                  <button type="button" aria-expanded={expandedMcpServer === index} aria-controls={`mcp-server-${index}-settings`} onClick={() => setExpandedMcpServer((current) => current === index ? null : index)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--ios-fill)]">
                    <ChevronDown size={16} className={`shrink-0 text-[#7C9B88] transition-transform ${expandedMcpServer === index ? "rotate-180" : ""}`} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[#E8FFF0]">{server.name.trim() || "New server"}</span><span className="block text-xs font-normal text-[#7C9B88]">{server.kind === "stdio" ? "Local command" : "HTTP URL"}</span></span>
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-normal text-[#7C9B88]"><span className={`size-1.5 rounded-full ${server.enabled ? "bg-[var(--ios-label)]" : "bg-[var(--ios-tertiary-label)]"}`} />{server.enabled ? "Enabled" : "Disabled"}</span>
                  </button>
                  <div id={`mcp-server-${index}-settings`} role="region" aria-label={`${server.name.trim() || "New server"} settings`} hidden={expandedMcpServer !== index} className="border-t border-[#294536] px-4 pb-4 pt-3">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-sm text-[#E8FFF0]"><Switch checked={server.enabled} onCheckedChange={(enabled) => updateMcpServer(index, { enabled })} aria-label={`Enable ${server.name || "MCP server"}`} /> Enabled</label>
                      <button type="button" className="quiet-button h-9 px-3 text-[#FB7185]" aria-label={`Remove ${server.name || "MCP server"}`} onClick={() => { setExpandedMcpServer((current) => current === index ? null : current !== null && current > index ? current - 1 : current); setMcpServers((current) => current.filter((_, itemIndex) => itemIndex !== index)); setMcpServersSaved(false); setMcpServersDirty(true); }}><Trash2 size={14} /> Remove</button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1 text-xs font-medium text-[#7C9B88]">Server name<Input value={server.name} onChange={(event) => updateMcpServer(index, { name: event.currentTarget.value })} placeholder="my-server" aria-label="MCP server name" className="h-9 border-[#294536] bg-[#050807] text-[#E8FFF0]" /></label>
                      <label className="grid gap-1 text-xs font-medium text-[#7C9B88]">Connection type<Select value={server.kind} onValueChange={(value) => { if (value === "http") updateMcpServer(index, { kind: value }); else if (value === "stdio") updateMcpServer(index, { kind: value, oauthClientId: "", oauthCallbackUrl: "", oauthScopesText: "", oauthClientSecret: undefined, oauthSecretStored: false }); }}><SelectTrigger className="h-9 border-[#294536] bg-[#050807] text-[#E8FFF0]" aria-label="MCP connection type"><SelectValue>{(value) => value === "stdio" ? "Local command (stdio)" : "HTTP URL"}</SelectValue></SelectTrigger><SelectContent><SelectItem value="http">HTTP URL</SelectItem><SelectItem value="stdio">Local command (stdio)</SelectItem></SelectContent></Select></label>
                      {server.kind === "http" ? <>
                      <label className="grid gap-1 text-xs font-medium text-[#7C9B88] sm:col-span-2">MCP URL<Input value={server.url} onChange={(event) => updateMcpServer(index, { url: event.currentTarget.value })} placeholder="https://example.com/mcp" aria-label="MCP URL" className="h-9 border-[#294536] bg-[#050807] text-[#E8FFF0]" /></label>
                      <label className="grid gap-1 text-xs font-medium text-[#7C9B88] sm:col-span-2">Bearer token environment variable (optional)<Input value={server.bearerTokenEnvVar} onChange={(event) => updateMcpServer(index, { bearerTokenEnvVar: event.currentTarget.value })} placeholder="MCP_API_TOKEN" aria-label="MCP bearer token environment variable" className="h-9 border-[#294536] bg-[#050807] text-[#E8FFF0]" /><span className="font-normal text-[#7C9B88]">The variable must be available to Lotse when it starts.</span></label>
                      <label className="grid gap-1 text-xs font-medium text-[#7C9B88]">OAuth client ID {isSlackMcp(server.url) ? "(required for Slack)" : "(optional)"}<Input value={server.oauthClientId ?? ""} onChange={(event) => updateMcpServer(index, { oauthClientId: event.currentTarget.value })} placeholder="OAuth client ID" aria-label="OAuth client ID" className="h-9 border-[#294536] bg-[#050807] text-[#E8FFF0]" /></label>
                      <label className="grid gap-1 text-xs font-medium text-[#7C9B88]">OAuth client secret (~/.lotse/credentials.json)<Input type="password" value={server.oauthClientSecret ?? ""} onChange={(event) => updateMcpServer(index, { oauthClientSecret: event.currentTarget.value })} placeholder={server.oauthError ? "Saved secret unavailable" : server.oauthSecretStored ? "Stored in ~/.lotse/credentials.json" : isSlackMcp(server.url) ? "Required for Slack" : "Optional"} aria-label="OAuth client secret" className="h-9 border-[#294536] bg-[#050807] text-[#E8FFF0]" /></label>
                      {server.oauthSecretStored && <button type="button" className="quiet-button w-fit text-[#FB7185] sm:col-span-2" onClick={() => updateMcpServer(index, { oauthClientSecret: "", oauthSecretStored: false })}>Remove stored OAuth secret</button>}
                      <label className="grid gap-1 text-xs font-medium text-[#7C9B88] sm:col-span-2">OAuth callback URL {isSlackMcp(server.url) && "(required for Slack)"}<Input value={server.oauthCallbackUrl ?? ""} onChange={(event) => updateMcpServer(index, { oauthCallbackUrl: event.currentTarget.value })} placeholder="http://localhost:43123/callback" aria-label="OAuth callback URL" className="h-9 border-[#294536] bg-[#050807] text-[#E8FFF0]" /><span className="font-normal text-[#7C9B88]">Save to generate the complete callback URL, then copy it into your provider app. Keep the host, port, and full path unchanged.</span></label>
                      {!!server.oauthClientId && !!server.oauthCallbackUrl && !mcpServersDirty && <button type="button" className="quiet-button w-fit sm:col-span-2" onClick={() => { void navigator.clipboard.writeText(server.oauthCallbackUrl).catch((reason) => setMcpServersError(`Could not copy callback URL: ${message(reason)}`)); }}><Copy size={14} /> Copy callback URL</button>}
                      {isSlackMcp(server.url) && <p className="text-xs text-[#7C9B88] sm:col-span-2">Use User Token Scopes in Slack OAuth &amp; Permissions. Enable MCP under Agents in your Slack app; your workspace may require admin approval. <button type="button" className="underline" onClick={() => { void openUrl("https://docs.slack.dev/ai/slack-mcp-server/developing/").catch((reason) => setMcpServersError(message(reason))); }}>Slack setup guide</button></p>}
                      {server.oauthError && <p role="alert" className="text-xs text-[#FB7185] sm:col-span-2">{server.oauthError}</p>}
                      <label className="grid gap-1 text-xs font-medium text-[#7C9B88] sm:col-span-2">OAuth scopes {isSlackMcp(server.url) ? "(required Slack user token scopes)" : "(space or comma separated)"}<Input value={server.oauthScopesText} onChange={(event) => updateMcpServer(index, { oauthScopesText: event.currentTarget.value })} placeholder="search:read.public channels:history" aria-label="OAuth scopes" className="h-9 border-[#294536] bg-[#050807] text-[#E8FFF0]" /></label>
                      {!server.bearerTokenEnvVar && <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                        <button type="button" className="quiet-button" disabled={!server.enabled || mcpServersDirty || mcpLoginPending !== null} onClick={() => void loginMcp(server.name)}>{mcpLoginPending === server.name ? mcpLoginStarted === server.name ? "Waiting for sign-in…" : "Opening sign-in…" : mcpAuthStatuses[server.name]?.toLowerCase() === "oauth" ? "Reconnect OAuth" : "Connect with OAuth"}</button>
                        <span role="status" className="text-xs text-[#7C9B88]">{mcpServersDirty ? "Save servers before connecting." : mcpLoginStarted === server.name ? "Complete sign-in in your browser." : mcpAuthStatuses[server.name]?.toLowerCase() === "oauth" ? "Signed in with OAuth" : mcpAuthStatuses[server.name] === "missingSecret" ? "Saved secret missing" : mcpAuthStatuses[server.name] === "notLoggedIn" ? "Sign-in required" : ""}</span>
                      </div>}
                      </> : <>
                      <label className="grid gap-1 text-xs font-medium text-[#7C9B88] sm:col-span-2">Command<Input value={server.command} onChange={(event) => updateMcpServer(index, { command: event.currentTarget.value })} placeholder="/absolute/path/to/server" aria-label="MCP command" className="h-9 border-[#294536] bg-[#050807] text-[#E8FFF0]" /></label>
                      <label className="grid gap-1 text-xs font-medium text-[#7C9B88]">Arguments, one per line<Textarea value={server.argsText} onChange={(event) => updateMcpServer(index, { argsText: event.currentTarget.value })} aria-label="MCP command arguments" className="min-h-24 border-[#294536] bg-[#050807] font-mono text-[#E8FFF0]" /></label>
                      <label className="grid gap-1 text-xs font-medium text-[#7C9B88]">Environment, KEY=value per line<Textarea value={server.envText} onChange={(event) => updateMcpServer(index, { envText: event.currentTarget.value })} aria-label="MCP environment variables" className="min-h-24 border-[#294536] bg-[#050807] font-mono text-[#E8FFF0]" /></label>
                      </>}
                    </div>
                  </div>
                </div>)}
                {mcpServersLoaded && mcpServers.length === 0 && <p className="rounded-xl border border-[#294536] bg-[#111A15] px-5 py-4 text-sm text-[#7C9B88]">No additional MCP servers configured.</p>}
              </fieldset>
              {mcpLoginPending && <div role="status" className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-[#294536] p-3 text-sm text-[#7C9B88]"><span>{mcpLoginStarted ? `Complete ${mcpLoginPending} sign-in in your browser, or cancel to retry.` : `Opening ${mcpLoginPending} sign-in…`}</span><button type="button" className="quiet-button shrink-0" disabled={!mcpLoginStarted || mcpLoginCancelling} onClick={() => void cancelMcpLogin()}>{mcpLoginCancelling ? "Cancelling…" : "Cancel sign-in"}</button></div>}
              {mcpServersError && <p role="alert" className="mt-3 text-sm text-[#FB7185]">{mcpServersError}</p>}
              {mcpServersSaved && <p role="status" className="mt-3 text-sm text-[#7C9B88]">MCP servers saved. Changes apply to the next chat turn.</p>}
              <div className="mt-4 flex justify-end"><button type="button" className="accent-button" disabled={!mcpServersLoaded || mcpServersSaving || mcpLoginPending !== null || !mcpServersDirty} onClick={() => void saveMcpServers()}>{mcpServersSaving ? "Saving…" : "Save MCP servers"}</button></div>
            </section>
          </div>
          <div hidden={settingsPage !== "github"} data-settings-page="github">
            <GitHubSettings github={githubInbox} />
          </div>
          <div hidden={settingsPage !== "credentials"} data-settings-page="credentials">
            {browserSupported && <WebsiteCredentialsSettings />}
          </div>
          <div hidden={settingsPage !== "repository"} data-settings-page="repository">
            <section className="mt-10">
              <h2 className="mb-4 text-[17px] font-semibold text-[#E8FFF0]">Git & commands</h2>
              <div className="overflow-hidden rounded-xl border border-[#294536] bg-[#111A15] px-5">
                <label className="flex cursor-pointer items-center justify-between gap-5 py-5 text-[#E8FFF0]">
                  <span><span className="block font-semibold">Automatically fetch and pull branches</span><span className="mt-1 block text-sm text-[#7C9B88]">On branch switch or task start from a branch, fetch origin and fast forward tracked local branches.</span></span>
                  <Switch checked={autoFetchPullOnBranchSwitch} onCheckedChange={setAutoFetchPullOnBranchSwitch} aria-label="Automatically fetch and pull branches" className="shrink-0" />
                </label>
                <div className="border-t border-[#294536]" />
                <div className="py-5 sm:flex sm:items-start sm:justify-between sm:gap-5">
                  <div><h3 className="font-semibold text-[#E8FFF0]">Run command</h3><p className="mt-1 text-sm text-[#7C9B88]">{repository ? "Runs from the repository root." : "Open a repository to configure a command."}</p></div>
                  <div className="mt-3 w-full sm:mt-0 sm:max-w-sm"><Input value={settingsRunCommandDraft} disabled={!repository} onChange={(event) => setSettingsRunCommandDraft(event.currentTarget.value)} placeholder="npm test" className="h-9 w-full rounded-md border border-[#294536] bg-[#050807] px-3 text-sm text-[#E8FFF0] outline-none placeholder:text-[#7C9B88] focus:border-[var(--ios-label)] disabled:opacity-50" /><div className="mt-3 flex flex-wrap justify-end gap-2">{!!runCommand && <button type="button" onClick={() => { saveRunCommand(""); setSettingsRunCommandDraft(""); }} className="quiet-button text-[#fb7185]">Remove</button>}<button type="button" disabled={!repository || !settingsRunCommandDraft.trim()} onClick={() => saveRunCommand(settingsRunCommandDraft)} className="accent-button">Save command</button></div></div>
                </div>
                <div className="border-t border-[#294536] py-5 sm:flex sm:items-start sm:justify-between sm:gap-5">
                  <div><h3 className="font-semibold text-[#E8FFF0]">Orphaned worktrees</h3><p className="mt-1 text-sm text-[#7C9B88]">Remove Lotse worktrees left behind by deleted tasks in this repository. Git branches remain.</p>{worktreeCleanupStatus && <p role={worktreeCleanupStatus.error ? "alert" : "status"} className={`mt-2 text-sm ${worktreeCleanupStatus.error ? "text-[#FB7185]" : "text-[#7C9B88]"}`}>{worktreeCleanupStatus.message}</p>}</div>
                  <button type="button" onClick={() => void cleanUpOrphanedWorktrees()} disabled={!repository || taskStorageRoot !== repository.rootPath || worktreeCleanupBusy} className="quiet-button mt-3 shrink-0 disabled:opacity-50 sm:mt-0">{worktreeCleanupBusy ? "Working…" : "Clean up worktrees"}</button>
                </div>
              </div>
            </section>
          </div>
          <div hidden={settingsPage !== "diagnostics"} data-settings-page="diagnostics">
            <section className="mt-10 pb-8">
              <h2 className="mb-4 text-[17px] font-semibold text-[#E8FFF0]">Troubleshooting</h2>
              <div className="overflow-hidden rounded-xl border border-[#294536] bg-[#111A15] px-5 py-5 sm:flex sm:items-center sm:justify-between sm:gap-5">
                <div><h3 className="font-semibold text-[#E8FFF0]">Agent diagnostics</h3><p className="mt-1 text-sm text-[#7C9B88]">View troubleshooting information for the bundled Codex agent.</p></div>
                <button type="button" onClick={() => void invoke("agent_open_diagnostics")} className="secondary-button mt-4 sm:mt-0">Open diagnostics</button>
              </div>
            </section>
          </div>
        </SettingsLayout>
      )}
      <div
        ref={taskGridRef}
        className={`${settingsOpen ? "hidden " : ""}grid min-h-0 flex-1`}
        style={{
          gridTemplateColumns: memoryMode && repository
            ? `${sidebarWidths.left}px minmax(0, 1fr)`
            : zenMode
            ? "minmax(0, 1fr)"
            : tasksTabActive && boardMode && repository
            ? "minmax(0, 1fr)"
            : tasksTabActive && repository
            ? `${taskColumns.tasks}px minmax(0, 1fr) ${taskColumns.changes}px`
            : repository
            ? `${sidebarWidths.left}px minmax(0, 1fr) min(${sidebarWidths.right}px, max(0px, calc(100% - ${sidebarWidths.left}px)))`
            : `${sidebarWidths.left}px minmax(0, 1fr)`,
        }}
      >
        {repository && <MemoryWorkspace key={repository.rootPath} repositoryRoot={repository.rootPath} flushRef={memoryFlushRef} visible={memoryMode} />}
        {!zenMode && !tasksTabActive && !memoryMode && <aside className="ios-file-list relative z-10 mt-[-52px] flex h-[calc(100%+52px)] min-h-0 flex-col border-r border-[#294536] bg-[#0B110E]">
          <div
            data-tauri-drag-region
            onMouseDown={startDragging}
            className="ios-sidebar-titlebar flex h-[52px] shrink-0 items-center border-b border-[#294536] pl-[88px] pr-2"
          >
            <span className="truncate text-sm font-semibold text-[#E8FFF0]">{repository ? repository.name : "Open repository"}</span>
          </div>
          <div className="ios-file-sidebar-header">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[13px] font-semibold text-[#7C9B88]">Changes</h2>
              <DropdownMenu>
                <DropdownMenuTrigger className="ios-sidebar-more-button" aria-label="File list options" title="File list options"><Ellipsis size={17} /></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40 border border-[#294536] bg-[#111A15] p-1.5">
                  <DropdownMenuItem onClick={() => setExpandedFolders(expandedFolderPaths(visibleFiles))}>Expand all</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setExpandedFolders(new Set())}>Collapse all</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="ios-sidebar-context mt-2 flex-col items-stretch gap-1">
              <span className="ios-comparison-selector-wrap">
                <GitBranch size={13} className="ios-comparison-selector-icon" />
                <Popover open={branchPickerOpen} onOpenChange={(open) => {
                  setBranchPickerOpen(open);
                  if (open) void invoke<BranchRefs>("list_branch_refs").then(setBranchRefs).catch((reason) => setError(message(reason)));
                  else setBranchFilter("");
                }}>
                  <PopoverTrigger disabled={branchActionBusy} aria-label="Switch branch" className="ios-comparison-selector flex items-center">
                    <span className="flex-1 truncate text-left">{branchSwitching ? "Switching branch…" : repository?.currentBranch ?? "Detached HEAD"}</span>
                    {branchSwitching ? <LoaderCircle size={14} className="animate-spin" /> : <ChevronDown size={14} />}
                  </PopoverTrigger>
                  <PopoverContent align="start" className="ios-branch-menu">
                    <div className="ios-branch-filter">
                      <Input autoFocus value={branchFilter} onChange={(event) => setBranchFilter(event.currentTarget.value)} placeholder="Filter branches" aria-label="Filter branches" />
                      {repository?.hasOrigin && <div className="ios-branch-sync-actions">
                        <button type="button" disabled={branchActionBusy} onClick={() => void fetchBranches()} className="ios-branch-fetch">
                          {branchesFetching ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />} {branchesFetching ? "Fetching…" : "Fetch"}
                        </button>
                        <button type="button" disabled={branchActionBusy} onClick={() => discardFileEdit(() => void pullBranch())} className="ios-branch-fetch">
                          {branchPulling ? <LoaderCircle size={14} className="animate-spin" /> : <ArrowDown size={14} />} {branchPulling ? "Pulling…" : "Pull"}
                          {branchRefs?.pullCount != null && branchRefs.pullCount > 0 && ` (${branchRefs.pullCount})`}
                        </button>
                        <button type="button" disabled={branchActionBusy || !repository.currentBranch} onClick={() => void pushBranch()} className="ios-branch-fetch">
                          {branchPushing ? <LoaderCircle size={14} className="animate-spin" /> : <ArrowUp size={14} />} {branchPushing ? "Pushing…" : "Push"}
                          {branchRefs?.pushCount != null && branchRefs.pushCount > 0 && ` (${branchRefs.pushCount})`}
                        </button>
                      </div>}
                    </div>
                    <div className="ios-branch-separator" />
                    <div className="ios-branch-list">
                      <p className="ios-branch-heading">Local branches</p>
                      <BranchTreeView tree={localBranchTree} parentPath="local" depth={0} expandedFolders={expandedBranchFolders} forceExpanded={!!branchFilterTerm} currentBranch={repository?.currentBranch} disabled={branchActionBusy} onToggle={toggleBranchFolder} onSelect={(branch) => discardFileEdit(() => void switchBranch(branch))} />
                      {remoteBranches.length ? <>
                        <div className="ios-branch-separator" />
                        <p className="ios-branch-heading">Remote branches</p>
                        <BranchTreeView tree={remoteBranchTree} parentPath="origin" depth={0} expandedFolders={expandedBranchFolders} forceExpanded={!!branchFilterTerm} currentBranch={repository?.currentBranch ? `origin/${repository.currentBranch}` : null} disabled={branchActionBusy} onToggle={toggleBranchFolder} onSelect={(branch) => discardFileEdit(() => void switchBranch(branch))} />
                      </> : null}
                      {!localBranches.length && !remoteBranches.length && <p className="px-2 py-3 text-sm text-[#7C9B88]">No matching branches</p>}
                    </div>
                  </PopoverContent>
                </Popover>
              </span>
              <div className="ios-sidebar-divider" aria-hidden="true" />
              <span className="ios-comparison-selector-wrap">
                <GitCompareArrows size={13} className="ios-comparison-selector-icon" />
                <Select value={comparisonMode === "branch" ? baseRef : "workingCopy"} onValueChange={(value) => {
                  if (value === null) return;
                  if (value === "workingCopy") switchComparisonMode("workingCopy");
                  else selectBranchComparison(value);
                }}>
                  <SelectTrigger aria-label="Comparison context" className="ios-comparison-selector"><SelectValue>{(value) => value === "workingCopy" ? "Working Copy" : repository?.currentBranch ? `${value} → ${repository.currentBranch}` : value}</SelectValue></SelectTrigger>
                  <SelectContent className="ios-select-content ios-comparison-select-content">
                    <SelectItem value="workingCopy">{repository?.currentBranch ? `Working Copy · ${repository.currentBranch}` : "Working Copy"}</SelectItem>
                    {repository?.currentBranch && branchRefs?.refs.some((ref) => ref !== repository.currentBranch) && (
                      <SelectGroup>
                        <SelectLabel>Compare with {repository.currentBranch}</SelectLabel>
                        {branchRefs.refs.filter((ref) => ref !== repository.currentBranch).map((ref) => (
                          <SelectItem key={ref} value={ref}>{ref} → {repository.currentBranch}</SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
              </span>
            </div>
            <div className="ios-sidebar-divider ios-sidebar-search-divider" aria-hidden="true" />
            <label className="ios-sidebar-search mt-2">
              <Search size={13} />
              <input
                value={filter}
                onChange={(event) => setFilter(event.currentTarget.value)}
                placeholder="Search files"
                className="min-w-0 flex-1 bg-transparent text-sm text-[#E8FFF0] outline-none placeholder:text-[#7C9B88]"
              />
            </label>
          </div>
          <nav className="ios-source-list min-h-0 flex-1 overflow-y-auto" aria-label="Changed files">
            <FileTreeView
              tree={fileTree}
              parentPath=""
              depth={0}
              expandedFolders={expandedFolders}
              approvedFiles={approvedFiles}
              onToggle={toggleFolder}
              selectedPath={selectedFile?.path}
              onSelect={(file) => { setWorkspaceMode("workspace"); selectChangedFile(file); }}
            />
            {repository && comparison && !visibleFiles.length && (
              <p className="px-2 py-8 text-center text-sm text-[#7C9B88]">No matching files</p>
            )}
          </nav>
          {comparisonMode === "workingCopy" && comparison?.files.length ? (
            <section className="ios-commit-section" aria-label={repository?.hasOrigin ? "Commit and push changes" : "Commit changes"}>
              <div className="ios-chat-composer">
                <textarea
                  value={commitMessage}
                  onChange={(event) => setCommitMessage(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                      event.preventDefault();
                      void commitChanges();
                    }
                  }}
                  disabled={commitRunning || commitGenerating || fileEditDirty}
                  maxLength={4_000}
                  rows={2}
                  placeholder="Commit message"
                  aria-label="Commit message"
                  className="ios-chat-textarea ios-commit-message"
                />
                <div className="ios-commit-actions">
                  <button type="button" onClick={() => void generateCommitMessage()} disabled={commitRunning || commitGenerating || fileEditDirty} className="ios-commit-generate">
                    {commitGenerating ? <LoaderCircle size={13} className="animate-spin" /> : <Sparkles size={13} />} {commitGenerating ? "Generating…" : "Generate"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void commitChanges()}
                    disabled={!commitMessage.trim() || commitRunning || commitGenerating || aiChatRunning || fileEditDirty}
                    className="accent-button ios-commit-button"
                  >
                    {commitRunning ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={15} />}
                    {commitRunning ? repository?.hasOrigin ? "Committing & pushing…" : "Committing…" : repository?.hasOrigin ? "Commit & Push" : "Commit"}
                  </button>
                </div>
              </div>
              <p className="ios-commit-caption">{repository?.hasOrigin ? "Stages, commits, and pushes all current changes." : "Stages and commits all current changes."} ⌘↵ to run.</p>
            </section>
          ) : null}
          <button
            type="button"
            aria-label="Resize file sidebar"
            onPointerDown={(event) => startResizing("left", event)}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") resizeSidebar("left", sidebarWidths.left - 16);
              if (event.key === "ArrowRight") resizeSidebar("left", sidebarWidths.left + 16);
            }}
            className="sidebar-resize-handle right-[-4px]"
          />
        </aside>}

        <section
          className={`ios-workspace min-h-0 min-w-0 flex-col bg-[#0B110E] ${tasksTabActive ? "task-mode-list relative border-r border-[#294536]" : ""} ${tasksTabActive && !boardMode ? "mt-[-52px] h-[calc(100%+52px)]" : ""} ${memoryMode || agentChatExpanded || zenMode ? "hidden" : "flex"}`}
          style={{ gridColumn: tasksTabActive ? "1" : repository ? undefined : "2" }}
        >
          {tasksTabActive && !boardMode && <div data-tauri-drag-region onMouseDown={startDragging} className="ios-sidebar-titlebar flex h-[52px] shrink-0 items-center border-b border-[#294536] pl-[88px] pr-2"><span className="truncate text-sm font-semibold text-[#E8FFF0]">{repository?.name ?? "Tasks"}</span></div>}
          {!tasksTabActive && error && !(comparisonMode === "branch" && !comparison) && (
            <div role="alert" className="ios-error-banner flex min-h-12 shrink-0 items-center gap-3 border-b border-[#482631] bg-[#25151b] px-4 py-2 text-sm font-medium text-[#FB7185]">
              <CircleAlert size={16} className="shrink-0" />
              <span className="min-w-0 flex-1 break-words">{error}</span>
              <button type="button" onClick={() => setError("")} className="ml-4 text-[#fb7185]">
                Dismiss
              </button>
            </div>
          )}
          <div className="min-h-0 flex flex-1 flex-col">
          {tasksTabActive ? (
            <>
              <div className="ios-file-sidebar-header task-list-header flex shrink-0 items-center justify-between gap-3">
                <div className="flex items-center gap-3"><h2>Tasks</h2><div role="group" aria-label="Task view" className="task-view-switch"><button type="button" aria-pressed={taskView === "list"} onClick={() => { setTaskView("list"); setBoardAddingSubtaskId(null); }}><ListTodo size={14} /> List</button><button type="button" aria-pressed={taskView === "kanban"} onClick={() => { setTaskView("kanban"); }}><LayoutGrid size={14} /> Kanban</button><button type="button" aria-pressed={taskView === "gantt"} onClick={() => { setTaskView("gantt"); }}><ChartGantt size={14} /> Gantt</button></div></div>
                <NewTaskButton key={repository?.rootPath} onCreate={({ status, ...draft }) => createTask(null, status, draft)} />
              </div>
              {taskView === "gantt" ? <TaskGantt tasks={tasks} groups={boardGroups} onOpenTask={(task) => openBoardTask(task, "detail")} renderTaskOptions={renderTaskOptions} renderStatusOptions={(group) => renderStatusOptions(group.status, group.label)} renderAgentStatus={(task) => {
                const run = taskRuns[task.id];
                const attention = taskAttention(task, run);
                if (run?.input || run?.approval) {
                  const label = run.input ? "Agent awaiting input" : "Agent awaiting approval";
                  return <span role="img" aria-label={label} title={label} className="task-attention task-attention-waiting"><CircleAlert size={12} /></span>;
                }
                if (run || taskStartingIds.has(task.id)) return <span role="img" aria-label="Agent working" title={run?.status ?? "Agent starting"}><LoaderCircle size={13} className="animate-spin" /></span>;
                return attention ? <span role="img" aria-label={attention} title={attention} className="task-attention"><CircleAlert size={12} /></span> : null;
              }} /> : taskView === "kanban" ? <div className="task-board-scroll min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-4 pb-4"><div className="task-board flex h-full min-h-0 items-stretch gap-3"><DragDropProvider onDragMove={previewBoardDrag} onDragOver={overBoardDrag} onDragEnd={endBoardDrag}>
                {boardGroups.map((group) => {
                  const draftKey = `status:${group.status}`;
                  return <Fragment key={group.key}><BoardColumnTarget id={group.key} board>{({ ref, isDropTarget }) => <section ref={ref} data-drop-target={boardDropTarget?.status === group.status || isDropTarget} className={`task-board-column flex h-full min-h-0 flex-col rounded-xl border ${boardDropTarget?.status === group.status || isDropTarget ? "border-[#A3FF12] bg-[#183522]" : "border-[#294536] bg-[#111A15]"}`} aria-label={`${group.label} tasks`}>
                    <header className="flex min-h-12 items-center gap-2 border-b border-[#294536] px-3">
                      <ListTodo size={15} className="text-[#7C9B88]" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{group.label}</span>
                      <span className="text-xs text-[#7C9B88]">{group.tasks.length}</span>
                      {renderStatusOptions(group.status, group.label)}
                    </header>
                    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-2">{group.tasks.map((task, index) => {
                      const parent = task.parentId ? tasks.find((item) => item.id === task.parentId) : null;
                      const run = taskRuns[task.id];
                      const attention = taskAttention(task, run);
                      const status = task.completed ? "Done" : run?.input ? "Awaiting input" : task.manualStatus === "inProgress" ? "In development" : task.manualStatus === "inReview" ? "In review" : run ? "Working…" : task.manualStatus === "inbox" ? "Inbox" : "Needs planning";
                      const color = taskColors.find((item) => item.value === task.color)!;
                      const visibleCustomFields = customFields.filter((field) => field.showOnCards && taskCustomFieldLabel(task, field));
                      return <SortableBoardTask key={task.id} id={task.id} index={index} group={group.key}>{({ ref, isDragging }) => <div ref={ref} tabIndex={0} role="group" data-drop-position={boardDropTarget?.taskId === task.id ? boardDropTarget.position : undefined} aria-label={`Drag ${task.title}`} onClick={(event) => { if (event.currentTarget.contains(event.target as Node) && !event.defaultPrevented && !(event.target as HTMLElement).closest("button, input, textarea")) openBoardTask(task); }} className={`task-board-card rounded-lg border bg-[#0B110E] p-3 ${isDragging ? "task-row-dragging" : ""}`} style={{ borderLeftColor: task.color === "clear" ? undefined : color.color, borderLeftWidth: task.color === "clear" ? undefined : 3 }}>
                        <div className="flex items-start gap-2"><button type="button" onClick={() => openBoardTask(task)} className="pointer-events-none min-w-0 flex-1 break-words text-left text-sm font-medium text-[#E8FFF0] hover:underline">{task.title}</button>{renderTaskOptions(task)}</div>
                        {parent && <p className="mt-1 truncate text-[11px] text-[#7C9B88]" title={parent.title}>↳ {parent.title}</p>}
                        <div className="mt-2 flex flex-wrap items-start gap-x-3 gap-y-1"><span className="shrink-0 text-xs text-[#7C9B88]">{status}</span>{visibleCustomFields.map((field) => <span key={field.id} className={`min-w-0 max-w-full border-l border-[#7C9B88]/35 pl-3 text-xs text-[#7C9B88] ${field.multiline ? "whitespace-pre-wrap [overflow-wrap:anywhere]" : "truncate"}`} title={`${field.name}: ${taskCustomFieldLabel(task, field)}`}>{field.name}: <TaskCustomFieldValue task={task} field={field} /></span>)}{attention && <span role="status" className={`task-attention ${run?.input || run?.approval ? "task-attention-waiting" : ""}`}><CircleAlert size={12} />{attention}</span>}{run && !run.input && !run.approval && <LoaderCircle size={13} className="shrink-0 animate-spin" aria-label="Task running" />}</div>
                        {boardAddingSubtaskId === task.id && <form onSubmit={(event) => { event.preventDefault(); createTask(task.id, group.status); }} className="mt-2 flex gap-1"><Input autoFocus value={newTaskDrafts[task.id] ?? ""} onChange={(event) => { const value = event.currentTarget.value; setNewTaskDrafts((current) => ({ ...current, [task.id]: value })); }} onKeyDown={(event) => { if (event.key === "Escape") setBoardAddingSubtaskId(null); }} placeholder="Subtask title" aria-label={`New subtask for ${task.title}`} className="h-8 min-w-0 flex-1 px-2 text-xs" /><button type="submit" className="quiet-button h-8 px-2 text-xs">Add</button></form>}
                      </div>}</SortableBoardTask>;
                    })}</div>
                    <form onSubmit={(event) => { event.preventDefault(); createTask(null, group.status); }} className="flex shrink-0 gap-1 border-t border-[#294536] p-2"><Input value={newTaskDrafts[draftKey] ?? ""} onChange={(event) => { const value = event.currentTarget.value; setNewTaskDrafts((current) => ({ ...current, [draftKey]: value })); }} placeholder="Add task…" aria-label={`Add task to ${group.label}`} className="h-8 min-w-0 flex-1 px-2 text-xs" /><button type="submit" className="quiet-button h-8 px-2 text-xs" aria-label={`Create task in ${group.label}`}><Plus size={15} /></button></form>
                  </section>}</BoardColumnTarget></Fragment>;
                })}
              </DragDropProvider></div></div> : <div className="task-list-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-3">
              <div className="w-full">
                <DragDropProvider onDragEnd={endTaskDrag}>
                <div className="task-list">
                  {taskGroups.map((group) => <Fragment key={group.key}>
                    <BoardColumnTarget id={group.key}>{({ ref, isDropTarget }) => <div ref={ref} className={`task-status-row flex min-h-10 items-center gap-2 px-3 py-1.5 ${isDropTarget ? "bg-[#294536] ring-1 ring-inset ring-[#52745d]" : ""}`}>
                      <button type="button" aria-expanded={!collapsedTaskIds.has(group.key)} aria-label={`${collapsedTaskIds.has(group.key) ? "Expand" : "Collapse"} ${group.label}`} onClick={() => setCollapsedTaskIds((current) => { const next = new Set(current); if (next.has(group.key)) next.delete(group.key); else next.add(group.key); return next; })} className="grid size-5 shrink-0 place-items-center text-[#7C9B88]">{collapsedTaskIds.has(group.key) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</button>
                      <ListTodo size={15} className="shrink-0 text-[#7C9B88]" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#E8FFF0]">{group.label}</span>
                      <span className="text-xs text-[#7C9B88]">{group.tasks.length}</span>
                      {renderStatusOptions(group.status, group.label)}
                    </div>}</BoardColumnTarget>
                    {!collapsedTaskIds.has(group.key) && <>
                    {group.tasks.map((task) => {
                  const index = visibleTaskIndexes.get(task.id)!;
                  const run = taskRuns[task.id];
                  const attention = taskAttention(task, run);
                  const hasChildren = taskLayout.parents.has(task.id);
                  const collapsed = collapsedTaskIds.has(task.id);
                  const color = taskColors.find((item) => item.value === task.color)!;
                  const status = task.completed ? "Done" : run?.input ? "Awaiting input" : task.manualStatus === "inProgress" ? "In development" : task.manualStatus === "inReview" ? "In review" : run ? null : task.manualStatus === "inbox" ? "Inbox" : "Needs planning";
                  const readyToPlan = !task.completed && (task.manualStatus === null || task.manualStatus === "inbox") && !run && !task.planReady;
                  const closingParents = taskLayout.closingParents.get(task.id) ?? [];
                  return <SortableTask key={task.id} id={task.id} index={index}>{({ ref, handleRef, isDragging }) => <Fragment><div ref={ref} onClick={(event) => { if (!(event.target as HTMLElement).closest("button, input, textarea")) openBoardTask(task); }} style={{ paddingLeft: `${12 + taskLayout.depths.get(task.id)! * 16}px` }} className={`task-row grid gap-2 py-2 pr-3 ${isDragging ? "task-row-dragging" : ""} ${selectedTaskId === task.id ? "bg-[#183522]" : "hover:bg-[#111A15]"}`}>
                  <button ref={handleRef} type="button" className="task-drag-handle mt-[2px] self-start" aria-label={`Drag ${task.title}`}><GripVertical size={16} /></button>
                  <button type="button" role="checkbox" aria-checked={task.completed} onClick={() => updateTask(task.id, (current) => ({ ...current, completed: !current.completed, manualStatus: null }))} style={{ borderColor: task.color === "clear" ? undefined : color.color, borderWidth: task.color === "clear" ? 1 : 2, backgroundColor: task.completed && task.color !== "clear" ? color.color : undefined, color: task.completed && task.color !== "clear" ? "white" : undefined }} className="task-check mt-[3px] grid size-6 shrink-0 self-start place-items-center rounded-full border text-[#39FF88]">{task.completed && <Check size={13} />}</button>
                  <div className="task-row-content min-w-0">
                    <div className="task-row-heading flex min-w-0 items-start gap-1">
                      {hasChildren && <button type="button" aria-expanded={!collapsed} aria-label={`${collapsed ? "Expand" : "Collapse"} ${task.title}`} onClick={(event) => { event.stopPropagation(); setCollapsedTaskIds((current) => { const next = new Set(current); if (next.has(task.id)) next.delete(task.id); else next.add(task.id); return next; }); }} className="mt-[3px] grid size-6 shrink-0 place-items-center text-[#7C9B88] hover:text-[#E8FFF0]">{collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</button>}
                      <button type="button" onClick={() => openBoardTask(task)} className={`min-w-0 flex-1 break-words text-left text-sm font-medium ${task.completed ? "line-through opacity-60" : ""}`}>{task.title}</button>
                    </div>
                    {(run || status || attention) && <div className="task-row-meta flex flex-wrap items-center gap-1.5 text-xs text-[#7C9B88]">{run && !run.input && !run.approval && <LoaderCircle size={14} className="animate-spin" aria-label="Planning" />}{status}{attention && <span role="status" className={`task-attention ${run?.input || run?.approval ? "task-attention-waiting" : ""}`}><CircleAlert size={12} />{attention}</span>}</div>}
                    {customFields.filter((field) => field.showOnCards && taskCustomFieldLabel(task, field)).map((field) => <div key={field.id} className={`text-xs text-[var(--ios-secondary-label)] ${field.multiline ? "whitespace-pre-wrap [overflow-wrap:anywhere]" : "truncate"}`} title={`${field.name}: ${taskCustomFieldLabel(task, field)}`}>{field.name}: <TaskCustomFieldValue task={task} field={field} /></div>)}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="task-status-button mt-[3px] self-start" aria-label="Task options" title="Task options"><Ellipsis size={15} /></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-40">
                      {readyToPlan && <DropdownMenuItem onClick={() => { selectTask(task); void sendTaskMessage(task, "plan", task.title); }}>Start planning</DropdownMenuItem>}
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>Status</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => setTaskStatus(task.id, "inbox")}>Inbox{!task.completed && task.manualStatus === "inbox" && <Check className="ml-auto" />}</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setTaskStatus(task.id, "clear")}>Needs planning{!task.completed && !task.manualStatus && <Check className="ml-auto" />}</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setTaskStatus(task.id, "inProgress")}>In development{!task.completed && task.manualStatus === "inProgress" && <Check className="ml-auto" />}</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setTaskStatus(task.id, "inReview")}>In review{!task.completed && task.manualStatus === "inReview" && <Check className="ml-auto" />}</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setTaskStatus(task.id, "done")}>Done{task.completed && <Check className="ml-auto" />}</DropdownMenuItem>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuLabel className="flex items-center gap-1.5"><Palette size={13} /> Color label</DropdownMenuLabel>
                        {taskColors.map((item) => <DropdownMenuItem key={item.value} onClick={() => updateTask(task.id, (current) => ({ ...current, color: item.value }))}><span className={`task-color-dot ${item.value === "clear" ? "task-color-dot-clear" : ""}`} style={{ backgroundColor: item.color }} />{item.label}{task.color === item.value && <Check className="ml-auto" />}</DropdownMenuItem>)}
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" disabled={protectedTaskIds.has(task.id)} onClick={() => confirmDeleteTasks(taskSubtreeIds(tasks, [task.id]))}><Trash2 size={13} /> Delete task</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>{closingParents.map((parent) => <TaskCreateRow key={`new-${parent.id}`} depth={taskLayout.depths.get(parent.id)! + 1} parent value={newTaskDrafts[parent.id] ?? ""} onChange={(value) => setNewTaskDrafts((current) => ({ ...current, [parent.id]: value }))} onSubmit={() => createTask(parent.id, taskBoardStatus(parent))} />)}</Fragment>}</SortableTask>})}
                    <TaskCreateRow depth={0} parent={false} value={newTaskDrafts[`status:${group.status}`] ?? ""} onChange={(value) => setNewTaskDrafts((current) => ({ ...current, [`status:${group.status}`]: value }))} onSubmit={() => createTask(null, group.status)} />
                    </>}
                  </Fragment>)}
                </div>
                </DragDropProvider>
              </div>
              </div>}
            </>
          ) : selectedFile && comparison ? (
            <>
              <div className="ios-file-toolbar h-14 shrink-0 border-b border-[#294536] px-4">
                <div className="ios-file-title flex min-w-0 items-center gap-2">
                  <FileCode2 size={16} className="shrink-0 text-[#A3FF12]" />
                  <strong className="truncate text-sm font-semibold">{selectedFile.path}</strong>
                  {selectedFile.binary ? (
                    <span className="shrink-0 text-sm text-[#7C9B88]">binary</span>
                  ) : (
                    <span className="shrink-0 font-mono text-sm"><span className="ios-tree-additions">+{selectedFile.additions ?? 0}</span> <span className="ios-tree-deletions">−{selectedFile.deletions ?? 0}</span></span>
                  )}
                </div>
                {!selectedFile.binary && <div className="file-view-switch" role="group" aria-label="File view">
                  {(["split", "unified"] as const).map((mode) => <button key={mode} type="button" onClick={() => selectFileViewMode(mode)} disabled={diffLoading} aria-pressed={fileViewMode === mode} className="file-view-button">{mode === "split" ? <GitCompareArrows size={14} /> : <FileText size={14} />}{mode === "split" ? "Split" : "Unified"}</button>)}
                  {comparison.mode === "workingCopy" && selectedFile.status !== "deleted" && <button type="button" onClick={() => void openSelectedFileInEditor()} disabled={diffLoading} className="file-view-button"><Pencil size={14} />Edit</button>}
                  {fileViewMode !== "edit" && <><span aria-hidden="true" className="mx-1 h-4 w-px bg-[#294536]" /><button type="button" onClick={() => navigateChange(-1)} disabled={diffLoading || !changeBlocks.length} aria-label="Previous change" title="Previous change" className="file-view-button px-1.5"><ArrowUp size={14} /></button><span className="min-w-9 text-center font-mono text-xs text-[#7C9B88]" aria-live="polite">{activeChangeNavigation ? activeChangeNavigation.index + 1 : 0}/{changeBlocks.length}</span><button type="button" onClick={() => navigateChange(1)} disabled={diffLoading || !changeBlocks.length} aria-label="Next change" title="Next change" className="file-view-button px-1.5"><ArrowDown size={14} /></button></>}
                </div>}
                <div className="ios-review-actions flex items-center justify-end gap-2 text-sm text-[#7C9B88]">
                  {fileViewMode === "edit" ? <>
                    <span aria-live="polite" className={`file-edit-status ${fileEditDirty ? "text-[#FBBF24]" : "text-[#7C9B88]"}`}>{fileEditSaving ? "Saving…" : fileEditDirty ? "Unsaved" : ""}</span>
                    <button type="button" onClick={discardCurrentFileEdit} disabled={!fileEditDirty || fileEditSaving} className="quiet-button h-9 px-3 disabled:opacity-40">Discard</button>
                    <button type="button" onClick={() => void saveCurrentFileEdit()} disabled={!fileEditDirty || fileEditSaving} className="accent-button h-9 px-3 disabled:opacity-40"><Save size={14} /> Save</button>
                  </> : <>
                  {comparison.mode === "workingCopy" && (
                    <button
                      type="button"
                      onClick={() => setConfirmation({
                        title: `Revert ${selectedFile.path.split("/").pop()}?`,
                        description: "All staged and unstaged changes to this file will be discarded. This cannot be undone.",
                        actionLabel: "Revert file",
                        action: () => void revertFile(),
                      })}
                      disabled={revertRunning || fileEditDirty}
                      aria-label={revertRunning ? "Reverting file" : "Revert file"}
                      title="Revert file"
                      className="grid size-9 place-items-center rounded-md border border-[#294536] bg-[#111A15] text-[#FB7185] hover:bg-[#3a1b24] disabled:opacity-40"
                    >
                      <RotateCcw size={15} className={revertRunning ? "animate-spin" : undefined} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={toggleFileApproval}
                    aria-pressed={approvedFiles.has(selectedFile.path)}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-bold ${approvedFiles.has(selectedFile.path) ? "border-[#294536] bg-[#183522] text-[#E8FFF0]" : "border-[#294536] bg-[#111A15] text-[#E8FFF0] hover:bg-[#183522]"}`}
                  >
                    <Check size={15} className="text-[#39FF88]" /> {approvedFiles.has(selectedFile.path) ? "Approved" : "Approve"}
                  </button>
                  </>}
                </div>
              </div>
              <div className="ios-diff-scroll min-h-0 flex-1 overflow-hidden bg-[#111A15]">
                {diffLoading ? (
                  <div className="grid h-full place-items-center text-sm text-[#7C9B88]">Loading diff…</div>
                ) : selectedFile.binary ? (
                  <div className="grid h-full place-items-center px-8 text-center">
                    <div>
                      <FileCode2 size={30} className="mx-auto mb-3 text-[#7C9B88]" />
                      <p className="text-sm font-semibold">Binary file</p>
                      <p className="mt-1 text-sm text-[#7C9B88]">Line selection is unavailable for this file.</p>
                    </div>
                  </div>
                ) : fileViewMode === "edit" ? (
                  fileEditLoading || fileEditDraft?.path !== selectedFile.path ? <div className="grid h-full place-items-center text-sm text-[#7C9B88]">Loading file…</div> : <CodeMirrorFileEditor key={`${fileEditDraft.path}:${fileEditRevision}`} path={fileEditDraft.path} content={fileEditDraft.original} onChange={(content) => setFileEditDraft((current) => current ? { ...current, content } : null)} onSave={() => void saveCurrentFileEdit()} />
                ) : largeDiff ? (
                  <div role="status" className="grid h-full place-items-center p-8 text-center text-sm text-[#7C9B88]">Large diff hidden.</div>
                ) : diff ? (
                  <CodeMirrorReviewWorkspace
                    mode={fileViewMode}
                    diff={diff}
                    changeBlocks={changeBlocks}
                    navigation={activeChangeNavigation}
                    selection={selection}
                    onSelectLine={selectLine}
                  />
                ) : (
                  <div className="grid h-full place-items-center text-sm text-[#7C9B88]">No text diff</div>
                )}
              </div>
            </>
          ) : repository && comparisonMode === "branch" && !comparison ? (
            <div className="grid h-full place-items-center p-8 text-center">
              <div className="max-w-sm">
                <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl border border-[#294536] bg-[#111A15] text-[#A3FF12] shadow-xl shadow-black/20">
                  {loading ? <LoaderCircle size={25} className="animate-spin" /> : <GitCompareArrows size={25} />}
                </div>
                <h1 className="text-[28px] font-bold tracking-tight">{loading ? "Loading diff" : "Compare branches"}</h1>
                <p className="mt-2 text-[15px] leading-6 text-[#7C9B88]">
                  {loading ? "Loading the selected branch comparison." : "Choose another comparison from the Changes header."}
                </p>
                {error && <p role="alert" className="mt-3 text-sm text-[#FB7185]">{error}</p>}
                {error && <button type="button" disabled={loading} onClick={() => void loadComparison(repository, false, "branch", baseRef, compareRef)} className="accent-button mt-5 px-4">
                  <GitCompareArrows size={14} /> Retry
                </button>}
              </div>
            </div>
          ) : agentChatExpanded ? (
            null
          ) : repository && comparison ? (
            <div className="grid h-full place-items-center p-8 text-center text-sm text-[#7C9B88]">
              Select a changed file to start reviewing.
            </div>
          ) : (
            <div className="grid h-full place-items-center p-8 text-center">
              <div className="max-w-sm">
                <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl border border-[#294536] bg-[#111A15] text-[#A3FF12] shadow-xl shadow-black/20">
                  <GitBranch size={25} />
                </div>
                <h1 className="text-[28px] font-bold tracking-tight">Open a repository</h1>
                <p className="mt-2 text-[15px] leading-6 text-[#7C9B88]">
                  Choose a Git repository to start making changes.
                </p>
                <button type="button" onClick={() => discardFileEdit(() => void chooseRepository())} disabled={loading} className="mt-5 inline-flex h-9 items-center gap-2 rounded-md bg-[#A3FF12] px-4 text-sm font-bold text-[#050807] hover:bg-[#A3FF12] disabled:opacity-50">
                  <FolderGit2 size={14} /> {loading ? "Opening…" : "Open repository"}
                </button>
              </div>
            </div>
          )}
          </div>
          {terminalMounted && repository && <TerminalPanel key={repository.rootPath} rootPath={repository.rootPath} visible={terminalOpen && !taskMode && !memoryMode && !settingsOpen && !zenMode} onClose={() => { setTerminalOpen(false); setTerminalMounted(false); }} />}
          {taskMode && !boardMode && repository && <button type="button" role="separator" aria-orientation="vertical" aria-label="Resize Tasks and Details columns" aria-valuenow={Math.round(taskColumns.tasks / taskGridWidth * 100)} aria-valuetext={`${Math.round(taskColumns.tasks)} pixels`} onPointerDown={(event) => startTaskResizing("tasks", event)} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); adjustTaskDivider("tasks", event.key === "ArrowRight" ? 16 : -16); } }} className="sidebar-resize-handle right-[-4px]" />}
        </section>

        {repository && (taskMode || taskTerminals.length > 0) && <div className={zenMode || !taskMode || boardMode ? "hidden" : "relative flex min-h-0 min-w-0 flex-col"} style={{ gridColumn: 2, gridRow: 1 }}>
          <div className="task-list-toolbar flex min-h-12 min-w-0 shrink-0 flex-wrap items-center gap-2 border-b border-[#294536] bg-[#0B110E] px-3 py-1">
            <div role="tablist" aria-label="Task panels" onKeyDown={(event) => { if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return; event.preventDefault(); const tabs: TaskDetailsTab[] = ["details", "changes", "draw", ...(sandboxSupported ? ["sandbox" as const] : []), ...(browserSupported ? ["browser" as const] : [])]; const next = tabs[(tabs.indexOf(taskDetailsTab) + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]; setTaskDetailsTab(next); (event.currentTarget.querySelector(`#task-${next}-tab`) as HTMLButtonElement | null)?.focus(); }} className="task-modal-tabs">
              <button id="task-details-tab" type="button" role="tab" aria-controls="task-details-panel" aria-selected={taskDetailsTab === "details"} tabIndex={taskDetailsTab === "details" ? 0 : -1} onClick={() => setTaskDetailsTab("details")} className="task-board-modal-tab">Details</button>
              <button id="task-changes-tab" type="button" role="tab" aria-controls="task-changes-panel" aria-selected={taskDetailsTab === "changes"} aria-label={selectedTaskHasPendingChanges ? "Changes, uncommitted changes" : "Changes"} tabIndex={taskDetailsTab === "changes" ? 0 : -1} onClick={() => setTaskDetailsTab("changes")} className="task-board-modal-tab">Changes{selectedTaskHasPendingChanges && <span className="ml-1 size-1.5 shrink-0 rounded-full bg-[#FFD28A]" aria-hidden="true" />}</button>
              <button id="task-draw-tab" type="button" role="tab" aria-controls="task-draw-panel" aria-selected={taskDetailsTab === "draw"} tabIndex={taskDetailsTab === "draw" ? 0 : -1} onClick={() => setTaskDetailsTab("draw")} className="task-board-modal-tab">Draw</button>
              {sandboxSupported && <button id="task-sandbox-tab" type="button" role="tab" aria-controls="task-sandbox-panel" aria-selected={taskDetailsTab === "sandbox"} tabIndex={taskDetailsTab === "sandbox" ? 0 : -1} onClick={() => setTaskDetailsTab("sandbox")} className="task-board-modal-tab">Sandbox</button>}
              {browserSupported && <button id="task-browser-tab" type="button" role="tab" aria-controls="task-browser-panel" aria-selected={taskDetailsTab === "browser"} tabIndex={taskDetailsTab === "browser" ? 0 : -1} onClick={() => setTaskDetailsTab("browser")} className="task-board-modal-tab">Browser</button>}
            </div>
            <div className="ml-auto flex min-w-0 items-center gap-1"><PomodoroTimer onSettings={openPomodoroSettings} />{taskMode && !boardMode && !zenMode && taskGitToolbar && <><span className="task-modal-toolbar-divider" aria-hidden="true" />{taskGitToolbar}</>}</div>
          </div>
          <div id="task-details-panel" role="tabpanel" aria-labelledby="task-details-tab" data-active={taskDetailsTab === "details"} className="task-tab-panel min-h-0 flex-1" style={{ display: taskDetailsTab === "details" ? undefined : "none" }}>
          <TaskSurface board={boardMode} target={boardDetailHost}><TaskDetailsPanel key={repository.rootPath} branchPrefix={branchPrefix} onBranchNameChange={(newBranchName) => { if (selectedTask && taskStartEditable(selectedTask, taskStartingRef.current.has(selectedTask.id))) updateTaskAtRoot(repository.rootPath, selectedTask.id, (task) => ({ ...task, newBranchName })); }} onScheduleChange={(schedule) => { if (selectedTask) updateTaskAtRoot(repository.rootPath, selectedTask.id, (task) => ({ ...task, ...schedule })); }} customFields={customFields} onCustomFieldChange={(id, value) => { if (selectedTask) changeTaskCustomField(repository.rootPath, selectedTask.id, id, value); }} assetBusy={selectedTaskRootBusy} task={selectedTask} branches={branchRefs?.refs ?? []} remoteBranches={branchRefs?.remoteRefs ?? []} workspaceBranch={repository.currentBranch} startLocked={!taskStartEditable(selectedTask, !!(selectedTask && taskStartingIds.has(selectedTask.id)))} onTitleChange={(title) => { if (selectedTask) { updateTask(selectedTask.id, (task) => ({ ...task, title })); } }} onDescriptionChange={(description) => { if (selectedTask) updateTaskAtRoot(repository.rootPath, selectedTask.id, (task) => ({ ...task, description })); }} onStatusChange={(status) => { if (selectedTask) setTaskStatus(selectedTask.id, status); }} onColorChange={(color) => { if (selectedTask) updateTask(selectedTask.id, (task) => ({ ...task, color })); }} onLocationChange={(location) => { if (selectedTask && taskStartEditable(selectedTask, taskStartingRef.current.has(selectedTask.id))) updateTask(selectedTask.id, (task) => ({ ...task, ...taskLocationFields(location), worktree: null })); }} onStartChange={(worktreeStart) => { if (selectedTask && taskStartEditable(selectedTask, taskStartingRef.current.has(selectedTask.id))) updateTask(selectedTask.id, (task) => ({ ...task, worktreeStart })); }} onStartOpen={() => { void invoke<BranchRefs>("list_branch_refs").then(setBranchRefs).catch((reason) => setError(message(reason))); }} onAddAssets={(paths) => { if (selectedTask) void addTaskAssets(selectedTask.id, paths); }} onRemoveAsset={(assetId) => { if (selectedTask) void removeTaskAsset(selectedTask, assetId); }} onAddComment={(body) => { if (selectedTask) updateTask(selectedTask.id, (task) => ({ ...task, comments: [...task.comments, { id: crypto.randomUUID(), author: "user", body, createdAt: Date.now() }] })); }} onUpdateComment={(commentId, body) => { if (selectedTask) updateTask(selectedTask.id, (task) => ({ ...task, comments: task.comments.map((comment) => comment.id === commentId ? { ...comment, body } : comment) })); }} onDeleteComment={(commentId) => { if (selectedTask) updateTask(selectedTask.id, (task) => ({ ...task, comments: task.comments.filter((comment) => comment.id !== commentId) })); }} /></TaskSurface>
          </div>
          <div id="task-draw-panel" role="tabpanel" aria-labelledby="task-draw-tab" data-active={taskDetailsTab === "draw"} className="task-tab-panel min-h-0 flex-1" style={{ display: taskDetailsTab === "draw" ? undefined : "none" }}>
            <TaskSurface board={boardMode} target={boardDrawHost}>{selectedTask && taskVisualSessionOpen && <TaskDrawingPanel key={`${repository.rootPath}:${selectedTask.id}`} active={boardMode ? boardTab === "draw" : taskDetailsTab === "draw"} value={selectedTask.drawing} onChange={(drawing) => {
              const rootPath = repository.rootPath; const id = selectedTask.id;
              const update = (task: RepositoryTask) => task.id === id ? { ...task, drawing } : task;
              const active = repositoryRef.current?.rootPath === rootPath;
              const previous = active ? tasksRef.current : loadTasks(rootPath, chatDefaults);
              const next = timestampTaskUpdates(previous, previous.map(update));
              saveTasks(rootPath, next);
              if (active) { tasksRef.current = next; setTasks((current) => current.map(update)); }
            }} />}</TaskSurface>
          </div>
          {sandboxSupported && <div id="task-sandbox-panel" role="tabpanel" aria-labelledby="task-sandbox-tab" data-active={taskDetailsTab === "sandbox"} className="task-tab-panel min-h-0 flex-1" style={{ display: taskDetailsTab === "sandbox" ? undefined : "none" }}>
            <TaskSurface board={boardMode} target={boardSandboxHost}>{selectedTask && taskVisualSessionOpen && <TaskSandboxPanel key={`${repository.rootPath}:${selectedTask.id}`} active={boardMode ? boardTab === "sandbox" : taskDetailsTab === "sandbox"} repositoryRoot={repository.rootPath} taskId={selectedTask.id} value={selectedTask.sandboxHtml} />}</TaskSurface>
          </div>}
          {browserSupported && <div id="task-browser-panel" role="tabpanel" aria-labelledby="task-browser-tab" data-active={taskDetailsTab === "browser"} className="task-tab-panel min-h-0 flex-1" style={{ display: taskDetailsTab === "browser" ? undefined : "none" }}>
            <TaskSurface board={boardMode} target={boardBrowserHost}>{selectedTask && taskVisualSessionOpen && <TaskBrowser key={`${repository.rootPath}:${selectedTask.id}`} repositoryRoot={repository.rootPath} taskId={selectedTask.id} active={boardMode ? boardTab === "browser" : taskDetailsTab === "browser"} />}</TaskSurface>
          </div>}
          <div id="task-changes-panel" role="tabpanel" aria-labelledby="task-changes-tab" data-active={taskDetailsTab === "changes"} className="task-tab-panel min-h-0 flex-1" style={{ display: taskDetailsTab === "changes" ? undefined : "none" }}><TaskSurface board={boardMode} target={boardChangesHost}><TaskChangesPanel key={selectedTask?.id ?? "none"} task={selectedTask} repository={repository} model={commitMessageModel} revision={taskChangesRevision} active={taskMode && !settingsOpen && !zenMode && (boardMode ? boardDrawerOpen && boardTab === "changes" : taskDetailsTab === "changes")} taskRunning={selectedTaskRootBusy} runningBranches={new Set(tasks.filter((task) => (!!taskRuns[task.id] || taskStartingIds.has(task.id)) && task.worktree).map((task) => task.worktree!.branch))} onPendingChange={(pending) => setTaskPendingChanges((current) => current && current.taskId === selectedTask?.id && current.location === selectedTask?.location && current.pending === pending ? current : { taskId: selectedTask?.id ?? "", location: selectedTask?.location ?? "workspace", pending })} onMerged={() => { void refreshRef.current(); }} onWorkspaceCommit={(repo) => { setRepository(repo); void refreshRef.current(); }} /></TaskSurface></div>
          <TaskSurface board={boardMode} target={boardDetailHost}>{taskTerminals.map((terminal) => <TerminalPanel
            key={terminal.key}
            rootPath={terminal.rootPath}
            taskId={terminal.taskId}
            visible={terminal.key === activeTaskTerminalKey}
            onClose={() => { setTaskTerminals((current) => current.filter((item) => item.key !== terminal.key)); setTerminalOpen(false); }}
          />)}
          {terminalOpen && taskMode && !zenMode && (!selectedTask || (selectedTask.location === "worktree" && !selectedTask.worktree)) &&
            <div className="ios-terminal-panel h-[clamp(180px,32vh,300px)] shrink-0 border-t border-[#294536] bg-[#0B110E] p-4 text-sm text-[#7C9B88]">
              {selectedTask ? "The worktree starts with the first Agent message." : "Select a task to open its terminal."}
            </div>}</TaskSurface>
          <button type="button" role="separator" aria-orientation="vertical" aria-label="Resize Details and Agent columns" aria-valuenow={Math.round(taskColumns.changes / taskGridWidth * 100)} aria-valuetext={`${Math.round(taskColumns.changes)} pixels`} onPointerDown={(event) => startTaskResizing("changes", event)} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); adjustTaskDivider("changes", event.key === "ArrowRight" ? 16 : -16); } }} className="sidebar-resize-handle right-[-4px]" />
        </div>}

        {repository && !memoryMode && <div className={boardMode ? "hidden" : "relative flex min-h-0 min-w-0 flex-col"} style={{ gridColumn: zenMode ? "1" : tasksTabActive ? "3" : agentChatExpanded ? "2 / 4" : "3", gridRow: 1 }}>
          <div className="flex min-h-0 flex-1 flex-col">
          <TaskSurface board={boardMode} target={boardChatHost}>
          {taskMode && zenMode && taskGitToolbar}
          <AiChatPanel
            onOpenTask={(id) => {
              const task = tasksRef.current.find((task) => task.id === id);
              if (!task) { setError("This task is no longer available in this repository."); return; }
              if (workspaceMode === "workspace") { setZenMode(false); openBoardTask(task, "detail"); }
              else discardFileEdit(() => { setZenMode(false); setWorkspaceMode("tasks"); openBoardTask(task, "detail"); });
            }}
            key={taskMode ? selectedTask?.id ?? "no-task" : "agent-chat"}
            messages={taskMode ? selectedTask?.chatMessages ?? [] : review?.chatMessages ?? []}
            draft={taskMode && selectedTask ? taskDrafts[selectedTask.id] ?? "" : aiChatDraft}
            running={taskMode ? !!selectedTaskRun || !!(selectedTask && taskStartingIds.has(selectedTask.id)) : aiChatRunning}
            status={taskMode ? selectedTaskRun?.status ?? "Starting…" : aiChatStatus}
            streamingEntries={taskMode ? selectedTaskRun?.timeline ?? [] : aiChatTimeline}
            comparison={comparison}
            models={chatModels}
            favoriteModels={favoriteModels}
            modelsStatus={modelsStatus}
            serverModel={taskMode ? null : aiChatServerModel}
            model={taskMode ? selectedTask?.chatModel ?? chatDefaults.default.model : aiChatModel}
            effort={taskMode ? selectedTask?.chatEffort ?? chatDefaults.default.effort : aiChatEffort}
            mode={taskMode ? selectedTask?.chatMode ?? "default" : aiChatMode}
            plan={taskMode ? selectedTaskRun?.plan ?? null : aiChatPlan}
            centered={zenMode || (!taskMode && agentChatExpanded)}
            zenMode={zenMode}
            hideHeader={boardMode}
            approvalReviewer={activeApprovalReviewer}
            error={error}
            images={taskMode ? selectedTask?.attachments ?? [] : aiChatUploads}
            taskAssets={taskMode ? selectedTask?.assets ?? [] : []}
            selectedAssetIds={taskMode && selectedTask ? taskAssetSelections[selectedTask.id] ?? [] : []}
            onToggleTaskAsset={(id) => { if (selectedTask) setTaskAssetSelections((current) => ({ ...current, [selectedTask.id]: (current[selectedTask.id] ?? []).includes(id) ? (current[selectedTask.id] ?? []).filter((value) => value !== id) : [...(current[selectedTask.id] ?? []), id] })); }}
            onDraftChange={(value) => taskMode && selectedTask ? setTaskDrafts((current) => ({ ...current, [selectedTask.id]: value })) : setAiChatDraft(value)}
            onModelChange={(value) => taskMode && selectedTask ? updateTask(selectedTask.id, (task) => ({ ...task, chatModel: value })) : setAiChatModel(value)}
            onEffortChange={(value) => taskMode && selectedTask ? updateTask(selectedTask.id, (task) => ({ ...task, chatEffort: value })) : setAiChatEffort(value)}
            onModeChange={(mode) => taskMode && selectedTask ? selectTaskChatMode(selectedTask.id, mode) : selectAiChatMode(mode)}
            onResetConfig={() => taskMode && selectedTask ? updateTask(selectedTask.id, (task) => ({ ...task, chatModel: chatDefaults[task.chatMode].model, chatEffort: chatDefaults[task.chatMode].effort })) : (setAiChatModel(chatDefaults[aiChatMode].model), setAiChatEffort(chatDefaults[aiChatMode].effort))}
            onDismissError={() => setError("")}
            onZenModeChange={setZenMode}
            onApprovalReviewerChange={(value) => setApprovalReviewerOverrides((current) => ({ ...current, [taskMode ? selectedTask?.id ?? "" : "review"]: value }))}
            onSend={sendComposerMessage}
            queuedMessages={activeQueueKey ? chatQueues[activeQueueKey] ?? [] : []}
            queuePaused={activeQueueKey ? pausedQueueKeys.has(activeQueueKey) : false}
            canSteerQueued={taskMode ? !!selectedTaskRun : reviewRunQueueKeyRef.current === activeQueueKey}
            onSteerQueued={(id) => { if (activeQueueKey) void steerQueued(activeQueueKey, id); }}
            onDeleteQueued={(id) => { if (activeQueueKey && !queueBusyRef.current.has(activeQueueKey)) removeQueued(activeQueueKey, id, true); }}
            onEditQueued={(id, body) => { if (activeQueueKey && !queueBusyRef.current.has(activeQueueKey)) changeQueue(activeQueueKey, (items) => items.map((item) => item.id === id ? { ...item, body: body.trim() } : item)); }}
            onMoveQueued={(id, offset) => { if (activeQueueKey && !queueBusyRef.current.has(activeQueueKey)) changeQueue(activeQueueKey, (items) => moveQueuedMessage(items, id, offset)); }}
            onResumeQueue={() => { if (activeQueueKey) { setQueuePaused(activeQueueKey, false); queueDispatchRef.current(activeQueueKey); } }}
            onImplementPlan={() => { if (taskMode && selectedTask) void implementTask(selectedTask); else { selectAiChatMode("default"); void sendAiChat(implementPlanPrompt, chatRequestContext, "default", chatDefaults.default); } }}
            onCancel={() => { if (taskMode && selectedTask) void cancelTaskPlan(selectedTask.id); else void cancelAiChat(); }}
            onClear={taskMode && selectedTask ? () => clearTaskChat(selectedTask) : clearAiChat}
            onAddFiles={(paths) => void addChatFiles(paths, taskMode ? selectedTask?.id : undefined)}
            onPasteImage={(image) => void pasteChatImage(image, taskMode ? selectedTask?.id : undefined)}
            onRemoveImage={(path) => removeChatImage(path, taskMode ? selectedTask?.id : undefined)}
            taskMode={taskMode}
            taskLocation={taskMode ? selectedTask?.location : undefined}
            taskLocationLocked={!!selectedTask?.started || !!(selectedTask && taskStartingIds.has(selectedTask.id))}
            taskWorktreeStart={selectedTask?.worktreeStart}
            agentInput={taskMode ? selectedTaskRun?.input ?? null : agentUserInput}
            agentApproval={inlineAgentApproval}
            approvalResponding={inlineAgentApproval?.source === "mcp" && mcpRespondingRequestId === inlineAgentApproval.requestId}
            onAnswerInput={(answers) => { if (taskMode && selectedTask) void answerTaskQuestion(selectedTask.id, answers); else void answerReviewQuestion(answers); }}
            onCancelInput={() => { if (taskMode && selectedTask) void cancelTaskPlan(selectedTask.id); else void cancelAgentQuestion(); }}
            onRespondApproval={(approved) => respondToApproval(inlineAgentApproval, approved)}
            agents={agents}
            chatAgent={(taskMode ? selectedTask?.chatAgent : review?.chatAgent) ?? null}
            onAgentChange={selectChatAgent}
            onManageAgents={() => { setAgentsOpen(true); setSettingsOpen(false); }}
            playbooks={playbooks}
            canRunPlaybooks={!!comparison && !!review}
            variablePrompt={variablePrompt && (taskMode ? !!selectedTask && variablePrompt.taskId === selectedTask.id : variablePrompt.taskId === null) ? variablePrompt.playbook : null}
            onRunPlaybook={(playbook) => runPlaybook(playbook, taskMode ? selectedTask : null)}
            onManagePlaybooks={() => { setPlaybooksOpen(true); setSettingsOpen(false); }}
            onSubmitPlaybookValues={confirmVariablePrompt}
            onCancelPlaybook={() => setVariablePrompt(null)}
            taskSelected={!taskMode || !!selectedTask}
            active
          />
          </TaskSurface>
          {!zenMode && !taskMode && !agentChatExpanded && <button
            type="button"
            aria-label="Resize Review Agent sidebar"
            onPointerDown={(event) => startResizing("right", event)}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") resizeSidebar("right", sidebarWidths.right + 16);
              if (event.key === "ArrowRight") resizeSidebar("right", sidebarWidths.right - 16);
            }}
            className="sidebar-resize-handle left-[-4px]"
          />}
          </div>
        </div>}
      </div>
      </div>
      <Dialog open={boardMode && boardDrawerOpen && !!selectedTask} onOpenChange={(open) => {
        const finish = () => {
          if (!open) {
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
            window.dispatchEvent(new Event("flush-task-fields")); window.dispatchEvent(new Event("flush-task-drawing"));
          }
          setBoardDrawerOpen(open);
          if (!open) setBoardFolderError("");
        };
        if (!open && browserSupported && boardTab === "browser") void hideTaskBrowsers().catch(() => {}).then(finish);
        else finish();
      }} disablePointerDismissal={!closeKanbanModalOnOutsideClick}>
        <DialogContent keepMounted showCloseButton={false} className="task-detail-dialog !animate-none flex h-[88vh] w-[94vw] !max-w-[1800px] min-h-0 flex-col gap-0 overflow-hidden rounded-xl border border-[#294536] bg-[var(--ios-grouped-background)] p-0 shadow-2xl shadow-black/50">
          <DialogDescription className="sr-only">Task detail, chat and changes</DialogDescription>
          <Tabs.Root value={boardTab} onValueChange={(value) => { const tab = value as BoardTab; setBoardTab(tab); if (repository && selectedTask) saveBoardTab(repository.rootPath, selectedTask.id, tab); }} className="flex min-h-0 flex-1 flex-col">
            <header className="task-modal-toolbar">
              <DialogTitle className="task-modal-title" title={selectedTask?.title}>{selectedTask?.title ?? "Task"}</DialogTitle>
              <Tabs.List className="task-modal-tabs" aria-label="Task panels">
                <Tabs.Tab value="detail" className="task-board-modal-tab">Detail</Tabs.Tab>
                <Tabs.Tab value="draw" className="task-board-modal-tab">Draw</Tabs.Tab>
                {sandboxSupported && <Tabs.Tab value="sandbox" className="task-board-modal-tab">Sandbox</Tabs.Tab>}
                {browserSupported && <Tabs.Tab value="browser" className="task-board-modal-tab">Browser</Tabs.Tab>}
                <Tabs.Tab value="changes" className="task-board-modal-tab">Changes{selectedTaskHasPendingChanges && <span className="ml-1 inline-block size-1.5 rounded-full bg-[#FFD28A]" aria-label="Uncommitted changes" />}</Tabs.Tab>
              </Tabs.List>
              <div className="task-modal-actions">
                <PomodoroTimer onSettings={openPomodoroSettings} />
                {boardMode && boardDrawerOpen && taskGitToolbar && <><span className="task-modal-toolbar-divider" aria-hidden="true" />{taskGitToolbar}</>}
                <span className="task-modal-toolbar-divider" aria-hidden="true" />
                <DropdownMenu>
                  <DropdownMenuTrigger aria-label={selectedTask?.worktree ? "Open task folder" : "Open repository folder"} title="Open folder" className="task-modal-icon"><FolderOpen size={17} /></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => openTaskFolder(false)}><FolderOpen size={14} /> Open in Finder</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openTaskFolder(true)}><Terminal size={14} /> Open in Terminal</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger className="task-modal-icon" aria-label="Task actions" title="Task actions"><Ellipsis size={18} /></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={() => setZenMode(true)}><Maximize2 size={14} /> Enter Zen Mode</DropdownMenuItem>
                    <DropdownMenuItem disabled={!selectedTask?.chatMessages.length && !(activeQueueKey && chatQueues[activeQueueKey]?.length) || !!selectedTaskRun} onClick={() => { if (selectedTask) clearTaskChat(selectedTask); }}><RotateCcw size={14} /> Clear conversation</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" disabled={!selectedTask || protectedTaskIds.has(selectedTask.id)} onClick={() => { if (selectedTask) confirmDeleteTasks(taskSubtreeIds(tasks, [selectedTask.id])); }}><Trash2 size={14} /> Delete task</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DialogClose aria-label="Close task modal" title="Close" className="task-modal-icon"><X size={17} /></DialogClose>
              </div>
            </header>
            {boardFolderError && <p role="alert" className="border-b border-[#482631] px-4 py-2 text-xs text-[#FB7185]">{boardFolderError}</p>}
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.618fr)_minmax(0,1fr)]">
              <div className="flex min-h-0 min-w-0 flex-col" aria-label="Task panels">
                <Tabs.Panel value="detail" keepMounted className="task-board-modal-panel"><div ref={setBoardDetailHost} className="task-board-detail-host flex h-full min-h-0 flex-col" /></Tabs.Panel>
                <Tabs.Panel value="draw" keepMounted className="task-board-modal-panel"><div ref={setBoardDrawHost} className="flex h-full min-h-0 flex-col" /></Tabs.Panel>
                {sandboxSupported && <Tabs.Panel value="sandbox" keepMounted className="task-board-modal-panel"><div ref={setBoardSandboxHost} className="flex h-full min-h-0 flex-col" /></Tabs.Panel>}
                {browserSupported && <Tabs.Panel value="browser" keepMounted className="task-board-modal-panel"><div ref={setBoardBrowserHost} className="flex h-full min-h-0 flex-col" /></Tabs.Panel>}
                <Tabs.Panel value="changes" keepMounted className="task-board-modal-panel"><div ref={setBoardChangesHost} className="flex h-full min-h-0 flex-col" /></Tabs.Panel>
              </div>
              <div ref={setBoardChatHost} className="flex min-h-0 min-w-0 flex-col" aria-label="Task chat" />
            </div>
          </Tabs.Root>
        </DialogContent>
      </Dialog>
      {simulatorSpace.enabled && <aside className="relative flex min-h-0 shrink-0 flex-col border-l border-[#294536] bg-[#0B110E]" style={{ width: Math.min(simulatorSpace.width, Math.max(200, window.innerWidth - 320)) }} aria-label="Simulator space">
        <button type="button" role="separator" aria-orientation="vertical" aria-label="Resize simulator space" aria-valuemin={200} aria-valuemax={Math.max(200, Math.min(960, window.innerWidth - 320))} aria-valuenow={simulatorSpace.width} aria-valuetext={`${simulatorSpace.width} pixels`} onPointerDown={startSimulatorResizing} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); resizeSimulator(simulatorSpace.width + (event.key === "ArrowLeft" ? 16 : -16)); } }} className="sidebar-resize-handle left-[-4px]" />
        <header className="flex h-12 shrink-0 items-center border-b border-[#294536] px-4 text-sm font-semibold text-[#E8FFF0]">Simulator</header>
      </aside>}
      </div>

      {agentsOpen && <AgentsDialog agents={agents} onChange={setAgents} onClose={() => setAgentsOpen(false)} onConfirm={setConfirmation} />}
      {playbooksOpen && (
        <Dialog open onOpenChange={(open) => !open && setPlaybooksOpen(false)}>
          <DialogContent showCloseButton={false} className="ios-sheet flex h-[min(630px,88vh)] w-[min(980px,94vw)] !max-w-none flex-col overflow-hidden rounded-xl border border-[#294536] bg-[#0B110E] p-0 shadow-2xl shadow-black/60">
            <header className="flex h-[66px] shrink-0 items-center border-b border-[#294536] px-5">
              <div>
                <DialogTitle className="text-[17px] font-bold text-[#E8FFF0]">Playbooks</DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-[#7C9B88]">Reusable prompts for Agent Chat</DialogDescription>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button type="button" onClick={createPlaybook} className="quiet-button h-9">
                  <Plus size={14} /> New playbook
                </button>
                <button type="button" onClick={() => setPlaybooksOpen(false)} className="grid size-9 place-items-center rounded-md text-[#7C9B88] hover:bg-[#294536] hover:text-white" aria-label="Close playbooks">
                  <X size={16} />
                </button>
              </div>
            </header>
            <div className="grid min-h-0 flex-1 grid-cols-[265px_minmax(0,1fr)]">
              <aside className="min-h-0 overflow-y-auto border-r border-[#294536] bg-[#0B110E] p-3" aria-label="Saved playbooks">
                <div className="mb-2 px-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#7C9B88]">Saved playbooks</div>
                <div className="space-y-1">
                  {selectedPlaybookId === playbookDraft.id && !playbooks.some((playbook) => playbook.id === playbookDraft.id) && (
                    <div className="flex w-full items-start gap-2.5 rounded-lg border border-[#294536] bg-[#183522] px-3 py-3 text-left">
                      <Plus size={15} className="mt-0.5 shrink-0 text-[#A3FF12]" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-[#E8FFF0]">{playbookDraft.title || "New playbook"}</span>
                        <span className="mt-1 block truncate text-xs text-[#7C9B88]">Unsaved draft</span>
                      </span>
                    </div>
                  )}
                  {playbooks.map((playbook, index) => (
                    <div key={playbook.id} className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-3 ${selectedPlaybookId === playbook.id ? "border-[#294536] bg-[#183522]" : "border-transparent hover:bg-[#111A15]"}`}>
                      <button type="button" onClick={() => selectPlaybook(playbook)} className="flex min-w-0 flex-1 items-start gap-2.5 text-left">
                        <Blocks size={15} className="mt-0.5 shrink-0 text-[#A3FF12]" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-[#E8FFF0]">{playbook.title}</span>
                          <span className="mt-1 block truncate text-xs text-[#7C9B88]">{playbook.description || "Custom Agent Chat prompt"}</span>
                        </span>
                      </button>
                      <div className="flex shrink-0 flex-col gap-0.5">
                        <button type="button" className="grid size-6 place-items-center rounded text-[#7C9B88] hover:bg-[#294536] hover:text-white disabled:opacity-30" aria-label={`Move ${playbook.title} up`} title="Move up" disabled={index === 0} onClick={() => setPlaybooks((current) => movePlaybook(current, playbook.id, -1))}><ArrowUp size={14} /></button>
                        <button type="button" className="grid size-6 place-items-center rounded text-[#7C9B88] hover:bg-[#294536] hover:text-white disabled:opacity-30" aria-label={`Move ${playbook.title} down`} title="Move down" disabled={index === playbooks.length - 1} onClick={() => setPlaybooks((current) => movePlaybook(current, playbook.id, 1))}><ArrowDown size={14} /></button>
                      </div>
                    </div>
                  ))}
                  {!playbooks.length && (
                    <div className="rounded-lg border border-dashed border-[#294536] px-3 py-8 text-center text-xs text-[#7C9B88]">
                      No saved playbooks
                    </div>
                  )}
                </div>
              </aside>
              <div className="flex min-h-0 flex-col bg-[#111A15]">
                <div className="min-h-0 flex-1 overflow-y-auto p-6">
                  <label className="block text-xs font-bold text-[#7C9B88]">
                    Title
                    <input
                      value={playbookDraft.title}
                      onChange={(event) => {
                        const title = event.currentTarget.value;
                        setPlaybookDraft((draft) => ({ ...draft, title }));
                      }}
                      maxLength={200}
                      className="mt-2 h-10 w-full rounded-md border border-[#294536] bg-[#050807] px-3 text-sm font-semibold text-[#E8FFF0] outline-none focus:border-[#A3FF12]"
                    />
                  </label>
                  <label className="mt-4 block text-xs font-bold text-[#7C9B88]">
                    Short description <span className="font-normal">(optional)</span>
                    <input
                      value={playbookDraft.description}
                      onChange={(event) => {
                        const description = event.currentTarget.value;
                        setPlaybookDraft((draft) => ({ ...draft, description }));
                      }}
                      maxLength={240}
                      className="mt-2 h-10 w-full rounded-md border border-[#294536] bg-[#050807] px-3 text-sm text-[#E8FFF0] outline-none focus:border-[#A3FF12]"
                    />
                  </label>
                  <label className="mt-4 block text-xs font-bold text-[#7C9B88]">
                    Prompt
                    <textarea
                      value={playbookDraft.prompt}
                      onChange={(event) => {
                        const prompt = event.currentTarget.value;
                        setPlaybookDraft((draft) => ({ ...draft, prompt }));
                      }}
                      maxLength={20_000}
                      rows={9}
                      className="mt-2 min-h-44 w-full resize-y rounded-md border border-[#294536] bg-[#050807] p-3 text-sm leading-6 text-[#E8FFF0] outline-none focus:border-[#A3FF12]"
                    />
                  </label>
                  <div className="mt-4 rounded-md border border-[#294536] bg-[#0B110E] p-3">
                    <div className="flex items-center justify-between text-xs font-bold text-[#7C9B88]"><span>Variables <span className="font-normal">(use as {"{{NAME}}"} in the prompt)</span></span><button type="button" onClick={() => setPlaybookDraft((draft) => ({ ...draft, variables: [...draft.variables, { id: crypto.randomUUID(), name: "", label: "", type: "singleLine" }] }))} className="text-[#A3FF12]">+ Variable</button></div>
                    {playbookDraft.variables.map((variable) => <div key={variable.id} className="mt-3 flex flex-wrap items-end gap-2">
                      <label className="text-xs text-[#7C9B88]">Name<input value={variable.name} onChange={(event) => { const name = event.currentTarget.value; setPlaybookDraft((draft) => ({ ...draft, variables: draft.variables.map((item) => item.id === variable.id ? { ...item, name } : item) })); }} placeholder="GOAL" className="mt-1 block h-9 w-32 rounded border border-[#294536] bg-[#050807] px-2 font-mono text-xs text-[#E8FFF0] outline-none focus:border-[#A3FF12]" /></label>
                      <label className="min-w-36 flex-1 text-xs text-[#7C9B88]">Label<input value={variable.label} maxLength={200} onChange={(event) => { const label = event.currentTarget.value; setPlaybookDraft((draft) => ({ ...draft, variables: draft.variables.map((item) => item.id === variable.id ? { ...item, label } : item) })); }} placeholder="What should the agent focus on?" className="mt-1 block h-9 w-full rounded border border-[#294536] bg-[#050807] px-2 text-xs text-[#E8FFF0] outline-none focus:border-[#A3FF12]" /></label>
                      <label className="text-xs text-[#7C9B88]">Type<select value={variable.type} onChange={(event) => { const type = event.currentTarget.value as typeof variable.type; setPlaybookDraft((draft) => ({ ...draft, variables: draft.variables.map((item) => item.id === variable.id ? { ...item, type } : item) })); }} className="mt-1 block h-9 rounded border border-[#294536] bg-[#050807] px-2 text-xs text-[#E8FFF0] outline-none focus:border-[#A3FF12]"><option value="singleLine">Single line</option><option value="multiLine">Multi line</option></select></label>
                      <button type="button" onClick={() => setPlaybookDraft((draft) => ({ ...draft, variables: draft.variables.filter((item) => item.id !== variable.id) }))} className="h-9 px-1 text-xs text-[#fb7185]">Remove</button>
                    </div>)}
                    {playbookDraft.variables.length > 0 && <p className="mt-2 text-xs text-[#7C9B88]">Values are requested every time this playbook runs.</p>}
                  </div>
                  {playbookError && <p role="alert" className="mt-3 text-xs text-[#FB7185]">{playbookError}</p>}
                  {playbookSaveNotice && <p role="status" aria-live="polite" className="mt-3 text-xs font-bold text-[#39FF88]">{playbookSaveNotice}</p>}
                </div>
                <footer className="flex h-16 shrink-0 items-center justify-between border-t border-[#294536] px-6">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={deletePlaybook}
                      disabled={!playbooks.some((playbook) => playbook.id === playbookDraft.id)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-bold text-[#FB7185] hover:bg-[#3a1b24] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={savePlaybook} className="quiet-button h-9">
                      {playbookSaveNotice ? <Check size={14} className="text-[#39FF88]" /> : <Save size={14} />} {playbookSaveNotice || "Save"}
                    </button>
                  </div>
                </footer>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {runOutputOpen && (
        <Dialog open onOpenChange={(open) => !open && setRunOutputOpen(false)}>
          <DialogContent aria-label="Run output" showCloseButton={false} className="ios-sheet flex h-[min(500px,78vh)] w-[min(760px,92vw)] !max-w-none flex-col overflow-hidden rounded-xl border border-[#294536] bg-[#050807] p-0 shadow-2xl shadow-black/60">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[#294536] px-4">
              <Terminal size={15} className="text-[#39FF88]" />
              <strong className="text-sm text-[#E8FFF0]">Run</strong>
              <span className="ml-2 inline-flex items-center gap-1.5 text-sm text-[#7C9B88]">
                {runStatus === "running" || runStatus === "stopping" ? <LoaderCircle size={13} className="animate-spin" /> : runStatus === "success" ? <Check size={13} /> : runStatus === "failed" ? <X size={13} /> : null}
                {runStatus === "running" ? "Running…" : runStatus === "stopping" ? "Stopping…" : runStatus === "success" ? "Succeeded" : runStatus === "failed" ? runError || (runExitCode === null ? "Failed" : `Exited with code ${runExitCode}`) : "Ready"}
              </span>
              <div className="ml-auto flex items-center gap-2">
                {runStatus === "running" || runStatus === "stopping" ? <button type="button" onClick={() => void stopRepositoryRun()} disabled={runStatus === "stopping"} className="quiet-button h-8 text-[#7C9B88] hover:text-[#E8FFF0] disabled:opacity-50"><Square size={12} /> Stop</button> : runCommand && <button type="button" onClick={() => void startRepositoryRun()} className="quiet-button h-8"><Play size={12} fill="currentColor" /> Run again</button>}
                {!!runOutput && <button type="button" onClick={() => void navigator.clipboard.writeText(runOutput)} className="quiet-button h-8"><Copy size={12} /> Copy logs</button>}
                <button type="button" onClick={() => setRunOutputOpen(false)} className="grid size-8 place-items-center rounded-md text-[#7C9B88] hover:bg-[#294536] hover:text-white" aria-label="Close Run output"><X size={15} /></button>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-auto bg-[#050807] p-4 font-mono text-xs leading-5 text-[#E8FFF0]">
              <pre className="whitespace-pre-wrap break-words font-inherit">{runOutput || (runStatus === "running" || runStatus === "stopping" ? "Starting Run…" : runError || "No output.")}</pre>
              <div ref={runOutputBottomRef} />
            </div>
            <footer className="flex min-h-9 shrink-0 items-center gap-3 border-t border-[#294536] px-4 py-1.5 text-[11px] text-[#7C9B88]">
              <span className="min-w-0 flex-1 truncate">{runCommand || "No command configured"}</span>
              {runExitCode !== null && <span>Exit code {runExitCode}</span>}
            </footer>
          </DialogContent>
        </Dialog>
      )}

      <AgentAttentionStack key={repository?.rootPath ?? "no-repository"} requests={attentionRequests} onOpen={({ taskId, kind, requestId }) => discardFileEdit(() => {
        setSettingsOpen(false); setZenMode(false); setTerminalOpen(false);
        if (kind === "approval") setMcpApprovals((current) => [...current.filter((approval) => approval.requestId === requestId), ...current.filter((approval) => approval.requestId !== requestId)]);
        if (taskId === null) { setWorkspaceMode("workspace"); setBoardDrawerOpen(false); }
        else {
          const task = tasksRef.current.find((task) => task.id === taskId);
          if (!task) { setError("This task is no longer available in this repository."); return; }
          if (workspaceMode !== "workspace") setWorkspaceMode("tasks");
          openBoardTask(task, "detail");
        }
      })} />

      {automationStatus && repository && <LaneAutomation key={`${repository.rootPath}:${automationStatus}`} status={automationStatus} label={boardStatusColumns.find((column) => column.id === automationStatus)?.label ?? automationStatus} controller={laneAutomation} branches={branchRefs} tasks={tasks} onClose={() => setAutomationStatus(null)} onOpenTask={(task) => { setAutomationStatus(null); setWorkspaceMode("tasks"); if (taskView === "list") selectTask(task); else openBoardTask(task); }} />}
      {confirmation && (
        <AlertDialog open onOpenChange={(open) => { if (!open) { confirmation.cancel?.(); setConfirmation(null); } }}>
          <AlertDialogContent className="ios-alert-dialog border-0 bg-[var(--ios-elevated-background)]">
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmation.title}</AlertDialogTitle>
              <AlertDialogDescription className="whitespace-pre-wrap">{confirmation.description}</AlertDialogDescription>
              {confirmation.details && <details className="w-full min-w-0 overflow-hidden rounded-md border border-black/10 bg-black/5 p-3 text-left text-sm text-[var(--ios-foreground)]"><summary className="cursor-pointer font-medium">Show command</summary><pre className="mt-3 max-h-48 max-w-full overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] font-mono text-xs leading-5">{confirmation.details}</pre></details>}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={confirmation.cancel}>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => { confirmation.action(); setConfirmation(null); }}>{confirmation.actionLabel}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {authOnboardingOpen && (
        <Dialog open onOpenChange={() => {}}>
          <DialogContent showCloseButton={false} className="ios-sheet max-h-[90vh] w-[min(560px,94vw)] !max-w-none overflow-y-auto rounded-xl border border-[#294536] bg-[#111A15] p-6 shadow-2xl shadow-black/60">
            <DialogTitle className="text-lg font-bold text-[#E8FFF0]">Set up a model provider</DialogTitle>
            <DialogDescription className="mt-1 text-sm leading-6 text-[#7C9B88]">Connect OpenRouter or another OpenAI-compatible provider using an API key.</DialogDescription>
            <div className="mt-5 space-y-3">
              <section className="rounded-lg border border-[#294536] bg-[#0B110E] p-4" aria-labelledby="onboarding-provider-title">
                <div className="flex items-start gap-3"><Blocks size={16} className={`mt-0.5 shrink-0 ${providerAvailable ? "text-[#39FF88]" : "text-[#7C9B88]"}`} /><div><h3 id="onboarding-provider-title" className="font-semibold text-[#E8FFF0]">Model provider</h3><p className="mt-1 text-sm text-[#7C9B88]">{providerAvailable ? `${effectiveProvider} is active.` : "OpenRouter is prefilled. Edit these fields to use another compatible provider."}</p></div></div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-medium text-[#A9C8B5]">Provider ID<Input value={onboardingProviderDraft.id} disabled={providerTestLoading} onChange={(event) => { const id = event.currentTarget.value; updateOnboardingProvider({ id, envKey: `${id.toUpperCase()}_API_KEY` }); }} className="h-9 border-[#294536] bg-[#050807] text-[#E8FFF0]" /></label>
                  <label className="grid gap-1 text-xs font-medium text-[#A9C8B5]">Display name<Input value={onboardingProviderDraft.name} disabled={providerTestLoading} onChange={(event) => updateOnboardingProvider({ name: event.currentTarget.value })} className="h-9 border-[#294536] bg-[#050807] text-[#E8FFF0]" /></label>
                  <label className="grid gap-1 text-xs font-medium text-[#A9C8B5] sm:col-span-2">Base URL<Input value={onboardingProviderDraft.baseUrl} disabled={providerTestLoading} onChange={(event) => updateOnboardingProvider({ baseUrl: event.currentTarget.value })} className="h-9 border-[#294536] bg-[#050807] text-[#E8FFF0]" /></label>
                  <label className="grid gap-1 text-xs font-medium text-[#A9C8B5] sm:col-span-2">API key<Input type="password" value={onboardingProviderDraft.secret ?? ""} disabled={providerTestLoading} onChange={(event) => updateOnboardingProvider({ secret: event.currentTarget.value || undefined })} placeholder="Stored in ~/.lotse/credentials.json; leave blank to keep an existing key" className="h-9 border-[#294536] bg-[#050807] font-mono text-[#E8FFF0]" /></label>
                </div>
                {providerTestResult && <p role={providerTestResult.ok ? "status" : "alert"} className={`mt-3 text-sm ${providerTestResult.ok ? "text-[#39FF88]" : "text-[#FB7185]"}`}>{providerTestResult.message}</p>}
                <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" className="quiet-button" disabled={authOnboardingLoading || providerTestLoading || providerSettingsSaving || !aiSettings} onClick={() => void testOnboardingProvider()}>{providerTestLoading ? "Testing…" : "Test credentials"}</button><button type="button" className="quiet-button" disabled={authOnboardingLoading || providerTestLoading || providerSettingsSaving || !aiSettings} onClick={() => void saveOnboardingProvider()}>{providerSettingsSaving ? "Saving…" : "Save and use provider"}</button></div>
              </section>
            </div>
            {aiSettingsError && <p role="alert" className="mt-4 text-sm text-[#FB7185]">{aiSettingsError}</p>}
            <div className="mt-6 flex items-center justify-end gap-2">{settingsOpen && <button type="button" onClick={() => setAuthOnboardingOpen(false)} className="quiet-button">Close</button>}{!providerAvailable && <button type="button" onClick={() => void loadOnboardingAuth()} disabled={authOnboardingLoading} className="quiet-button disabled:opacity-50">{authOnboardingLoading ? "Checking…" : "Retry"}</button>}<button type="button" onClick={completeAuthOnboarding} disabled={authOnboardingLoading || providerSettingsSaving || !providerAvailable} className="accent-button disabled:cursor-not-allowed disabled:opacity-50">Continue</button></div>
          </DialogContent>
        </Dialog>
      )}
    </main>
    </TooltipProvider>
    </PomodoroProvider>
  );
}

export default App;
