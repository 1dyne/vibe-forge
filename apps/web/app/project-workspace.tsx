"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { AgentId, ChatChannel, ImageAttachment, LocalProject, MakerProfile } from "../lib/project-types";
import { AGENTS, emptyProfile, intakeMissing, TOOL_OPTIONS, workflowFor } from "../lib/workflow";
import { workbenchItems } from "../lib/workbench";
import WorkbenchPanel from "./workbench-panel";
import { ResizeHandle, useWorkspaceLayout, layoutLimits } from "./workspace-layout";
import { useWorkspacePreferences } from "./workspace-preferences";

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
  const [profile,setProfile]=useState<MakerProfile>(emptyProfile());
  const {preferences,setWorkbench,expand,toggleProjects,toggleFolder}=useWorkspacePreferences();
  const end=useRef<HTMLDivElement>(null);
  const fileInput=useRef<HTMLInputElement>(null);
  const project=projects.find(p=>p.id===selectedId)??null;
  const items=workbenchItems(project);
  const workbenchPreference=project?preferences.workbenches[project.id]:undefined;
  const selectedItem=items.find(i=>i.id===workbenchPreference?.selected)??items[0];
  const showArtifacts=!!project&&items.length>0&&(workbenchPreference?.open??true);
  const layout=useWorkspaceLayout(showArtifacts);
  const workflow=project?workflowFor(project):null;
  const phase=workflow?.phase??"brainstorm";
  const workshop=phase==="workshop";
  useEffect(()=>{fetch("/api/projects",{cache:"no-store"}).then(async r=>{if(r.status===401){window.location.assign("/login");return;}if(!r.ok)throw new Error("프로젝트를 불러오지 못했습니다. 로그인 상태를 확인해주세요.");const b=await r.json();setProjects(b.projects);}).catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);
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
  async function action(input:Record<string,unknown>) {if(!project)return;const labels:Record<string,string>={plan:"회로 초안을 설계하고 검토하고 있어요",approve_circuit:"승인된 회로로 3D 목업을 만들고 있어요",approve_mockup:"다음 작업을 정리하고 있어요",enter_workshop:"대장간을 준비하고 있어요"};const p=await request("/api/projects/"+project.id+"/workflow",input,labels[String(input.action)]??"프로젝트에 반영하고 있어요");if(p){const kind=input.action==="plan"?"circuit":input.action==="approve_circuit"?"cad":input.action==="approve_mockup"?"tasks":null;const item=workbenchItems(p).find(i=>i.kind===kind);if(item)setWorkbench(p.id,true,item.id);if(input.action==="enter_workshop")setChannel("main");if(input.action==="profile")setShowProfile(false);}}
  async function attach(files:FileList|null) {if(!files)return;setError("");try {const added:ImageAttachment[]=[];for(const f of Array.from(files)){if(!["image/png","image/jpeg","image/webp"].includes(f.type))throw new Error("PNG, JPG, WebP 이미지를 선택해주세요.");if(f.size>5*1024*1024)throw new Error("이미지 한 장은 5MB 이하로 첨부해주세요.");const bitmap=await createImageBitmap(f);const canvas=document.createElement("canvas");const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));canvas.width=bitmap.width*scale;canvas.height=bitmap.height*scale;canvas.getContext("2d")!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();added.push({name:f.name,dataUrl:canvas.toDataURL("image/jpeg",.82)});}if(attachments.length+added.length>3)throw new Error("한 번에 이미지는 3장까지 첨부할 수 있어요.");setAttachments([...attachments,...added]);}catch(e){setError(e instanceof Error?e.message:"이미지 처리에 실패했습니다.");}if(fileInput.current)fileInput.current.value="";}
  function switchProject(id:string|null,room:ChatChannel="main"){if(busy)return;setSelectedId(id);setChannel(room);setText("");setAttachments([]);setError("");setMode("work");setShowProfile(false);if(id)expand(id);}
  function toggleAgent(agent:AgentId) {if(!workflow)return;const next=workflow.activeAgents.includes(agent)?workflow.activeAgents.filter(a=>a!==agent):[...workflow.activeAgents,agent];if(!next.length){setError("함께 작업할 에이전트를 하나 이상 선택해주세요.");return;}if(channel===agent)setChannel("main");void action({action:"agents",agents:next});}
  const messages=project?.messages.filter(m=>!workshop||channel==="main"||(m.channel??"main")===channel)??[];
  const activeSpeaker=channel==="main"?"chief":channel;
  const openProfile=()=>{setProfile(workflow?.profile??emptyProfile());setShowProfile(true);};
  const resize=(key:keyof typeof layout.sizes,value:number)=>layout.resize(key,value,showArtifacts);
  return <main style={layout.style} className={"forge-app resizable-workspace "+(showArtifacts?"":"artifacts-hidden")}>
    <aside className="sidebar" id="project-sidebar" aria-label="프로젝트 탐색">
      <button className="brand" onClick={()=>switchProject(null)} disabled={!!busy} aria-label="달그락 대장간 · 새로운 아이디어로 이동"><img src="/characters/idle.png" alt=""/><span>달그락 대장간<small>생각을 손에 잡히게.</small></span></button>
      <button className="new-project" onClick={()=>switchProject(null)} disabled={!!busy}>＋ 새로운 아이디어</button>
      <button className="nav-caption projects-toggle" aria-expanded={preferences.projectsOpen} aria-controls="project-folders" onClick={toggleProjects}><span>{preferences.projectsOpen?"⌄":"›"} 프로젝트</span><span>{projects.length}</span></button>
      {preferences.projectsOpen&&<nav className="project-tree" id="project-folders" aria-label="프로젝트 목록">{projects.map(p=>{
        const w=workflowFor(p);const expanded=preferences.expanded.includes(p.id);const active=p.id===selectedId;
        return <section className={"project-folder "+(active?"active-folder":"")} key={p.id}>
          <div className="folder-heading"><button className="folder-toggle" aria-label={p.name+" 작업실 "+(expanded?"접기":"펼치기")} aria-expanded={expanded} aria-controls={"rooms-"+p.id} onClick={()=>toggleFolder(p.id)}>{expanded?"⌄":"›"}</button><button className="folder-name" aria-current={active?"page":undefined} disabled={!!busy} title={p.name} onClick={()=>switchProject(p.id)}><span aria-hidden="true">▱</span><span>{p.name}<small>{phaseNames[w.phase]}</small></span></button></div>
          {expanded&&<nav className="rooms project-rooms" id={"rooms-"+p.id} aria-label={p.name+" 작업실"}><button disabled={!!busy} className={active&&channel==="main"?"selected":""} aria-current={active&&channel==="main"?"page":undefined} onClick={()=>switchProject(p.id,"main")}>⌂ {w.phase==="workshop"?"메인 대장간":"대장과 아이디어 나누기"}</button>{w.phase==="workshop"&&Array.from(new Set<AgentId>(["chief",...w.activeAgents])).map(a=><button key={a} disabled={!!busy} className={active&&channel===a?"selected":""} aria-current={active&&channel===a?"page":undefined} onClick={()=>switchProject(p.id,a)}><span className={"agent-dot dot-"+a}/>{AGENTS[a].name}<small>작업실</small></button>)}</nav>}
        </section>;
      })}{!projects.length&&!loading&&<p className="muted empty-projects">첫 아이디어를 이야기하면 프로젝트 폴더가 생겨요.</p>}</nav>}
      <div className="sidebar-bottom"><span className="online-dot"/> 내 작업 공간<button disabled={!project||!!busy} onClick={openProfile}>⚙ 제작 프로필</button><div className="workspace-settings"><button onClick={layout.reset}>구역 크기 초기화</button><form method="post" action="/api/session"><input type="hidden" name="intent" value="logout"/><button disabled={!!busy}>로그아웃</button></form></div></div>
    </aside>
    <ResizeHandle className="sidebar-resizer" controls="project-sidebar" label="프로젝트 영역 크기 조절" axis={layout.mobile?"y":"x"} value={layout.mobile?layout.sizes.sidebarHeight:layout.sizes.sidebar} min={layout.mobile?120:160} max={480} onResize={v=>resize(layout.mobile?"sidebarHeight":"sidebar",v)} onReset={()=>resize(layout.mobile?"sidebarHeight":"sidebar",layout.mobile?210:240)}/>
    <section className="chat-panel" id="chat-panel" aria-label="대화">
      <header className="chat-header"><div><span className="breadcrumb">내 대장간 / {project?.name??"새로운 아이디어"}</span><h1>{workshop?(channel==="main"?"메인 대장간":AGENTS[channel].name+" 작업실"):phaseNames[phase]}</h1></div>{items.length>0&&<button className="workbench-toggle" aria-expanded={showArtifacts} aria-controls="workbench-panel" onClick={()=>project&&setWorkbench(project.id,!showArtifacts,selectedItem.id)}>▥ 작업대 <span>{items.length}</span></button>}</header>
      <div className="phase-strip"><span className={phase==="brainstorm"?"current":"done"}>01 아이디어</span><i/><span className={phase!=="brainstorm"&&!workshop?"current":workshop?"done":""}>02 계획</span><i/><span className={workshop?"current":""}>03 대장간</span></div>
      {workshop&&<div className="team-strip"><span>함께 일할 팀</span>{(["hw","sw","me","id"] as AgentId[]).map(a=><label key={a} className={workflow!.activeAgents.includes(a)?"on":""}><input type="checkbox" checked={workflow!.activeAgents.includes(a)} disabled={!!busy} onChange={()=>toggleAgent(a)}/>{a.toUpperCase()}</label>)}<select aria-label="에이전트 모드" value={mode} onChange={e=>setMode(e.target.value as "work"|"evaluate")}><option value="work">작업 모드</option><option value="evaluate">Evaluator 모드</option></select></div>}
      <div className="chat-scroll" role="log" aria-label="프로젝트 대화" aria-live="polite">
        {!project&&<div className="welcome"><Avatar large/><p className="eyebrow">YOUR IDEA, OUR NEXT PROJECT</p><h2>무엇을 만들어볼까요?</h2><p>아직 다 정해지지 않아도 괜찮아요.<br/>대장 달그락과 이야기하며 첫 설계를 시작해보세요.</p><div className="idea-prompts">{["내 팔에 앉는 부엉이 반려 로봇","식물의 상태를 알려주는 화분","책상 위 작은 집중 타이머"].map(s=><button key={s} onClick={()=>setText(s)}>{s} ↗</button>)}</div></div>}
        {project&&<div className="project-intro"><span className="pill">{phaseNames[phase]}</span><p>{project.oneLiner}</p></div>}
        {messages.map(m=><article key={m.id} className={"chat-message "+m.role}>
          {m.role==="assistant"?<Avatar agent={m.agent??"chief"}/>:<span className="user-avatar">나</span>}
          <div className="message-body"><div className="message-meta"><strong>{m.role==="user"?"나":AGENTS[m.agent??"chief"].name}</strong>{m.mode==="evaluate"&&<span className="pill unknown">Evaluator</span>}{workshop&&channel==="main"&&m.channel&&m.channel!=="main"&&<small>{AGENTS[m.channel].name} 작업실에서 공유</small>}<time>{new Date(m.createdAt).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})}</time></div><div className="message-text">{m.text}</div>{m.attachments?.length?<div className="message-images">{m.attachments.map((a,i)=><a href={a.dataUrl} download={a.name} key={i}><img src={a.dataUrl} alt={a.name}/><span>{a.name}</span></a>)}</div>:null}{m.shared&&workshop&&<span className="shared-tag">↗ 팀 공통 기록에 공유됨</span>}</div>
        </article>)}
        {project&&phase==="brainstorm"&&<div className="intake-card"><strong>설계 전, 함께 확인할 것</strong><p>핵심 동작과 보유 도구, 펌웨어 경험을 알려주세요. 경험은 설명을 맞추는 데만 사용합니다.</p><div className="intake-status">{["핵심 동작","보유 도구","펌웨어 경험"].map(s=><span key={s} className={intakeMissing(workflow!.profile).includes(s)?"":"complete"}>{intakeMissing(workflow!.profile).includes(s)?"○":"✓"} {s}</span>)}</div><button onClick={openProfile} disabled={!!busy}>체크리스트 작성하기</button><button className="primary" disabled={!!busy||intakeMissing(workflow!.profile).length>0} onClick={()=>action({action:"plan"})}>브레인스토밍 마치고 계획 시작 →</button></div>}
        {project&&phase==="circuit"&&<div className="stage-card"><span className="pill">먼저, 회로</span><strong>회로 방향을 확인해주세요.</strong><p>오른쪽 회로도에서 연결과 미확정 항목을 검토하고 변경할 부분은 채팅으로 논의해요.</p><button className="primary" disabled={!!busy||!project.build} onClick={()=>action({action:"approve_circuit"})}>회로 방향 승인 · 3D 목업 만들기 →</button><button disabled={!!busy} onClick={()=>action({action:"reopen"})}>아이디어·회로 다시 논의</button></div>}
        {project&&phase==="mockup"&&<div className="stage-card"><strong>돌려보고, 형태를 확인해주세요.</strong><p>회로에 맞춘 치수 목업입니다. 실제 부품 크기와 착용감은 제작 단계에서 확인해요.</p><button className="primary" disabled={!!busy} onClick={()=>action({action:"approve_mockup"})}>3D 방향 승인 · 작업 나누기 →</button><button disabled={!!busy} onClick={()=>action({action:"reopen"})}>설계 변경 논의</button></div>}
        {project&&phase==="handoff"&&<div className="handoff-card"><h3>함께 만들 달그락 팀이에요.</h3><p>아이디어 범위에 맞춰 제안했어요. 사용할 에이전트를 직접 고를 수 있습니다.</p><div className="agent-cards">{(["hw","sw","me","id"] as AgentId[]).map(a=><label key={a}><Avatar agent={a}/><strong>{AGENTS[a].name}</strong><small>{AGENTS[a].title}</small><input type="checkbox" aria-label={AGENTS[a].name+" 선택"} checked={workflow!.activeAgents.includes(a)} disabled={!!busy} onChange={()=>toggleAgent(a)}/></label>)}</div><p>다음 할 일과 BOM을 확인했으면 준비된 작업부터 시작해요. 부품이 없어도 코드·설계 논의를 진행할 수 있어요.</p><button className="primary" disabled={!!busy} onClick={()=>action({action:"enter_workshop"})}>대장간 입장 →</button></div>}
        {busy&&<div className="thinking-message" role="status"><Avatar agent={activeSpeaker} busy/><div><strong>{busy}</strong><p>필요한 정보를 살펴보고 있어요<span className="loading-dots">…</span></p></div></div>}
        {loading&&<p className="loading-text">저장한 프로젝트를 불러오고 있어요…</p>}<div ref={end}/>
      </div>
      <ResizeHandle className="composer-resizer" controls="composer-area" label="대화 입력 영역 높이 조절" axis="y" reverse value={layout.sizes.composer} min={layoutLimits.composer[0]} max={layoutLimits.composer[1]} onResize={v=>resize("composer",v)} onReset={()=>resize("composer",160)}/>
      <footer className="composer-area" id="composer-area">{error&&<div role="alert" className="error-banner">{error}<button onClick={()=>setError("")}>닫기</button></div>}{attachments.length>0&&<div className="attachment-previews">{attachments.map((a,i)=><div key={i}><img src={a.dataUrl} alt={a.name}/><button type="button" aria-label={a.name+" 첨부 제거"} onClick={()=>setAttachments(attachments.filter((_,j)=>j!==i))}>×</button></div>)}</div>}
        <form className="composer" onSubmit={submit}><textarea value={text} aria-label={project?"채팅 메시지":"아이디어 입력"} placeholder={workshop?(channel==="main"?"달그락 팀":AGENTS[channel].name)+"에게 이야기해주세요…":"머릿속 아이디어를 들려주세요. 이미지도 좋아요."} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if(!busy)void submit(e);}}} disabled={!!busy||loading}/><div className="composer-tools"><input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={e=>attach(e.target.files)}/><button type="button" aria-label="이미지 첨부" disabled={!!busy} onClick={()=>fileInput.current?.click()}>＋ <span>이미지 첨부</span></button><span className="composer-hint">{workshop?(mode==="evaluate"?"평가":"작업")+" · 팀 전체 기록 공유":"대장 달그락과 함께"}</span><button type="submit" className="send" aria-label="메시지 보내기" disabled={!!busy||loading||(!text.trim()&&!attachments.length)}>↑</button></div></form><p className="composer-footnote">{project?.lastAgentMode==="mock"?"Mock · 실제 AI 분석 없이 기록만 저장됩니다.":"AI 제안은 확인이 필요해요. 중요한 제작 결정은 함께 검토합니다."}</p>
      </footer>
    </section>
    {showArtifacts&&project&&<>
      <ResizeHandle className="workbench-resizer" controls="workbench-panel" label="작업대 크기 조절" axis={layout.stacked?"y":"x"} reverse value={layout.stacked?layout.sizes.workbenchHeight:layout.sizes.workbench} min={layout.stacked?180:280} max={layout.stacked?800:1000} onResize={v=>resize(layout.stacked?"workbenchHeight":"workbench",v)} onReset={()=>resize(layout.stacked?"workbenchHeight":"workbench",layout.stacked?360:460)}/>
      <WorkbenchPanel key={project.id} project={project} items={items} selected={selectedItem.id} busy={!!busy} onSelect={id=>setWorkbench(project.id,true,id)} onClose={()=>setWorkbench(project.id,false,selectedItem.id)} onAction={action}/>
    </>}
    {showProfile&&<div className="modal-backdrop" onClick={()=>setShowProfile(false)}><section className="profile-modal" role="dialog" aria-modal="true" aria-label="제작 프로필" onClick={e=>e.stopPropagation()}><header><h2>함께 만들기 전에</h2><button aria-label="프로필 닫기" onClick={()=>setShowProfile(false)}>×</button></header><p>목표를 작게 만들기 위한 질문이 아니에요.<br/>설명과 확인 방법을 나에게 맞추기 위한 준비예요.</p><label>핵심 동작<textarea aria-label="핵심 동작" placeholder="무엇을 감지하고, 어떻게 반응하면 좋을까요?" value={profile.coreBehavior} onChange={e=>setProfile({...profile,coreBehavior:e.target.value})}/></label><fieldset><legend>사용할 수 있는 제작 도구</legend><div className="tool-checks">{TOOL_OPTIONS.map(t=><label key={t}><input type="checkbox" checked={profile.tools.includes(t)} onChange={e=>setProfile({...profile,toolsConfirmed:true,tools:e.target.checked?[...profile.tools,t]:profile.tools.filter(x=>x!==t)})}/>{t}</label>)}</div><label className="none-check"><input type="checkbox" checked={profile.toolsConfirmed&&!profile.tools.length} onChange={e=>setProfile({...profile,tools:[],toolsConfirmed:e.target.checked})}/>아직 보유한 도구가 없어요</label></fieldset><fieldset><legend>펌웨어 설치·업로드 경험</legend>{([["none","처음이에요 · 단계마다 안내가 필요해요"],["guided","안내를 보면서 해본 적 있어요"],["independent","보드 설정과 업로드를 직접 할 수 있어요"]] as const).map(([v,label])=><label className="radio-option" key={v}><input type="radio" name="experience" value={v} checked={profile.firmwareExperience===v} onChange={()=>setProfile({...profile,firmwareExperience:v})}/>{label}</label>)}</fieldset><button className="primary" disabled={!!busy} onClick={()=>action({action:"profile",profile})}>프로필 저장 · 팀에 알려주기</button><small>도구와 경험은 다음 프로젝트에서도 불러옵니다.</small></section></div>}
  </main>;
}
