import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { createProject, getProject, mutateProject } from "../apps/web/lib/local-project-store";
import { workflowFor, transition, intakeMissing } from "../apps/web/lib/workflow";
import { AttachmentsSchema, modelImages } from "../apps/web/lib/attachments";
import { teamContext } from "../apps/web/lib/workshop-agent";
import * as workshopAgent from "../apps/web/lib/workshop-agent";
import type { AgentPlan, BuildResult, LocalProject } from "../apps/web/lib/project-types";

vi.mock("../apps/web/lib/build-pipeline", async (importOriginal) => {
  const original = await importOriginal<typeof import("../apps/web/lib/build-pipeline")>();
  return { ...original, runBuildPipeline: vi.fn(async () => ({
    status:"needs_input", blueprint:{title:"검증 회로",board:"Nano",supplyVoltage:5,components:[{ref:"U1",type:"controller",valueOrModel:"Nano",reason:"제어"}],nets:[],enclosure:{widthMm:80,depthMm:60,heightMm:40,wallMm:3},firmware:{platform:"arduino",behavior:"버튼 알림",pinAssignments:[],loopSteps:[]},assumptions:[],humanChecks:[]},
    checks:[],evaluator:{summary:"실측 필요",hw:{verdict:"unknown",findings:[],requiredMeasurements:["전압을 측정해주세요."]},sw:{verdict:"unknown",findings:[],requiredRuns:["컴파일 결과를 알려주세요."]}},
    artifacts:[{id:"circuit",kind:"circuit",filename:"circuit.md",mimeType:"text/plain",content:"회로",createdAt:new Date().toISOString()}],createdAt:new Date().toISOString()
  } satisfies BuildResult)) };
});
import { POST as workflowPost } from "../apps/web/app/api/projects/[id]/workflow/route";
import { POST as messagePost } from "../apps/web/app/api/projects/[id]/messages/route";
import { GET as download } from "../apps/web/app/api/projects/[id]/artifacts/[artifactId]/route";
import { GET as downloadFile } from "../apps/web/app/api/projects/[id]/files/[fileId]/route";

let folder:string;
const plan:AgentPlan={projectName:"테스트 제작",oneLiner:"설계 흐름 검증",reply:"어떤 동작을 만들까요?",slotUpdates:[],tasks:[]};
const request=(suffix:string,body:unknown)=>new NextRequest("http://localhost:3000/api/projects/test/"+suffix,{method:"POST",headers:{"content-type":"application/json",origin:"http://localhost:3000"},body:JSON.stringify(body)});
async function act(p:LocalProject,input:unknown) {const response=await workflowPost(request("workflow",input),{params:Promise.resolve({id:p.id})});return {status:response.status,...await response.json()} as {status:number;project:LocalProject;error?:string};}
beforeAll(async()=>{folder=await mkdtemp(path.join(tmpdir(),"forge-workflow-test-"));vi.stubEnv("FORGE_TEST_DATA_FILE",path.join(folder,"projects.json"));vi.stubEnv("APP_MODE","mock");});
afterAll(async()=>{vi.unstubAllEnvs();await rm(folder,{recursive:true,force:true});});

describe("persisted approval and team workflow",()=>{
  it("blocks premature planning, sequences circuit → CAD → handoff, shares room changes and evidence",async()=>{
    let p=await createProject("웨어러블 로봇 앱",plan,"mock");
    expect(workflowFor(p).phase).toBe("brainstorm");
    expect((await act(p,{action:"plan"})).status).toBe(409);
    expect((await act(p,{action:"enter_workshop"})).status).toBe(409);
    p=(await act(p,{action:"profile",profile:{coreBehavior:"버튼을 누르면 LED가 켜져요",tools:[],toolsConfirmed:true,firmwareExperience:"none"}})).project;
    p=(await act(p,{action:"plan"})).project;
    expect(p.workflow?.phase).toBe("circuit");
    expect(p.build?.artifacts.some(a=>a.kind==="cad")).toBe(false);
    expect((await act(p,{action:"approve_mockup"})).status).toBe(409);
    p=(await act(p,{action:"approve_circuit"})).project;
    expect(p.workflow?.phase).toBe("mockup");
    const cad=p.build!.artifacts.find(a=>a.kind==="cad")!;
    expect(cad.content).toContain("difference()");
    p=(await act(p,{action:"approve_mockup"})).project;
    expect(p.tasks.some(t=>t.kind==="measure")).toBe(true);
    p=(await act(p,{action:"enter_workshop"})).project;
    expect(p.stage).toBe("workshop");
    const response=await messagePost(request("messages",{text:"멀티미터가 없어요. 구매도 어렵습니다. 대체 확인 방법을 알려주세요.",channel:"hw",mode:"evaluate"}),{params:Promise.resolve({id:p.id})});
    expect(response.status).toBe(200);
    p=(await response.json()).project;
    expect(p.messages.at(-1)?.agent).toBe("hw");
    expect(p.messages.at(-1)?.mode).toBe("evaluate");
    expect(teamContext(p).sharedUpdates.at(-1)?.text).toContain("멀티미터");
    expect(teamContext(p).profile.tools).toEqual([]);
    p=(await act(p,{action:"purchase",ref:"U1",status:"problem",note:"품절이라 대체품 필요"})).project;
    expect(teamContext(p).purchases.U1).toBe("problem");
    const task=p.tasks.find(t=>t.kind==="measure")!;
    p=(await act(p,{action:"evidence",taskId:task.id,text:"4.9 V 측정"})).project;
    expect(teamContext(p).evidence[0].text).toBe("4.9 V 측정");
    expect(p.build?.evaluator.hw.verdict).toBe("unknown");
    p=(await act(p,{action:"reopen"})).project;
    expect(p.workflow?.circuitApprovedAt).toBeNull();
    const blocked=await download(new NextRequest("http://localhost:3000"),{params:Promise.resolve({id:p.id,artifactId:cad.id})});
    expect(blocked.status).toBe(409);
    expect((await getProject(p.id))?.workflow?.phase).toBe("brainstorm");
  });
  it("detects stale writes and keeps every concurrent shared update",async()=>{
    const p=await createProject("부품 상자",plan,"mock");
    await Promise.all([1,2].map(n=>mutateProject(p.id,x=>x.workflow!.sharedUpdates.push({id:String(n),agent:"me",text:"치수 "+n,createdAt:new Date().toISOString()}))));
    const current=(await getProject(p.id))!;
    expect(current.workflow?.sharedUpdates).toHaveLength(2);
    await expect(mutateProject(p.id,x=>{x.name="덮어쓰기";},p.designRevision)).rejects.toThrow("다른 변경");
    expect((await getProject(p.id))?.name).toBe(plan.projectName);
  });
  it("inherits maker tools for new projects but asks each project's core behavior again",async()=>{
    const p=await createProject("다른 프로젝트",plan,"mock");
    expect(p.workflow?.profile.firmwareExperience).toBe("none");
    expect(intakeMissing(p.workflow!.profile)).toEqual(["핵심 동작"]);
  });
  it("rejects unexpected image types and passes images as vision blocks",()=>{
    expect(AttachmentsSchema.safeParse([{name:"bad.svg",dataUrl:"data:image/svg+xml;base64,AAAA"}]).success).toBe(false);
    const attachments=AttachmentsSchema.parse([{name:"reference.png",dataUrl:"data:image/png;base64,aGVsbG8="}]);
    expect(modelImages(attachments)).toEqual([{mediaType:"image/png",data:"aGVsbG8="}]);
  });
  it("requires at least one active specialist before workshop entry",()=>{
    const w=workflowFor({idea:"로봇",build:null});
    expect(()=>transition({...w,phase:"handoff",mockupApprovedAt:"now",activeAgents:[]},"enter_workshop",true)).toThrow("하나 이상");
  });
  it("persists a specialist file, shares it with the team and downloads exact content", async () => {
    const created = await createProject("파일 전달 검사", plan, "mock");
    const p = await mutateProject(created.id, project => { project.workflow!.phase = "workshop"; project.workflow!.activeAgents = ["me"]; });
    const content = "difference(){cube([20,20,2]);translate([10,10,-1])cylinder(d=8,h=4);}";
    const spy = vi.spyOn(workshopAgent, "runWorkshopAgent").mockResolvedValueOnce({ replies: [{ agent: "me", text: "8mm 초안, 실측 필요" }], sharedSummary: "구멍 8mm 변경 제안. 아직 실측 없음.", files: [{ agent: "me", filename: "button.scad", content }] });
    try {
      const response = await messagePost(request("messages", { text: "8mm 초안 파일", channel: "me", mode: "work" }), { params: Promise.resolve({ id: p!.id }) });
      expect(response.status).toBe(200);
      const saved = (await response.json()).project as LocalProject;
      expect(teamContext(saved).workspaceFiles?.[0].content).toBe(content);
      expect(teamContext(saved).sharedUpdates.at(-1)?.text).toContain("실측 없음");
      const file = saved.workspaceFiles![0];
      const result = await downloadFile(new NextRequest("http://localhost:3000"), { params: Promise.resolve({ id: saved.id, fileId: file.id }) });
      expect(result.headers.get("content-disposition")).toContain("button.scad");
      expect(await result.text()).toBe(content);
      expect(saved.build).toEqual(created.build);
    } finally { spy.mockRestore(); }
  });
});
