// 3D 조립 책상(명세서 2차 v0.1 §1·§3·§5)의 입력 데이터.
// 연습 키트와 프로젝트 조립 가이드가 같은 형식을 쓴다.
// 좌표 단위는 mm, 책상 위 원점 = 커팅매트 가운데, x = 오른쪽, z = 앞(사용자 쪽).

export type BenchView = "34" | "top" | "bottom" | "front";

export type BenchPartKind =
  | "perfboard" | "breadboard" | "resistor" | "led" | "battery_holder_2aa" | "aa_battery"
  | "header_male" | "sensor_module"
  // 프로젝트 조립 가이드에서 오는 부품: 부품 카드(catalogId)나 가이드의 크기·핀으로 만든다
  | "module" | "plate"
  // 하우징 부위 도형 (완성품 형태 + 하우징 계획에서)
  | "housing_shape";

export type BenchPart = {
  ref: string;
  kind: BenchPartKind;
  label: string;
  /** 부품 한 줄 설명 (칩을 누르면 보인다) */
  about: string;
  /** 종류별 추가 값: 저항값, LED 색, 핀 수, 기판 크기 등 */
  spec?: {
    ohms?: number; color?: string; pins?: number; cols?: number; rows?: number; pinNames?: string[]; silk?: string;
    /** module: 기판 위 자리(기판 왼쪽 위 기준 mm)와 핀 위치(같은 좌표계, 회전 적용 후) */
    catalogId?: string; partType?: string; model?: string;
    foot?: { x: number; y: number; w: number; h: number; rotation: number };
    pinXY?: Array<{ name: string; x: number; y: number }>;
    /** plate·perfboard·breadboard 크기 (mm) */
    widthMm?: number; heightMm?: number;
    /** housing_shape: 완성품 형태 도형 (x 가로, y 앞뒤(+가 앞), z 높이 바닥 기준) */
    primitive?: "box" | "sphere" | "cylinder" | "cone"; sizeMm?: [number, number, number]; posMm?: [number, number, number]; around?: string;
  };
};

/** "PB.H5" = 기판 PB의 H열 5행 구멍, "U1.VCC" = 부품 U1의 VCC 핀, "BT.RED" = 배터리 홀더 빨간 선 끝 */
export type Anchor = string;

export type BenchOp =
  | { op: "place"; ref: string; at: [number, number]; rotation?: number }
  | { op: "insert"; ref: string; into: string; holes: Anchor[] }
  | { op: "mount_on"; ref: string; onto: string; holes: Anchor[] }
  | { op: "prep_wire"; wires: Anchor[]; stripMm: number; tin: boolean }
  | { op: "insert_wire"; wire: Anchor; hole: Anchor }
  | { op: "solder"; joints: Anchor[]; side: "top" | "bottom" }
  | { op: "bridge"; pairs: Array<[Anchor, Anchor]> }
  | { op: "trim"; refs: string[] }
  | { op: "batteries"; ref: string }
  | { op: "check"; how: "look" | "continuity" | "power_on"; targets: Anchor[]; expected: string }
  /** 기판(onto) 위 foot 자리에 부품을 놓는다 */
  | { op: "seat"; ref: string; onto: string }
  /** 두 핀을 전선으로 잇는다 (브레드보드 점퍼선 또는 납땜용 전선) */
  | { op: "jumper"; from: Anchor; to: Anchor; color: string; label?: string }
  /** 하우징 부위를 위에서 내려 씌운다 */
  | { op: "enclose"; refs: string[] };

export type BenchMistake = { kind: "cold" | "bridge" | "starved"; title: string; looks: string; fix: string };

export type BenchStep = {
  phase: "준비" | "꽂기" | "납땜" | "전선" | "다듬기" | "검사";
  title: string;
  /** 굵게 보일 부분은 **로 감싼다 */
  action: string;
  why: string;
  ops: BenchOp[];
  view: BenchView;
  /** 화면에서 '직접 하기' 때 무엇을 눌러야 하는지 */
  tapHint: string;
  /** 열·안전 주의 (있으면 노란 띠) */
  caution?: string;
  mistakes?: BenchMistake[];
  /** 실물로 확인하는 방법 */
  doneWhen: string;
};

export type BenchFaq = { q: string; a: string };

export type BenchKit = {
  id: string;
  title: string;
  subtitle: string;
  level: "처음" | "조금 해봄";
  minutes: number;
  learn: string[];
  parts: BenchPart[];
  tools: string[];
  safety: string[];
  steps: BenchStep[];
  faq: BenchFaq[];
  /** 데이터만 있고 아직 3D 연출이 완성되지 않은 키트 */
  draft?: boolean;
  /** '바뀔 수 있어요' 스티커에 붙일 이유 (프로젝트) */
  provisional?: string[];
};
