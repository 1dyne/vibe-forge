// 부품은 '하는 일'부터: 비전공자는 역할과 기능만 읽고 넘어가고, 궁금한 사람만 펼쳐서 부품 이름·사양을 본다.
// 여기서는 큰 종류(무엇이 필요한지)까지만 알려준다. 실제 부품 고르기·구매처·가격은 대장간이 열린 뒤 대장간에서 한다.

export type PartRole = {
  key: string;
  /** 쉬운 이름 (예: 무게를 재는 판) */
  role: string;
  /** 이 도깨비불에서 하는 일 (예: 컵을 들었는지 알아채) */
  does: string;
  /** 펼치면 보이는 준비할 것: 부품 종류와 대략의 사양 */
  parts: Array<{ name: string; spec: string }>;
};

type Def = { key: string; chips: string[]; role: string; does: string; doesBy?: Record<string, string>; parts: PartRole["parts"] };

// 앞에 있을수록 먼저 보여준다. doesBy는 고른 장작에 따라 '하는 일'을 더 구체적으로 바꾼다.
const DEFS: Def[] = [
  { key: "weight", chips: ["s_weight", "s_cup", "s_goal", "s_count"], role: "무게를 재는 판", does: "올려둔 게 가벼워졌는지 알아채",
    doesBy: { s_cup: "컵을 들었는지, 얼마나 마셨는지 알아채", s_count: "밥을 몇 번 먹었는지 세", s_goal: "하루 목표만큼 채웠는지 세" },
    parts: [{ name: "로드셀", spec: "무게 센서, 1~5kg짜리" }, { name: "HX711 보드", spec: "로드셀의 작은 신호를 읽어주는 보드" }] },
  { key: "distance", chips: ["s_dist", "s_sit", "s_away", "s_motion"], role: "거리를 재는 눈", does: "누가 다가오면 알아채",
    doesBy: { s_sit: "자리에 앉아 있는지 알아채", s_away: "집을 나서는 걸 알아채", s_motion: "누가 지나가면 알아채" },
    parts: [{ name: "초음파 거리 센서", spec: "HC-SR04 계열, 2cm~4m" }, { name: "또는 레이저 거리 센서", spec: "VL53L0X 계열, 작고 정확함" }] },
  { key: "motion", chips: ["s_move", "s_reset", "s_posture", "s_shake"], role: "기울기를 느끼는 센서", does: "들거나 기울이는 걸 알아채",
    doesBy: { s_posture: "자세가 무너졌는지 알아채", s_reset: "기울이면 처음부터 다시 세", s_shake: "흔들면 깨어나" },
    parts: [{ name: "가속도·자이로 센서", spec: "MPU6050 계열" }] },
  { key: "door", chips: ["s_door", "s_lock"], role: "문 열림 감지기", does: "문이 열리고 닫히는 걸 알아채",
    doesBy: { s_lock: "걸쇠가 잠겼는지까지 알아채" },
    parts: [{ name: "자석 문 센서", spec: "리드 스위치 + 자석, 문틀에 붙이는 형" }] },
  { key: "soil", chips: ["s_soil", "s_season"], role: "흙 촉촉함 막대", does: "흙이 말랐는지 알아채",
    parts: [{ name: "정전식 토양 수분 센서", spec: "녹이 덜 스는 정전식" }] },
  { key: "air", chips: ["s_air", "s_co2", "s_window"], role: "공기 냄새 맡는 코", does: "공기가 탁해졌는지 알아채",
    doesBy: { s_co2: "답답한 공기(이산화탄소)까지 알아채", s_window: "창문 열 때를 알아채" },
    parts: [{ name: "미세먼지 센서", spec: "PMS 계열" }, { name: "이산화탄소 센서", spec: "SCD4x 계열 (필요할 때)" }] },
  { key: "humid", chips: ["s_humid", "s_htemp", "s_humidifier", "s_temp", "s_hot"], role: "온도·습도계", does: "방이 건조하거나 더운지 알아채",
    parts: [{ name: "온습도 센서", spec: "SHT3x 또는 DHT22 계열" }] },
  { key: "light", chips: ["s_dark", "s_sun", "s_night"], role: "밝기를 재는 눈", does: "어두워졌는지 알아채",
    doesBy: { s_sun: "햇빛이 얼마나 드는지 재" },
    parts: [{ name: "조도 센서", spec: "BH1750 계열" }] },
  { key: "ear", chips: ["s_noise", "s_level", "s_classroom"], role: "소리 듣는 귀", does: "주변이 시끄러워졌는지 알아채",
    parts: [{ name: "디지털 마이크 센서", spec: "INMP441 계열" }] },
  { key: "button", chips: ["s_btn", "s_off", "s_long"], role: "누르는 버튼", does: "눌러서 끄거나 알려줘",
    parts: [{ name: "누름 버튼", spec: "택트 스위치, 12mm 정도" }] },
  { key: "led", chips: ["r_light", "r_blink", "r_color", "r_breathe", "r_traffic"], role: "색이 바뀌는 불빛", does: "때가 되면 빛으로 알려줘",
    doesBy: { r_blink: "때가 되면 깜빡여", r_color: "상태에 따라 색이 바뀌어", r_breathe: "숨 쉬듯 천천히 밝아졌다 어두워져", r_traffic: "초록·노랑·빨강으로 알려줘" },
    parts: [{ name: "주소 지정 LED", spec: "WS2812B 링 또는 줄, 8~16구" }] },
  { key: "beep", chips: ["r_sound", "r_buzz", "r_quiet"], role: "삑 소리", does: "소리로 불러",
    parts: [{ name: "피에조 부저", spec: "3~5V" }] },
  { key: "speaker", chips: ["r_melody", "r_voice"], role: "작은 스피커", does: "멜로디나 목소리로 알려줘",
    parts: [{ name: "소형 스피커", spec: "3W 정도" }, { name: "오디오 앰프 보드", spec: "MAX98357A 계열" }] },
  { key: "vibe", chips: ["r_vibe", "r_tap", "r_pattern"], role: "부르르 진동", does: "몸으로 느끼게 톡톡 알려줘",
    parts: [{ name: "진동 모터", spec: "코인형, 3V" }] },
  { key: "motor", chips: ["r_move", "r_wave", "r_walk", "r_press", "r_dance", "r_morning"], role: "조금씩 도는 모터", does: "직접 움직여서 알려줘",
    doesBy: { r_press: "손가락처럼 스위치를 눌러", r_wave: "손을 흔들어", r_walk: "바퀴로 다가와" },
    parts: [{ name: "서보 모터", spec: "SG90 계열 (작은 힘), 힘이 필요하면 MG996R 계열" }] },
  { key: "screen", chips: ["r_screen", "r_face", "r_big", "r_count", "r_mood"], role: "작은 화면", does: "숫자나 표정을 보여줘",
    parts: [{ name: "OLED 화면", spec: "0.96인치, 128×64" }, { name: "또는 전자잉크 화면", spec: "1.5~2.9인치, 전기를 거의 안 씀" }] }
];

const CARRIED = ["f_hand", "f_wear", "f_wrist", "f_clip", "f_key", "f_bag", "f_band"];
const WIFI = ["r_phone", "r_log", "r_fam", "r_week", "r_only"];
const has = (ids: string[], list: string[]) => list.some((id) => ids.includes(id));

/** 고른 장작 → 하는 일 중심 부품 목록. 두뇌 보드 → 고른 기능 → 전원 → 몸통 순서. */
export function partRoles(ids: string[]): PartRole[] {
  const wifi = has(ids, WIFI);
  const carried = has(ids, CARRIED);
  const out: PartRole[] = [
    wifi
      ? { key: "brain", role: "작은 두뇌 보드", does: "센서를 읽고, 와이파이로 폰까지 소식을 보내", parts: [{ name: "ESP32 보드", spec: "와이파이·블루투스 내장" }] }
      : { key: "brain", role: "작은 두뇌 보드", does: "센서를 읽고 언제 알려줄지 정해", parts: [{ name: "아두이노 나노 또는 ESP32 보드", spec: "USB로 코드를 올리는 작은 보드" }] }
  ];
  for (const def of DEFS) {
    if (!has(ids, def.chips)) continue;
    // 가장 나중에 고른(더 구체적인) 장작의 설명을 쓴다
    const specific = [...ids].reverse().find((id) => def.doesBy?.[id]);
    out.push({ key: def.key, role: def.role, does: specific ? def.doesBy![specific] : def.does, parts: def.parts });
  }
  out.push(carried
    ? { key: "power", role: "충전 배터리", does: "선 없이 들고 다니게 해", parts: [{ name: "리튬 배터리", spec: "3.7V, 500~1000mAh" }, { name: "충전 보드", spec: "TP4056 계열, 보호회로 있는 것" }] }
    : { key: "power", role: "전원", does: "USB로 꽂아두면 계속 켜져 있어", parts: [{ name: "USB 케이블과 충전기", spec: "5V 1A 이상" }] });
  out.push({ key: "body", role: "몸통", does: "부품을 담고 놓일 자리에 맞춰 모양을 잡아", parts: [{ name: "케이스", spec: "3D 프린트, 또는 작은 상자로 먼저 만들어봐도 돼" }] });
  return out;
}

export const PARTS_NOTE = "실제 부품 고르기와 구매처는 대장간이 열리면 같이 골라줄게.";
