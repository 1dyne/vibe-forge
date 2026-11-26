// 화면과 서버가 같이 쓰는 이름표와 모양(서버 저장소를 끌어오지 않게 따로 둔다).
export const FINISH_ROUTES = {
  own_tool: "가진 도구로 직접 다듬기",
  easy_tool: "쉬운 도구로 다듬기 (틴커캐드, 슬라이서의 자르기·구멍)",
  learn: "배워서 다듬기",
  outsource: "외주 맡기기",
  hand_finish: "출력한 뒤 손으로 마감 (퍼티·사포·도색)",
  makerspace: "메이커스페이스에서 도움 받기",
  simplify: "디자인을 낮춰 초안 그대로 가기"
} as const;
export type FinishRoute = keyof typeof FINISH_ROUTES;

export type DesignFinish = {
  /** 초안이 어디까지 만들어졌는지 */
  draft: string;
  /** 사람 손이 필요한 곳과 이유 */
  limits: Array<{ what: string; why: string }>;
  /** 사용자가 다룰 수 있는 도구(체크리스트 답에서 확인한 것) */
  toolsOnHand: string[];
  /** 고를 수 있는 길. 첫 번째가 추천 */
  routes: Array<{ route: FinishRoute; why: string; steps: string[]; tool?: string; costKRW?: number | null; time?: string }>;
  /** 외주·메이커스페이스에 그대로 가져갈 의뢰서 */
  brief?: string;
  chosen?: FinishRoute;
  updatedAt: string;
};

