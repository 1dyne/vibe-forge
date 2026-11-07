// 도깨비 마을: 골목 = 관심사. 도깨비불이 태어나면 장작과 가장 많이 겹치는 골목의 빈 터에 대장간을 짓는다.
// 골목마다 터 CAPACITY개. 다 차면 같은 주제의 다음 골목("냥집사 2골목")이 열린다.

export type AlleyTheme = { id: string; name: string; street: string; chips: string[] };

// 초기 8개 골목(이름은 다인이 확정 전 가제). street = Phase 4 손바닥 마을의 큰길
export const ALLEY_THEMES: AlleyTheme[] = [
  { id: "cat", name: "냥집사", street: "반려길", chips: ["w_cat", "w_cats", "w_pet", "f_bowl", "f_tough", "f_wash", "s_count", "s_when"] },
  { id: "dog", name: "멍집사", street: "반려길", chips: ["w_dog", "w_walk"] },
  { id: "water", name: "물 한 잔", street: "일길", chips: ["f_cup", "f_thin", "f_wood", "s_cup", "s_goal", "s_weight"] },
  { id: "sleep", name: "잠", street: "쉼길", chips: ["f_bed", "f_dim", "f_soft", "s_dark", "s_night", "s_motion", "r_press", "f_switch", "f_clean", "r_morning", "r_breathe"] },
  { id: "plant", name: "식물", street: "집길", chips: ["f_pot", "f_splash", "f_solar", "s_soil", "s_sun", "s_season", "w_plant", "w_many", "w_vacation"] },
  { id: "desk", name: "책상", street: "일길", chips: ["f_desk", "f_tiny", "f_round", "s_sit", "s_posture", "s_standup", "s_reset", "s_streak", "r_screen", "r_big", "r_count", "s_noise", "s_level", "s_classroom"] },
  { id: "door", name: "현관", street: "집길", chips: ["f_door", "f_noglue", "f_battery", "s_door", "s_lock", "s_away", "s_dist", "r_phone", "r_fam"] },
  { id: "kitchen", name: "부엌", street: "집길", chips: ["f_wall", "f_mag", "f_fridge", "s_air", "s_co2", "s_window", "s_humid", "s_htemp", "s_humidifier"] }
];

export const ALLEY_CAPACITY = Math.max(1, Number(process.env.FIND_ALLEY_CAPACITY ?? 100));

export function themeById(id: string) {
  return ALLEY_THEMES.find((t) => t.id === id) ?? ALLEY_THEMES[0];
}

export function alleyName(themeId: string, seq: number) {
  const t = themeById(themeId);
  return seq <= 1 ? `${t.name} 골목` : `${t.name} ${seq}골목`;
}

/** 장작과 가장 많이 겹치는 골목. 겹침이 같으면 주민이 적은 골목, 아무것도 안 겹치면 가장 한산한 골목. */
export function pickTheme(picked: string[], residents: Record<string, number>): AlleyTheme {
  const scored = ALLEY_THEMES.map((t) => ({ t, score: t.chips.filter((c) => picked.includes(c)).length, n: residents[t.id] ?? 0 }));
  scored.sort((a, b) => b.score - a.score || a.n - b.n);
  return scored[0].t;
}

/** n번째(0부터) 주민이 들어갈 골목 번호와 터 번호 */
export function plotFor(index: number) {
  return { seq: Math.floor(index / ALLEY_CAPACITY) + 1, plotNo: (index % ALLEY_CAPACITY) + 1, left: ALLEY_CAPACITY - ((index % ALLEY_CAPACITY) + 1) };
}

/** 선착순 문구 */
export function plotLine(themeId: string, seq: number, plotNo: number, left: number) {
  const name = alleyName(themeId, seq);
  if (left === 0) return `${name} 마지막 터를 네가 차지했어!`;
  if (left <= 10) return `${name} 마지막 ${left}터 남았어`;
  if (plotNo <= 10) return `너는 ${name}의 ${plotNo}번째 주민이야`;
  return `${name} ${plotNo}번 터`;
}

// ── Phase 4: 손바닥 마을 ─────────────────────────────────
// 손가락 5개 = 관심사 큰길, 손바닥 = 광장(달그락 대장간 본관 공사 중). 이름은 다인 확정 전 가제.
export type Street = { id: string; name: string; finger: string; topics: string; themes: string[] };
export const STREETS: Street[] = [
  { id: "heart", name: "마음길", finger: "엄지", topics: "선물 · 가족 · 기념", themes: [] },
  { id: "rest", name: "쉼길", finger: "검지", topics: "잠 · 휴식", themes: ["sleep"] },
  { id: "work", name: "일길", finger: "중지", topics: "책상 · 공부 · 집중 · 물 한 잔", themes: ["desk", "water"] },
  { id: "home", name: "집길", finger: "약지", topics: "현관 · 부엌 · 식물", themes: ["door", "kitchen", "plant"] },
  { id: "pet", name: "반려길", finger: "새끼", topics: "냥집사 · 멍집사", themes: ["cat", "dog"] }
];

// 주민 모두가 넣은 장작의 총합 = 본관 공사 진행도
export const HALL_GOAL = Math.max(1, Number(process.env.FIND_HALL_GOAL ?? 1000));
export const HALL_STAGES = ["터", "뼈대", "지붕", "굴뚝", "완공"] as const;
export function hallProgress(totalFuel: number) {
  const pct = Math.min(100, Math.floor((totalFuel / HALL_GOAL) * 100));
  const stage = pct >= 100 ? 4 : pct >= 75 ? 3 : pct >= 50 ? 2 : pct >= 25 ? 1 : 0;
  return { pct, stage, label: HALL_STAGES[stage] };
}

// 집 겉모습: 굴뚝 불(화력 + 받은 장작), 창문 불(최근 7일 방문), 깃발(나도 갖고 싶어가 많이 쌓임)
export const FLAG_WANTS = Math.max(1, Number(process.env.FIND_FLAG_WANTS ?? 5));
export function chimneyLevel(peak: number, fuel: number): 1 | 2 | 3 {
  const v = peak + fuel * 3;
  return v >= 110 ? 3 : v >= 60 ? 2 : 1;
}
