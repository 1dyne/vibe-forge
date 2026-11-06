import type { FormField, InfoForm } from "./project-types";

// Ready-made formats agents can ask the person to fill in, so findings come
// back in the shape the team needs. Each format has an "정보" text (what to put
// in, why, where to find it) shown next to the form so fewer questions are
// needed in chat. Agents may also define their own fields.

export const INFO_FORMATS: Record<string, InfoForm & { title: string }> = {
  stock_check: {
    title: "부품 재고·가격 확인",
    help: "판매 페이지에서 지금 주문할 수 있는지 확인해 주세요. 가격은 확인한 시점 기준이라 날짜와 함께 남겨요. 같은 모델명인지 꼭 비교해 주세요(비슷한 이름의 다른 부품이 많아요).",
    fields: [
      { key: "url", label: "판매 페이지 링크", type: "link", required: true, help: "주소창의 주소를 그대로 붙여넣어 주세요." },
      { key: "model", label: "판매 페이지의 정확한 모델명", type: "text", required: true, help: "상품명 옆이나 상세 설명의 모델명(예: U177, C124)." },
      { key: "stock", label: "주문 가능한 수량", type: "number", unit: "개", required: true, help: "재고 표시가 없으면 장바구니에 필요한 수량을 담아 보고 막히는지 확인해 주세요. 모르면 0이 아니라 비워두고 메모에 적어주세요." },
      { key: "price", label: "개당 가격", type: "number", unit: "원", required: false, help: "부가세 포함 가격으로 적어주세요." },
      { key: "delivery", label: "예상 도착", type: "text", required: false, help: "예: 내일 도착, 2~3주(해외 배송)" }
    ]
  },
  part_link: {
    title: "찾은 부품 공유",
    help: "직접 찾은 부품을 팀에 알려주세요. 달그락이 데이터시트와 맞는지 확인해요.",
    fields: [
      { key: "url", label: "링크", type: "link", required: true },
      { key: "model", label: "모델명", type: "text", required: true },
      { key: "why", label: "이 부품을 고른 이유", type: "text", long: true, required: false }
    ]
  },
  dimension: {
    title: "실측 치수",
    help: "버니어 캘리퍼스나 자로 잰 값을 적어주세요. 같은 곳을 두세 번 재서 가장 자주 나온 값을 쓰면 좋아요. 케이스 구멍과 고정 자리를 이 값으로 맞춰요.",
    fields: [
      { key: "target", label: "잰 곳", type: "text", required: true, help: "예: 저울 유닛의 긴 변, USB-C 포트 중심 높이" },
      { key: "value", label: "값", type: "number", unit: "mm", required: true },
      { key: "tool", label: "잰 도구", type: "choice", choices: ["버니어 캘리퍼스", "자", "줄자", "기타"], required: false }
    ]
  },
  measurement: {
    title: "측정값",
    help: "요청한 위치와 모드로 잰 값을 적어주세요. 정상 범위가 있으면 서버가 바로 비교해요. 재는 방법을 모르면 '할 수 없어요 → 측정·작업 방법을 모르겠어요'를 눌러 주세요. 달그락이 더 쉽게 다시 설명해요.",
    fields: [
      { key: "value", label: "측정값", type: "number", required: true },
      { key: "power", label: "전원 상태", type: "choice", choices: ["켜진 상태", "꺼진 상태"], required: true, help: "전압은 켜진 상태, 저항·연결(통전)은 꺼진 상태에서 재요." },
      { key: "where", label: "잰 위치와 모드", type: "text", required: false, help: "예: 빨간 리드 5V 핀, 검은 리드 GND, DC 20V 모드" },
      { key: "firmware", label: "올라가 있는 펌웨어", type: "text", required: false, help: "시리얼 모니터 첫 줄의 버전이나 마지막으로 올린 파일 이름. 어떤 코드에서 잰 값인지 알아야 원인을 좁힐 수 있어요." }
    ]
  },
  error_log: {
    title: "오류 메시지",
    help: "화면에 나온 오류를 고치지 말고 그대로 복사해 주세요. 맨 위 몇 줄보다 빨간 글씨가 시작되는 부분부터 끝까지가 더 중요해요.",
    fields: [
      { key: "where", label: "어디서 났나요", type: "choice", choices: ["Arduino IDE 컴파일", "업로드", "시리얼 모니터", "웹·앱", "기타"], required: true },
      { key: "message", label: "오류 메시지 전체", type: "text", long: true, required: true },
      { key: "before", label: "바로 전에 한 일", type: "text", long: true, required: false, help: "예: 라이브러리 설치, 보드 선택 변경, 선 다시 꽂기" }
    ]
  }
};

export type FormJudgement = "normal" | "abnormal" | "unknown";

// Checks a submission against the fields: required values present, numbers
// parse, links look like links. Returns the cleaned values and, for numbers
// with an expected range, whether the reading is inside it.
export function checkSubmission(fields: FormField[], raw: Record<string, unknown>): { values: Record<string, string | number>; judgements: Record<string, FormJudgement>; errors: string[] } {
  const values: Record<string, string | number> = {};
  const judgements: Record<string, FormJudgement> = {};
  const errors: string[] = [];
  for (const field of fields) {
    const input = raw[field.key];
    const text = input === undefined || input === null ? "" : String(input).trim();
    if (!text) { if (field.required) errors.push(`${field.label}을(를) 적어주세요.`); continue; }
    if (field.type === "number") {
      const number = Number(text.replace(/,/g, ""));
      if (!Number.isFinite(number)) { errors.push(`${field.label}은(는) 숫자로 적어주세요.`); continue; }
      values[field.key] = number;
      if (field.expected) judgements[field.key] = (field.expected.min == null || number >= field.expected.min) && (field.expected.max == null || number <= field.expected.max) ? "normal" : "abnormal";
    } else if (field.type === "link") {
      if (!/^https?:\/\/\S+$/i.test(text)) { errors.push(`${field.label}은(는) http로 시작하는 주소로 적어주세요.`); continue; }
      values[field.key] = text.slice(0, 500);
    } else if (field.type === "choice") {
      if (field.choices && !field.choices.includes(text)) { errors.push(`${field.label}은(는) 선택지 중에서 골라주세요.`); continue; }
      values[field.key] = text;
    } else values[field.key] = text.slice(0, 3000);
  }
  return { values, judgements, errors };
}

export function describeSubmission(fields: FormField[], values: Record<string, string | number>, judgements: Record<string, FormJudgement>): string {
  return fields.filter((f) => values[f.key] !== undefined).map((f) => {
    const range = f.expected ? ` (정상 ${f.expected.min ?? "…"}~${f.expected.max ?? "…"}${f.unit ?? ""}${judgements[f.key] ? ` · ${judgements[f.key] === "normal" ? "범위 안" : "범위 밖"}` : ""})` : "";
    return `${f.label}: ${values[f.key]}${f.unit && f.type === "number" ? f.unit : ""}${range}`;
  }).join(" / ");
}
