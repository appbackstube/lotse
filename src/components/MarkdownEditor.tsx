import { Component, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MDXEditor, codeBlockPlugin, codeMirrorPlugin, headingsPlugin, imagePlugin, linkPlugin, listsPlugin, markdownShortcutPlugin, quotePlugin, tablePlugin, thematicBreakPlugin, type MDXEditorMethods } from "@mdxeditor/editor";
import { Textarea } from "./ui/textarea";

const markdownPastePattern = /(?:^|\n)\s{0,3}(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|`{3}|~{3}|(?:---|\*\*\*|___)\s*(?:\n|$)|\|[^\n]*\|)|(?:\*\*|__|~~)[^\n]+?(?:\*\*|__|~~)|\[[^\]]+\]\([^)]+\)|`[^`\n]+`|(?:^|[\s(])(?:\*[^*\s\n][^*\n]*\*|_[^_\s\n][^_\n]*_)/;
const RichTextEditor = memo(MDXEditor);

class MarkdownEditorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function MarkdownEditor({ value, readOnly = false, onChange, placeholder, contentClassName, maxLength = 1_000_000, maxBytes, imagePreviewHandler }: {
  value: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
  placeholder: string;
  contentClassName: string;
  maxLength?: number;
  maxBytes?: number;
  imagePreviewHandler?: (source: string) => Promise<string>;
}) {
  const editorRef = useRef<MDXEditorMethods>(null);
  const valueRef = useRef(value);
  // MDXEditor uses markdown only on mount; external edits are applied below.
  const [initialMarkdown] = useState(value);
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => { onChangeRef.current = onChange; });
  const [sourceMode, setSourceMode] = useState(false);
  const plugins = useMemo(() => [headingsPlugin(), listsPlugin(), quotePlugin(), linkPlugin(), imagePlugin({ imagePreviewHandler }), tablePlugin(), thematicBreakPlugin(), codeBlockPlugin(), codeMirrorPlugin({ codeBlockLanguages: {}, autoLoadLanguageSupport: false }), markdownShortcutPlugin()], [imagePreviewHandler]);
  const handleChange = useCallback((next: string, initialMarkdownNormalize = false) => {
    if (initialMarkdownNormalize || next === valueRef.current) return;
    if (next.length > maxLength || (maxBytes && new TextEncoder().encode(next).length > maxBytes)) { editorRef.current?.setMarkdown(valueRef.current); return; }
    valueRef.current = next;
    onChangeRef.current(next);
  }, [maxLength, maxBytes]);
  const handleError = useCallback(() => queueMicrotask(() => setSourceMode(true)), []);
  const sourceEditor = <div className="space-y-2"><p role="status" className="text-xs text-[#7C9B88]">This content is shown as Markdown source because rich text could not display it.</p><Textarea aria-label="Markdown source" value={value} readOnly={readOnly} placeholder={placeholder} className="min-h-40 w-full font-mono text-sm" onChange={(event) => handleChange(event.currentTarget.value)} /></div>;
  useEffect(() => {
    if (valueRef.current === value) return;
    valueRef.current = value;
    editorRef.current?.setMarkdown(value);
  }, [value]);
  return <div onPasteCapture={(event) => {
    if (readOnly || event.clipboardData.files.length || !(event.target instanceof HTMLElement) || !event.target.closest('[contenteditable="true"]') || event.target.closest('.cm-editor')) return;
    const text = event.clipboardData.getData("text/plain");
    if (!markdownPastePattern.test(text)) return;
    event.preventDefault();
    event.stopPropagation();
    editorRef.current?.insertMarkdown(text);
  }}><MarkdownEditorBoundary fallback={sourceEditor}>{sourceMode ? sourceEditor : <RichTextEditor ref={editorRef} markdown={initialMarkdown} readOnly={readOnly} plugins={plugins} placeholder={placeholder} className="task-markdown-editor" contentEditableClassName={contentClassName} onError={handleError} onChange={handleChange} />}</MarkdownEditorBoundary></div>;
}
