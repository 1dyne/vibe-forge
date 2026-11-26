import seed from "./bench/sam-seed.json";
import type { ChatChannel, LocalProject } from "./project-types";

// ── MEETUP: 2026-11-28 밋업 시연 전용. 밋업이 끝나면 이 커밋을 통째로 되돌려 지운다 ──
// 시연용 프로젝트 하나에만 걸리는 예외다. 다른 프로젝트는 이 파일의 어떤 것에도 닿지 않는다.
//  1) 대장 방에 적는 말은 AI를 부르지 않고 '현장 아이디어'로 바로 적는다 (무대에서 기다리지 않게).
//  2) 설계를 바꾸는 도구는 거절한다 (책상 위 실물과 화면이 달라지지 않게).
//  3) '완성 🎉'을 누르면 대장 달그락이 축하 인사와 함께, 아이디어마다 조언을 적은 편지를 보낸다.
// 시연용 프로젝트인지는 시드(sam-seed.json)의 아이디어 문장과 글자까지 같은지로 가린다. 따로 켜는 스위치가 없다.

const SEED_IDEA = ((seed.calls[0].args as { idea?: string }).idea ?? "").trim();
export const MEETUP_FINISH = "완성했어요! 🎉";

type Meetup = NonNullable<LocalProject["meetup"]>;

export const isMeetup = (project: Pick<LocalProject, "idea"> | null | undefined) => !!project && !!SEED_IDEA && project.idea.trim() === SEED_IDEA;
/** 시드가 조립 가이드와 테스트 계획까지 넣은 뒤부터 잠근다. 그 전에는 시드가 설계를 넣어야 한다. */
export const meetupLocked = (project: LocalProject | null | undefined) => isMeetup(project) && !!project!.assembly && !!project!.testPlan;
export const meetupChat = (channel: string) => channel === "main" || channel === "chief";
export const meetupIdeas = (project: LocalProject) => (project.meetup?.ideas ?? []).map((i) => i.text);

// 설계를 바꾸는 도구. 기록·조회·팀 대화는 그대로 둔다.
export const MEETUP_LOCKED_TOOLS = new Set([
  "record_brainstorm", "set_build_plan", "submit_circuit", "set_precise_mockup", "set_product_form", "set_housing_plan", "set_power_budget",
  "set_test_plan", "set_safety_review", "set_data_contract", "set_assembly_guide", "expand_assembly_step", "reset_project_stage",
  "write_dev_spec", "set_design_finish", "propose_design_change", "set_work_board"
]);
export const MEETUP_LOCK_MESSAGE = "이 프로젝트는 밋업 시연용이라 설계를 바꾸지 않아요. 도구로 고치지 말고, 사용자에게 말로만 조언해 주세요.";

/** 현장 아이디어 한 줄을 적고, 대장이 정해진 말로 받는다 (AI 호출 없음) */
export function recordMeetupIdea(p: LocalProject, text: string, channel: ChatChannel) {
  const now = new Date().toISOString();
  const meetup: Meetup = p.meetup ?? { ideas: [] };
  meetup.ideas = [...meetup.ideas, { text: text.trim().slice(0, 600), at: now }].slice(-30);
  p.meetup = meetup;
  const n = meetup.ideas.length;
  p.messages.push({ id: globalThis.crypto.randomUUID(), role: "user", channel, text, createdAt: now });
  p.messages.push({ id: globalThis.crypto.randomUUID(), role: "assistant", agent: "chief", channel, createdAt: now, text: `${n}번째 현장 아이디어로 적어 뒀어요.\n\n오늘은 설계를 바꾸지 않고 사만다를 끝까지 만들어요. 다 만들고 **완성 🎉** 을 누르면, 아이디어마다 제 생각을 편지로 드릴게요.` });
}

/** '완성 🎉'을 눌렀다는 말을 한 번만 적는다 (다시 눌러도 겹쳐 쌓이지 않게) */
export function markMeetupFinish(p: LocalProject, channel: ChatChannel) {
  const now = new Date().toISOString();
  const last = [...p.messages].reverse().find((m) => (m.channel ?? "main") === channel && m.role === "user");
  if (last?.text !== MEETUP_FINISH) p.messages.push({ id: globalThis.crypto.randomUUID(), role: "user", channel, text: MEETUP_FINISH, createdAt: now });
  p.meetup = { ...(p.meetup ?? { ideas: [] }), finishedAt: now };
}

/** 연결 앱의 AI에게 넘기는 부탁. 화면에는 보이지 않고, 답(편지)만 대화에 남는다 */
export function meetupPrompt(project: LocalProject) {
  const ideas = meetupIdeas(project);
  return [
    "밋업 시연의 마지막 순서예요. 방금 사만다 재고 저울을 끝까지 조립했고, 사용자가 '완성 🎉' 버튼을 눌렀어요.",
    "대장 달그락으로서 편지 한 통만 써 주세요. 도구는 하나도 부르지 마세요. 이 프로젝트의 설계는 바꾸지 않아요.",
    "",
    "쓰는 순서:",
    "1. 완성을 축하하는 인사 두세 문장. 오늘 만든 것(로드셀 + HX711 + ATOMS3 Lite, 납땜 두 번과 꽂기 한 번)을 짚어 주세요.",
    "2. \"편지를 하나 준비했어요.\"라고 말하고 줄을 바꿔요.",
    "3. 현장에서 나온 아이디어를 하나씩, 아래 세 줄 모양 그대로 써요. 화면이 이 모양을 읽어 카드로 그려요. 머리말 글자를 바꾸지 마세요:",
    "   **1번째 아이디어** — (아이디어를 한 줄로)",
    "   - 더 들어가야 할 설계: (전자회로 달그락(EE) / 소프트웨어 달그락(SW) / 기구설계 달그락(ME) / 제품 디자인 달그락(ID) 중에서 고르고, 이유 한 문장)",
    "   - 해 볼 것: (내일 바로 해 볼 수 있는 가장 작은 실험 하나)",
    "4. 마지막에 한 문장으로 응원해요.",
    "",
    "규칙: 존댓말 해요체. 아이디어 하나는 위 세 줄만 써요. 번호 목록(1. 2.)이나 표는 쓰지 않아요. 확인하지 않은 가격·수치는 지어내지 않아요.",
    "",
    ideas.length ? `현장에서 나온 아이디어 ${ideas.length}개:\n${ideas.map((t, i) => `${i + 1}. ${t}`).join("\n")}` : "오늘은 현장 아이디어가 적히지 않았어요. 3번 대신, 사만다를 다음에 더 키워 볼 방향 두 가지를 같은 형식(어느 달그락 / 해 볼 것)으로 제안해 주세요."
  ].join("\n");
}

const AREAS: Array<{ who: string; test: RegExp; why: string; tryIt: string }> = [
  { who: "소프트웨어 달그락(SW)", test: /앱|어플|화면|알림|알람|데이터|엑셀|기록|서버|클라우드|AI|인공지능|음성|바코드|QR|사진|카메라|연동|공유|통계|그래프/i, why: "휴대폰 화면과 기록 쪽 이야기라서요.", tryIt: "셈 앱에 화면 한 장을 종이로 먼저 그려서, 버튼을 몇 번 눌러야 하는지 세어 봐요." },
  { who: "전자회로 달그락(EE)", test: /배터리|건전지|충전|전원|무선|와이파이|블루투스|센서|LED|불빛|소리|부저|스피커|정확|정밀|kg|킬로|무게|디스플레이|버튼|전기|회로/i, why: "부품과 전원이 바뀌는 이야기라서요.", tryIt: "새로 붙일 부품 하나만 브레드보드에서 따로 돌려 보고, 그다음에 사만다에 합쳐요." },
  { who: "기구설계 달그락(ME)", test: /크기|케이스|하우징|상자|방수|튼튼|접이|접는|휴대|들고|저울판|넓|작게|크게|고정|벽|걸이|선반|서랍|뚜껑|무겁|가볍/i, why: "모양과 크기, 고정하는 방법이 바뀌는 이야기라서요.", tryIt: "폼보드나 두꺼운 종이로 실제 크기 모형을 먼저 만들어, 놓을 자리에 대 봐요." },
  { who: "제품 디자인 달그락(ID)", test: /디자인|색|예쁘|귀엽|캐릭터|얼굴|눈|손잡이|사용감|모양|느낌|브랜드|이름|스티커/i, why: "쓰는 사람이 보고 만지는 느낌의 이야기라서요.", tryIt: "누가 어디서 어떤 손으로 쓰는지 한 장면을 그려 보고, 거기서 어색한 곳을 찾아요." }
];

/** 연결 앱이 꺼져 있거나 답이 끊겼을 때 쓰는 편지. AI 없이 정해진 기준으로만 쓴다 (그렇다고 편지에 적는다) */
export function fallbackLetter(project: LocalProject) {
  const ideas = meetupIdeas(project);
  const lines = [
    "축하해요, 사만다가 완성됐어요! 🎉",
    "",
    "로드셀 선 네 가닥과 헤더를 납땜하고, ATOMS3 Lite를 핀에 맞춰 꽂아서 저울 한 대를 만들었어요. 이제 올리기만 하면 무게를 알려 줘요.",
    "",
    "편지를 하나 준비했어요.",
    ""
  ];
  if (!ideas.length) lines.push("오늘은 현장 아이디어가 적히지 않았어요. 다음에는 대장 방에 한 줄만 적어 주세요. 그 아이디어에 어느 달그락의 설계가 더 필요한지 같이 볼게요.");
  ideas.forEach((idea, i) => {
    const hits = AREAS.filter((a) => a.test.test(idea));
    const area = hits[0] ?? { who: "대장 달그락", why: "어느 쪽 일인지 아직 한 문장으로 좁혀지지 않아서요.", tryIt: "'누가, 언제, 무엇이 불편한지'를 한 문장으로 먼저 적어 봐요." };
    lines.push(`**${i + 1}번째 아이디어** — ${idea}`, "", `- 더 들어가야 할 설계: ${hits.length > 1 ? hits.slice(0, 2).map((a) => a.who).join("와 ") : area.who}. ${area.why}`, `- 해 볼 것: ${area.tryIt}`, "");
  });
  lines.push("오늘 만든 한 대가 다음 아이디어의 출발점이에요. 수고했어요!", "", "(연결 앱이 닿지 않아, 이 편지는 정해진 기준으로만 썼어요. 연결 앱을 켜고 다시 누르면 더 자세히 써 드려요.)");
  return lines.join("\n");
}

/** 편지인 말풍선: '완성했어요'를 누른 바로 뒤에 온 대장의 답 */
export function meetupLetterIds(project: LocalProject): Set<string> {
  const ids = new Set<string>();
  if (!isMeetup(project)) return ids;
  let after = false;
  for (const m of project.messages) {
    if (!meetupChat(m.channel ?? "main")) continue;
    if (m.role === "user") after = m.text === MEETUP_FINISH;
    else if (after && m.role === "assistant") ids.add(m.id);
  }
  return ids;
}

export type MeetupLetterParts = { intro: string[]; ideas: Array<{ title: string; design: string; tryIt: string; extra: string[] }>; outro: string[] };
const IDEA_HEAD = /^\s*(?:#+\s*)?\**\s*\d+\s*번째\s*아이디어\s*\**\s*[—–:-]\s*(.+)$/;
const DESIGN_LINE = /^\s*[-•*]?\s*\**\s*(?:더 들어가야 할 설계|설계 더하기|조언)\s*\**\s*[:：]\s*(.+)$/;
const TRY_LINE = /^\s*[-•*]?\s*\**\s*(?:해 볼 것|해볼 것)\s*\**\s*[:：]\s*(.+)$/;

/** 편지 글을 인사 / 아이디어별 조언 / 맺음말로 나눈다. 모양이 어긋난 줄은 버리지 않고 가까운 칸에 그대로 둔다 */
export function parseMeetupLetter(text: string): MeetupLetterParts {
  const out: MeetupLetterParts = { intro: [], ideas: [], outro: [] };
  let cur: MeetupLetterParts["ideas"][number] | null = null;
  let closing = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const head = line.match(IDEA_HEAD);
    if (head) { cur = { title: head[1], design: "", tryIt: "", extra: [] }; out.ideas.push(cur); closing = false; continue; }
    if (!cur) { out.intro.push(line); continue; }
    const design = line.match(DESIGN_LINE), tryIt = line.match(TRY_LINE);
    if (!closing && design) { cur.design = cur.design ? `${cur.design} ${design[1]}` : design[1]; continue; }
    if (!closing && tryIt) { cur.tryIt = cur.tryIt ? `${cur.tryIt} ${tryIt[1]}` : tryIt[1]; continue; }
    // 두 칸이 다 찬 뒤에 오는 줄글은 맺음말이다
    if (closing || (cur.design && cur.tryIt)) { closing = true; out.outro.push(line); continue; }
    cur.extra.push(line.replace(/^[-•*]\s*/, ""));
  }
  return out;
}
