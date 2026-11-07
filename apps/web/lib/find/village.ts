// 도깨비 마을: 골목 = 관심사. 도깨비불이 태어나면 장작과 가장 많이 겹치는 골목의 빈 터에 대장간을 짓는다.
// 골목마다 터 CAPACITY개. 다 차면 같은 주제의 다음 골목("냥집사 2골목")이 열린다.

export type AlleyTheme = { id: string; name: string; street: string; chips: string[] };

// 골목 = 마을 안의 구체적인 용도. id는 이미 입주한 집이 쓰고 있으니 바꾸지 않는다(이름·마을·장작만 조정).
// 장작 하나는 골목 하나에만 둔다. 와글·깜빡·뚝딱에 새 골목을 열면서 기존 골목에 있던 장작 일부를 옮겼다.
export const ALLEY_THEMES: AlleyTheme[] = [
  // 꼬물마을: 돌봄·반려동물·식물·가족
  { id: "cat", name: "냥집사", street: "꼬물마을", chips: ["w_cat", "w_cats", "w_pet", "f_bowl", "f_tough", "f_wash", "s_count", "s_when"] },
  { id: "dog", name: "멍집사", street: "꼬물마을", chips: ["w_dog", "w_walk"] },
  { id: "plant", name: "초록 손", street: "꼬물마을", chips: ["f_pot", "f_splash", "f_solar", "s_soil", "s_sun", "s_season", "w_plant", "w_many", "w_vacation"] },
  { id: "family", name: "안부", street: "꼬물마을", chips: ["w_family", "w_fam", "w_far", "w_daily", "r_fam"] },
  // 뚝딱마을: 생활 편의·살림·자동화
  { id: "kitchen", name: "부엌", street: "뚝딱마을", chips: ["f_wall", "f_mag", "f_fridge"] },
  { id: "switch", name: "자동 스위치", street: "뚝딱마을", chips: ["f_switch", "r_press", "s_off", "s_long", "r_morning", "f_clean"] },
  // 째깍마을: 시간·습관·집중·업무
  { id: "desk", name: "책상", street: "째깍마을", chips: ["f_desk", "f_tiny", "s_sit", "s_posture", "s_standup", "s_reset", "s_streak", "r_screen", "r_big", "r_count", "s_classroom"] },
  { id: "sleep", name: "잠", street: "째깍마을", chips: ["f_bed", "f_dim", "s_night", "s_motion", "r_breathe", "r_quiet"] },
  { id: "water", name: "물 한 잔", street: "째깍마을", chips: ["f_cup", "f_thin", "f_wood", "s_cup", "s_goal", "s_weight"] },
  // 와글마을: 놀이·장난감·상호작용
  { id: "toy", name: "장난감", street: "와글마을", chips: ["r_dance", "r_wave", "r_walk", "r_move", "s_shake", "f_round", "f_soft", "r_melody"] },
  { id: "kid", name: "꼬마", street: "와글마을", chips: ["w_kid", "w_safe", "r_face", "r_mood", "s_btn"] },
  // 깜빡마을: 관찰·감지·상태 확인
  { id: "door", name: "현관", street: "깜빡마을", chips: ["f_door", "f_noglue", "f_battery", "s_door", "s_lock", "s_away", "s_dist", "r_phone"] },
  { id: "air", name: "공기", street: "깜빡마을", chips: ["s_air", "s_co2", "s_window", "s_humid", "s_htemp", "s_humidifier", "s_hot", "s_temp", "r_traffic"] },
  { id: "noise", name: "소리·빛", street: "깜빡마을", chips: ["s_noise", "s_level", "s_dark", "r_blink", "r_color"] }
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

// ── 마을 5개 ─────────────────────────────────
// 마을 = 큰 제작 분야, 골목 = 그 안의 구체적인 용도. 가운데 광장엔 공사 중인 달그락 대장간 본관.
export type VillageId = "kkomul" | "ttukttak" | "jjaekkak" | "wagle" | "kkambbak";
export type Village = { id: VillageId; name: string; topics: string; mood: string; themes: string[] };
export const VILLAGES: Village[] = [
  { id: "kkomul", name: "꼬물마을", topics: "돌봄 · 반려동물 · 식물 · 가족", mood: "식물과 작은 생명들이 함께 사는 정원 마을", themes: ["cat", "dog", "plant", "family"] },
  { id: "ttukttak", name: "뚝딱마을", topics: "생활 편의 · 살림 · 자동화", mood: "기계 장치와 공구들이 곳곳에 놓인 공방 마을", themes: ["kitchen", "switch"] },
  { id: "jjaekkak", name: "째깍마을", topics: "시간 · 습관 · 집중 · 업무", mood: "작은 종소리가 하루의 리듬을 알려주는 차분한 마을", themes: ["desk", "sleep", "water"] },
  { id: "wagle", name: "와글마을", topics: "놀이 · 장난감 · 상호작용", mood: "장난감과 작은 로봇들이 움직이는 놀이 마을", themes: ["toy", "kid"] },
  { id: "kkambbak", name: "깜빡마을", topics: "관찰 · 감지 · 상태 확인", mood: "눈에 보이지 않는 변화를 발견하는 관측 마을", themes: ["door", "air", "noise"] }
];
export function villageOf(themeId: string) {
  return VILLAGES.find((v) => v.themes.includes(themeId)) ?? null;
}

/** 대장간 성장 단계: 도깨비불의 구상 수준(장작이 채운 갈래 수·개수)으로 정한다. 1 불씨 → 2 타오름 → 3 활활 */
export const HOUSE_STAGES = ["불씨", "타오름", "활활"] as const;
export function houseStage(picked: string[]): 1 | 2 | 3 {
  const cats = new Set(picked.map((id) => id.split("_")[0]));
  if (cats.size <= 1 || picked.length <= 2) return 1;
  return cats.size < 4 ? 2 : 3;
}

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
