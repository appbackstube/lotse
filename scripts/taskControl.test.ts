import assert from "node:assert/strict";
import { agentMetadata, argumentsFor, getTask, playbookMetadata, requiredText, taskMetadata, taskObservation, taskStartPoint, taskSummary } from "../src/taskControl.ts";
import { newAgent } from "../src/agents.ts";
import { newPlaybook, preparePlaybookPrompt } from "../src/playbooks.ts";
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

const role = { id: "owner", title: "Owner", prompt: "Clarify goals" };
assert.deepEqual(agentMetadata(role, { title: " Product owner " }), { ...role, title: "Product owner" });
for (const args of [{ title: null }, { title: " " }, { title: "x".repeat(201) }, { prompt: null }, { prompt: "" }, { prompt: "x".repeat(20_001) }]) assert.throws(() => agentMetadata(role, args));
assert.throws(() => agentMetadata(newAgent(), { title: "Missing prompt" }));
const template = playbookMetadata(newPlaybook(), { title: "Review", description: "Check an area", prompt: "Review {{AREA}}", variables: [{ name: "AREA", label: "Which area?", type: "singleLine" }] });
assert.equal(template.variables.length, 1);
assert.ok(template.variables[0].id);
assert.deepEqual(playbookMetadata(template, { description: "" }), { ...template, description: "" });
assert.equal(playbookMetadata(template, { variables: [{ name: "AREA", label: "Area", type: "multiLine" }] }).variables[0].id, template.variables[0].id);
assert.equal(playbookMetadata(template, { variables: [{ id: "renamed", name: "OTHER", label: "Other", type: "multiLine" }] }).variables[0].id, "renamed");
assert.deepEqual(playbookMetadata(template, { prompt: "Review all", variables: [] }).variables, []);
assert.equal(preparePlaybookPrompt(template, { AREA: "auth" }).prompt, "Review auth");
const variable = template.variables[0];
for (const args of [{ description: null }, { description: "x".repeat(20_001) }, { variables: null }, { variables: {} }, { variables: Array(101).fill(variable) },
  { variables: [null] }, { variables: [{ ...variable, extra: true }] }, { variables: [{ ...variable, name: "1INVALID" }] }, { variables: [{ ...variable, label: " " }] },
  { variables: [{ ...variable, type: "unknown" }] }, { variables: [{ ...variable, id: "" }] }, { variables: [variable, { ...variable, id: "other" }] }, { variables: [variable, { ...variable, name: "OTHER" }] }]) assert.throws(() => playbookMetadata(template, args));
assert.equal(template.description, "Check an area");
assert.equal(template.variables[0].label, "Which area?");

const selectedTask = taskMetadata([task], task, { agentId: role.id }, [], [role])[0];
assert.deepEqual(selectedTask.chatAgent, role);
assert.deepEqual(selectedTask.attachments, task.attachments);
assert.equal(selectedTask.chatModel, task.chatModel);
assert.equal(selectedTask.chatEffort, task.chatEffort);
assert.equal(selectedTask.worktree, task.worktree);
assert.equal(task.chatAgent, null);
assert.deepEqual(taskSummary(selectedTask).agent, { id: role.id, title: role.title });
assert.equal(taskSummary(task).agent, null);
assert.equal(taskMetadata([selectedTask], selectedTask, { title: "Keep role" }, [], [role])[0].chatAgent, role);
assert.equal(taskMetadata([selectedTask], selectedTask, { agentId: null }, [], [role])[0].chatAgent, null);
for (const agentId of ["missing", "", " ", 42, {}, false]) assert.throws(() => taskMetadata([task], task, { agentId }, [], [role]));
for (const existing of [{ ...selectedTask, chatMessages: withResult.chatMessages }, { ...selectedTask, agentThreadId: "thread" }]) {
  assert.throws(() => taskMetadata([existing], existing, { agentId: null }, [], [role]), /conversation/);
  assert.throws(() => taskMetadata([existing], existing, { agentId: role.id }, [], [{ ...role, prompt: "Updated role" }]), /conversation/);
  assert.deepEqual(taskMetadata([existing], existing, { agentId: role.id, title: "Safe metadata update" }, [], [role])[0].chatMessages, existing.chatMessages);
}
assert.deepEqual(taskMetadata([selectedTask], selectedTask, { agentId: role.id }, [], [{ ...role, prompt: "Updated role" }])[0].chatAgent, { ...role, prompt: "Updated role" });
