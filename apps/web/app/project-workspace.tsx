"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { AgentId, ChatChannel, ImageAttachment, LocalProject, MakerProfile } from "../lib/project-types";
import { AGENTS, emptyProfile, intakeMissing, personPart, TOOL_OPTIONS, workflowFor } from "../lib/workflow";
import { CODING_EXPERIENCE, DEV_TOOLS, emptyDevProfile } from "../lib/dev-handoff";
import { workbenchItems } from "../lib/workbench";
import WorkbenchPanel from "./workbench-panel";
import ConnectPanel from "./connect-panel";
import AccountPanel from "./account-panel";
import MakerspaceList from "./makerspace-list";
import DeleteProjectDialog from "./delete-project-dialog";
import ProgressPanel, { ProgressRing } from "./progress-panel";
import { projectProgress } from "../lib/progress";
import { CHECKLIST } from "../lib/checklist";
import { ResizeHandle, useWorkspaceLayout, layoutLimits } from "./workspace-layout";
import { useWorkspacePreferences } from "./workspace-preferences";
import { IconDesk, IconHammer, IconLaptop, IconLink, IconPencil, IconPeople, IconPerson, IconPrinter, IconTrash, IconUndo } from "./icons";
import MessageText from "./message-text";

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
  const [renaming,setRenaming]=useState<string|null>(null);
  const [dragId,setDragId]=useState<string|null>(null);
  const [profile,setProfile]=useState<MakerProfile>(emptyProfile());
  const [viewer,setViewer]=useState<ViewerInfo>({kind:"operator"});
  const [connectTab,setConnectTab]=useState<"claude"|"dev"|null>(null);
  const [makerHelp,setMakerHelp]=useState(false);
  const [showAccount,setShowAccount]=useState(false);
  const [deleting,setDeleting]=useState<LocalProject|null>(null);
  const {preferences,setWorkbench,expand,toggleProjects,toggleFolder,markSeen,ready:prefsReady}=useWorkspacePreferences();
  const end=useRef<HTMLDivElement>(null);
  const fileInput=useRef<HTMLInputElement>(null);
  const project=projects.find(p=>p.id===selectedId)??null;
  const items=workbenchItems(project);
  const workbenchPreference=project?preferences.workbenches[project.id]:undefined;
  const selectedItem=items.find(i=>i.id===workbenchPreference?.selected)??items[0];
  const showArtifacts=!!project&&items.length>0&&(workbenchPreference?.open??true);
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
  const layout=useWorkspaceLayout(showArtifacts);
  const workflow=project?workflowFor(project):null;
  const phase=workflow?.phase??"brainstorm";
  const workshop=phase==="workshop";
  // Connector accounts talk to their own Claude; this page shows and approves.
  const connectorOnly=viewer.kind==="user"&&!viewer.webAi;
  const busyRef=useRef("");busyRef.current=busy;
  useEffect(()=>{fetch("/api/projects",{cache:"no-store"}).then(async r=>{if(r.status===401){window.location.assign("/login");return;}if(!r.ok)throw new Error("프로젝트를 불러오지 못했습니다. 로그인 상태를 확인해주세요.");const b=await r.json();setProjects(b.projects);if(b.viewer)setViewer(b.viewer);
    // Links from Claude can name a project and a panel (?p=<id>&open=profile|claude|dev).
    const query=new URLSearchParams(window.location.search);if(query.get("open")==="account"){setShowAccount(true);window.history.replaceState(null,"","/");}const target=(b.projects as LocalProject[]).find(x=>x.id===query.get("p"));
    if(target){setSelectedId(target.id);expand(target.id);const open=query.get("open");if(open==="profile"){setProfile(workflowFor(target).profile);setShowProfile(true);}else if(open==="claude"||open==="dev")setConnectTab(open);window.history.replaceState(null,"","/");}
  }).catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);
  // Claude writes to projects from outside this page, so pick up changes while idle.
  // Poll every 3s while Claude reports live progress on the open project, else every 8s.
  const liveRef=useRef(false);liveRef.current=!!project?.liveStatus&&Date.now()-new Date(project.liveStatus.updatedAt).getTime()<120_000;
  useEffect(()=>{let timer:ReturnType<typeof setTimeout>;let stopped=false;const tick=()=>{timer=setTimeout(()=>{if(stopped)return;if(busyRef.current||document.hidden){tick();return;}fetch("/api/projects",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(b=>{if(b&&!busyRef.current)setProjects(current=>JSON.stringify(current)===JSON.stringify(b.projects)?current:b.projects);}).catch(()=>{}).finally(tick);},liveRef.current?3000:8000);};tick();return()=>{stopped=true;clearTimeout(timer);};},[]);
  useEffect(()=>{end.current?.scrollIntoView({behavior:"smooth",block:"end"});},[project?.messages.length,busy,channel]);
  function accept(p:LocalProject) {
    const before=workbenchItems(projects.find(x=>x.id===p.id)??null);
    const added=workbenchItems(p).find(i=>i.kind!=="record"&&!before.some(old=>old.id===i.id&&old.content===i.content&&old.filename===i.filename));
    if(added)setWorkbench(p.id,true,added.id);
    setProjects(ps=>[p,...ps.filter(x=>x.id!==p.id)]);setSelectedId(p.id);expand(p.id);
  }
  async function request(url:string,body:unknown,label:string) {
    if(busy)return;setBusy(label);setError("");
    try {const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});if(r.status===401){window.location.assign("/login");return;}const b=await r.json();if(!r.ok||!b.project)throw new Error(b.error??"요청에 실패했습니다.");accept(b.project);return b.project as LocalProject;}
    catch(e){setError(e instanceof Error?e.message:"요청에 실패했습니다.");}
    finally{setBusy("");}
  }
  async function submit(e:FormEvent) {e.preventDefault();if(!text.trim()&&!attachments.length)return;const p=await request(project?"/api/projects/"+project.id+"/messages":"/api/projects",project?{text:text.trim()||"첨부 이미지로 아이디어를 함께 논의해주세요.",attachments,channel,mode}:{idea:text.trim()||"첨부 이미지로 제작 아이디어를 구체화해주세요.",attachments},(workshop&&channel!=="main"?AGENTS[channel].name:"대장 달그락")+"이 생각하고 있어요");if(p){setText("");setAttachments([]);}}
  async function action(input:Record<string,unknown>) {if(!project)return;const labels:Record<string,string>={plan:"회로 초안을 설계하고 검토하고 있어요",approve_circuit:"승인된 회로로 3D 목업을 만들고 있어요",approve_mockup:"다음 작업을 정리하고 있어요",enter_workshop:"대장간을 준비하고 있어요"};const p=await request("/api/projects/"+project.id+"/workflow",input,labels[String(input.action)]??"프로젝트에 반영하고 있어요");if(p){const kind=input.action==="plan"?"circuit":input.action==="approve_circuit"?"cad":input.action==="approve_mockup"?"tasks":null;const item=workbenchItems(p).find(i=>i.kind===kind);if(item)setWorkbench(p.id,true,item.id);if(input.action==="enter_workshop")setChannel("main");if(input.action==="profile"){setShowProfile(false);const access=(input.profile as MakerProfile|undefined)?.printerAccess;if(access==="makerspace"||access==="none")setMakerHelp(true);}}}
  async function attach(files:FileList|null) {if(!files)return;setError("");try {const added:ImageAttachment[]=[];for(const f of Array.from(files)){if(!["image/png","image/jpeg","image/webp"].includes(f.type))throw new Error("PNG, JPG, WebP 이미지를 선택해주세요.");if(f.size>5*1024*1024)throw new Error("이미지 한 장은 5MB 이하로 첨부해주세요.");const bitmap=await createImageBitmap(f);const canvas=document.createElement("canvas");const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));canvas.width=bitmap.width*scale;canvas.height=bitmap.height*scale;canvas.getContext("2d")!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();added.push({name:f.name,dataUrl:canvas.toDataURL("image/jpeg",.82)});}if(attachments.length+added.length>3)throw new Error("한 번에 이미지는 3장까지 첨부할 수 있어요.");setAttachments([...attachments,...added]);}catch(e){setError(e instanceof Error?e.message:"이미지 처리에 실패했습니다.");}if(fileInput.current)fileInput.current.value="";}
  function switchProject(id:string|null,room:ChatChannel="main"){if(busy)return;setConnectTab(null);setSelectedId(id);setChannel(room);setText("");setAttachments([]);setError("");setMode("work");setShowProfile(false);if(id)expand(id);}
  function toggleAgent(agent:AgentId) {if(!workflow)return;const next=workflow.activeAgents.includes(agent)?workflow.activeAgents.filter(a=>a!==agent):[...workflow.activeAgents,agent];if(!next.length){setError("함께 작업할 에이전트를 하나 이상 선택해주세요.");return;}if(channel===agent)setChannel("main");void action({action:"agents",agents:next});}
  const messages=project?.messages.filter(m=>!workshop||channel==="main"||(m.channel??"main")===channel)??[];
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
    setProfileScope("account");setProfile(emptyProfile());setShowProfile(true);
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
      if(profile.printerAccess==="makerspace"||profile.printerAccess==="none")setMakerHelp(true);
    }catch(e){setError(e instanceof Error?e.message:"저장하지 못했어요.");}
    finally{setBusy("");}
  }
  const resize=(key:keyof typeof layout.sizes,value:number)=>layout.resize(key,value,showArtifacts);
  return <main style={layout.style} className={"forge-app resizable-workspace "+(showArtifacts?"":"artifacts-hidden")}>
    <aside className="sidebar" id="project-sidebar" aria-label="프로젝트 탐색">
      <button className="brand" onClick={()=>switchProject(null)} disabled={!!busy} aria-label="달그락 대장간 · 새로운 아이디어로 이동"><img src="/characters/idle.png" alt=""/><span>달그락 대장간<small>생각을 손에 잡히게.</small></span></button>
      <button className="new-project" onClick={()=>switchProject(null)} disabled={!!busy}>＋ 새로운 아이디어</button>
      <button className="nav-caption projects-toggle" aria-expanded={preferences.projectsOpen} aria-controls="project-folders" onClick={toggleProjects}><span>{preferences.projectsOpen?"⌄":"›"} 프로젝트</span><span>{projects.length}{viewer.kind==="user"&&viewer.projectLimit?`/${viewer.projectLimit}`:""}</span></button>
      {preferences.projectsOpen&&<nav className="project-tree" id="project-folders" aria-label="프로젝트 목록">{projects.map((p,index)=>{
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
          {expanded&&<nav className="rooms project-rooms" id={"rooms-"+p.id} aria-label={p.name+" 작업실"}><button disabled={!!busy} className={active&&channel==="main"?"selected":""} aria-current={active&&channel==="main"?"page":undefined} onClick={()=>switchProject(p.id,"main")}>⌂ {w.phase==="workshop"?"메인 대장간":"대장과 아이디어 나누기"}</button>{w.phase==="workshop"&&Array.from(new Set<AgentId>(["chief",...w.activeAgents])).map(a=><button key={a} disabled={!!busy} className={active&&channel===a?"selected":""} aria-current={active&&channel===a?"page":undefined} onClick={()=>switchProject(p.id,a)}><span className={"agent-dot dot-"+a}/>{AGENTS[a].name}<small>작업실</small></button>)}</nav>}
        </section>;
      })}{!projects.length&&!loading&&<p className="muted empty-projects">첫 아이디어를 이야기하면 프로젝트 폴더가 생겨요.</p>}</nav>}
      <div className="sidebar-bottom"><span className="online-dot"/> {viewer.kind==="user"?viewer.name+"의 작업 공간":"내 작업 공간"}{viewer.kind==="user"&&viewer.webAi&&viewer.credit&&viewer.credit.allowanceUsd>0&&<span className="credit-line" title="앱 안에서 대장 달그락과 대화할 때만 줄어요. 내 Claude에 커넥터를 연결해 쓰면 줄지 않아요.">오늘 남은 대화 {Math.round((viewer.credit.remainingUsd/viewer.credit.allowanceUsd)*100)}%</span>}{viewer.kind==="operator"&&<a className="admin-link" href="/admin"><IconPeople/> 참여자 관리</a>}{viewer.kind==="user"&&<button onClick={()=>setShowAccount(true)}><IconPerson/> 내 계정</button>}<span className="nav-group">내 설정</span><button disabled={!!busy} onClick={()=>void openProfile()}><IconHammer/> 제작 프로필</button><button onClick={()=>setMakerHelp(true)}><IconPrinter/> 메이커스페이스·3D 프린터</button><span className="nav-group">연결</span><button disabled={!project} onClick={()=>setConnectTab("claude")}><IconLink/> Claude 연결</button><button disabled={!project} onClick={()=>setConnectTab("dev")}><IconLaptop/> 개발 연결</button><div className="workspace-settings">{!layout.isDefault&&<button onClick={layout.reset} title="끌어서 바꾼 칸 너비를 처음 크기로 돌립니다">칸 너비 원래대로</button>}<form method="post" action="/api/session"><input type="hidden" name="intent" value="logout"/><button disabled={!!busy}>로그아웃</button></form></div></div>
    </aside>
    <ResizeHandle className="sidebar-resizer" controls="project-sidebar" label="프로젝트 영역 크기 조절" axis={layout.mobile?"y":"x"} value={layout.mobile?layout.sizes.sidebarHeight:layout.sizes.sidebar} min={layout.mobile?120:160} max={480} onResize={v=>resize(layout.mobile?"sidebarHeight":"sidebar",v)} onReset={()=>resize(layout.mobile?"sidebarHeight":"sidebar",layout.mobile?210:240)}/>
    <section className="chat-panel" id="chat-panel" aria-label="대화">
      <header className="chat-header"><div><h1 title={project?.name??"새로운 아이디어"}>{project?.name??"새로운 아이디어"}</h1><span className="breadcrumb">{workshop?(channel==="main"?"메인 대장간":AGENTS[channel].name+" 작업실"):phaseNames[phase]}</span></div>{items.length>0&&<button className={"workbench-toggle"+(newMarks.length?" has-new":"")} aria-expanded={showArtifacts} aria-controls="workbench-panel" onClick={()=>project&&setWorkbench(project.id,!showArtifacts,selectedItem.id)}><IconDesk/> 작업대 <span>{items.length}</span>{newMarks.length>0&&<em className="new-dot" role="img" aria-label={`새로 온 것 ${newMarks.length}개`}/>}</button>}</header>
      {project&&<ProgressPanel project={project} onAction={action} busy={!!busy}/>}
      {/* 새 작업물과 새 할 일이 조용히 늘어나기만 해서, 화면이 바뀐 줄도 모르고 지나갔다.
          작업대가 닫혀 있을 때는 여기서 한 줄로 불러 세운다. */}
      {project&&!showArtifacts&&newMarks.length>0&&<button className="new-banner" onClick={()=>setWorkbench(project.id,true,selectedItem?.id??"")}>
        <span className="new-dot" aria-hidden="true"/>새로 온 것 {newMarks.length}개 · 작업대에서 보기 →
      </button>}
      <div className="phase-strip" hidden={!!project}><span className={phase==="brainstorm"?"current":"done"}>01 아이디어</span><i/><span className={phase!=="brainstorm"&&!workshop?"current":workshop?"done":""}>02 계획</span><i/><span className={workshop?"current":""}>03 대장간</span></div>
      {workshop&&<div className="team-strip"><span>함께 일할 팀</span>{(["hw","sw","me","id"] as AgentId[]).map(a=><label key={a} className={workflow!.activeAgents.includes(a)?"on":""}><input type="checkbox" checked={workflow!.activeAgents.includes(a)} disabled={!!busy} onChange={()=>toggleAgent(a)}/>{a.toUpperCase()}</label>)}<select aria-label="에이전트 모드" value={mode} onChange={e=>setMode(e.target.value as "work"|"evaluate")}><option value="work">작업 모드</option><option value="evaluate">Evaluator 모드</option></select></div>}
      <div className="chat-scroll" role="log" aria-label="프로젝트 대화" aria-live="polite">
        {!project&&<div className="welcome"><Avatar large/><p className="eyebrow">YOUR IDEA, OUR NEXT PROJECT</p><h2>무엇을 만들어볼까요?</h2>{connectorOnly?<p>대화는 내 Claude에서 이어가요.<br/>Claude에게 아이디어를 말하고 “달그락 대장간에 프로젝트로 만들어줘”라고 하면 여기에 폴더가 생겨요.</p>:<p>아직 다 정해지지 않아도 괜찮아요.<br/>대장 달그락과 이야기하며 첫 설계를 시작해보세요.</p>}{!connectorOnly&&<div className="idea-prompts">{["내 팔에 앉는 부엉이 반려 로봇","식물의 상태를 알려주는 화분","책상 위 작은 집중 타이머"].map(s=><button key={s} onClick={()=>setText(s)}>{s} ↗</button>)}</div>}</div>}
        {project&&<div className="project-intro"><span className="pill">{phaseNames[phase]}</span><p>{project.oneLiner}</p></div>}
        {messages.map(m=><article key={m.id} className={"chat-message "+m.role+(m.role==="assistant"?" agent-"+(m.agent??"chief"):"")}>
          {m.role==="assistant"?<Avatar agent={m.agent??"chief"}/>:<span className="user-avatar">나</span>}
          <div className="message-body"><div className="message-meta"><strong>{m.role==="user"?"나":AGENTS[m.agent??"chief"].name}</strong>{m.mode==="evaluate"&&<span className="pill unknown">Evaluator</span>}{workshop&&channel==="main"&&m.channel&&m.channel!=="main"&&<small>{AGENTS[m.channel].name} 작업실에서 공유</small>}<time>{new Date(m.createdAt).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})}</time></div><MessageText text={m.text}/>{m.attachments?.length?<div className="message-images">{m.attachments.map((a,i)=><a href={a.dataUrl} download={a.name} key={i}><img src={a.dataUrl} alt={a.name}/><span>{a.name}</span></a>)}</div>:null}{m.shared&&workshop&&<span className="shared-tag">↗ 팀 공통 기록에 공유됨</span>}</div>
        </article>)}
        {project&&phase==="brainstorm"&&<div className="intake-card"><strong>설계 전, 함께 확인할 것</strong><p>핵심 동작과 보유 도구, 펌웨어 경험을 알려주세요. 경험은 설명을 맞추는 데만 사용합니다.</p><div className="intake-status">{["핵심 동작","보유 도구","펌웨어 경험"].map(s=><span key={s} className={intakeMissing(workflow!.profile).includes(s)?"":"complete"}>{intakeMissing(workflow!.profile).includes(s)?"○":"✓"} {s}</span>)}</div><button onClick={openProfile} disabled={!!busy}>체크리스트 작성하기</button>{connectorOnly?<p className="connector-hint">준비가 되면 내 Claude에게 “회로 계획 시작해줘”라고 말해주세요.</p>:<button className="primary" disabled={!!busy||intakeMissing(workflow!.profile).length>0} onClick={()=>action({action:"plan"})}>브레인스토밍 마치고 계획 시작 →</button>}</div>}
        {project&&phase==="circuit"&&<div className="stage-card"><span className="pill">먼저, 회로</span><strong>회로 방향을 확인해주세요.</strong><p>오른쪽 회로도에서 연결과 미확정 항목을 검토하고 변경할 부분은 채팅으로 논의해요.</p><button className="primary" disabled={!!busy||!project.build} onClick={()=>action({action:"approve_circuit"})}>회로 방향 승인 · 3D 목업 만들기 →</button><button disabled={!!busy} onClick={()=>action({action:"reopen"})}>아이디어·회로 다시 논의</button></div>}
        {project&&phase==="mockup"&&<div className="stage-card"><strong>돌려보고, 형태를 확인해주세요.</strong><p>회로에 맞춘 치수 목업입니다. 실제 부품 크기와 착용감은 제작 단계에서 확인해요.</p><button className="primary" disabled={!!busy} onClick={()=>action({action:"approve_mockup"})}>3D 방향 승인 · 작업 나누기 →</button><button disabled={!!busy} onClick={()=>action({action:"reopen"})}>설계 변경 논의</button></div>}
        {project&&phase==="handoff"&&<div className="handoff-card"><h3>함께 만들 달그락 팀이에요.</h3><p>아이디어 범위에 맞춰 제안했어요. 사용할 에이전트를 직접 고를 수 있습니다.</p><div className="agent-cards">{(["hw","sw","me","id"] as AgentId[]).map(a=><label key={a}><Avatar agent={a}/><strong>{AGENTS[a].name}</strong><small>{AGENTS[a].title}</small><input type="checkbox" aria-label={AGENTS[a].name+" 선택"} checked={workflow!.activeAgents.includes(a)} disabled={!!busy} onChange={()=>toggleAgent(a)}/></label>)}</div><p>다음 할 일과 BOM을 확인했으면 준비된 작업부터 시작해요. 부품이 없어도 코드·설계 논의를 진행할 수 있어요.</p><button className="primary" disabled={!!busy} onClick={()=>action({action:"enter_workshop"})}>대장간 입장 →</button></div>}
        {busy&&<div className="thinking-message" role="status"><Avatar agent={activeSpeaker} busy/><div><strong>{busy}</strong><p>필요한 정보를 살펴보고 있어요<span className="loading-dots">…</span></p></div></div>}
        {loading&&<p className="loading-text">저장한 프로젝트를 불러오고 있어요…</p>}<div ref={end}/>
      </div>
      <ResizeHandle className="composer-resizer" controls="composer-area" label="대화 입력 영역 높이 조절" axis="y" reverse value={layout.sizes.composer} min={layoutLimits.composer[0]} max={layoutLimits.composer[1]} onResize={v=>resize("composer",v)} onReset={()=>resize("composer",160)}/>
      <footer className="composer-area" id="composer-area">{error&&<div role="alert" className="error-banner">{error}<button onClick={()=>setError("")}>닫기</button></div>}{attachments.length>0&&<div className="attachment-previews">{attachments.map((a,i)=><div key={i}><img src={a.dataUrl} alt={a.name}/><button type="button" aria-label={a.name+" 첨부 제거"} onClick={()=>setAttachments(attachments.filter((_,j)=>j!==i))}>×</button></div>)}</div>}
        {connectorOnly?<div className="connector-composer"><strong>대화는 내 Claude에서 이어가요</strong><p>Claude가 나눈 이야기와 설계를 이곳에 기록해요. 이 화면은 자동으로 새로고침되고, 회로·3D 승인과 구매·측정 기록은 여기서 직접 해요.</p></div>:<form className="composer" onSubmit={submit}><textarea value={text} aria-label={project?"채팅 메시지":"아이디어 입력"} placeholder={workshop?(channel==="main"?"달그락 팀":AGENTS[channel].name)+"에게 이야기해주세요…":"머릿속 아이디어를 들려주세요. 이미지도 좋아요."} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if(!busy)void submit(e);}}} disabled={!!busy||loading}/><div className="composer-tools"><input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={e=>attach(e.target.files)}/><button type="button" aria-label="이미지 첨부" disabled={!!busy} onClick={()=>fileInput.current?.click()}>＋ <span>이미지 첨부</span></button><span className="composer-hint">{workshop?(mode==="evaluate"?"평가":"작업")+" · 팀 전체 기록 공유":"대장 달그락과 함께"}</span><button type="submit" className="send" aria-label="메시지 보내기" disabled={!!busy||loading||(!text.trim()&&!attachments.length)}>↑</button></div></form>}<p className="composer-footnote">{project?.origin==="connector"?"이 프로젝트의 대화와 설계는 Claude에서 만들어졌어요. 중요한 제작 결정은 직접 검토해주세요.":project?.lastAgentMode==="mock"?"Mock · 실제 AI 분석 없이 기록만 저장됩니다.":"AI 제안은 확인이 필요해요. 중요한 제작 결정은 함께 검토합니다."}</p>
      </footer>
    </section>
    {showArtifacts&&project&&<>
      <ResizeHandle className="workbench-resizer" controls="workbench-panel" label="작업대 크기 조절" axis={layout.stacked?"y":"x"} reverse value={layout.stacked?layout.sizes.workbenchHeight:layout.sizes.workbench} min={layout.stacked?180:280} max={layout.stacked?800:1000} onResize={v=>resize(layout.stacked?"workbenchHeight":"workbench",v)} onReset={()=>resize(layout.stacked?"workbenchHeight":"workbench",layout.stacked?360:460)}/>
      <WorkbenchPanel key={project.id} project={project} items={items} selected={selectedItem.id} busy={!!busy} onSelect={id=>setWorkbench(project.id,true,id)} onClose={()=>setWorkbench(project.id,false,selectedItem.id)} onAction={action} ownerName={viewer.kind==="user"?viewer.name:"나"} newMarks={newMarks} connectorOnly={connectorOnly}/>
    </>}
    {makerHelp&&<div className="modal-backdrop" onClick={()=>setMakerHelp(false)}><section className="profile-modal maker-help" role="dialog" aria-modal="true" aria-label="메이커스페이스 안내" onClick={e=>e.stopPropagation()}><header><h2>3D 프린터가 없어도 괜찮아요</h2><button aria-label="닫기" onClick={()=>setMakerHelp(false)}>×</button></header>
      {connectorOnly?<p>내 Claude에게 <b>“내 근처 메이커스페이스 찾아줘”</b>라고 말하면, 사는 곳과 이동할 수 있는 범위를 먼저 묻고 근처에서 쓸 수 있는 공간을 찾아 정리해줘요.</p>:<p className="notice">미안해요. 웹 대화에서 근처 메이커스페이스를 찾아주는 기능은 아직 설계 중이에요. 아래 방법으로 직접 찾아보실 수 있어요. Claude 커넥터로 쓰시면 Claude가 위치를 묻고 대신 찾아드려요.</p>}
      <h3>메이커스페이스가 뭐예요?</h3><p>3D 프린터, 레이저 커터, 납땜 도구 같은 장비를 기본 교육을 받은 뒤 무료나 재료비 정도로 빌려 쓰는 작업 공간이에요. 비슷한 곳으로 팹랩(Fab Lab), 무한상상실, 도서관·과학관 메이커존, 구청·시청 메이커스페이스, 대학 팹랩·창업지원센터가 있고, 직접 출력하기 어려우면 3D 출력 대행 서비스도 있어요.</p>
      <h3>이렇게 찾아보세요</h3><ul className="maker-tips"><li><b>메이크올(makeall.com)</b>에서 지역으로 메이커스페이스와 보유 장비를 검색해요.</li><li>검색어: “[내 지역] 메이커스페이스 3D 프린터 예약”, “[내 지역] 팹랩”, “[내 지역] 무한상상실”.</li><li>공간 소개에서 보유 프린터를 확인해요. 흔한 예: 뱀부랩(Bambu Lab), 큐비콘(Cubicon), 신도리코(Sindoh), 크리얼리티(Creality), 프루사(Prusa). 같은 이름으로 “[프린터 이름] 사용법”을 검색하면 출력 준비에 도움이 돼요.</li><li>이용 조건(기본 교육 이수, 예약 방법, 재료비)과 운영 시간은 방문 전에 공식 페이지에서 꼭 확인하세요.</li></ul>
      <MakerspaceList/>
      <button className="primary" onClick={()=>setMakerHelp(false)}>확인</button></section></div>}
    {showAccount&&<AccountPanel onClose={()=>setShowAccount(false)}/>}
    {deleting&&<DeleteProjectDialog project={deleting} used={projects.length} limit={viewer.kind==="user"?viewer.projectLimit??null:null} onClose={()=>setDeleting(null)} onDeleted={id=>{setDeleting(null);setProjects(ps=>ps.filter(x=>x.id!==id));if(selectedId===id)switchProject(null);}}/>}
    {connectTab&&project&&<ConnectPanel key={project.id} project={project} tab={connectTab} busy={!!busy} onTab={setConnectTab} onClose={()=>setConnectTab(null)} onAction={action}/>}
    {showProfile&&<div className="modal-backdrop" onClick={()=>setShowProfile(false)}><section className="profile-modal" role="dialog" aria-modal="true" aria-label="제작 프로필" onClick={e=>e.stopPropagation()}><header><h2>함께 만들기 전에</h2><button aria-label="프로필 닫기" onClick={()=>setShowProfile(false)}>×</button></header><p>목표를 작게 만들기 위한 질문이 아니에요.<br/>설명과 확인 방법을 나에게 맞추기 위한 준비예요.</p>{profileScope==="project"&&<label>핵심 동작<textarea aria-label="핵심 동작" placeholder="무엇을 감지하고, 어떻게 반응하면 좋을까요?" value={profile.coreBehavior} onChange={e=>setProfile({...profile,coreBehavior:e.target.value})}/></label>}<fieldset><legend>사용할 수 있는 제작 도구</legend><div className="tool-checks">{TOOL_OPTIONS.map(t=><label key={t}><input type="checkbox" checked={profile.tools.includes(t)} onChange={e=>setProfile({...profile,toolsConfirmed:true,tools:e.target.checked?[...profile.tools,t]:profile.tools.filter(x=>x!==t)})}/>{t}</label>)}</div><label className="none-check"><input type="checkbox" checked={profile.toolsConfirmed&&!profile.tools.length} onChange={e=>setProfile({...profile,tools:[],toolsConfirmed:e.target.checked})}/>아직 보유한 도구가 없어요</label></fieldset><fieldset><legend>펌웨어 설치·업로드 경험</legend>{([["none","처음이에요 · 단계마다 안내가 필요해요"],["guided","안내를 보면서 해본 적 있어요"],["independent","보드 설정과 업로드를 직접 할 수 있어요"]] as const).map(([v,label])=><label className="radio-option" key={v}><input type="radio" name="experience" value={v} checked={profile.firmwareExperience===v} onChange={()=>setProfile({...profile,firmwareExperience:v})}/>{label}</label>)}</fieldset>{/* 하드웨어 경험과 별개로 둔다. 웹은 짜지만 펌웨어는 처음인 사람이 아주 흔하다.
          하나의 '개발자/비개발자' 스위치로 묶으면 둘 중 하나는 반드시 틀린다. */}
      <fieldset><legend>코딩 경험 <small>(소프트웨어)</small></legend>{(["none","guided","independent"] as const).map(v=><label className="radio-option" key={v}><input type="radio" name="coding-account" checked={(profile.devProfile?.codingExperience??"unanswered")===v} onChange={()=>setProfile({...profile,devProfile:{...(profile.devProfile??emptyDevProfile()),codingExperience:v}})}/>{CODING_EXPERIENCE[v]}</label>)}</fieldset>
      <fieldset><legend>즐겨 쓰는 개발 도구 <small>(선택)</small></legend><div className="choice-row">{(["claude_code","codex","undecided"] as const).map(v=><label key={v} className={(profile.devProfile?.tool??"undecided")===v?"on":""}><input type="radio" name="devtool-account" checked={(profile.devProfile?.tool??"undecided")===v} onChange={()=>setProfile({...profile,devProfile:{...(profile.devProfile??emptyDevProfile()),tool:v}})}/>{DEV_TOOLS[v]}</label>)}</div><small className="muted">나중에 바뀌면 여기서 고치면 돼요. 설명의 깊이만 달라지고 쓸 수 있는 기능은 그대로예요.</small></fieldset>
      {CHECKLIST.filter(q=>q.key==="solderingSkill"||q.key==="printerAccess"||q.key==="travelRange"||(q.key==="purpose"&&profileScope==="project")).map(q=><fieldset key={q.key}><legend>{q.question}</legend>{q.options!.map(o=><label className="radio-option" key={o.value}><input type="radio" name={q.key} checked={profile[q.key]===o.value} onChange={()=>setProfile({...profile,[q.key]:o.value})}/>{o.label}</label>)}</fieldset>)}
      {profileScope==="project"&&profile.purpose==="sell"&&<label>목표 판매가 (원)<input className="profile-input" type="number" min={0} step={1000} value={profile.targetPriceKRW??""} onChange={e=>setProfile({...profile,targetPriceKRW:e.target.value===""?null:Number(e.target.value)})}/></label>}
      {profileScope==="project"&&<fieldset><legend>언제까지 만들고 싶나요? <small>(선택)</small></legend><div className="choice-row">{CHECKLIST.find(q=>q.key==="timelineWeeks")!.options!.map(o=><label key={o.value||"none"} className={(o.value===""?profile.timelineWeeks==null:profile.timelineWeeks===Number(o.value))?"on":""}><input type="radio" name="timeline" checked={o.value===""?profile.timelineWeeks==null:profile.timelineWeeks===Number(o.value)} onChange={()=>setProfile({...profile,timelineWeeks:o.value===""?null:Number(o.value)})}/>{o.label}</label>)}</div><small className="muted">실력에 비해 짧으면 목표는 유지하고, 왜 어려운지와 어떤 순서로 가야 하는지 알려드려요.</small></fieldset>}
      {profileScope==="project"&&<fieldset><legend>이 프로젝트에 투자하고 싶은 예산은요? <small>(선택)</small></legend><small className="muted">정확하지 않아도 돼요. 쓰고 싶은 만큼(심리적 비용)을 적어주세요. 도구가 없으면 처음 한 번 개발 환경 세팅 비용이 따로 들어요.</small><div className="choice-row">{CHECKLIST.find(q=>q.key==="budgetKRW")!.options!.filter(o=>o.value!=="custom").map(o=><label key={o.value} className={profile.budgetKRW===Number(o.value)?"on":""}><input type="radio" name="budget" checked={profile.budgetKRW===Number(o.value)} onChange={()=>setProfile({...profile,budgetKRW:Number(o.value)})}/>{o.label}</label>)}</div><label className="custom-budget">직접 입력 (원)<input className="profile-input" type="number" min={0} step={1000} value={profile.budgetKRW??""} onChange={e=>setProfile({...profile,budgetKRW:e.target.value===""?null:Number(e.target.value)})}/></label></fieldset>}
      <label>어느 지역에서 만드나요? <small>메이커스페이스 안내용</small><input className="profile-input" type="text" maxLength={60} placeholder="예: 서울 마포구" value={profile.region??""} onChange={e=>setProfile({...profile,region:e.target.value})}/></label>
      <button className="primary" disabled={!!busy} onClick={()=>void saveProfile()}>{profileScope==="project"?"프로필 저장 · 팀에 알려주기":"내 장비·경험 저장"}</button><small>{profileScope==="project"?"도구와 경험은 계정에 저장돼 다른 프로젝트에도 함께 반영됩니다.":"장비와 경험은 계정에 저장돼 모든 프로젝트가 같이 씁니다. 예산과 기한은 프로젝트마다 따로 정해요."}</small></section></div>}
  </main>;
}
