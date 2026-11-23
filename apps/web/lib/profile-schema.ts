import { z } from "zod";

// 자주 가는 메이커스페이스. 예약 자체는 공간마다 제각각(메이크올·지자체 사이트·전화)이라
// 여기서 대신 걸어주지 않는다. 대신 어디에 무엇이 있고 어디서 예약하는지를 들고 있다가,
// 출력 크기를 적어두면 설계가 그 장비로 낼 수 있는 범위 안에 머물게 한다.
export const MakerSpaceSchema = z.object({
  id: z.string().max(40),
  name: z.string().trim().min(1).max(60),
  where: z.string().trim().max(80),
  printers: z.string().trim().max(200),
  maxPrintMm: z.tuple([z.number().min(1).max(2000), z.number().min(1).max(2000), z.number().min(1).max(2000)]).nullable(),
  url: z.string().trim().max(300),
  note: z.string().trim().max(300)
}).strict();

// 가진 부품 한 줄. 이름만 있으면 되고, 부품 카드와 연결되면 catalogId가 붙는다.
export const OwnedPartSchema = z.object({
  id: z.string().max(40),
  name: z.string().trim().min(1).max(80),
  qty: z.number().int().min(1).max(999),
  catalogId: z.string().trim().max(60).nullable(),
  note: z.string().trim().max(120)
}).strict();

// 사람에게 붙는 값. 계정에 저장되고 모든 프로젝트가 함께 쓴다.
export const PersonProfileSchema = z.object({
  tools: z.array(z.string().max(80)).max(30),
  toolsConfirmed: z.boolean(),
  firmwareExperience: z.enum(["unanswered", "none", "guided", "independent"]),
  solderingSkill: z.enum(["unanswered", "none", "tried", "comfortable"]).optional(),
  printerAccess: z.enum(["unanswered", "own", "makerspace", "service", "none"]).optional(),
  region: z.string().max(60).optional(),
  travelRange: z.enum(["unanswered", "walk", "transit30", "transit60", "car"]).optional(),
  makerspaces: z.array(MakerSpaceSchema).max(10).optional(),
  ownedParts: z.array(OwnedPartSchema).max(120).optional(),
  devProfile: z.object({
    codingExperience: z.enum(["unanswered", "none", "guided", "independent"]),
    tool: z.enum(["undecided", "claude_code", "codex"]),
    os: z.enum(["unanswered", "mac", "windows", "linux"]),
    installed: z.array(z.string().max(40)).max(12),
    confirmed: z.boolean()
  }).strict().optional()
}).strict();

// 프로젝트마다 달라지는 값까지 포함한 전체 프로필.
export const ProfileSchema = PersonProfileSchema.extend({
  coreBehavior: z.string().max(1800),
  budgetKRW: z.number().int().min(0).max(100_000_000).nullable().optional(),
  purpose: z.enum(["unanswered", "personal", "gift", "sell", "lecture"]).optional(),
  targetPriceKRW: z.number().int().min(0).max(100_000_000).nullable().optional(),
  timelineWeeks: z.number().min(0.5).max(104).nullable().optional()
}).strict();
