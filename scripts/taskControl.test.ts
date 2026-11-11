import assert from "node:assert/strict";
import { argumentsFor, getTask, requiredText, taskMetadata, taskObservation, taskStartPoint, taskSummary } from "../src/taskControl.ts";
import { normalizeTask } from "../src/tasks.ts";
import type { TaskCustomField } from "../src/types.ts";
const task = normalizeTask({ id: "12345678-1234-1234-1234-123456789abc", title: "Keep model and draft", manualStatus: "inbox", chatModel: "custom/model", chatEffort: "high", attachments: [{kind:"image",path:"/draft.png",name:"draft.png"}] })!;
const child = {...task,id:"child",parentId:task.id};
const sibling = {...task,id:"sibling"};
const fields: TaskCustomField[] = [{id:"priority",name:"Priority",type:"select",options:[{id:"high",label:"High"}],showOnCards:true,multiline:false,hyperlink:false}];
assert.throws(()=>argumentsFor({shell:"rm"},["taskId"]),/unknown/);
assert.throws(()=>argumentsFor([],[]),/arguments/);
assert.throws(()=>requiredText(" ","Prompt"),/nonempty/);
assert.throws(()=>requiredText("abcd","Title",3),/3/);
assert.throws(()=>getTask([task],"unknown"),/not found/);
const original=JSON.stringify(task);
const changed=taskMetadata([task,child,sibling],task,{title:"Renamed",description:"",status:"inReview",startDate:"2026-10-29",deadline:"2026-10-30",customFields:{priority:"high"}},fields);
assert.equal(changed[0].manualStatus,"inReview");
assert.equal(changed[0].chatModel,task.chatModel);
assert.equal(changed[0].chatEffort,task.chatEffort);
assert.deepEqual(changed[0].attachments,task.attachments);
assert.equal(JSON.stringify(task),original);
assert.equal(taskMetadata(changed,changed[0],{customFields:{priority:null}},fields)[0].customFields.priority,undefined);
for(const args of [{title:""},{description:"x".repeat(20001)},{status:"invalid"},{color:"pink"},{startDate:"2026-02-30"},{deadline:"2026-10-28",startDate:"2026-10-29"},{customFields:{unknown:"hi"}},{customFields:{priority:"low"}},{parentId:child.id},{parentId:"unknown"},{position:-1},{position:99}]) assert.throws(()=>taskMetadata([task,child,sibling],task,args,fields));
assert.equal(taskMetadata([task,child,sibling],task,{position:1},fields).map(t=>t.id).join(","),"sibling,"+task.id+",child");
assert.equal(taskMetadata([task,child,sibling],child,{parentId:null},fields).find(t=>t.id===child.id)?.parentId,null);
assert.equal(taskSummary({...task,chatMessages:[{id:"secret",role:"assistant",body:"code",createdAt:"",selection:null,snapshotId:null,suggestions:[],contexts:[]}]}).hasOwnProperty("chatMessages"),false);
const withResult={...task,chatMessages:[{id:"prompt",role:"user" as const,body:"Work",createdAt:"2026-10-29T09:00:00Z",selection:null,snapshotId:null,suggestions:[],contexts:[]},{id:"answer",role:"assistant" as const,body:"Finished",createdAt:"2026-10-29T09:01:00Z",selection:null,snapshotId:null,suggestions:[],contexts:[]}]};
assert.equal(taskObservation(withResult,{queueIds:[]}).status,"completed");
assert.equal(taskObservation(withResult,{queueIds:[],running:true}).status,"running");
assert.equal(taskObservation(withResult,{queueIds:[],approvalId:0,running:true}).status,"needsApproval");
assert.equal(taskObservation(withResult,{queueIds:[],inputId:0}).status,"needsInput");
for (const status of ["running", "completed", "failed", "cancelled"] as const) {
  const reopened = normalizeTask(JSON.parse(JSON.stringify({ ...withResult, chatMessages: withResult.chatMessages.map((entry) => entry.id === "prompt" ? { ...entry, runStatus: status, runError: status === "failed" ? "Tool failed" : undefined } : entry) })))!;
  assert.equal(taskObservation(reopened, { queueIds: [] }).status, status === "running" ? "interrupted" : status);
  if (status === "failed") assert.equal(taskObservation(reopened, { queueIds: [] }).result, "Tool failed");
}
assert.deepEqual(taskObservation(withResult,{queueIds:["next"],queuePaused:true}).queuedMessageIds,["next"]);
assert.equal(taskObservation(withResult,{queueIds:["next"],queuePaused:true}).queuePaused,true);
assert.equal(taskObservation(withResult,{queueIds:[]}).startedAt,Date.parse(withResult.chatMessages[0].createdAt));


assert.deepEqual(taskStartPoint({ kind: "workspace" }, [], []), { kind: "workspace" });
assert.deepEqual(taskStartPoint({ kind: "existing", branch: "main" }, ["main"], []), { kind: "existing", branch: "main" });
assert.deepEqual(taskStartPoint({ kind: "existing", branch: "origin/main", remote: true }, ["main"], ["origin/main"]), { kind: "existing", branch: "origin/main", remote: true });
assert.throws(() => taskStartPoint({ kind: "existing", branch: "origin/missing", remote: true }, ["main"], ["origin/main"]));
assert.throws(() => taskStartPoint({ kind: "workspace", remote: true }, [], []));
assert.throws(() => taskStartPoint({ kind: "existing", branch: "main", remote: "true" }, ["main"], []));
assert.deepEqual(taskStartPoint({ kind: "remote", branch: "origin/main" }, [], ["origin/main"]), { kind: "remote", branch: "origin/main" });
assert.throws(() => taskStartPoint({ kind: "branch", branch: "missing" }, ["main"], []));
assert.throws(() => taskStartPoint({ kind: "workspace", branch: "main" }, ["main"], []));
assert.throws(() => taskStartPoint({ kind: "shell", command: "no" }, [], []));

const nextUser={...withResult.chatMessages[0],id:"next",runStatus:"running" as const};
const overlapping={...withResult,chatMessages:[{...withResult.chatMessages[0],runStatus:"completed" as const},withResult.chatMessages[1],nextUser]};
const observation=taskObservation(overlapping,{running:true,queueIds:[]});
assert.equal(observation.messageId,"next");assert.equal(observation.outcomes[0].messageId,"prompt");assert.equal(observation.outcomes[0].result,"Finished");

console.log("Task control tests passed");

assert.equal(taskSummary({ ...task, createdAt: 1000, updatedAt: 2000 }).createdAt, 1000);
assert.equal(taskSummary({ ...task, createdAt: 1000, updatedAt: 2000 }).updatedAt, 2000);
assert.equal(taskSummary(task).createdAt, null);
for (const args of [{ createdAt: 1000 }, { updatedAt: 2000 }]) assert.throws(() => argumentsFor(args, ["title", "description"]), /unknown/);

assert.equal(taskSummary(task).url, `#task=${task.id}`);
