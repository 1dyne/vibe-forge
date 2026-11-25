"use client";
import type { BoardView } from "../lib/board";
import type { AgentId } from "../lib/project-types";
import { agentName } from "../lib/workflow";

// 대장간 그림: 달그락들이 지금 무엇을 하고 있는지를 그림으로 읽는다.
// 움직임이 곧 상태다. 망치질하면 작업 중, 돌아서서 팻말을 들면 내 차례,
// 상자 옆에 앉아 있으면 현실을 기다리는 중. 누르면 그 달그락의 대장간이 열린다.
// 작업대(board.ts)의 값만 본다. 따로 저장하는 것은 없다.

export type RoomState = "my_turn" | "blocked" | "working" | "waiting" | "done" | "idle";

/** styles.css의 .agent-dot.dot-* 와 같은 색 */
export const AGENT_COLOR: Record<AgentId, string> = { chief: "#548b7c", hw: "#d2594b", sw: "#5b8fd9", me: "#d9a928", id: "#8f6fd0" };
/** 팀 색으로 칠한 달그락 그림 */
const art = (room: AgentId, frame: "idle" | "thinking_1" | "thinking_2") => `/characters/${room === "chief" ? "" : `${room}/`}${frame}.png`;
const STATE_LABEL: Record<RoomState, string> = { my_turn: "내 차례", blocked: "막힘", working: "작업 중", waiting: "기다리는 중", done: "끝남", idle: "쉬는 중" };

/** 대장은 카드가 없어도 늘 있다. 나머지는 작업대에 카드가 있는 달그락만. */
export function sceneRooms(board: BoardView): AgentId[] {
  const order: AgentId[] = ["chief", "hw", "sw", "me", "id"];
  return order.filter((room) => room === "chief" || board.rooms.some((r) => r.room === room));
}

export function roomState(board: BoardView, room: AgentId): RoomState {
  const cards = board.cards.filter((card) => card.owner === room);
  if (!cards.length) return "idle";
  if (cards.some((card) => card.active && card.turn === "person")) return "my_turn";
  if (cards.some((card) => card.turn === "blocked")) return "blocked";
  if (cards.some((card) => card.turn === "agent")) return "working";
  if (cards.some((card) => card.turn === "waiting")) return "waiting";
  if (cards.every((card) => card.turn === "done")) return "done";
  // 앞 카드를 기다리는 사람 차례 카드만 남은 경우: 아직 알릴 때가 아니다.
  return "waiting";
}

const clip = (text: string, max = 34) => { const t = text.replace(/\s+/g, " ").trim(); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };
const day = (iso: string) => iso.slice(5, 10).replace("-", "/");

/** 그 대장간 아래에 보일 한 줄 */
export function roomLine(board: BoardView, room: AgentId): string {
  const cards = board.cards.filter((card) => card.owner === room);
  const state = roomState(board, room);
  if (state === "idle") return room === "chief" ? "이야기를 기다려요" : "";
  if (state === "my_turn") return clip(cards.find((card) => card.active && card.turn === "person")!.ask ?? "확인이 필요해요");
  if (state === "blocked") return clip(cards.find((card) => card.turn === "blocked")!.note ?? "막혔어요");
  if (state === "working") return clip(cards.find((card) => card.turn === "agent" && card.active)?.title ?? cards.find((card) => card.turn === "agent")!.title);
  if (state === "waiting") {
    const card = cards.find((c) => c.turn === "waiting");
    if (!card) return "앞 일을 기다려요";
    return clip(`${card.waiting?.what ?? "기다리는 중"}${card.waiting?.expectedAt ? ` · ${day(card.waiting.expectedAt)}` : ""}${card.overdue ? " · 예정일 지남" : ""}`);
  }
  return "끝났어요";
}

const INK = "#232323";

/** 모루와 받침. 달그락마다 같은 자리, 색 띠만 다르다 */
function Anvil({ color, dim }: { color: string; dim?: boolean }) {
  return <g opacity={dim ? 0.55 : 1}>
    <path d="M70 66h34c0 5-5 7-9 7v5h5v5H74v-5h5v-5c-4 0-9-2-9-7z" fill="#cfd4d1" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M104 66c5 0 8 1 10 3-3 1-6 1-10 0z" fill="#cfd4d1" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
    <rect x="76" y="83" width="22" height="5" rx="1.5" fill={color} stroke={INK} strokeWidth="1.4" />
  </g>;
}

function Station({ room, state, count, selected, live, compact, late }: { room: AgentId; state: RoomState; count: number; selected: boolean; live: boolean; compact: boolean; late: boolean }) {
  const color = AGENT_COLOR[room];
  const working = state === "working";
  return <svg className={`fs-art fs-${state}`} viewBox="0 0 128 96" aria-hidden="true" focusable="false">
    {/* 바닥 */}
    <ellipse cx="64" cy="89" rx="54" ry="5" fill="#e9ebe6" />
    {/* 달그락 깃발: 누구의 대장간인지 */}
    <path d="M14 20v68" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
    <path d="M14 21h18l-5 6 5 6H14z" fill={color} stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />

    {state === "done"
      ? <>{/* 연장을 걸어 두었다 */}
          <path d="M96 30h22" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
          <path d="M102 30v14m-4 0h8v5h-8z" fill="#cfd4d1" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M113 30v16" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
          <Anvil color={color} dim />
        </>
      : state === "waiting"
        ? <>{/* 상자 옆에서 기다린다 */}
            <rect x="80" y="64" width="26" height="22" rx="2" fill="#e8d7b9" stroke={INK} strokeWidth="1.6" />
            <path d="M80 72h26M93 64v22" stroke={INK} strokeWidth="1.3" />
            {late && <g><circle cx="106" cy="62" r="7" fill="#e2603f" stroke={INK} strokeWidth="1.3" /><path d="M106 58v5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" /><circle cx="106" cy="65.6" r="1" fill="#fff" /></g>}
          </>
        : <Anvil color={color} />}

    {/* 달그락 */}
    <g className="fs-body">
      {working
        ? <><image className="fs-frame fs-frame-a" href={art(room, "thinking_1")} x="26" y="26" width="62" height="62" /><image className="fs-frame fs-frame-b" href={art(room, "thinking_2")} x="26" y="26" width="62" height="62" /></>
        : <image href={art(room, "idle")} x={state === "my_turn" ? 30 : 26} y="26" width="62" height="62" />}
    </g>

    {working && <g>
      {/* 망치질과 불똥 */}
      <g className="fs-hammer"><path d="M88 44l12 14" stroke={INK} strokeWidth="2" strokeLinecap="round" /><rect x="94" y="54" width="13" height="8" rx="1.5" transform="rotate(49 100 58)" fill="#9aa19d" stroke={INK} strokeWidth="1.4" /></g>
      <g className="fs-sparks" stroke="#e8a23c" strokeWidth="1.8" strokeLinecap="round"><path d="M98 60l-5-6" /><path d="M104 59l1-8" /><path d="M110 62l6-5" /></g>
    </g>}

    {state === "my_turn" && <g className="fs-sign">
      <path d="M96 52v32" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
      <rect x="82" y="26" width="28" height="26" rx="4" fill="#fff7f2" stroke={INK} strokeWidth="1.6" />
      <path d="M96 32v10" stroke="#e2603f" strokeWidth="3.2" strokeLinecap="round" /><circle cx="96" cy="47" r="1.9" fill="#e2603f" />
    </g>}

    {state === "blocked" && <g>
      <path d="M92 40l16 16m0-16L92 56" stroke="#c4442b" strokeWidth="3" strokeLinecap="round" />
    </g>}

    {state === "done" && <g><circle cx="42" cy="24" r="9" fill="#e4f0ea" stroke={INK} strokeWidth="1.4" /><path d="M37.5 24.5l3.2 3.2 6-6.4" fill="none" stroke="#3f7a6c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></g>}

    {state === "idle" && <g className="fs-zz" fill="none" stroke="#9aa69f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M80 34h6l-6 7h6" /><path d="M92 24h4l-4 5h4" /></g>}

    {live && <g className="fs-speech">
      <path d="M44 6h30a6 6 0 0 1 6 6v8a6 6 0 0 1-6 6H62l-5 6v-6H44a6 6 0 0 1-6-6v-8a6 6 0 0 1 6-6z" fill="#fff" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="51" cy="16" r="2" fill={INK} /><circle cx="59" cy="16" r="2" fill={INK} /><circle cx="67" cy="16" r="2" fill={INK} />
    </g>}

    {count > 0 && <g><circle cx="113" cy="15" r={compact ? 12 : 10} fill="#e2603f" /><text x="113" y={compact ? 20 : 19} textAnchor="middle" fontSize={compact ? 15 : 12.5} fontWeight="700" fill="#fff">{count}</text></g>}
    {selected && <rect className="fs-selected" x="2" y="2" width="124" height="92" rx="10" fill="none" />}
  </svg>;
}

export default function ForgeScene({ board, shortNames, activeRoom, liveRoom, onRoom, compact = false }: {
  board: BoardView; shortNames: boolean;
  /** 지금 대화창에 열려 있는 대장간 */
  activeRoom: AgentId | null;
  /** 지금 답하고 있는 달그락 */
  liveRoom: AgentId | null;
  onRoom: (room: AgentId) => void;
  /** true = 작업대 위에 얹는 낮은 띠, false = 넉넉한 그림 */
  compact?: boolean;
}) {
  const rooms = sceneRooms(board);
  const lateDeliveries = board.overdue.filter((o) => o.kind === "delivery");
  const now = board.real.now;
  return <div className={`fs-scene${compact ? " fs-compact" : ""}`} role="group" aria-label="대장간">
    {now && <div className="fs-me" title={now.text}>
      <svg className="fs-art" viewBox="0 0 128 96" aria-hidden="true" focusable="false">
        <ellipse cx="64" cy="89" rx="54" ry="5" fill="#e9ebe6" />
        {/* 내 작업대 */}
        <path d="M30 60h68v6H30z" fill="#e8d7b9" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" /><path d="M36 66v22M92 66v22" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="64" cy="34" r="11" fill="#fff" stroke={INK} strokeWidth="1.6" /><path d="M46 60c2-11 9-15 18-15s16 4 18 15" fill="#fff" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
        <g className="fs-me-tool"><path d="M80 52l14-10" stroke={INK} strokeWidth="2" strokeLinecap="round" /><circle cx="96" cy="41" r="2.4" fill="#e8a23c" /></g>
      </svg>
      {!compact && <span className="fs-text"><b>나</b><small>지금 {now.text}</small></span>}
      {compact && <span className="fs-text"><b>나</b></span>}
    </div>}

    {rooms.map((room) => {
      const state = roomState(board, room);
      const info = board.rooms.find((r) => r.room === room);
      const count = info?.myTurn ?? 0;
      const line = roomLine(board, room);
      const name = agentName(room, shortNames);
      const late = board.cards.some((card) => card.owner === room && card.overdue);
      const label = `${name} 대장간 · ${count > 0 ? `내 차례 ${count}개` : STATE_LABEL[state]}${line && count === 0 ? ` · ${line}` : ""}`;
      return <button key={room} type="button" className={`fs-room fs-is-${state}${activeRoom === room ? " fs-active" : ""}`} aria-label={label} aria-current={activeRoom === room ? "true" : undefined} title={line || STATE_LABEL[state]} onClick={() => onRoom(room)}>
        <Station room={room} state={state} count={count} selected={activeRoom === room} live={liveRoom === room} compact={compact} late={late} />
        <span className="fs-text">
          <b><i className="fs-dot" style={{ background: AGENT_COLOR[room] }} />{name}</b>
          {compact
            ? <small className={`fs-tag fs-tag-${state}`}>{STATE_LABEL[state]}</small>
            : <><small className={`fs-tag fs-tag-${state}`}>{STATE_LABEL[state]}</small>{line && state !== "done" && <small className="fs-line">{line}</small>}</>}
        </span>
      </button>;
    })}

    {lateDeliveries.length > 0 && <div className="fs-door" title={lateDeliveries.map((d) => d.label).join(", ")}>
      <svg className="fs-art" viewBox="0 0 128 96" aria-hidden="true" focusable="false">
        <ellipse cx="64" cy="89" rx="40" ry="5" fill="#e9ebe6" />
        <rect x="42" y="50" width="44" height="36" rx="3" fill="#e8d7b9" stroke={INK} strokeWidth="1.6" /><path d="M42 62h44M64 50v36" stroke={INK} strokeWidth="1.3" />
        <circle cx="88" cy="46" r="11" fill="#e2603f" stroke={INK} strokeWidth="1.4" /><path d="M88 40v7" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" /><circle cx="88" cy="51.5" r="1.5" fill="#fff" />
      </svg>
      <span className="fs-text"><b>예정일 지남</b>{!compact && <small className="fs-line">{clip(lateDeliveries.map((d) => d.label).join(", "), 30)}</small>}</span>
    </div>}
  </div>;
}
