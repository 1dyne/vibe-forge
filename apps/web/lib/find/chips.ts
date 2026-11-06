// 장작(키워드) 사전과 불 규칙. docs/find-prototype.html 의 ROOT/FOLLOW/FIRE/compose()를 옮겨 넓힌 것.
// 이 파일은 서버(규칙 기반 판별)와 브라우저(장작 넣기 화면) 양쪽에서 쓴다. AI 판별로 바꿀 때도 같은 Chip 모양을 돌려주면 된다.

export type Cat = "형태" | "반응" | "감지" | "누구";
export type ReactKind = "light" | "sound" | "move" | "none";

export type Chip = {
  id: string;
  cat: Cat;
  label: string;
  /** 문장 조각. compose()가 형태 → 감지 → 반응 → 누구 순서로 엮는다. */
  say: string;
  /** 반응 후속: 동사 앞에 붙는 꾸밈말 */
  pre?: boolean;
  /** 문장 끝에 따로 붙는 한 마디 */
  tail?: boolean;
  /** 이 키워드를 고르면 문장에서 빠지는 상위 키워드 */
  replaces?: string | null;
  /** 프로젝트 DB 태그(갈래별 어휘)와 맞춰보는 값 */
  tags: string[];
  react?: ReactKind;
};

export const CATS: Cat[] = ["형태", "반응", "감지", "누구"];

// 일치율 가중치 (HANDOFF §5). 고르지 않은 갈래는 빼고 나머지로 다시 나눈다.
export const MATCH_WEIGHTS: Record<Cat, number> = { 감지: 0.35, 반응: 0.3, 형태: 0.25, 누구: 0.1 };

export const FIRE = {
  start: 20, floor: 8, max: 100,
  tickMs: 100, decayPerTick: 0.08, // ≈ 초당 0.8 → 가득 찬 불이 꺼지기까지 약 2분. 생각할 여유를 준다
  perChip: 6, newCategoryBonus: 10, followUpBonus: 5,
  typeMs: 38
} as const;

export const REACT_FIRE: Record<ReactKind, string> = { light: "#9B7BFF", sound: "#FF8F3F", move: "#3FBF6E", none: "#4FB3A6" };
// 캐릭터 청록을 불 색 쪽으로 돌리는 각도. scripts/build-dokkaebi-sprites.py 의 HUE와 같아야 한다.
export const REACT_HUE: Record<ReactKind, number> = { none: 0, light: 83, sound: -146, move: -29 };

export const fireLabel = (v: number) => (v < 30 ? "불씨" : v < 55 ? "모닥불" : v < 80 ? "활활" : "도깨비불 만개");

type RootDef = Chip & { keywords: string[]; fallbackRank?: number };

// 뿌리 장작. keywords로 첫 입력과 얼마나 관련 있는지 매기고, fallbackRank가 낮을수록 관련 없을 때 먼저 나온다.
export const ROOTS: RootDef[] = [
  // 형태
  { id: "f_desk", cat: "형태", label: "책상 위에 두는", say: "책상 위에 두는", tags: ["책상 위"], keywords: ["책상", "공부", "집중", "일할", "업무", "모니터", "컴퓨터"], fallbackRank: 1 },
  { id: "f_hand", cat: "형태", label: "들고 다니는", say: "들고 다니는", tags: ["들고 다니는"], keywords: ["들고 다니", "들고 나가", "가방", "외출", "밖에서", "휴대", "열쇠"], fallbackRank: 2 },
  { id: "f_wall", cat: "형태", label: "벽에 붙는", say: "벽에 붙는", tags: ["벽에 붙는"], keywords: ["벽", "거실", "부엌", "냉장고"], fallbackRank: 3 },
  { id: "f_wear", cat: "형태", label: "몸에 차는", say: "몸에 차는", tags: ["몸에 착용"], keywords: ["손목", "차고", "몸에", "운동", "스트레칭", "자세", "걸음", "산책"] },
  { id: "f_door", cat: "형태", label: "문에 다는", say: "문에 다는", tags: ["현관·문"], keywords: ["현관", "문이", "문을", "문에", "잠갔", "잠금", "택배", "우편", "외출"] },
  { id: "f_pot", cat: "형태", label: "화분에 꽂는", say: "화분에 꽂는", tags: ["화분·정원"], keywords: ["화분", "식물", "물 줄", "물주", "흙", "베란다", "텃밭"] },
  { id: "f_bowl", cat: "형태", label: "밥그릇 옆에 두는", say: "밥그릇 옆에 두는", tags: ["반려동물 곁"], keywords: ["고양이", "강아지", "밥 먹", "사료", "밥그릇", "반려"] },
  { id: "f_bed", cat: "형태", label: "침대 옆에 두는", say: "침대 옆에 두는", tags: ["책상 위"], keywords: ["침대", "잠", "밤에", "자기 전", "아침", "알람", "불 끄"] },
  { id: "f_cup", cat: "형태", label: "컵 받침 모양", say: "컵 받침처럼 생긴", tags: ["책상 위"], keywords: ["물 마시", "물을 마시", "마시는", "컵", "텀블러", "수분"] },
  { id: "f_switch", cat: "형태", label: "스위치 위에 붙이는", say: "벽 스위치 위에 붙이는", tags: ["벽에 붙는"], keywords: ["불 끄", "불 켜", "스위치", "전등"] },
  // 반응
  { id: "r_light", cat: "반응", label: "빛으로 알려줘", say: "빛으로 알려줘", tags: ["빛"], react: "light", keywords: ["불빛", "빛", "led", "조명", "깜빡", "신호"], fallbackRank: 1 },
  { id: "r_sound", cat: "반응", label: "소리로 알려줘", say: "소리로 알려줘", tags: ["소리"], react: "sound", keywords: ["소리", "알람", "삐", "음악", "멜로디"], fallbackRank: 2 },
  { id: "r_move", cat: "반응", label: "움직여", say: "직접 움직여서 알려줘", tags: ["움직임"], react: "move", keywords: ["움직", "로봇", "흔들"], fallbackRank: 3 },
  { id: "r_vibe", cat: "반응", label: "진동으로", say: "진동으로 알려줘", tags: ["진동"], react: "move", keywords: ["진동", "몰래", "조용히", "스트레칭", "자세"] },
  { id: "r_screen", cat: "반응", label: "화면에 보여줘", say: "화면에 보여줘", tags: ["화면 표시"], react: "light", keywords: ["화면", "숫자", "얼마나", "몇", "시간을 재", "기록"] },
  { id: "r_phone", cat: "반응", label: "폰으로 알려줘", say: "폰으로 알림을 보내줘", tags: ["폰 알림"], react: "none", keywords: ["폰", "핸드폰", "휴대폰", "밖에서", "알림", "택배", "외출"] },
  { id: "r_press", cat: "반응", label: "스위치를 눌러줘", say: "손가락처럼 스위치를 눌러줘", tags: ["움직임"], react: "move", keywords: ["불 끄", "불 켜", "스위치", "버튼 누르"] },
  // 감지
  { id: "s_time", cat: "감지", label: "시간마다", say: "정해진 시간마다", tags: ["시간"], keywords: ["까먹", "잊", "시간", "마다", "주기", "타이머", "집중"], fallbackRank: 1 },
  { id: "s_dist", cat: "감지", label: "가까이 오면", say: "누가 가까이 오면", tags: ["거리·접근"], keywords: ["가까이", "다가오", "오면", "지나가", "택배", "사람"], fallbackRank: 2 },
  { id: "s_btn", cat: "감지", label: "버튼을 누르면", say: "버튼을 누르면", tags: ["버튼"], keywords: ["버튼", "누르", "한 번에"], fallbackRank: 3 },
  { id: "s_weight", cat: "감지", label: "무게가 줄면", say: "올려둔 게 가벼워지면", tags: ["무게"], keywords: ["밥 먹", "사료", "마셨", "마시", "남았", "무게", "물 마시"] },
  { id: "s_move", cat: "감지", label: "들거나 움직이면", say: "들거나 움직이면", tags: ["움직임·기울기"], keywords: ["움직", "들면", "흔들", "걸음", "넘어"] },
  { id: "s_door", cat: "감지", label: "문이 열리면", say: "문이 열리면", tags: ["문 열림"], keywords: ["문이", "문을", "문에", "현관", "잠갔", "잠금", "우편함", "택배"] },
  { id: "s_soil", cat: "감지", label: "흙이 마르면", say: "흙이 마르면", tags: ["흙 수분"], keywords: ["화분", "식물", "흙", "물 줄", "물주", "말라"] },
  { id: "s_air", cat: "감지", label: "공기가 탁해지면", say: "공기가 탁해지면", tags: ["공기질"], keywords: ["공기", "미세먼지", "환기", "답답", "냄새"] },
  { id: "s_humid", cat: "감지", label: "너무 건조하면", say: "방이 너무 건조하면", tags: ["온습도"], keywords: ["건조", "습도", "습해", "가습기", "더워", "추워", "온도"] },
  { id: "s_dark", cat: "감지", label: "어두워지면", say: "어두워지면", tags: ["빛 밝기"], keywords: ["어두", "밤에", "해가", "밝기"] },
  { id: "s_noise", cat: "감지", label: "시끄러워지면", say: "주변이 시끄러워지면", tags: ["소리"], keywords: ["시끄", "소음", "조용", "층간"] },
  { id: "s_sit", cat: "감지", label: "오래 앉아 있으면", say: "오래 앉아 있으면", tags: ["거리·접근", "시간"], keywords: ["앉아", "스트레칭", "자세", "허리", "목"] },
  // 누구
  { id: "w_me", cat: "누구", label: "나를 위해", say: "나를 위해", tags: ["나"], keywords: ["나", "내가", "자꾸", "까먹"], fallbackRank: 1 },
  { id: "w_family", cat: "누구", label: "가족을 위해", say: "우리 가족을 위해", tags: ["가족"], keywords: ["가족", "엄마", "아빠", "부모", "할머니", "할아버지"], fallbackRank: 2 },
  { id: "w_pet", cat: "누구", label: "반려동물을 위해", say: "반려동물을 위해", tags: ["반려동물"], keywords: ["고양이", "강아지", "반려", "사료"] },
  { id: "w_plant", cat: "누구", label: "식물을 위해", say: "우리 집 식물을 위해", tags: ["식물"], keywords: ["화분", "식물", "흙", "텃밭"] },
  { id: "w_kid", cat: "누구", label: "아이를 위해", say: "우리 아이를 위해", tags: ["아이"], keywords: ["아이", "아기", "애기", "조카", "학생"] }
];

export const FOLLOW: Record<string, Chip[]> = {
  f_desk: [{ id: "f_tiny", cat: "형태", label: "손바닥만 하게", say: "손바닥만 한", tags: [] }],
  f_hand: [{ id: "f_key", cat: "형태", label: "키링 크기", say: "키링만 한", tags: [] }],
  f_wall: [{ id: "f_mag", cat: "형태", label: "자석으로 붙이기", say: "자석으로 착 붙는", tags: [] }],
  f_wear: [
    { id: "f_wrist", cat: "형태", label: "손목에", say: "손목에 차는", tags: [], replaces: "f_wear" },
    { id: "f_clip", cat: "형태", label: "옷에 집게로", say: "옷에 집게로 다는", tags: [], replaces: "f_wear" }
  ],
  f_door: [{ id: "f_noglue", cat: "형태", label: "구멍 안 뚫고", say: "구멍 안 뚫고 붙이는", tags: [] }],
  f_pot: [{ id: "f_splash", cat: "형태", label: "물 튀어도 괜찮게", say: "물이 튀어도 괜찮은", tags: [] }],
  f_bowl: [{ id: "f_tough", cat: "형태", label: "깨물어도 튼튼하게", say: "깨물어도 튼튼한", tags: [] }],
  f_bed: [{ id: "f_dim", cat: "형태", label: "눈부시지 않게", say: "밤에 눈부시지 않은", tags: [] }],
  f_cup: [{ id: "f_thin", cat: "형태", label: "얇게", say: "얇은", tags: [] }],
  f_switch: [{ id: "f_clean", cat: "형태", label: "떼도 자국 없이", say: "떼어도 자국이 안 남는", tags: [] }],
  r_light: [
    { id: "r_blink", cat: "반응", label: "깜빡깜빡", say: "깜빡깜빡", pre: true, tags: ["깜빡임"], react: "light" },
    { id: "r_color", cat: "반응", label: "색이 바뀌게", say: "색을 바꿔가며", pre: true, tags: ["색 변화"], react: "light" }
  ],
  r_sound: [
    { id: "r_melody", cat: "반응", label: "짧은 멜로디", say: "짧은 멜로디로", pre: true, tags: ["멜로디"], react: "sound" },
    { id: "r_buzz", cat: "반응", label: "진동도 같이", say: "진동이랑 같이", pre: true, tags: ["진동"], react: "sound" }
  ],
  r_move: [
    { id: "r_wave", cat: "반응", label: "손 흔들기", say: "손을 흔들며", pre: true, tags: [], react: "move" },
    { id: "r_walk", cat: "반응", label: "걸어오기", say: "나한테 걸어와서", pre: true, tags: [], react: "move" }
  ],
  r_vibe: [{ id: "r_tap", cat: "반응", label: "두 번씩 톡톡", say: "두 번씩 톡톡", pre: true, tags: [], react: "move" }],
  r_screen: [
    { id: "r_face", cat: "반응", label: "표정 그림으로", say: "표정 그림으로", pre: true, tags: [], react: "light" },
    { id: "r_big", cat: "반응", label: "숫자 크게", say: "숫자를 크게", pre: true, tags: [], react: "light" }
  ],
  r_phone: [
    { id: "r_log", cat: "반응", label: "기록도 쌓기", say: "하루 기록도 폰에 쌓여.", tail: true, tags: [] },
    { id: "r_fam", cat: "반응", label: "가족 폰에도", say: "가족 폰에도 같이 가.", tail: true, tags: [] }
  ],
  r_press: [{ id: "r_morning", cat: "반응", label: "아침엔 다시 켜기", say: "아침엔 다시 켜 줘.", tail: true, tags: [] }],
  s_time: [
    { id: "s_cup", cat: "감지", label: "컵 무게 재기", say: "컵 무게로 마셨는지 확인해서", tags: ["무게"] },
    { id: "s_reset", cat: "감지", label: "기울이면 리셋", say: "기울이면 처음부터 다시 세고", tags: ["움직임·기울기"] }
  ],
  s_dist: [
    { id: "s_temp", cat: "감지", label: "온도도 재기", say: "온도도 같이 재서", tags: ["온습도"] },
    { id: "s_off", cat: "감지", label: "버튼 하나로 끄기", say: "버튼 하나로 끌 수 있어.", tail: true, tags: ["버튼"] }
  ],
  s_btn: [{ id: "s_long", cat: "감지", label: "길게 누르면 끄기", say: "길게 누르면 꺼져.", tail: true, tags: [] }],
  s_weight: [{ id: "s_count", cat: "감지", label: "몇 번 먹었는지 세기", say: "몇 번 먹었는지 세어서", tags: [] }],
  s_move: [{ id: "s_shake", cat: "감지", label: "흔들면 깨우기", say: "흔들면 다시 깨어나.", tail: true, tags: [] }],
  s_door: [{ id: "s_lock", cat: "감지", label: "잠금까지 확인", say: "잠금 걸쇠까지 확인해서", tags: [] }],
  s_soil: [{ id: "s_sun", cat: "감지", label: "햇빛도 재기", say: "햇빛이 얼마나 드는지도 재서", tags: ["빛 밝기"] }],
  s_air: [{ id: "s_co2", cat: "감지", label: "이산화탄소도", say: "이산화탄소도 같이 재서", tags: [] }],
  s_humid: [{ id: "s_htemp", cat: "감지", label: "온도도 같이", say: "온도도 같이 재서", tags: [] }],
  s_dark: [{ id: "s_night", cat: "감지", label: "밤에만 켜기", say: "밤에만 작동해.", tail: true, tags: [] }],
  s_noise: [{ id: "s_level", cat: "감지", label: "단계로 나누기", say: "얼마나 시끄러운지 단계로 나눠서", tags: [] }],
  s_sit: [{ id: "s_posture", cat: "감지", label: "자세도 보기", say: "자세가 무너졌는지도 보고", tags: ["움직임·기울기"] }],
  w_me: [{ id: "w_fam", cat: "누구", label: "가족도 같이", say: "가족도 같이 쓸 수 있게", tags: ["가족"] }],
  w_pet: [
    { id: "w_cat", cat: "누구", label: "고양이", say: "우리 고양이를 위해", replaces: "w_pet", tags: [] },
    { id: "w_dog", cat: "누구", label: "강아지", say: "우리 강아지를 위해", replaces: "w_pet", tags: [] }
  ],
  w_plant: [{ id: "w_many", cat: "누구", label: "화분 여러 개", say: "화분 여러 개를 위해", replaces: "w_plant", tags: [] }],
  w_kid: [{ id: "w_safe", cat: "누구", label: "만져도 안전하게", say: "아이 손이 닿아도 안전하게", tags: [] }],
  w_family: [{ id: "w_far", cat: "누구", label: "멀리 사는 부모님", say: "멀리 사는 부모님을 위해", replaces: "w_family", tags: [] }],
  // ── 후속의 후속: 고를수록 한 단계씩 더 구체적인 장작이 붙는다 ──
  f_tiny: [{ id: "f_round", cat: "형태", label: "동글동글하게", say: "동글동글한", tags: [] }],
  f_key: [{ id: "f_bag", cat: "형태", label: "가방에 달기", say: "가방에 다는", tags: [] }],
  f_mag: [{ id: "f_fridge", cat: "형태", label: "냉장고에", say: "냉장고에 착 붙는", replaces: "f_mag", tags: [] }],
  f_wrist: [{ id: "f_band", cat: "형태", label: "실리콘 밴드로", say: "실리콘 밴드로 된", tags: [] }],
  f_clip: [{ id: "f_light", cat: "형태", label: "티 안 나게 가볍게", say: "티 안 나게 가벼운", tags: [] }],
  f_splash: [{ id: "f_solar", cat: "형태", label: "햇빛으로 충전", say: "햇빛으로 충전되는", tags: [] }],
  f_thin: [{ id: "f_wood", cat: "형태", label: "나무 느낌", say: "나무 느낌의", tags: [] }],
  f_dim: [{ id: "f_soft", cat: "형태", label: "말랑하게", say: "말랑한", tags: [] }],
  f_tough: [{ id: "f_wash", cat: "형태", label: "물로 씻을 수 있게", say: "물로 씻을 수 있는", tags: [] }],
  f_noglue: [{ id: "f_battery", cat: "형태", label: "건전지로 오래", say: "건전지로 몇 달 가는", tags: [] }],
  r_blink: [{ id: "r_breathe", cat: "반응", label: "숨 쉬듯 천천히", say: "숨 쉬듯 천천히", pre: true, tags: [], react: "light" }],
  r_color: [{ id: "r_traffic", cat: "반응", label: "신호등 색으로", say: "초록·노랑·빨강 신호등 색으로", pre: true, tags: [], react: "light" }],
  r_melody: [{ id: "r_voice", cat: "반응", label: "목소리로 말해주기", say: "급할 땐 목소리로 직접 말해줘.", tail: true, tags: [] }],
  r_buzz: [{ id: "r_quiet", cat: "반응", label: "밤엔 조용히", say: "밤에는 소리 없이 진동만 해.", tail: true, tags: [] }],
  r_wave: [{ id: "r_dance", cat: "반응", label: "다 하면 춤추기", say: "다 끝내면 신나게 춤을 춰.", tail: true, tags: [] }],
  r_tap: [{ id: "r_pattern", cat: "반응", label: "상황마다 다르게", say: "상황마다 진동 모양이 달라.", tail: true, tags: [] }],
  r_face: [{ id: "r_mood", cat: "반응", label: "상태 따라 표정", say: "상태에 따라 표정이 바뀌어.", tail: true, tags: [] }],
  r_big: [{ id: "r_count", cat: "반응", label: "남은 횟수 보여주기", say: "오늘 남은 횟수도 보여줘.", tail: true, tags: [] }],
  r_log: [{ id: "r_week", cat: "반응", label: "일주일 그래프", say: "일주일치 그래프도 볼 수 있어.", tail: true, tags: [] }],
  r_fam: [{ id: "r_only", cat: "반응", label: "급할 때만", say: "정말 급할 때만 보내.", tail: true, tags: [] }],
  s_cup: [{ id: "s_goal", cat: "감지", label: "하루 목표 세기", say: "하루 목표만큼 채웠는지 세어서", tags: [] }],
  s_reset: [{ id: "s_streak", cat: "감지", label: "연속 기록 세기", say: "며칠 연속 지켰는지도 세어서", tags: [] }],
  s_temp: [{ id: "s_hot", cat: "감지", label: "너무 더우면 따로", say: "너무 더우면 따로 알려줘.", tail: true, tags: [] }],
  s_count: [{ id: "s_when", cat: "감지", label: "먹은 시간 적기", say: "언제 먹었는지 시간을 적어두고", tags: ["시간"] }],
  s_lock: [{ id: "s_away", cat: "감지", label: "집 나설 때만", say: "내가 집을 나설 때만", tags: ["거리·접근"] }],
  s_sun: [{ id: "s_season", cat: "감지", label: "계절마다 기준 바꾸기", say: "계절마다 물 줄 기준이 바뀌어.", tail: true, tags: [] }],
  s_co2: [{ id: "s_window", cat: "감지", label: "창문 열 때 알려주기", say: "창문을 열 때가 되면", tags: [] }],
  s_level: [{ id: "s_classroom", cat: "감지", label: "교실·사무실용", say: "여럿이 있는 방에서도 잘 보이게", tags: [] }],
  s_posture: [{ id: "s_standup", cat: "감지", label: "일어나면 리셋", say: "일어나면 다시 세기 시작해.", tail: true, tags: [] }],
  s_htemp: [{ id: "s_humidifier", cat: "감지", label: "가습기 켤 때 알려주기", say: "가습기를 켤 때가 되면", tags: [] }],
  s_night: [{ id: "s_motion", cat: "감지", label: "지나갈 때만 켜기", say: "누가 지나갈 때만", tags: ["거리·접근"] }],
  w_fam: [{ id: "w_kids2", cat: "누구", label: "아이도 쓰게", say: "아이도 혼자 쓸 수 있게", tags: ["아이"] }],
  w_cat: [{ id: "w_cats", cat: "누구", label: "여러 마리", say: "여러 마리 고양이를 위해", replaces: "w_cat", tags: [] }],
  w_dog: [{ id: "w_walk", cat: "누구", label: "산책도 챙기게", say: "산책 시간도 챙기게", tags: [] }],
  w_many: [{ id: "w_vacation", cat: "누구", label: "휴가 갈 때도", say: "휴가 가서도 걱정 없게", tags: [] }],
  w_far: [{ id: "w_daily", cat: "누구", label: "매일 안부 확인", say: "매일 안부를 확인할 수 있게", tags: [] }]
};

// 장작 칸에 한 번에 보이는 뿌리 장작 수. 하나를 고르면 다음으로 관련 있는 장작이 그 자리를 채운다.
export const ROOT_VISIBLE = 10;

export function toChip({ keywords: _k, fallbackRank: _f, ...chip }: RootDef): Chip {
  return chip;
}

export type ChipTree = { root: Chip[]; follow: Record<string, Chip[]> };

export function lookup(tree: ChipTree) {
  const all = [...tree.root, ...Object.values(tree.follow).flat()];
  const map = new Map(all.map((c) => [c.id, c]));
  return (id: string) => map.get(id);
}

export function byCat(picked: string[], find: (id: string) => Chip | undefined) {
  const out: Partial<Record<Cat, Chip[]>> = {};
  for (const id of picked) {
    const chip = find(id);
    if (chip) (out[chip.cat] ??= []).push(chip);
  }
  return out;
}

/** 고른 키워드 → 한 문단. 고르는 순서와 상관없이 형태 → 감지 → 반응 → 누구 순서로 자연스럽게 짠다. */
export function compose(picked: string[], find: (id: string) => Chip | undefined): string {
  const c = byCat(picked, find);
  const replaced = new Set(picked.map((id) => find(id)?.replaces).filter(Boolean) as string[]);
  const of = (k: Cat) => (c[k] ?? []).filter((x) => !x.tail && !replaced.has(x.id));
  const parts: string[] = [];
  const form = of("형태").map((x) => x.say);
  if (form.length) parts.push(form.join(", ") + " 물건이야.");
  const sense = of("감지").map((x) => x.say);
  const react = of("반응");
  const pre = react.filter((x) => x.pre).map((x) => x.say);
  const verb = react.filter((x) => !x.pre).map((x) => x.say);
  const reactTxt = [...pre, verb.join(" 또는 ")].filter(Boolean).join(" ");
  if (sense.length || reactTxt) parts.push([sense.join(", "), reactTxt || "알려줘"].filter(Boolean).join(" ") + ".");
  for (const k of CATS) for (const x of c[k] ?? []) if (x.tail) parts.push(x.say);
  const who = of("누구").map((x) => x.say);
  if (who.length) parts.push(who.join(", ") + " 만들 거야.");
  return parts.join(" ");
}

export function reactKind(picked: string[], find: (id: string) => Chip | undefined): ReactKind {
  // 처음 고른 반응이 불 색을 정한다.
  for (const id of picked) {
    const r = find(id)?.react;
    if (r) return r;
  }
  return "none";
}

const PLACE: Array<[string, string]> = [["f_desk", "책상"], ["f_cup", "책상"], ["f_hand", "주머니"], ["f_wear", "손목"], ["f_wall", "벽걸이"], ["f_switch", "벽걸이"], ["f_door", "현관"], ["f_pot", "화분"], ["f_bowl", "집사"], ["f_bed", "머리맡"]];
const WHO_PLACE: Array<[string, string]> = [["w_pet", "집사"], ["w_plant", "화분"], ["w_kid", "꼬마"], ["w_family", "우리집"]];

export function fireName(picked: string[], find: (id: string) => Chip | undefined): string {
  const adj = { light: "깜빡이는", sound: "노래하는", move: "꼼지락대는", none: "조용한" }[reactKind(picked, find)];
  const place = PLACE.find(([id]) => picked.includes(id))?.[1] ?? WHO_PLACE.find(([id]) => picked.includes(id))?.[1] ?? "방구석";
  return `${adj} ${place} 도깨비불`;
}

/** 장작 하나를 넣었을 때 늘어나는 화력 */
export function fireGain(chip: Chip, pickedBefore: string[], find: (id: string) => Chip | undefined, isFollow: boolean): number {
  const had = byCat(pickedBefore, find);
  return FIRE.perChip + (had[chip.cat] ? 0 : FIRE.newCategoryBonus) + (isFollow ? FIRE.followUpBonus : 0);
}
