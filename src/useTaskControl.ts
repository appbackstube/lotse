import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { fileStore } from "./fileStore";

export type TaskControlRequest = { repositoryRoot: string; operationId: string; callerTaskId: string | null; name: string; arguments: Record<string, unknown> };
type Options = {
  root?: string; ready: boolean;
  callerRunId: (taskId: string | null) => string | undefined;
  execute: (request: TaskControlRequest, active: () => Promise<boolean>) => Promise<unknown>;
  cancelConfirmation: () => void;
  onError: (error: string) => void;
};
const reason = (error: unknown) => error instanceof Error ? error.message : String(error);

export function useTaskControl(options: Options) {
  const latest = useRef(options); latest.current = options;
  useEffect(() => {
    if (!options.root || !options.ready) return;
    let disposed = false;
    let writes = Promise.resolve();
    const operations = new Map<string, Promise<unknown>>();
    const requests = listen<TaskControlRequest>("task-control-request", (event) => {
      const request = event.payload;
      if (disposed || request.repositoryRoot !== latest.current.root) return;
      const callerRunId = latest.current.callerRunId(request.callerTaskId);
      const active = async () => !disposed && latest.current.ready && request.repositoryRoot === latest.current.root
        && (request.callerTaskId === null && !callerRunId || !!callerRunId && latest.current.callerRunId(request.callerTaskId) === callerRunId)
        && await invoke<boolean>("task_control_active", { repositoryRoot: request.repositoryRoot, operationId: request.operationId });
      let operation = operations.get(request.operationId);
      if (!operation) {
        const execute = async () => {
          if (!await active()) throw new Error("Calling agent stopped or repository changed.");
          await fileStore.flush();
          if (!await active()) throw new Error("Calling agent stopped or repository changed.");
          return latest.current.execute(request, active);
        };
        // Serialize mutations so concurrent agents cannot overwrite each other's task changes.
        if (request.name.startsWith("get_")) operation = execute();
        else { operation = writes.then(execute); writes = operation.then(() => {}, () => {}); }
        operations.set(request.operationId, operation);
      }
      void operation.then(
        (result) => invoke("task_control_ack", { operationId: request.operationId, result, error: null }),
        (error) => invoke("task_control_ack", { operationId: request.operationId, result: null, error: reason(error) }),
      ).then(() => operations.delete(request.operationId)).catch((error) => {
        if (!disposed) latest.current.onError(reason(error));
      });
    });
    return () => {
      disposed = true;
      latest.current.cancelConfirmation();
      void requests.then((stop) => stop());
    };
  }, [options.root, options.ready]);
}
