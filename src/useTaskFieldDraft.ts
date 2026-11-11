import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

export function useTaskFieldDraft<T>(value: T, onChange: (value: T) => void, beforeReplace?: () => void | (() => void)) {
  const [draft, setDraft] = useState(value);
  const valueRef = useRef(value);
  const handlersRef = useRef({ onChange, beforeReplace });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useLayoutEffect(() => { handlersRef.current = { onChange, beforeReplace }; });
  const flush = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
    handlersRef.current.onChange(valueRef.current);
  }, []);
  const change = useCallback((next: T) => {
    if (next === valueRef.current) return;
    valueRef.current = next;
    setDraft(next);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, 300);
  }, [flush]);
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
  useLayoutEffect(() => {
    if (valueRef.current === value) return;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    const cleanup = handlersRef.current.beforeReplace?.();
    valueRef.current = value;
    setDraft(value);
    return cleanup;
  }, [value]);
  return [draft, change, flush] as const;
}
