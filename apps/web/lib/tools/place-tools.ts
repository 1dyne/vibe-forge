import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getMakerProfile, saveMakerProfile } from "../local-project-store";
import { emptyProfile } from "../workflow";
import { kit, projectIdSchema, type ToolDefinition } from "../tool-kit";

// 메이커스페이스를 사람이 칸마다 적지 않게 한다. 예약 화면 캡처나 지도·예약 페이지 주소를
// 대화에 올리면 달그락이 읽어서 계정에 등록한다. 등록된 곳은 모든 프로젝트가 같이 쓴다.
const Input = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  where: z.string().trim().max(80).default(""),
  printers: z.string().trim().max(200).default(""),
  maxPrintMm: z.tuple([z.number().min(0).max(2000), z.number().min(0).max(2000), z.number().min(0).max(2000)]).nullable().default(null),
  url: z.string().trim().max(300).refine((v) => v === "" || /^https?:\/\//i.test(v), "주소는 http(s)로 시작해야 해요").default(""),
  note: z.string().trim().max(300).default(""),
  source: z.enum(["photo", "link", "said", "search"])
}).strict();

export const tools: ToolDefinition[] = [{
  name: "add_makerspace", title: "메이커스페이스 등록",
  description: "사용자가 다니는(또는 가 보려는) 메이커스페이스를 계정에 등록한다. 사용자가 예약 확인 화면이나 장비 안내 사진을 올리거나, 네이버 지도·예약 페이지 주소를 붙여넣거나, 말로 알려주면 거기서 읽은 것만 채운다. 읽지 못한 칸은 비워 둔다(지어내지 않는다). 장비의 출력 가능 크기는 장비 이름으로 확실히 아는 경우에만 넣고, 근거를 note에 적는다. 같은 이름이 이미 있으면 그 항목을 고친다. 등록한 뒤에는 무엇을 채웠고 무엇이 비었는지 말하고, '내 계정 → 만드는 곳'에서 확인·수정할 수 있다고 알려준다. 웹 검색으로 찾은 곳은 사용자가 '거기로 할게요'라고 한 뒤에만 등록한다.",
  inputSchema: { type: "object", additionalProperties: false, required: ["projectId", "name", "source"], properties: {
    projectId: projectIdSchema,
    name: { type: "string", description: "공간 이름 (예: 마포 무한상상실)" },
    where: { type: "string", description: "위치와 가는 길 (예: 서울 마포구 · 지하철 15분)" },
    printers: { type: "string", description: "보유 장비 (예: Bambu Lab P1S 3대, 레이저 커터)" },
    maxPrintMm: { type: ["array", "null"], minItems: 3, maxItems: 3, items: { type: "number" }, description: "가장 큰 3D 프린터의 출력 가능 크기 [가로, 세로, 높이] mm. 모르면 null" },
    url: { type: "string", description: "예약·안내 페이지 주소" },
    note: { type: "string", description: "이용 조건 (예: 기본 교육 이수 필요, 재료비 별도, 평일 10~18시)" },
    source: { type: "string", enum: ["photo", "link", "said", "search"], description: "무엇을 보고 채웠는지: 사진, 붙여넣은 주소, 사용자의 말, 웹 검색" }
  } },
  run: async (input, context) => {
    const { projectId, source, ...space } = Input.parse(input);
    const project = await kit.ownedProject(projectId, context);
    const account = { ...emptyProfile(), ...((await getMakerProfile(context.user.id)) ?? {}) };
    const before = account.makerspaces ?? [];
    const same = before.find((s) => s.name.replace(/\s/g, "") === space.name.replace(/\s/g, ""));
    if (!same && before.length >= 10) return kit.stored(project, context, "메이커스페이스는 열 곳까지 등록할 수 있어요. '내 계정 → 만드는 곳'에서 안 쓰는 곳을 지운 뒤 다시 등록해 주세요.");
    const next = same ? before.map((s) => (s === same ? { ...same, ...Object.fromEntries(Object.entries(space).filter(([, v]) => v !== "" && v !== null)) } : s)) : [...before, { ...space, id: randomUUID().slice(0, 8) }];
    await saveMakerProfile({ ...account, makerspaces: next, printerAccess: account.printerAccess === "own" ? "own" : "makerspace" }, context.user.id);
    const empty = [!space.where && "위치", !space.printers && "보유 장비", !space.maxPrintMm && "출력 가능 크기", !space.url && "예약 페이지"].filter(Boolean);
    return kit.stored(project, context, `${same ? "등록돼 있던 곳을 고쳤어요" : "메이커스페이스를 등록했어요"}: ${space.name} (${{ photo: "사진", link: "주소", said: "말씀", search: "검색" }[source]}에서 읽음).${empty.length ? ` 비어 있는 것: ${empty.join(", ")}.` : ""} 사용자에게 채운 내용을 한 번 읽어 주고, 틀린 곳은 '내 계정 → 만드는 곳'에서 고칠 수 있다고 알려주세요.${space.maxPrintMm ? ` 이제 하우징은 ${space.maxPrintMm.join("×")}mm 안에 들어가게 설계하세요.` : ""}`);
  }
}];

export const GUIDE_SECTION = `## 예산, 구매처, 만드는 곳
### 예산 (프로젝트마다 다르다)
- get_project의 profile.budgetOff가 true면 이 프로젝트는 예산을 정하지 않기로 한 것이다. 예산을 묻지 않고, 예산 때문에 부품을 낮추지 않는다. 그래도 예상 비용은 원 단위로 말한다.
- false이거나 없으면 체크리스트대로 예산을 묻고(선택), 정해진 예산 안에서 보드와 부품을 고른다.
### 선호하는 구매처 (profile.preferredShops)
- 목록이 있으면 부품을 찾고 추천할 때 그곳을 먼저 본다. 그곳에 없거나 값이 많이 비쌀 때만 다른 곳을 함께 보여주고 이유를 말한다.
- 목록이 없으면 처음 부품을 살 때 "자주 쓰는 구매처가 있나요?"를 한 번 묻고, 답을 set_maker_profile의 preferredShops로 남긴다.
- 배송 기간은 구매처마다 다르다. 웹 검색을 쓸 수 있으면 그 판매 페이지의 배송 안내를 확인하고, 사용자가 기다릴 수 있는 기간(extras.deliveryWait)과 견줘 말한다. 확인하지 못했으면 "국내 2~3일, 해외 2~3주가 보통이에요. 판매 페이지에서 확인해 주세요"처럼 일반적인 값임을 밝힌다.
### 메이커스페이스 (profile.makerspaces)
- 사용자가 예약 화면 캡처, 장비 안내 사진, 지도·예약 페이지 주소를 올리거나 말로 알려주면 add_makerspace로 등록한다. 사용자에게 칸을 하나씩 채우라고 하지 않는다.
- 등록된 곳이 없고 3D 출력이 필요하면, 웹 검색을 쓸 수 있을 때 사용자 지역(profile.region)과 이동 범위(travelRange) 안의 메이커스페이스를 두세 곳 찾아 장비·예약 방법·출처 주소와 함께 보여준다. 지역을 모르면 먼저 묻는다. 사용자가 고르면 add_makerspace로 등록한다.
- 등록된 곳의 출력 가능 크기 안에 들어가게 하우징을 나눈다. 크기를 모르면 장비 이름으로 찾아보거나 사용자에게 확인을 부탁한다.`;
