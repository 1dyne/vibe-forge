import { CATS, type Cat, type Chip } from "./chips";
import type { ProjectMatch } from "./projects";

// 결과 화면의 "지금 네 아이디어는 어디쯤?" — 고른 장작만 보고 구상 수준을 4단계로 나누고,
// 지금 더 해보면 좋을 일을 최대 3개 고른다. 수준이 낮으면 빈 갈래 채우기, 높으면 만들기 쪽으로 한 걸음.

export type Maturity = {
  level: 1 | 2 | 3 | 4;
  label: string;
  summary: string;
  next: Array<{ title: string; body: string; href?: string }>;
};

const LABEL = { 1: "불씨 아이디어", 2: "모양이 잡히는 중", 3: "설계 직전", 4: "바로 만들어볼 수 있어" } as const;

const MISSING: Record<Cat, { title: string; body: string }> = {
  감지: { title: "언제 반응할지 정하기", body: "'시간마다', '무게가 줄면'처럼 신호 하나만 골라봐. 어떤 센서를 쓸지가 여기서 정해져." },
  반응: { title: "어떻게 알려줄지 정하기", body: "불빛·소리·진동 중 하나만 정해도 부품 절반이 정해져. 쓰는 사람이 어디를 보고 있을지 떠올려봐." },
  형태: { title: "어디에 둘지 정하기", body: "책상, 문, 손목처럼 놓일 자리가 정해지면 크기와 전원 방식이 따라와." },
  누구: { title: "누가 쓸지 정하기", body: "쓰는 사람이 정해지면 소리 크기, 버튼 크기, 안전 기준이 달라져." }
};

export function assessMaturity(chips: Chip[], followIds: Set<string>, matches: ProjectMatch[], unique: string[]): Maturity {
  const filled = new Set(chips.map((c) => c.cat));
  const missing = CATS.filter((c) => !filled.has(c));
  const depth = chips.filter((c) => followIds.has(c.id)).length;
  const count = chips.length;

  const level: Maturity["level"] =
    filled.size <= 1 || count <= 2 ? 1
    : filled.size < 4 ? 2
    : depth >= 2 && count >= 6 ? 4
    : 3;

  const summary = {
    1: "뭘 해결하고 싶은지는 보였어. 아직 장작이 적어서 어떤 물건인지는 흐릿해.",
    2: `큰 그림은 잡혔어. ${missing.join("·")} 갈래가 비어 있어서 거기만 채우면 설계를 시작할 수 있어.`,
    3: "네 갈래가 다 찼어. 이제 '얼마나·어떻게'를 한 단계씩 좁히면 부품을 고를 수 있어.",
    4: "여기까지 구체적이면 부품을 고르고 회로를 그릴 수 있는 수준이야. 이제 손을 움직여볼 차례."
  }[level];

  const next: Maturity["next"] = [];
  // 1·2단계: 빈 갈래부터 (감지 → 반응 → 형태 → 누구 순서로 중요)
  for (const cat of ["감지", "반응", "형태", "누구"] as Cat[]) if (missing.includes(cat)) next.push(MISSING[cat]);
  if (level <= 2 && depth === 0 && count > 0) {
    next.push({ title: "한 단계 더 구체적으로", body: "고른 장작을 누르면 더 자세한 장작이 붙어. '깜빡깜빡', '컵 무게 재기'처럼 '어떻게'를 좁혀봐." });
  }
  if (level >= 3) {
    const top = matches[0];
    if (top) next.push({ title: "닮은 프로젝트 뜯어보기", body: `'${top.title_ko}'의 부품 목록과 사진을 보고, 네 것과 같은 부분에 표시해봐. 겹치는 ${top.match}%는 거의 그대로 가져다 쓸 수 있어.`, href: top.source_url });
    if (unique.length) next.push({ title: "네 것만의 부분 생각해두기", body: `${unique.slice(0, 3).join(", ")}${unique.length > 3 ? " 등" : ""}은 닮은 프로젝트에 없어. 대장간에서 같이 설계할 핵심이니까 어떻게 동작하면 좋을지 한 줄씩 적어둬.` });
    const carried = chips.some((c) => ["f_hand", "f_wear", "f_key", "f_wrist", "f_clip"].includes(c.id));
    next.push(carried
      ? { title: "전원 정하기", body: "들고 다니거나 몸에 차는 물건이라 배터리가 필요해. 한 번 충전해서 며칠 가면 좋을지 정해봐." }
      : { title: "전원 정하기", body: "USB로 꽂아둘지, 건전지로 선 없이 둘지 정해봐. 하루에 몇 번 반응하는지 세어보면 답이 나와." });
    next.push({ title: "종이로 크기 잡아보기", body: "상자나 종이로 실제 크기를 대충 만들어서 둘 자리에 놓아봐. 10분이면 되고, 크기 감이 확 생겨." });
  }
  return { level, label: LABEL[level], summary, next: next.slice(0, 3) };
}
