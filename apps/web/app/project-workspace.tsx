"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { AgentId, ChatChannel, ImageAttachment, LocalProject, MakerProfile } from "../lib/project-types";
import { AGENTS, agentName, emptyProfile, intakeMissing, personPart, TOOL_OPTIONS, workflowFor } from "../lib/workflow";
import { CODING_EXPERIENCE, DEV_TOOLS, emptyDevProfile } from "../lib/dev-handoff";
import { workbenchItems } from "../lib/workbench";
import WorkbenchPanel from "./workbench-panel";
import ConnectPanel from "./connect-panel";
import AccountHub, { type HubTab } from "./account-hub";
import ProjectSettings from "./project-settings";
import StatusPanel from "./status-panel";
import { boardOf, viewBoard } from "../lib/board";
import MakerspaceList from "./makerspace-list";
import OwnedPartsField from "./owned-parts-field";
import Tour, { type Station } from "./tour";
import StartChecklist from "./start-checklist";
import DeleteProjectDialog from "./delete-project-dialog";
import ProgressPanel, { ProgressRing } from "./progress-panel";
import { projectProgress } from "../lib/progress";
import { CHECKLIST } from "../lib/checklist";
import { ResizeHandle, useWorkspaceLayout, layoutLimits } from "./workspace-layout";
import { useWorkspacePreferences } from "./workspace-preferences";
import { IconBook, IconDesk, IconHammer, IconLaptop, IconLink, IconPencil, IconPeople, IconPerson, IconPrinter, IconTrash, IconUndo } from "./icons";
import MessageText from "./message-text";
import HelperComposer, { type HelperLive, type HelperTurn } from "./helper-composer";
import { suggestNext } from "../lib/suggest";

type ViewerInfo = { kind: "operator" } | { kind: "user"; name: string; webAi: boolean; projectLimit?: number; credit?: { remainingUsd: number; allowanceUsd: number } | null };
const phaseNames = {brainstorm:"아이디어",circuit:"계획 · 회로",mockup:"계획 · 3D",handoff:"계획 · 작업 준비",workshop:"대장간"};
function Avatar({ agent="chief", busy=false, large=false }: {agent?:AgentId;busy?:boolean;large?:boolean}) {
  return <span className={["avatar",large?"large":"","avatar-"+agent].join(" ")}><img src="/characters/idle.png" alt={AGENTS[agent].name+" 캐릭터"} className={busy?"hidden":""}/>{busy&&<><img className="thinking first" src="/characters/thinking_1.png" alt="생각하는 달그락"/><img className="thinking second" src="/characters/thinking_2.png" alt=""/></>}<b>{agent==="chief"?"대장":agent.toUpperCase()}</b></span>;
}

export default function ProjectWorkspace() {
  const [projects,setProjects]=useState<LocalProject[]>([]);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [text,setText]=useState("");
  const [attachments,setAttachments]=useState<ImageAttachment[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [channel,setChannel]=useState<ChatChannel>("main");
  const [mode,setMode]=useState<"work"|"evaluate">("work");
  const [showProfile,setShowProfile]=useState(false);
  const [profileScope,setProfileScope]=useState<"project"|"account">("project");
  const [showTutorial,setShowTutorial]=useState(false);
  const [renaming,setRenaming]=useState<string|null>(null);
  const [dragId,setDragId]=useState<string|null>(null);
  const [profile,setProfile]=useState<MakerProfile>(emptyProfile());
  const [viewer,setViewer]=useState<ViewerInfo>({kind:"operator"});
  const [connectTab,setConnectTab]=useState<"ai"|"dev"|null>(null);
  const [makerHelp,setMakerHelp]=useState(false);
  const [hub,setHub]=useState<HubTab|null>(null);
  // 도우미가 답을 흘려보내는 동안의 말풍선과, 아직 프로젝트가 없는 대화(저장할 곳이 없어 화면에만 둔다).
  const [helperLive,setHelperLive]=useState<HelperLive|null>(null);
  const [loose,setLoose]=useState<Array<{role:"user"|"assistant";text:string}>>([]);
  const [deleting,setDeleting]=useState<LocalProject|null>(null);
  const {preferences,setWorkbench,expand,toggleProjects,toggleFolder,toggleShortNames,setShortNames,setTutorialSeen,markSeen,ready:prefsReady}=useWorkspacePreferences();
  const end=useRef<HTMLDivElement>(null);
  const fileInput=useRef<HTMLInputElement>(null);
  const project=projects.find(p=>p.id===selectedId)??null;
  const items=workbenchItems(project);
  const workbenchPreference=project?preferences.workbenches[project.id]:undefined;
  const selectedItem=items.find(i=>i.id===workbenchPreference?.selected)??items[0];
  // 오른쪽 패널은 프로젝트가 있으면 늘 있다(접을 수 있다). 기본은 작업대이고, 결과물을 누르면 같은 자리에 열린다.
  const [panelHidden,setPanelHidden]=useState(true);
  const [panelMode,setPanelMode]=useState<"status"|"files">("status");
  // 휴대폰에서는 대화가 화면 전부다. 프로젝트 목록과 작업대은 버튼으로 여닫는 서랍이다.
  const [navOpen,setNavOpen]=useState(false);
  // 내 공방: 내가 확인해 줘야 하는 것만, 프로젝트를 가리지 않고 한곳에.
  const [showWorkshop,setShowWorkshop]=useState(false);
  const myTurns=projects.flatMap(p=>viewBoard(boardOf(p)).cards.filter(c=>c.active&&c.turn==="person").map(c=>({project:p,card:c})));
  const showArtifacts=!!project&&!panelHidden;
  const viewing=showArtifacts&&items.length>0&&!!selectedItem&&(workbenchPreference?.open??false);
  const board=viewBoard(boardOf(project??{}));
  // 지금 이 프로젝트에 있는 것들의 표식. 여기에 있는데 '본 것'에 없으면 새로 온 것이다.
  const marks=project?[...items.map(i=>"item:"+i.id),...project.tasks.filter(t=>t.status==="ready").map(t=>"task:"+t.id)]:[];
  const seenMarks=project?preferences.seen[project.id]??[]:[];
  const newMarks=prefsReady?marks.filter(m=>!seenMarks.includes(m)):[];
  // 작업대를 열어보면 읽은 것으로 친다. 다만 바로 지우면 강조가 눈에 들기도 전에
  // 사라지므로 2.5초 뒤에 적는다. 그 사이에 새로 온 줄이 한 번 반짝인다.
  useEffect(()=>{
    if(!project||!showArtifacts||!prefsReady||!newMarks.length)return;
    const id=project.id;const pending=[...newMarks];
    const timer=setTimeout(()=>markSeen(id,pending),2500);
    return ()=>clearTimeout(timer);
  },[project?.id,showArtifacts,prefsReady,newMarks.join("|")]);// eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{if(prefsReady&&!preferences.tutorialSeen)setShowTutorial(true);},[prefsReady,preferences.tutorialSeen]);
  // 투어는 둘러보기까지만 한다. 한 장에 한 가지, 40자 안쪽. 설명서를 모달에 넣으면
  // 아무도 읽지 않는다. 실제로 하게 만드는 것은 아래 체크리스트가 맡는다.
  const tourStations: Station[] = [
    { key: "hello", title: "달그락 대장간",
      body: <p>회로도 코드도 몰라도, 머릿속 물건을 실제로 만들어봅니다.</p>,
      actions: ({ next, close }) => <>
        <button className="primary" onClick={close}>아이디어부터 적어보기</button>
        <button onClick={next}>화면 먼저 둘러보기</button>
      </> },
    { key: "projects", target: "projects", title: "프로젝트",
      body: <p>아이디어 하나가 프로젝트 하나. 왼쪽 고리가 진행률이에요.</p> },
    { key: "progress", target: "progress", title: "진행 단계",
      body: <p>여덟 단계 중 지금 여기. 눌러서 펼쳐보세요.</p> },
    { key: "workbench-button", target: "workbench-button", title: "작업대", optional: true,
      body: <p>설계·회로·3D·부품이 여기 쌓여요. 새로 생기면 주황 점.</p> },
    { key: "composer", target: "composer", title: "시작하기",
      body: <p>만들고 싶은 것을 한 줄로 적어보세요.</p> }
  ];
  const layout=useWorkspaceLayout(showArtifacts);
  useEffect(()=>{if(layout.mobile)setPanelHidden(true);},[layout.mobile]);
  const workflow=project?workflowFor(project):null;
  const phase=workflow?.phase??"brainstorm";
  const workshop=phase==="workshop";
  // 방은 대장이 일을 나눈 뒤에 열린다(예전 프로젝트는 대장간 단계부터).
  const roomsOn=workshop||board.rooms.some(r=>r.room!=="chief");
  const room:ChatChannel=roomsOn?channel:"main";
  async function boardAction(body:Record<string,unknown>) {if(!project)return;try{const r=await fetch("/api/projects/"+project.id+"/board",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const b=await r.json();if(!r.ok)throw new Error(b.error??"반영하지 못했어요.");if(b.project)setProjects(ps=>ps.map(x=>x.id===b.project.id?b.project:x));}catch(e){setError(e instanceof Error?e.message:"반영하지 못했어요.");}}
  // Connector accounts talk to their own Claude; this page shows and approves.
  const connectorOnly=viewer.kind==="user"&&!viewer.webAi;
  const busyRef=useRef("");busyRef.current=busy;
  useEffect(()=>{fetch("/api/projects",{cache:"no-store"}).then(async r=>{if(r.status===401){window.location.assign("/login");return;}if(!r.ok)throw new Error("프로젝트를 불러오지 못했습니다. 로그인 상태를 확인해주세요.");const b=await r.json();setProjects(b.projects);if(b.viewer)setViewer(b.viewer);
    // Links from Claude can name a project and a panel (?p=<id>&open=profile|claude|dev).
    const query=new URLSearchParams(window.location.search);if(query.get("open")==="account"){setHub("account");window.history.replaceState(null,"","/");}const target=(b.projects as LocalProject[]).find(x=>x.id===query.get("p"));
    if(target){setSelectedId(target.id);expand(target.id);const open=query.get("open");if(open==="profile"){setProfile(workflowFor(target).profile);setShowProfile(true);}else if(open==="ai"||open==="claude")setHub("ai");else if(open==="dev")setConnectTab("dev");window.history.replaceState(null,"","/");}
  }).catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);
  // Claude writes to projects from outside this page, so pick up changes while idle.
  // Poll every 3s while Claude reports live progress on the open project, else every 8s.
  const liveRef=useRef(false);liveRef.current=!!project?.liveStatus&&Date.now()-new Date(project.liveStatus.updatedAt).getTime()<120_000;
  useEffect(()=>{let timer:ReturnType<typeof setTimeout>;let stopped=false;const tick=()=>{timer=setTimeout(()=>{if(stopped)return;if(busyRef.current||document.hidden){tick();return;}fetch("/api/projects",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(b=>{if(b&&!busyRef.current)setProjects(current=>JSON.stringify(current)===JSON.stringify(b.projects)?current:b.projects);}).catch(()=>{}).finally(tick);},liveRef.current?3000:8000);};tick();return()=>{stopped=true;clearTimeout(timer);};},[]);
  useEffect(()=>{end.current?.scrollIntoView({behavior:"smooth",block:"end"});},[project?.messages.length,busy,channel,helperLive?.text.length,helperLive?.step,loose.length]);
  function accept(p:LocalProject) {
    const before=workbenchItems(projects.find(x=>x.id===p.id)??null);
    const added=workbenchItems(p).find(i=>i.kind!=="record"&&!before.some(old=>old.id===i.id&&old.content===i.content&&old.filename===i.filename));
    if(added){setWorkbench(p.id,true,added.id);setPanelHidden(false);}
    setProjects(ps=>[p,...ps.filter(x=>x.id!==p.id)]);setSelectedId(p.id);expand(p.id);
  }
  // 도우미가 답을 끝내면 목록을 다시 읽는다. 프로젝트 없이 시작했다면 도우미가 방금 만든 것을 연다.
  // 프로젝트가 생기지 않은 대화(인사, 질문)는 저장할 곳이 없으므로 화면에 남겨 둔다.
  async function helperTurnEnd(turn:HelperTurn) {
    const b=await fetch("/api/projects",{cache:"no-store"}).then(r=>r.ok?r.json():null).catch(()=>null);
    const known=new Set(projects.map(p=>p.id));if(b)setProjects(b.projects);
    if(turn.hadProject)return;
    const created=b?(b.projects as LocalProject[]).find(p=>!known.has(p.id)):null;
    if(created){setLoose([]);setSelectedId(created.id);expand(created.id);return;}
    setLoose(l=>[...l,{role:"user",text:turn.user},...(turn.assistant?[{role:"assistant" as const,text:turn.assistant}]:[])]);
  }
  async function request(url:string,body:unknown,label:string) {
    if(busy)return;setBusy(label);setError("");
    try {const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});if(r.status===401){window.location.assign("/login");return;}const b=await r.json();if(!r.ok||!b.project)throw new Error(b.error??"요청에 실패했습니다.");accept(b.project);return b.project as LocalProject;}
    catch(e){setError(e instanceof Error?e.message:"요청에 실패했습니다.");}
    finally{setBusy("");}
  }
  async function submit(e:FormEvent) {e.preventDefault();if(!text.trim()&&!attachments.length)return;const p=await request(project?"/api/projects/"+project.id+"/messages":"/api/projects",project?{text:text.trim()||"첨부 이미지로 아이디어를 함께 논의해주세요.",attachments,channel,mode}:{idea:text.trim()||"첨부 이미지로 제작 아이디어를 구체화해주세요.",attachments},(workshop&&channel!=="main"?agentName(channel,preferences.shortNames):"대장 달그락")+"이 생각하고 있어요");if(p){setText("");setAttachments([]);}}
  async function action(input:Record<string,unknown>) {if(!project)return;const labels:Record<string,string>={plan:"회로 초안을 설계하고 검토하고 있어요",approve_circuit:"승인된 회로로 3D 목업을 만들고 있어요",approve_mockup:"다음 작업을 정리하고 있어요",enter_workshop:"대장간을 준비하고 있어요"};const p=await request("/api/projects/"+project.id+"/workflow",input,labels[String(input.action)]??"프로젝트에 반영하고 있어요");if(p){const kind=input.action==="plan"?"circuit":input.action==="approve_circuit"?"cad":input.action==="approve_mockup"?"tasks":null;const item=workbenchItems(p).find(i=>i.kind===kind);if(item)setWorkbench(p.id,true,item.id);if(input.action==="enter_workshop")setChannel("main");if(input.action==="profile"){setShowProfile(false);const access=(input.profile as MakerProfile|undefined)?.printerAccess;if(access==="makerspace"||access==="none")setHub("place");}}}
  async function attach(files:FileList|null) {if(!files)return;setError("");try {const added:ImageAttachment[]=[];for(const f of Array.from(files)){if(!["image/png","image/jpeg","image/webp"].includes(f.type))throw new Error("PNG, JPG, WebP 이미지를 선택해주세요.");if(f.size>5*1024*1024)throw new Error("이미지 한 장은 5MB 이하로 첨부해주세요.");const bitmap=await createImageBitmap(f);const canvas=document.createElement("canvas");const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));canvas.width=bitmap.width*scale;canvas.height=bitmap.height*scale;canvas.getContext("2d")!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();added.push({name:f.name,dataUrl:canvas.toDataURL("image/jpeg",.82)});}if(attachments.length+added.length>3)throw new Error("한 번에 이미지는 3장까지 첨부할 수 있어요.");setAttachments([...attachments,...added]);}catch(e){setError(e instanceof Error?e.message:"이미지 처리에 실패했습니다.");}if(fileInput.current)fileInput.current.value="";}
  function switchProject(id:string|null,room:ChatChannel="main"){if(busy)return;setLoose([]);setNavOpen(false);if(layout.mobile)setPanelHidden(true);setConnectTab(null);setSelectedId(id);setChannel(room);setText("");setAttachments([]);setError("");setMode("work");setShowProfile(false);if(id)expand(id);}
  function toggleAgent(agent:AgentId) {if(!workflow)return;const next=workflow.activeAgents.includes(agent)?workflow.activeAgents.filter(a=>a!==agent):[...workflow.activeAgents,agent];if(!next.length){setError("함께 작업할 에이전트를 하나 이상 선택해주세요.");return;}if(channel===agent)setChannel("main");void action({action:"agents",agents:next});}
  // 방이 열리면 방마다 자기 대화만 본다. 메인에는 대장과 나눈 이야기만 남는다.
  const messages=project?.messages.filter(m=>!roomsOn||(room==="main"?["main","chief"].includes(m.channel??"main"):(m.channel??"main")===room))??[];
  const activeSpeaker=channel==="main"?"chief":channel;
  // 이름은 목록에서 바로 고친다. 먼저 화면에 반영하고 서버가 거절하면 되돌린다.
  async function renameTo(id:string,name:string) {
    const trimmed=name.trim();setRenaming(null);
    const before=projects.find(p=>p.id===id);
    if(!before||!trimmed||trimmed===before.name)return;
    setProjects(ps=>ps.map(p=>p.id===id?{...p,name:trimmed}:p));
    try{
      const r=await fetch("/api/projects/"+id,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({name:trimmed})});
      if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error??"이름을 바꾸지 못했어요.");
    }catch(e){setError(e instanceof Error?e.message:"이름을 바꾸지 못했어요.");setProjects(ps=>ps.map(p=>p.id===id?{...p,name:before.name}:p));}
  }
  // 끌어놓기와 Alt+방향키가 같은 길을 쓴다. 마우스를 못 쓰는 사람도 순서를 바꿀 수 있어야 한다.
  async function moveProject(id:string,toIndex:number) {
    const from=projects.findIndex(p=>p.id===id);
    if(from<0)return;
    const to=Math.max(0,Math.min(projects.length-1,toIndex));
    if(from===to)return;
    const next=[...projects];next.splice(to,0,...next.splice(from,1));
    setProjects(next);
    try{
      const r=await fetch("/api/projects",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({order:next.map(p=>p.id)})});
      if(!r.ok)throw new Error("순서를 저장하지 못했어요.");
    }catch{setError("순서를 저장하지 못했어요. 새로고침하면 이전 순서로 돌아가요.");}
  }
  // 프로젝트 없이도 열 수 있어야 한다. 프로젝트 안에서만 고칠 수 있으면 "장비는 한 번
  // 정해두고 계속 쓴다"가 성립하지 않는다. 프로젝트가 없으면 계정 프로필만 다룬다.
  const openProfile=async()=>{
    if(workflow){setProfileScope("project");setProfile(workflow.profile);setShowProfile(true);return;}
    setHub("gear");return;
    try{const r=await fetch("/api/me/profile",{cache:"no-store"});const b=r.ok?await r.json():null;if(b?.profile)setProfile({...emptyProfile(),...b.profile});}catch{/* 계정 프로필이 아직 없으면 빈 값으로 시작한다. */}
  };
  async function saveProfile() {
    if(profileScope==="project"){void action({action:"profile",profile});return;}
    if(busy)return;setBusy("제작 프로필을 저장하고 있어요");setError("");
    try{
      const r=await fetch("/api/me/profile",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(personPart(profile))});
      if(r.status===401){window.location.assign("/login");return;}
      if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error??"저장하지 못했어요.");
      setShowProfile(false);
      if(profile.printerAccess==="makerspace"||profile.printerAccess==="none")setHub("place");
    }catch(e){setError(e instanceof Error?e.message:"저장하지 못했어요.");}
    finally{setBusy("");}
  }
  const resize=(key:keyof typeof layout.sizes,value:number)=>layout.resize(key,value,showArtifacts);
  return <main style={layout.style} className={"forge-app resizable-workspace "+(showArtifacts?"":"artifacts-hidden")+(navOpen?" nav-open":"")}>
    <aside className="sidebar" id="project-sidebar" aria-label="프로젝트 탐색">
      <button className="nav-close" aria-label="프로젝트 목록 닫기" onClick={()=>setNavOpen(false)}>×</button><button className="brand" onClick={()=>switchProject(null)} disabled={!!busy} aria-label="달그락 대장간 · 새로운 아이디어로 이동"><img src="/characters/idle.png" alt=""/><span>달그락 대장간<small>생각을 손에 잡히게.</small></span></button>
      <button className="new-project" onClick={()=>switchProject(null)} disabled={!!busy}>＋ 새로운 아이디어</button><button className={"my-workshop"+(myTurns.length?" has-turn":"")} onClick={()=>{setShowWorkshop(true);setNavOpen(false);}}><IconHammer/> 내 공방{myTurns.length>0&&<em className="turn-badge" aria-label={`내가 확인할 것 ${myTurns.length}개`}>{myTurns.length}</em>}</button>
      <button className="nav-caption projects-toggle" aria-expanded={preferences.projectsOpen} aria-controls="project-folders" onClick={toggleProjects}><span>{preferences.projectsOpen?"⌄":"›"} 프로젝트</span><span>{projects.length}{viewer.kind==="user"&&viewer.projectLimit?`/${viewer.projectLimit}`:""}</span></button>
      {preferences.projectsOpen&&<nav className="project-tree" id="project-folders" data-tour="projects" aria-label="프로젝트 목록">{projects.map((p,index)=>{
        const w=workflowFor(p);const progress=projectProgress(p);const expanded=preferences.expanded.includes(p.id);const active=p.id===selectedId;
        return <section className={"project-folder "+(active?"active-folder":"")} key={p.id}>
          <div className={"folder-heading"+(dragId===p.id?" dragging":"")} draggable={!renaming&&!busy}
            onDragStart={e=>{setDragId(p.id);e.dataTransfer.effectAllowed="move";}}
            onDragOver={e=>{if(dragId&&dragId!==p.id)e.preventDefault();}}
            onDrop={e=>{e.preventDefault();if(dragId&&dragId!==p.id)void moveProject(dragId,index);setDragId(null);}}
            onDragEnd={()=>setDragId(null)}>
            <button className="folder-toggle" aria-label={p.name+" 작업실 "+(expanded?"접기":"펼치기")} aria-expanded={expanded} aria-controls={"rooms-"+p.id} onClick={()=>toggleFolder(p.id)}>{expanded?"⌄":"›"}</button>
            {renaming===p.id
              ? <input className="folder-rename" autoFocus defaultValue={p.name} maxLength={80} aria-label={p.name+" 이름 바꾸기"}
                  onBlur={e=>void renameTo(p.id,e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void renameTo(p.id,e.currentTarget.value);}if(e.key==="Escape"){e.preventDefault();setRenaming(null);}}}/>
              : <button className="folder-name" aria-current={active?"page":undefined} disabled={!!busy} title={p.name+" · 두 번 누르면 이름 바꾸기, Alt+방향키로 순서 바꾸기"} onClick={()=>switchProject(p.id)}
                  onDoubleClick={()=>setRenaming(p.id)}
                  onKeyDown={e=>{if(e.key==="F2"){e.preventDefault();setRenaming(p.id);}if(e.altKey&&(e.key==="ArrowUp"||e.key==="ArrowDown")){e.preventDefault();void moveProject(p.id,index+(e.key==="ArrowUp"?-1:1));}}}>
                  <ProgressRing percent={progress.percent} blocked={progress.blocked}/><span>{p.name}<small>{progress.blocked?"꼭 고칠 것 · ":""}{phaseNames[w.phase]} · {progress.percent}%</small></span></button>}
            <button className="folder-rename-button" aria-label={p.name+" 이름 바꾸기"} title="이름 바꾸기" disabled={!!busy} onClick={()=>setRenaming(p.id)}><IconPencil/></button>
            <button className="folder-delete" aria-label={p.name+" 삭제"} title="프로젝트 삭제" disabled={!!busy} onClick={()=>setDeleting(p)}><IconTrash/></button></div>
          {expanded&&(()=>{const b=viewBoard(boardOf(p));const on=w.phase==="workshop"||b.rooms.some(r=>r.room!=="chief");const badge=(a:AgentId)=>{const n=b.rooms.find(r=>r.room===a)?.myTurn??0;return n>0?<em className="turn-badge" aria-label={`내 차례 ${n}개`}>{n}</em>:null;};const list=on?Array.from(new Set<AgentId>([...w.activeAgents,...b.rooms.map(r=>r.room).filter(r=>r!=="chief")])):[];
            return <nav className="rooms project-rooms" id={"rooms-"+p.id} aria-label={p.name+" 대장간"}><button disabled={!!busy} className={active&&room==="main"?"selected":""} aria-current={active&&room==="main"?"page":undefined} onClick={()=>switchProject(p.id,"main")}>⌂ {agentName("chief",preferences.shortNames)}{badge("chief")}</button>{list.map(a=><button key={a} disabled={!!busy} className={active&&room===a?"selected":""} aria-current={active&&room===a?"page":undefined} onClick={()=>switchProject(p.id,a)}><span className={"agent-dot dot-"+a}/>{agentName(a,preferences.shortNames)}{badge(a)}</button>)}</nav>;})()}
        </section>;
      })}{!projects.length&&!loading&&<p className="muted empty-projects">첫 아이디어를 이야기하면 프로젝트 폴더가 생겨요.</p>}</nav>}
      <StartChecklist projects={projects} onIdea={()=>switchProject(null)} onProfile={()=>void openProfile()} onConnect={()=>{if(project)setHub("ai");else switchProject(null);}}/><div className="sidebar-bottom" data-tour="settings"><span className="online-dot"/> {viewer.kind==="user"?viewer.name+"의 작업 공간":"내 작업 공간"}{viewer.kind==="user"&&viewer.webAi&&viewer.credit&&viewer.credit.allowanceUsd>0&&<span className="credit-line" title="앱 안에서 대장 달그락과 대화할 때만 줄어요. 내 Claude에 커넥터를 연결해 쓰면 줄지 않아요.">오늘 남은 대화 {Math.round((viewer.credit.remainingUsd/viewer.credit.allowanceUsd)*100)}%</span>}{viewer.kind==="operator"&&<a className="admin-link" href="/admin"><IconPeople/> 참여자 관리</a>}<button className="me-button" data-tour="ai-connect" onClick={()=>setHub("skill")}><IconPerson/> {viewer.kind==="user"?viewer.name:"내 계정"}</button></div>
    </aside>
    <div className="sidebar-resizer" aria-hidden="true"/>
    <section className="chat-panel" id="chat-panel" aria-label="대화">
      <header className="chat-header"><button className="nav-toggle" aria-label="프로젝트 목록 열기" aria-expanded={navOpen} onClick={()=>setNavOpen(o=>!o)}>☰</button><div><h1 title={project?.name??"새로운 아이디어"}>{project?.name??"새로운 아이디어"}</h1><span className="breadcrumb">{!project?"대장 달그락과 이야기하기":agentName(room==="main"?"chief":room as AgentId,preferences.shortNames)+" 대장간"}</span></div>{project&&<div className="header-actions"><button className={"workbench-toggle"+(newMarks.length?" has-new":"")} aria-pressed={showArtifacts&&panelMode==="files"} onClick={()=>{if(showArtifacts&&panelMode==="files"&&!viewing)setPanelHidden(true);else{setPanelMode("files");setPanelHidden(false);setWorkbench(project.id,false,selectedItem?.id??"");}}}>파일{items.length>0&&<span>{items.length}</span>}{newMarks.length>0&&<em className="new-dot" role="img" aria-label={`새로 온 것 ${newMarks.length}개`}/>}</button><button data-tour="workbench-button" className={"workbench-toggle"+(board.nextForPerson?" has-new":"")} aria-pressed={showArtifacts&&panelMode==="status"} aria-controls="workbench-panel" onClick={()=>{if(showArtifacts&&panelMode==="status"&&!viewing)setPanelHidden(true);else{setPanelMode("status");setPanelHidden(false);setWorkbench(project.id,false,selectedItem?.id??"");}}}><IconDesk/> 작업대{board.rooms.reduce((n,r)=>n+r.myTurn,0)>0&&<span>{board.rooms.reduce((n,r)=>n+r.myTurn,0)}</span>}</button></div>}</header>
      {project&&board.nextForPerson&&!(roomsOn&&room===board.nextForPerson.room)&&<button className="next-banner" onClick={()=>switchProject(project.id,board.nextForPerson!.room==="chief"?"main":board.nextForPerson!.room)}><span className="turn-badge">내 차례</span><b>{board.nextForPerson.title}</b><span>{agentName(board.nextForPerson.room,preferences.shortNames)} 대장간에서 기다리고 있어요</span><em>가기 →</em></button>}
      <div className="chat-scroll" role="log" aria-label="프로젝트 대화" aria-live="polite">
        {!project&&!loose.length&&!helperLive&&<div className="welcome"><Avatar large/><p className="eyebrow">YOUR IDEA, OUR NEXT PROJECT</p><h2>무엇을 만들어볼까요?</h2>{connectorOnly?<p>만들고 싶은 것을 아래에 적어주세요.<br/>대장 달그락이 질문하며 함께 구체화하고, 프로젝트 폴더를 만들어요.</p>:<p>아직 다 정해지지 않아도 괜찮아요.<br/>대장 달그락과 이야기하며 첫 설계를 시작해보세요.</p>}{!connectorOnly&&<div className="idea-prompts">{["내 팔에 앉는 부엉이 반려 로봇","식물의 상태를 알려주는 화분","책상 위 작은 집중 타이머"].map(s=><button key={s} onClick={()=>setText(s)}>{s} ↗</button>)}</div>}</div>}
        {project&&<div className="project-intro"><span className="pill">{phaseNames[phase]}</span><p>{project.oneLiner}</p></div>}
        {project&&roomsOn&&board.cards.filter(c=>c.turn!=="done"&&(room==="main"?c.owner==="chief":c.owner===room)).map(c=><div key={c.id} className={"room-card turn-"+c.turn+(c.active?"":" held")}><div><small>{c.heldBy.length?"앞 작업을 기다리는 중":c.turn==="person"?"내 차례":c.turn==="waiting"?"기다리는 중":c.turn==="blocked"?"막힘":"달그락 작업 중"}</small><strong>{c.title}</strong><p>{c.turn==="person"?c.ask:c.turn==="waiting"?(c.waiting?.what??"")+(c.waiting?.expectedAt?" · "+c.waiting.expectedAt+" 예정":""):c.turn==="blocked"?c.note:c.detail}</p></div>{c.turn==="person"&&c.active&&<button disabled={!!busy} onClick={()=>void boardAction({action:"respond",cardId:c.id})}>했어요 · 달그락에게 넘기기</button>}</div>)}
        {messages.map(m=><article key={m.id} className={"chat-message "+m.role+(m.role==="assistant"?" agent-"+(m.agent??"chief"):"")}>
          {m.role==="assistant"?<Avatar agent={m.agent??"chief"}/>:<span className="user-avatar">나</span>}
          <div className="message-body"><div className="message-meta"><strong>{m.role==="user"?"나":agentName(m.agent??"chief",preferences.shortNames)}</strong>{m.mode==="evaluate"&&<span className="pill unknown">Evaluator</span>}{workshop&&channel==="main"&&m.channel&&m.channel!=="main"&&<small>{agentName(m.channel,preferences.shortNames)} 작업실에서 공유</small>}<time>{new Date(m.createdAt).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})}</time></div><MessageText text={m.text}/>{m.attachments?.length?<div className="message-images">{m.attachments.map((a,i)=><a href={a.dataUrl} download={a.name} key={i}><img src={a.dataUrl} alt={a.name}/><span>{a.name}</span></a>)}</div>:null}{m.shared&&workshop&&<span className="shared-tag">↗ 팀 공통 기록에 공유됨</span>}</div>
        </article>)}
        {project&&room==="main"&&phase==="brainstorm"&&<div className="intake-card"><strong>설계 전, 함께 확인할 것</strong><p>핵심 동작과 보유 도구, 펌웨어 경험을 알려주세요. 경험은 설명을 맞추는 데만 사용합니다.</p><div className="intake-status">{["핵심 동작","보유 도구","펌웨어 경험"].map(s=><span key={s} className={intakeMissing(workflow!.profile).includes(s)?"":"complete"}>{intakeMissing(workflow!.profile).includes(s)?"○":"✓"} {s}</span>)}</div><button onClick={openProfile} disabled={!!busy}>체크리스트 작성하기</button>{connectorOnly?<p className="connector-hint">준비가 되면 연결한 AI에게 “회로 계획 시작해줘”라고 말해주세요.</p>:<button className="primary" disabled={!!busy||intakeMissing(workflow!.profile).length>0} onClick={()=>action({action:"plan"})}>브레인스토밍 마치고 계획 시작 →</button>}</div>}
        {project&&room==="main"&&phase==="circuit"&&<div className="stage-card"><span className="pill">먼저, 회로</span><strong>회로 방향을 확인해주세요.</strong><p>오른쪽 회로도에서 연결과 미확정 항목을 검토하고 변경할 부분은 채팅으로 논의해요.</p><button className="primary" disabled={!!busy||!project.build} onClick={()=>action({action:"approve_circuit"})}>회로 방향 승인 · 3D 목업 만들기 →</button><button disabled={!!busy} onClick={()=>action({action:"reopen"})}>아이디어·회로 다시 논의</button></div>}
        {project&&room==="main"&&phase==="mockup"&&<div className="stage-card"><strong>돌려보고, 형태를 확인해주세요.</strong><p>회로에 맞춘 치수 목업입니다. 실제 부품 크기와 착용감은 제작 단계에서 확인해요.</p><button className="primary" disabled={!!busy} onClick={()=>action({action:"approve_mockup"})}>3D 방향 승인 · 작업 나누기 →</button><button disabled={!!busy} onClick={()=>action({action:"reopen"})}>설계 변경 논의</button></div>}
        {project&&room==="main"&&phase==="handoff"&&<div className="handoff-card"><h3>함께 만들 달그락 팀이에요.</h3><p>아이디어 범위에 맞춰 제안했어요. 사용할 에이전트를 직접 고를 수 있습니다.</p><div className="agent-cards">{(["hw","sw","me","id"] as AgentId[]).map(a=><label key={a}><Avatar agent={a}/><strong>{agentName(a,preferences.shortNames)}</strong><small>{AGENTS[a].title}</small><input type="checkbox" aria-label={agentName(a,preferences.shortNames)+" 선택"} checked={workflow!.activeAgents.includes(a)} disabled={!!busy} onChange={()=>toggleAgent(a)}/></label>)}</div><p>다음 할 일과 BOM을 확인했으면 준비된 작업부터 시작해요. 부품이 없어도 코드·설계 논의를 진행할 수 있어요.</p><button className="primary" disabled={!!busy} onClick={()=>action({action:"enter_workshop"})}>대장간 입장 →</button></div>}
        {!project&&loose.map((m,i)=><article key={"loose"+i} className={"chat-message "+m.role+(m.role==="assistant"?" agent-chief":"")}>{m.role==="assistant"?<Avatar agent="chief"/>:<span className="user-avatar">나</span>}<div className="message-body"><div className="message-meta"><strong>{m.role==="user"?"나":agentName("chief",preferences.shortNames)}</strong></div><MessageText text={m.text}/></div></article>)}
        {helperLive&&!project&&<article className="chat-message user"><span className="user-avatar">나</span><div className="message-body"><div className="message-meta"><strong>나</strong></div><MessageText text={helperLive.user}/></div></article>}
        {helperLive&&<article className={"chat-message assistant agent-"+(room!=="main"?room:"chief")} aria-live="polite"><Avatar agent={room!=="main"?room as AgentId:"chief"} busy/><div className="message-body"><div className="message-meta"><strong>{agentName(room!=="main"?room as AgentId:"chief",preferences.shortNames)}</strong></div>{helperLive.text&&<MessageText text={helperLive.text}/>}<p className="helper-live-step">{helperLive.step||(helperLive.text?"이어서 쓰는 중":"생각하고 있어요")}<span className="loading-dots">…</span></p></div></article>}
        {busy&&<div className="thinking-message" role="status"><Avatar agent={activeSpeaker} busy/><div><strong>{busy}</strong><p>필요한 정보를 살펴보고 있어요<span className="loading-dots">…</span></p></div></div>}
        {loading&&<p className="loading-text">저장한 프로젝트를 불러오고 있어요…</p>}<div ref={end}/>
      </div>
      
      <footer className="composer-area" data-tour="composer" id="composer-area">{error&&<div role="alert" className="error-banner">{error}<button onClick={()=>setError("")}>닫기</button></div>}{attachments.length>0&&<div className="attachment-previews">{attachments.map((a,i)=><div key={i}><img src={a.dataUrl} alt={a.name}/><button type="button" aria-label={a.name+" 첨부 제거"} onClick={()=>setAttachments(attachments.filter((_,j)=>j!==i))}>×</button></div>)}</div>}
        {connectorOnly?<HelperComposer speaker={agentName(room!=="main"?room as AgentId:"chief",false)} project={project} channel={room} placeholder={workshop?(channel==="main"?"달그락 팀":agentName(channel,preferences.shortNames))+"에게 이야기해주세요…":"머릿속 아이디어를 들려주세요."} suggestion={room!=="main"?null:suggestNext(project)} onProject={accept} onLive={setHelperLive} onTurnEnd={helperTurnEnd}/>:<form className="composer" onSubmit={submit}><textarea value={text} aria-label={project?"채팅 메시지":"아이디어 입력"} placeholder={workshop?(channel==="main"?"달그락 팀":agentName(channel,preferences.shortNames))+"에게 이야기해주세요…":"머릿속 아이디어를 들려주세요. 이미지도 좋아요."} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if(!busy)void submit(e);}}} disabled={!!busy||loading}/><div className="composer-tools"><input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={e=>attach(e.target.files)}/><button type="button" aria-label="이미지 첨부" disabled={!!busy} onClick={()=>fileInput.current?.click()}>＋ <span>이미지 첨부</span></button><span className="composer-hint">{workshop?(mode==="evaluate"?"평가":"작업")+" · 팀 전체 기록 공유":"대장 달그락과 함께"}</span><button type="submit" className="send" aria-label="메시지 보내기" disabled={!!busy||loading||(!text.trim()&&!attachments.length)}>↑</button></div></form>}<p className="composer-footnote">{project?.origin==="connector"?"이 프로젝트의 대화와 설계는 연결한 AI가 만들었어요. 중요한 제작 결정은 직접 검토해주세요.":project?.lastAgentMode==="mock"?"Mock · 실제 AI 분석 없이 기록만 저장됩니다.":"AI 제안은 확인이 필요해요. 중요한 제작 결정은 함께 검토합니다."}</p>
      </footer>
    </section>
    {showArtifacts&&project&&<>
      <ResizeHandle className="workbench-resizer" controls="workbench-panel" label="작업대 크기 조절" axis={layout.stacked?"y":"x"} reverse value={layout.stacked?layout.sizes.workbenchHeight:layout.sizes.workbench} min={layout.stacked?180:280} max={layout.stacked?800:1000} onResize={v=>resize(layout.stacked?"workbenchHeight":"workbench",v)} onReset={()=>resize(layout.stacked?"workbenchHeight":"workbench",layout.stacked?360:460)}/>
      {viewing?<WorkbenchPanel key={project.id} project={project} items={items} selected={selectedItem.id} busy={!!busy} onSelect={id=>setWorkbench(project.id,true,id)} onClose={()=>setWorkbench(project.id,false,selectedItem.id)} onAction={action} ownerName={viewer.kind==="user"?viewer.name:"나"} newMarks={newMarks} shortNames={preferences.shortNames} connectorOnly={connectorOnly}/>:<StatusPanel key={project.id+"-status"} mode={panelMode} project={project} board={board} items={items} newMarks={newMarks} shortNames={preferences.shortNames} busy={!!busy} onRoom={r=>switchProject(project.id,r==="chief"?"main":r)} onOpenItem={id=>setWorkbench(project.id,true,id)} onAction={action} onBoard={boardAction} onProjectSettings={()=>void openProfile()} onDevConnect={()=>setConnectTab("dev")} onClose={()=>setPanelHidden(true)}/>}
    </>}
    
    {showTutorial&&<Tour stations={tourStations} onClose={()=>{setShowTutorial(false);setTutorialSeen(true);}}/>}
    {showWorkshop&&<div className="modal-backdrop" onClick={()=>setShowWorkshop(false)}><section className="profile-modal workshop-modal" role="dialog" aria-modal="true" aria-label="내 공방" onClick={e=>e.stopPropagation()}><header><h2>내 공방</h2><button aria-label="닫기" onClick={()=>setShowWorkshop(false)}>×</button></header>
      {myTurns.length===0?<p className="muted">지금 확인할 것이 없어요.</p>:projects.filter(p=>myTurns.some(t=>t.project.id===p.id)).map(p=><div key={p.id} className="workshop-group"><h3>{p.name}</h3><ul>{myTurns.filter(t=>t.project.id===p.id).map(t=><li key={t.card.id}><button onClick={()=>{setShowWorkshop(false);switchProject(p.id,t.card.owner==="chief"?"main":t.card.owner);}}><span className={"agent-dot dot-"+t.card.owner}/><span><b>{t.card.title}</b><small>{t.card.ask}</small></span><em>{agentName(t.card.owner,preferences.shortNames)} →</em></button></li>)}</ul></div>)}
    </section></div>}
    {hub&&<AccountHub key={hub} initialTab={hub} project={project} hasAccount={viewer.kind==="user"} settings={{shortNames:preferences.shortNames,onToggleShortNames:toggleShortNames,onTutorial:()=>{setHub(null);setShowTutorial(true);},onProjectSettings:null,onDevConnect:null,projectName:null}} onClose={()=>setHub(null)} onSaved={()=>{void fetch("/api/projects",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(b=>{if(b)setProjects(b.projects);}).catch(()=>{});}}/>}
    {deleting&&<DeleteProjectDialog project={deleting} used={projects.length} limit={viewer.kind==="user"?viewer.projectLimit??null:null} onClose={()=>setDeleting(null)} onDeleted={id=>{setDeleting(null);setProjects(ps=>ps.filter(x=>x.id!==id));if(selectedId===id)switchProject(null);}}/>}
    {connectTab&&project&&<ConnectPanel key={project.id} project={project} tab={connectTab} busy={!!busy} onTab={setConnectTab} onClose={()=>setConnectTab(null)} onAction={action} onAccount={()=>{setConnectTab(null);setHub("skill");}}/>}
    {showProfile&&project&&<ProjectSettings projectName={project.name} profile={profile} busy={!!busy} onChange={setProfile} onSave={()=>void saveProfile()} onClose={()=>setShowProfile(false)} onAccount={tab=>{setShowProfile(false);setHub(tab);}}/>}
  </main>;
}
