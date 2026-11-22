import { NextResponse } from "next/server";
import { accountById, changeAccount, type ForgeUser } from "./users";
import type { Viewer } from "./viewer";

// 앱 안에서 대화하려면 누가 얼마를 썼는지 세야 한다. 지금까지 LLM_COST_LIMIT_PER_DAY_USD는
// "이번 호출의 최대 비용이 설정값보다 작은가"만 보는 사전 점검이었고, 실제로 쓴 돈은
// 어디에도 쌓이지 않았다. 그래서 하루 한도가 한 번도 집계된 적이 없다.
//
// 여기서는 사람별로 하루 쓴 금액을 쌓고, 무료 한도를 넘으면 더 쓰지 못하게 막는다.
// 결제는 아직 붙이지 않는다. PG는 사업자등록과 심사가 필요한 외부 의존이라 코드로
// 당길 수 없고, 먼저 필요한 것은 "얼마나 쓰는가"를 아는 일이다.

export type Usage = NonNullable<ForgeUser["usage"]>;

const today = () => new Date().toISOString().slice(0, 10);
const empty = (): Usage => ({ day: today(), usd: 0, turns: 0, totalUsd: 0 });

// 한 번의 대화에 잡는 비용. 실제 토큰 수가 아니라 그 호출에 걸어둔 상한이라
// 실제보다 적게 세는 일이 없다. 토큰 단위 정산은 모델 호출부가 사용량을
// 돌려주도록 고친 뒤에 붙인다(어댑터는 이미 inputTokens/outputTokens를 준다).
export const TURN_USD = { chat: 0.04, build: 0.35, evaluate: 0.2, repair: 0.2 } as const;
export type TurnKind = keyof typeof TURN_USD;

export const freeDailyUsd = () => {
  const configured = Number(process.env.FREE_CREDIT_USD_PER_DAY);
  return Number.isFinite(configured) && configured >= 0 ? configured : 0.5;
};

export const allowanceUsd = (user: Pick<ForgeUser, "dailyCreditUsd">) =>
  typeof user.dailyCreditUsd === "number" && user.dailyCreditUsd >= 0 ? user.dailyCreditUsd : freeDailyUsd();

export function spentTodayUsd(user: Pick<ForgeUser, "usage">): number {
  return user.usage && user.usage.day === today() ? user.usage.usd : 0;
}

export function remainingUsd(user: Pick<ForgeUser, "usage" | "dailyCreditUsd">): number {
  return Math.max(0, allowanceUsd(user) - spentTodayUsd(user));
}

// 운영자는 자기 키로 자기 돈을 쓰므로 세지 않는다. 참여자만 한도를 받는다.
export async function budgetDenied(viewer: Viewer, kind: TurnKind): Promise<NextResponse | null> {
  if (viewer.kind !== "user") return null;
  const account = await accountById(viewer.user.id);
  if (!account) return null;
  const left = remainingUsd(account);
  if (left >= TURN_USD[kind]) return null;
  return NextResponse.json({
    error: `오늘 쓸 수 있는 무료 분량을 다 썼어요. 내일 다시 채워져요. 그동안에는 내가 쓰는 AI에 커넥터를 연결해 쓰시면 대화 비용이 들지 않아요.`,
    code: "credit_exhausted",
    remainingUsd: left
  }, { status: 402 });
}

// 한 번의 대화가 끝나면 그만큼 적는다. 날짜가 바뀌었으면 오늘치부터 다시 센다.
export async function chargeTurn(viewer: Viewer, kind: TurnKind): Promise<void> {
  if (viewer.kind !== "user") return;
  const cost = TURN_USD[kind];
  await changeAccount(viewer.user.id, (record) => {
    const current = record.usage && record.usage.day === today() ? record.usage : { ...empty(), totalUsd: record.usage?.totalUsd ?? 0 };
    record.usage = { day: today(), usd: Math.round((current.usd + cost) * 1e6) / 1e6, turns: current.turns + 1, totalUsd: Math.round((current.totalUsd + cost) * 1e6) / 1e6 };
  }).catch(() => { /* 기록에 실패해도 이미 끝난 대화를 되돌리지는 않는다. */ });
}
