import type { MockSolid } from "../mockup-3d";

// 고른 장작으로 "이런 물건이 돼"를 로우폴리 도형으로 짓는다. AI 없이 규칙으로만.
// 단위는 mm, z가 위, base는 바닥 중심. 실제 설계가 아니라 모양을 상상하게 돕는 그림이다.

const WHO_COLOR: Record<string, string> = { w_me: "#9ED3CB", w_fam: "#F2B880", w_family: "#F2B880", w_far: "#F2B880", w_pet: "#F4B6C8", w_cat: "#F4B6C8", w_dog: "#E9C79B", w_plant: "#A8D5A2", w_many: "#A8D5A2", w_kid: "#F6DC7A", w_safe: "#F6DC7A" };
const PROP = "#F4F1EA"; // 컵·화분 같은 곁 물건은 연한 색으로

type Body = { w: number; d: number; h: number; z: number; prim: MockSolid["primitive"]; front: number; top: number };

export function productSolids(picked: string[], idea = ""): MockSolid[] {
  const has = (...ids: string[]) => ids.some((id) => picked.includes(id));
  const color = WHO_COLOR[picked.find((id) => id in WHO_COLOR) ?? ""] ?? "#9ED3CB";
  const out: MockSolid[] = [];
  const add = (primitive: MockSolid["primitive"], size: [number, number, number], base: [number, number, number], c: string, role: MockSolid["role"], label: string) => out.push({ primitive, size, base, color: c, role, label });

  // ── 몸통과 곁 물건 ──
  let b: Body;
  if (has("f_cup", "f_thin")) {
    const h = has("f_thin") ? 10 : 18;
    add("cylinder", [104, 104, h], [0, 0, 0], color, "shell", "컵 받침 몸통");
    add("cylinder", [78, 78, 2], [0, 0, h], "#E8E2D4", "shell", "컵 놓는 자리");
    // 받침이 주인공이라 컵은 낮고 작게, 한쪽으로 비켜 놓는다
    add("cylinder", [58, 58, 46], [8, 8, h + 2], PROP, "feature", "머그컵 (예시)");
    add("box", [6, 16, 22], [8, 42, h + 14], PROP, "feature", "컵 손잡이");
    b = { w: 104, d: 104, h, z: 0, prim: "cylinder", front: -52, top: h };
  } else if (has("f_wall", "f_switch", "f_mag", "f_fridge", "f_clean")) {
    add("box", [76, 14, 104], [0, 0, 0], color, "shell", "벽에 붙는 몸통");
    add("box", [180, 6, 150], [0, 14, -20], "#ECE8DE", "feature", "벽 (예시)");
    b = { w: 76, d: 14, h: 104, z: 0, prim: "box", front: -7, top: 104 };
  } else if (has("f_door", "f_noglue")) {
    add("box", [56, 18, 84], [0, 0, 20], color, "shell", "문에 다는 몸통");
    add("box", [130, 8, 190], [0, 13, 0], "#C9A27A", "feature", "문 (예시)");
    b = { w: 56, d: 18, h: 84, z: 20, prim: "box", front: -9, top: 104 };
  } else if (has("f_pot", "f_splash")) {
    add("cone", [120, 120, 96], [0, 0, 0], "#D9895B", "feature", "화분 (예시)");
    add("cylinder", [104, 104, 6], [0, 0, 86], "#7A5A3C", "feature", "흙");
    add("box", [10, 6, 70], [0, 0, 60], color, "shell", "흙에 꽂는 다리");
    add("box", [46, 22, 34], [0, 0, 128], color, "shell", "화분 꽂이 머리");
    b = { w: 46, d: 22, h: 34, z: 128, prim: "box", front: -11, top: 162 };
  } else if (has("f_bowl", "f_tough")) {
    add("cylinder", [120, 120, 36], [0, 34, 0], PROP, "feature", "밥그릇 (예시)");
    add("box", [60, 50, 40], [0, -60, 0], color, "shell", "밥그릇 옆 몸통");
    b = { w: 60, d: 50, h: 40, z: 0, prim: "box", front: -85, top: 40 };
  } else if (has("f_wear", "f_wrist", "f_clip")) {
    add("box", [40, 12, 44], [0, 0, 6], color, "shell", "몸에 차는 몸통");
    add("box", [22, 10, 6], [0, 0, 0], "#3B3F46", "feature", "밴드");
    add("box", [22, 10, 6], [0, 0, 50], "#3B3F46", "feature", "밴드");
    b = { w: 40, d: 12, h: 44, z: 6, prim: "box", front: -6, top: 50 };
  } else if (has("f_hand", "f_key", "f_bag")) {
    add("box", [42, 18, 58], [0, 0, 0], color, "shell", "들고 다니는 몸통");
    add("cylinder", [16, 4, 16], [0, 0, 58], "#B8BCC4", "feature", "고리");
    b = { w: 42, d: 18, h: 58, z: 0, prim: "box", front: -9, top: 58 };
  } else if (has("f_desk", "f_bed", "f_tiny", "f_round", "f_dim")) {
    const round = has("f_round", "f_tiny");
    if (round) { add("sphere", [70, 70, 66], [0, 0, 0], color, "shell", "동글동글한 몸통"); b = { w: 70, d: 70, h: 66, z: 0, prim: "sphere", front: -33, top: 66 }; }
    else { add("box", [84, 58, 52], [0, 0, 0], color, "shell", "책상 위 몸통"); add("box", [86, 60, 4], [0, 0, 52], "#FFFFFF", "shell", "윗판"); b = { w: 84, d: 58, h: 56, z: 0, prim: "box", front: -29, top: 56 }; }
  } else {
    // 아직 모양을 안 골랐을 때: 말랑한 기본 덩어리
    add("sphere", [72, 64, 62], [0, 0, 0], color, "shell", "아직 모양을 정하는 중인 몸통");
    b = { w: 72, d: 64, h: 62, z: 0, prim: "sphere", front: -30, top: 62 };
  }
  const fy = b.front - 1.5; // 앞면 바로 앞
  const midZ = b.z + b.h * 0.55;

  // ── 도깨비 눈: 무엇이든 우리 마을 물건처럼 ──
  if (!has("f_cup", "f_thin", "f_pot", "f_splash")) {
    add("sphere", [7, 4, 7], [-b.w * 0.18, fy, midZ + 4], "#1E1F24", "feature", "눈");
    add("sphere", [7, 4, 7], [b.w * 0.18, fy, midZ + 4], "#1E1F24", "feature", "눈");
  }

  // ── 알려주는 방법 ──
  if (has("r_light", "r_blink", "r_color", "r_dim")) {
    const ringColor = has("r_color") ? "#B58CFF" : "#FFD25E";
    if (b.prim === "cylinder") add("cylinder", [b.w + 2, b.d + 2, 3], [0, 0, b.top - 6], ringColor, "feature", "불빛 링 (light)");
    else add("box", [b.w * 0.6, 3, 6], [0, fy, b.z + b.h * 0.22], ringColor, "feature", "불빛 줄 (light)");
  }
  if (has("r_sound", "r_melody", "r_buzz")) {
    for (let i = -1; i <= 1; i++) add("cylinder", [4, 3, 4], [b.prim === "cylinder" ? i * 7 : b.w * 0.3 + i * 6, fy, b.z + b.h * 0.25], "#2B2E33", "feature", "스피커 구멍");
  }
  if (has("r_move", "r_wave", "r_walk", "r_press")) {
    add("box", [8, 8, 30], [b.w * 0.5 + 4, 0, b.top - 18], "#F2A65A", "feature", "까딱이는 팔");
    add("sphere", [12, 12, 12], [b.w * 0.5 + 4, 0, b.top + 10], "#F2A65A", "feature", "팔 끝");
  }
  if (has("r_vibe", "r_tap")) add("box", [b.w * 0.3, 2, 4], [0, fy, b.z + 6], "#B7BCC4", "feature", "진동 표시");
  if (has("r_screen", "r_face", "r_big")) add("box", [b.w * 0.5, 2, Math.min(24, b.h * 0.3)], [0, fy, midZ - 22], "#1F2A2E", "feature", "작은 화면");
  if (has("r_phone", "r_log", "r_fam")) add("cylinder", [3, 3, 18], [-b.w * 0.35, 0, b.top], "#B7BCC4", "feature", "무선 안테나");

  // ── 알아채는 방법 ──
  if (has("s_weight", "s_cup", "s_count") && !has("f_cup", "f_thin")) add("cylinder", [b.w * 0.6, b.w * 0.6, 3], [0, 0, b.top], "#D8CBB0", "feature", "무게 패드");
  if (has("s_dist")) {
    add("cylinder", [12, 4, 12], [-b.w * 0.2, fy - 1, midZ - 12], "#C9CED6", "feature", "거리 센서 눈");
    add("cylinder", [12, 4, 12], [b.w * 0.2, fy - 1, midZ - 12], "#C9CED6", "feature", "거리 센서 눈");
  }
  if (has("s_btn", "s_long", "s_off")) add("cylinder", [18, 18, 6], [0, 0, b.top], "#E25B4B", "feature", "큰 버튼");
  if (has("s_time")) add("cylinder", [20, 3, 20], [b.w * 0.28, fy, b.z + b.h * 0.8], "#FFFFFF", "feature", "작은 시계");
  if (has("s_door", "s_lock")) add("box", [14, 10, 26], [b.w * 0.5 + 16, 0, b.z + b.h * 0.4], "#9AA0A8", "feature", "문 자석 짝");
  if (has("s_soil", "s_sun")) add("box", [3, 3, 40], [8, 0, 60], "#C0C4CA", "feature", "흙 센서 다리");
  if (has("s_air", "s_co2", "s_humid", "s_htemp", "s_temp")) for (let i = 0; i < 3; i++) add("box", [b.w * 0.35, 2, 2], [-b.w * 0.15, fy, b.z + 8 + i * 5], "#5C636B", "feature", "바람 구멍");
  if (has("s_dark", "s_night")) add("sphere", [10, 10, 8], [-b.w * 0.25, 0, b.top], "#FFF4C2", "feature", "빛 센서");
  if (has("s_noise", "s_level")) add("cylinder", [5, 3, 5], [-b.w * 0.3, fy, b.z + b.h * 0.25], "#2B2E33", "feature", "마이크 구멍");

  // 아이디어 문장 속 물건을 곁에 둔다 (아직 형태를 안 골랐을 때만)
  if (!picked.some((id) => id.startsWith("f_"))) {
    if (/컵|물 마시|텀블러/.test(idea)) add("cylinder", [60, 60, 76], [70, 10, 0], PROP, "feature", "컵 (예시)");
    else if (/화분|식물/.test(idea)) add("cone", [70, 70, 60], [72, 10, 0], "#D9895B", "feature", "화분 (예시)");
  }
  // 위에서는 -y를 앞으로 지었다. 미리보기 카메라는 +y 쪽에 있으니 뒤집어서 얼굴이 카메라를 보게 한다.
  return out.map((o) => ({ ...o, base: [o.base[0], -o.base[1], o.base[2]] as [number, number, number] }));
}
