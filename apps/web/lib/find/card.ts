import { CATS, reactKind, type Cat, type Chip, type ReactKind } from "./chips";
import type { ProjectMatch } from "./projects";

// 결과 화면의 트레이딩 카드: 등급(희귀도+화력), 능력치, 특기·약점, 도깨비 한 줄 평, 뒷면 설계 정보.
// 전부 규칙으로 만든다. 숫자를 지어내지 않도록 부품·난이도는 고른 장작에서만 어림하고, 화면에 '어림'이라고 밝힌다.

export type Grade = "전설" | "희귀" | "흔함";
export type Rarity = { total: number; sameCombo: number; higherPeak: number };

export type FireCard = {
  grade: Grade;
  attr: { kind: ReactKind; label: string };
  /** 도깨비불이 30개 미만이면 null (숫자가 작아서 비교가 의미 없다) */
  rarityLine: string | null;
  peakLine: string | null;
  stats: Array<{ cat: Cat; value: number }>;
  specialty: string;
  weakness: string;
  roast: { head: string; body: string };
  build: {
    difficulty: number;
    time: string;
    partsRange: string;
    parts: string[];
    basis: { title: string; source: string; match: number; image: string | null; url: string } | null;
  };
};

/** 같은 조합인지 비교하는 키. 고른 순서와 상관없이 같은 장작이면 같은 조합이다. */
export function comboKey(ids: string[]) {
  return [...new Set(ids)].sort().join("+");
}

const ATTR: Record<ReactKind, string> = { light: "빛 속성", sound: "소리 속성", move: "움직임 속성", none: "고요 속성" };

export function gradeOf(rarity: Rarity, peak: number): Grade {
  const unique = rarity.sameCombo === 0;
  const topShare = (rarity.higherPeak + 1) / (rarity.total + 1);
  if (unique && peak >= 80) return "전설";
  if (unique || rarity.sameCombo / Math.max(1, rarity.total) < 0.05 || topShare <= 0.2) return "희귀";
  return "흔함";
}

export const MIN_FIRES_FOR_STATS = 30;

function rarityLines(rarity: Rarity): { rarityLine: string | null; peakLine: string | null } {
  const all = rarity.total + 1;
  if (all < MIN_FIRES_FOR_STATS) return { rarityLine: null, peakLine: null };
  const rarityLine = rarity.sameCombo === 0
    ? `이 조합은 지금까지 도깨비불 ${all.toLocaleString("ko-KR")}개 중 너만 찾았어`
    : `이 조합, 너 말고 ${rarity.sameCombo.toLocaleString("ko-KR")}명이 더 찾았어`;
  // 순위 기준. 1위는 "1등", 위쪽 절반은 "상위 N%", 아래쪽 절반은 꼴찌처럼 읽히니 숨긴다.
  const rank = rarity.higherPeak + 1;
  const pct = Math.ceil((rank / all) * 100);
  const peakLine = rank === 1 ? "화력 1등" : pct <= 50 ? `화력 상위 ${pct}%` : null;
  return { rarityLine, peakLine };
}

// 약점: 앞에 있을수록 우선
const WEAKNESS: Array<[string[], string]> = [
  [["s_cup", "s_goal", "s_weight", "s_count"], "올려두지 않으면 아무것도 모름"],
  [["r_phone", "r_log", "r_fam"], "와이파이 끊기면 시무룩해짐"],
  [["f_hand", "f_wear", "f_wrist", "f_clip", "f_key"], "충전 깜빡하면 바로 기절"],
  [["r_move", "r_walk", "r_wave", "r_press"], "모터 돌릴 때마다 배터리를 꿀꺽"],
  [["s_soil"], "흙을 너무 믿는 편"],
  [["s_air", "s_co2"], "고기 구우면 패닉"],
  [["s_dist", "s_sit"], "고양이도 사람으로 착각할 수 있음"],
  [["s_noise"], "박수 소리에도 화들짝"],
  [["s_door", "s_lock"], "문 쾅 닫히면 깜짝 놀람"],
  [["r_sound", "r_melody"], "도서관에선 눈치 보임"],
  [["r_light", "r_blink", "r_color"], "대낮 햇빛 아래선 존재감 실종"],
  [["r_screen"], "글씨가 작으면 아무도 안 봄"],
  [["s_time"], "주말에도 꼬박꼬박 출근함"]
];

// 도깨비 한 줄 평: 앞에 있을수록 우선
const ROASTS: Array<[string[], string, string]> = [
  [["s_cup", "s_goal"], "컵 무게까지 재겠다고?", "너 물 진짜 안 마시는구나 ㅋㅋ"],
  [["w_cat", "w_cats"], "고양이를 위해 여기까지?", "집사 등급 인정. 근데 고양이는 관심 없을 수도 있어."],
  [["w_dog", "w_walk"], "강아지 위한 거지?", "꼬리 흔드는 게 벌써 보인다."],
  [["s_soil", "f_pot", "w_plant"], "식물 또 보낼 뻔했지?", "이번엔 흙이 먼저 말해줄 거야."],
  [["s_door", "s_lock", "s_away"], "현관문 확인하러 또 올라가는 사람?", "이제 엘리베이터 앞에서 돌아서지 않아도 돼."],
  [["r_press", "f_switch"], "불 끄러 일어나기 싫은 거 다 알아", "게으름은 발명의 어머니지."],
  [["s_sit", "s_posture"], "거북목 진행 중이구나", "등 펴라는 잔소리는 내가 대신 해줄게."],
  [["w_far", "r_fam"], "부모님 생각하는구나", "효도 도깨비 출동이야."],
  [["s_air", "s_co2", "s_window"], "공기 냄새에 예민한 편?", "환기 타이밍은 이제 내가 챙길게."],
  [["s_humid", "s_humidifier"], "피부가 바삭바삭해?", "가습기 켤 때는 내가 알려줄게."],
  [["s_noise", "s_level"], "시끄러운 거 못 참는 타입이구나", "조용히 하라고 대신 째려봐줄게."],
  [["w_pet", "f_bowl"], "반려동물 챙기는 거 보니", "마음씨는 합격이야."],
  [["w_kid", "w_safe", "w_kids2"], "아이를 위한 거라니", "튼튼하게 만들어야겠다. 애들은 다 던지거든."],
  [["r_walk", "r_dance", "r_move"], "움직이기까지 해야 해?", "욕심 많은 거 마음에 들어."],
  [["f_wear", "f_wrist", "f_clip"], "몸에 차고 다닌다고?", "나랑 늘 붙어 다니겠다는 거지?"],
  [["s_dist"], "누가 오는지 궁금해?", "경비 도깨비로 임명할게."],
  [["s_time"], "시간 맞춰 알려달라고?", "알람 10개 맞추는 사람 특징이야."],
  [["r_sound", "r_melody"], "소리로 알려달라니", "이어폰 끼고 있으면 못 들을 거 각오해."]
];

const PART: Array<[string[], string]> = [
  [["s_weight", "s_cup", "s_goal", "s_count"], "로드셀 + HX711"],
  [["s_dist", "s_sit", "s_away", "s_motion"], "거리 센서"],
  [["s_move", "s_reset", "s_posture", "s_shake"], "기울기·움직임 센서"],
  [["s_door", "s_lock"], "문 열림 센서"],
  [["s_soil"], "흙 수분 센서"],
  [["s_air", "s_co2", "s_window"], "공기질 센서"],
  [["s_humid", "s_htemp", "s_humidifier", "s_temp"], "온습도 센서"],
  [["s_dark", "s_sun", "s_night"], "조도 센서"],
  [["s_noise", "s_level"], "마이크 센서"],
  [["s_btn", "s_off", "s_long"], "버튼"],
  [["r_light", "r_blink", "r_color", "r_breathe", "r_traffic"], "LED (WS2812)"],
  [["r_sound", "r_melody", "r_voice"], "부저·작은 스피커"],
  [["r_vibe", "r_buzz", "r_tap", "r_pattern"], "진동 모터"],
  [["r_move", "r_wave", "r_walk", "r_press", "r_dance"], "서보 모터"],
  [["r_screen", "r_face", "r_big", "r_count", "r_mood"], "작은 화면(OLED)"]
];
const CARRIED = ["f_hand", "f_wear", "f_wrist", "f_clip", "f_key", "f_bag", "f_band"];
const WIFI = ["r_phone", "r_log", "r_fam", "r_week", "r_only"];

const has = (ids: string[], list: string[]) => list.some((id) => ids.includes(id));

export function buildCard(chips: Chip[], peak: number, rarity: Rarity, matches: ProjectMatch[]): FireCard {
  const ids = chips.map((c) => c.id);
  const find = (id: string) => chips.find((c) => c.id === id);
  const kind = reactKind(ids, find);
  const stats = CATS.map((cat) => ({ cat, value: Math.min(3, chips.filter((c) => c.cat === cat).length) }));

  // 특기: 가장 구체적인(나중에 고른) 감지와 반응
  const last = (cat: Cat) => [...chips].reverse().find((c) => c.cat === cat && !c.tail);
  const sense = last("감지"), react = last("반응");
  const specialty = sense && react ? `${sense.label} → ${react.label}` : sense?.label ?? react?.label ?? chips[chips.length - 1]?.label ?? "아직 비밀";
  const weakness = WEAKNESS.find(([list]) => has(ids, list))?.[1] ?? "약점은 아직 숨기는 중";

  const hit = ROASTS.find(([list]) => has(ids, list));
  const tail = peak >= 80 ? " 장작 솜씨도 수준급이고." : peak < 40 ? " 불은 좀 약했지만 씨앗은 좋아." : "";
  const roast = hit ? { head: hit[1], body: hit[2] + tail } : { head: "흠, 재밌는 불이네.", body: "이런 조합은 나도 처음 봐." + tail };

  const parts = [...new Set(PART.filter(([list]) => has(ids, list)).map(([, p]) => p))];
  const wifi = has(ids, WIFI);
  const carried = has(ids, CARRIED);
  const board = wifi ? "ESP32 보드(와이파이)" : "작은 보드(아두이노·ESP32)";
  const allParts = [board, ...parts, carried ? "충전 배터리" : "USB 전원", "케이스(3D 프린트·상자)"];
  const motor = parts.includes("서보 모터");
  const difficulty = Math.max(1, Math.min(5, 1 + (motor ? 1 : 0) + (wifi ? 1 : 0) + (parts.length >= 3 ? 1 : 0) + (carried ? 1 : 0)));
  const time = difficulty <= 2 ? "주말 하루" : difficulty === 3 ? "주말 이틀" : "주말 두세 번";
  const top = matches[0];

  return {
    grade: gradeOf(rarity, peak),
    attr: { kind, label: ATTR[kind] },
    ...rarityLines(rarity),
    stats,
    specialty,
    weakness,
    roast,
    build: {
      difficulty,
      time,
      partsRange: `${allParts.length - 1}~${allParts.length}개`,
      parts: allParts,
      basis: top ? { title: top.title_ko, source: top.source, match: top.match, image: top.image?.url ?? null, url: top.source_url } : null
    }
  };
}
