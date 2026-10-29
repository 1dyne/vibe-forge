# Vibe Forge — 1차 개발 명세서 v0.3

작성일 2026-09-15 · 1 dyne

**v0.2 대비 변경**
- 부품 추천을 사용자 대면 기능으로 승격 (§3.8) — 결정 카드의 한 종류로 통합
- 모든 카드에 초보자용 해설 필드 추가 (§3.7)
- 지식 아키텍처 4계층 신설 (§5) — 회로·부품 지식을 AI에 어떻게 주는가
- 원칙 7의 범위를 "코드·시드에 부품을 박지 않는다"로 한정
- 검증을 단일 프로젝트(로봇) 기준으로 축소

---

## 0. 한 줄 정의

하드웨어 아이디어를 넣으면, 확정에 필요한 스펙 칸을 대화로 채워가고, 도메인별 AI 에이전트가 낸 제약들 사이의 충돌을 자동으로 찾아내, **각 결정마다 실제 부품 후보와 트레이드오프와 예상 매몰비용을 카드로 제시하는** 설계 웹앱.

3D는 결정된 것을 보여주는 화면이지 제품의 본체가 아니다. 본체는 **결정과 그 대가**다.

---

## 1. 설계 원칙

1. **생성이 아니라 판단이 가치다.** 형상을 만들어내는 능력은 범용 모델이 계속 가져간다. 이 앱이 파는 건 "그 선택을 하면 무엇을 잃는가"다.
2. **대화는 휘발, 상태는 영구.** 확정된 것은 채팅 로그가 아니라 구조화된 레코드로 남는다.
3. **충돌은 손으로 적지 않고 예산에서 도출한다.** 도메인이 숫자 제약을 내면 충돌은 코드가 찾는다.
4. **모든 선택지에는 네 축의 대가가 붙는다.** 시간 / 돈 / 되돌리기 비용 / 학습 비용.
5. **개인 맥락과 일반 지식은 처음부터 분리한다.** 스키마에서만 나눠 둔다.
6. **관측 가능하게 만든다.** 결과가 이상할 때 프롬프트 문제인지 상태 문제인지 렌더 문제인지 구분할 수 있어야 한다.
7. **부품 지식을 코드와 시드 데이터에 박지 않는다.** 앱은 빈 상태로 출발하고, 부품은 전부 런타임에 획득된다.
8. **숫자는 LLM이 아니라 코드가 계산한다.** 합계, 여유, 예산 소진율. LLM은 해석과 설명만 한다.

> **원칙 7이 금지하는 것과 금지하지 않는 것**
> 금지: 앱 코드·프롬프트·시드 DB에 특정 부품이나 특정 기기 종류를 박아두는 것.
> 금지 아님: 설계 중에 AI가 실제 부품을 찾아 **사용자에게 구체적으로 보여주는 것.** 이건 오히려 필수 기능이다. "토크 8kg·cm 이상인 액추에이터"만 말하면 사용자는 뭘 사야 할지 모른다.

---

## 2. 범위

### 1차에 포함

- 아이디어 대화 → 스펙 게이트 충족 판정
- HW / SW / ME / ID 네 도메인 에이전트와 핸드오프
- 예산표 기반 충돌 자동 감지 + 룰팩 검사
- 결정 카드 — **트레이드오프 카드**와 **부품 선택 카드** 두 종류
- 부품 추천·비교·획득 (PartScout)
- 3D 뷰 — 부품 배치 + 조립 스텝 재생
- 커스텀 하우징 파라메트릭 생성 (CadQuery → STL)
- 명세서 / BOM / 결선 리스트 내보내기
- LLM 호출·상태 변경 전체 로그

### 1차에서 제외

- 멀티유저, 인증, 과금
- 회로도(schematic) 자동 생성 — 결선 리스트 텍스트까지만
- PCB 레이아웃 / Gerber
- 사진 기반 디버깅 (3차)
- 학습 제안 UI (4차) — 데이터는 1차부터 적재
- 커뮤니티
- 부품 카탈로그 사전 구축

---

## 3. 데이터 모델

### 3.1 공통 규칙

```json
{
  "id": "uuid",
  "project_id": "uuid | null",
  "scope": "personal | general",
  "created_at": "iso8601",
  "created_by": "user | agent:ME | agent:HW | agent:SW | agent:ID | scout | system",
  "source": { "model": "claude-opus-5", "call_id": "uuid" }
}
```

`project_id: null` + `scope: general`인 레코드가 프로젝트를 넘어 재사용되는 자산이다. 부품 레코드가 여기 해당한다.

### 3.2 Project

```json
{
  "name": "무제 프로젝트",
  "one_liner": "사용자가 쓴 한 줄",
  "stage": "idea | spec | blueprint | build",
  "spec_gate": { },
  "budgets": [ ]
}
```

`spec → blueprint` 전환 조건: 모든 스펙 칸이 `filled` 또는 명시적 `assumed`.

### 3.3 SpecGate — 스펙 칸

```json
{
  "slots": [
    { "key": "power",     "label": "전원",          "unlocks": ["에너지원", "전압 변환", "충전"] },
    { "key": "wireless",  "label": "무선 필요 여부",  "unlocks": ["연산 유닛 계열"] },
    { "key": "sensing",   "label": "감지 대상과 정밀도", "unlocks": ["센서"] },
    { "key": "actuation", "label": "움직임·표시",     "unlocks": ["액추에이터", "전류 예산"] },
    { "key": "data_sink", "label": "데이터 행선지",    "unlocks": ["통신", "저장"] },
    { "key": "form",      "label": "폼팩터·환경 제약", "unlocks": ["하우징", "재료"] },
    { "key": "runtime",   "label": "구동 시간",       "unlocks": ["에너지 용량", "절전 설계"] },
    { "key": "fab",       "label": "제작 방식",       "unlocks": ["조립 단계 전체"] }
  ]
}
```

상태: `empty` / `assumed`(AI가 가정, 항상 표시, 언제든 뒤집힘) / `filled`.
슬롯 상태 변화 이력을 남긴다 — 4차의 입력값.

### 3.4 Budget

```json
{
  "key": "mass_total",
  "label": "총 중량",
  "unit": "g",
  "limit": 900,
  "limit_source": "decision:HW-01",
  "allocations": [
    { "owner": "ME:housing", "value": 220, "confidence": "estimate" }
  ]
}
```

기본 키: `mass_total`(g) / `current_peak`·`current_avg`(mA) / `volume_envelope`(mm bbox) / `cost_total`(원) / `thermal_dissipation`(W) / `build_hours`(h). 도메인 에이전트가 새 키를 만들 수 있다.

`confidence`: `measured > datasheet > estimate > guess`. **guess가 섞인 예산으로는 결정을 잠그지 않는다.**

### 3.5 Constraint

```json
{
  "domain": "ME",
  "target": "mass_total",
  "op": "lte | gte | eq | range",
  "value": 40,
  "unit": "g",
  "applies_to": "housing",
  "rationale": "총 중량 예산에서 하우징 몫",
  "hardness": "hard | soft",
  "derived_from": "decision:HW-01"
}
```

### 3.6 Conflict

**LLM이 아니라 코드가 만든다.**

1. 같은 `target`의 `hard` 제약 교집합이 공집합 → 충돌
2. `allocations` 합계 > `limit` → 충돌
3. `hard` 제약을 만족하는 부품 후보가 0개 (PartScout 탐색 후) → 충돌
4. 룰팩 위반 (§5.4) → 충돌
5. `soft` 제약 위반 → 경고

**충돌 없이 생성되는 Decision은 없다.**

### 3.7 Decision — 결정 카드

두 종류가 있고 구조는 같다.

```json
{
  "code": "ME-04",
  "kind": "tradeoff | part_pick",
  "title": "하우징 재료",
  "conflict_id": "uuid",
  "status": "open | decided | deferred",
  "plain": "하우징을 단단하게 만들수록 무거워집니다. 지금 무게 예산이 12g 모자랍니다.",
  "options": [ ]
}
```

**`plain` 필드가 v0.3의 핵심 추가다.** 전문 용어를 쓰지 않고 지금 무슨 선택을 하는 건지 설명하는 두세 문장. 각 옵션에도 `plain`을 둔다. 이게 없으면 초보 사용자에게는 카드가 암호문이다.

`plain`에서 처음 등장한 용어는 용어 주석을 달고, 그 용어가 **KnowledgeGap을 생성**한다 (§3.10).

#### kind: tradeoff — 방법 선택

```json
{
  "label": "경질 수지 출력",
  "plain": "단단한 플라스틱으로 직접 뽑습니다. 튼튼하지만 무겁습니다.",
  "satisfies": { "mass_total": false, "protection": true },
  "cost": {
    "time_h": { "design": 2, "make": 6, "finish": 1 },
    "money_krw": 1800,
    "undo": { "kind": "remakeable", "cost_h": 6 },
    "learning": []
  },
  "expected_trouble": [
    { "what": "얇은 벽 휨으로 2차 출력", "likelihood": "high", "realistic_time_h": 12 }
  ]
}
```

`undo.kind`: `remakeable | repurchasable | irreversible`. 매몰비용의 실체는 여기다.

#### kind: part_pick — 부품 선택

**부품을 고르는 것도 결정이다.** 토크가 높은 액추에이터는 무겁고 비싸다 — 그게 정확히 트레이드오프이므로 같은 카드 구조에 들어간다.

```json
{
  "kind": "part_pick",
  "title": "다리 관절 액추에이터",
  "requirement": { "category": "actuator", "must": [ { "target": "torque", "op": "gte", "value": 8, "unit": "kg·cm" } ] },
  "plain": "다리를 움직이는 모터를 고릅니다. '토크'는 회전하는 힘의 세기로, 8kg·cm이면 축에서 1cm 떨어진 지점에서 8kg을 들어올리는 힘입니다. 힘이 셀수록 무겁고 비쌉니다.",
  "comparison": {
    "columns": ["torque_kgcm", "mass_g", "i_stall_ma", "price_krw", "size_mm", "stock"],
    "highlight": ["torque_kgcm", "mass_g"]
  },
  "options": [
    {
      "part_key": "actuator-xxx",
      "label": "제품명",
      "plain": "가장 흔하게 쓰이는 표준 크기. 자료가 많아 막혔을 때 검색이 잘 됩니다.",
      "specs": { "torque_kgcm": 9.4, "mass_g": 55, "i_stall_ma": 1500, "price_krw": 8500 },
      "satisfies": { "torque": true, "mass_total": false },
      "cost": {
        "time_h": { "procure": 0.5 },
        "money_krw": 8500,
        "undo": { "kind": "repurchasable" },
        "learning": []
      },
      "why_recommended": "요구 토크를 18% 여유로 만족하면서 가격이 가장 낮음",
      "trade": "무게 예산을 6g 초과"
    }
  ]
}
```

**후보는 3~5개.** 그 이상은 사용자가 고르지 못한다.

**비교표 규칙** (1차 기준, 이후 개선 대상)

- 열은 `requirement.must`에 등장한 축 + 4축 비용 + 재고
- 정렬은 ① `hard` 제약 전부 만족 → ② 예산 초과 총량 오름차순 → ③ 가격 오름차순
- `hard` 제약을 못 지키는 후보도 **1개까지는 보여준다.** "조금 넘지만 다른 게 다 좋은" 경우가 실제로 많고, 그 초과분이 곧 다음 트레이드오프 카드가 된다
- 값이 `guess`/`unknown`인 칸은 회색 + 물음표. 비교 근거로 쓰지 않는다

### 3.8 Part — 부품 레코드와 PartScout

**앱은 부품 카탈로그를 갖고 출발하지 않는다. 라이브러리는 카탈로그가 아니라 캐시다.** 설계가 진행되며 필요해진 부품만 그때그때 획득하고, `scope: general`로 남아 다음 프로젝트에서 재사용된다.

```json
{
  "key": "actuator-xxx",
  "name": "제품명",
  "category": "compute | sensor | actuator | power | io | mechanical | fastener",
  "scope": "general",
  "fields": {
    "dims_mm":   { "value": { "x": 32, "y": 12, "z": 30 }, "confidence": "guess", "source": "vendor_page" },
    "mass_g":    { "value": 55, "confidence": "datasheet", "source": "ds p.2" },
    "v_in":      { "value": [4.8, 6.0], "confidence": "datasheet" },
    "i_stall_ma":{ "value": 1500, "confidence": "datasheet" }
  },
  "pins": { "value": [], "confidence": "unknown" },
  "model_3d": null,
  "sources": [ { "vendor": "...", "url": "...", "price_krw": 8500, "stock": true, "checked_at": "iso8601" } ]
}
```

필드마다 `confidence`와 `source`를 따로 갖는다. 같은 부품이라도 필드별 신뢰도가 다르기 때문이다.

#### PartScout — 추천과 획득

도메인 에이전트가 `part_needs`를 내면 PartScout가 실행된다.

1. **캐시 조회** — 기존 레코드 중 제약 만족하는 것
2. **웹 탐색** — 벤더 페이지·데이터시트에서 후보 발굴 및 파싱
3. **사용자 입력** — 보유 부품 등록, 또는 자동 취득 실패 시

결과는 `part_pick` 카드로 사용자에게 제시된다. **PartScout의 출력은 DB 레코드가 아니라 화면에 뜨는 비교표다.**

#### 필드별 취득 정책

전부 자동으로 뽑으면 3D가 조용히 거짓말을 한다.

| 필드 | 자동 취득 | 기본 confidence | 비고 |
|---|---|---|---|
| 전압·전류·전력·토크 | 가능 | `datasheet` | 데이터시트 표에서 안정적 |
| 가격·재고 | 가능 | `datasheet` | `checked_at` 필수 |
| 질량 | 부분 | `estimate` | 없으면 부피×밀도 추정 |
| 카테고리·명칭 | 가능 | `datasheet` | |
| **외형 치수** | 위험 | `guess` | 기계도면을 읽어야 정확 |
| **핀 좌표** | 사실상 불가 | `unknown` | 자동 취득 금지 |

#### 낮은 신뢰도의 전파 규칙

- `dims_mm`이 `guess` → 3D 간섭 검사에 **여유 +3mm 강제**, 뷰에서 점선 표시
- `pins`가 `unknown` → **3D 결선 표시 비활성화**, 결선 리스트는 모듈 단위까지만
- `hard` 제약이 `guess` 필드에 의존 → 해당 Decision은 잠기지 않고, "실물 계측 필요" 항목이 조립 단계 앞에 자동 삽입
- 사용자가 실물을 재서 입력 → `measured`로 승격, 의존하던 판정 전부 재계산

**`measured`는 `datasheet`보다 높다.** 손에 있는 물건이 최종 권위다.

### 3.9 Assembly

```json
{
  "step": 3,
  "title": "액추에이터 브래킷 고정",
  "parts_added": ["part:...#1", "part:bracket-a"],
  "camera": { "pos": [120, 90, 140], "target": [0, 30, 0] },
  "render_png": "renders/{project_id}/step-03.png",
  "photo_guide": { "angle": "정면 45도 위", "must_show": ["체결부 2개", "케이블 방향"] }
}
```

> `render_png`·`photo_guide`는 1차에서 쓰지 않는다. **3차(사진 기반 디버깅)의 정답지**라 지금 만들어 둔다.

### 3.10 KnowledgeGap — 4차 시드

```json
{
  "topic": "토크(kg·cm)가 무엇인가",
  "origin": "decision:HW-07.plain",
  "kind": "new_term | blocking_choice | empty_slot | repeated_question",
  "est_h": 0.3,
  "status": "open"
}
```

네 경로로 쌓인다: **카드 해설에 처음 등장한 용어**, 선택지가 요구하는 학습, 오래 비어 있는 스펙 칸, 대화에서 반복된 같은 질문.

---

## 4. 에이전트 구조

### 4.1 구성

```
Orchestrator (코드)
 ├─ ME  기구·재료·강성·무게·간섭
 ├─ HW  전자·전원·전류·발열
 ├─ SW  펌웨어·제어·통신·데이터
 ├─ ID  형태·사용성·마감
 ├─ PartScout (LLM + 검색 tool + 사용자 입력)
 ├─ RulePack (코드)
 ├─ ConflictDetector (코드)
 └─ CardWriter (LLM) — plain 해설 포함
```

### 4.2 도메인 에이전트의 계약

출력은 아래 형태만. 산문 금지.

```json
{
  "constraints": [ ],
  "allocations": [ ],
  "part_needs": [ { "category": "actuator", "must": [ { "target": "torque", "op": "gte", "value": 8, "unit": "kg·cm" } ], "context": "다리 관절" } ],
  "questions": [ { "slot": "form", "ask": "실내 전용인가, 낙하 가능성이 있나?" } ],
  "notes": "사용자에게 보여줄 한 문단"
}
```

도메인 에이전트는 **부품 이름을 지목하지 않고 요구 조건만 낸다.** 구체적인 제품을 찾아 보여주는 건 PartScout의 일이다. 이렇게 나눠야 프롬프트에 부품이 박히지 않으면서도 사용자는 실물을 본다.

### 4.3 호출 순서

```
사용자 발화
 → Orchestrator: 영향받는 slot 판정 (소형 모델)
 → 해당 도메인만 병렬 호출
 → constraints / allocations / part_needs 저장
 → PartScout: 미해결 part_needs → 후보 3~5개
 → RulePack + ConflictDetector 실행 (코드, 0원)
 → 충돌 있으면 CardWriter 호출 (plain 포함)
 → 없으면 다음 빈 slot 질문
```

### 4.4 모델 매핑

| 역할 | 1순위 | 폴백 |
|---|---|---|
| 도메인 판단 | Claude | GPT |
| 충돌 해석·카드 작성·plain 해설 | Claude | GPT |
| 3D 생성·CadQuery 코드 | GPT | Claude |
| 코드 구현 전반 | GPT (코덱스) | Claude |
| PartScout 파싱 | 소형 모델 | 1순위 |
| 슬롯 판정·요약·JSON 정리 | 소형 모델 | — |

```ts
interface ModelAdapter {
  call(role: Role, input: object, schema: JSONSchema): Promise<object>
}
```

매핑은 설정 파일. 한 벤더가 죽어도 매핑만 바꿔 계속 작업할 수 있어야 한다.

---

## 5. 지식 아키텍처 — 회로·부품 지식을 AI에 어떻게 주는가

### 5.1 L1 — 상시 컨텍스트 (매 호출, 얇게)

- 도메인 역할 정의와 출력 스키마
- 현재 프로젝트: 스펙 게이트 상태, 예산표 현황, 확정된 결정 요약(제목 + 선택만)
- 마지막 사용자 발화와 직전 2턴

목표 2~4천 토큰. **부품 데이터는 여기 들어가지 않는다.**

### 5.2 L2 — 조회 (tool call)

```
search_parts({ category, must: [...], nice: [...] })  → 캐시 우선, 부족하면 웹 탐색
get_part(key)                                         → 전체 필드
get_decision(code)                                    → 과거 결정 상세
get_budget(key)                                       → 예산 현황
measure_request(part_key, field)                      → 사용자에게 실물 계측 요청
```

AI는 부품을 **암기하지 않고 조회한다.** 부품 DB를 프롬프트에 붓는 방식은 확장되지 않고(수백 개만 돼도 안 들어감), 가격·재고는 어차피 실시간이라 넣을 의미가 없다.

### 5.3 L3 — 모델 내장 지식 (주지 않음)

옴의 법칙, 전압 분배, 풀업/풀다운, I2C·SPI·UART 기초, 액추에이터 돌입전류, 리튬셀 취급, 3D 출력 공차와 오버행. 모델이 이미 안다. 프롬프트에 넣을 이유가 없다.

**단, 이 층은 틀릴 수 있다.** 그래서 L4가 있다.

### 5.4 L4 — 룰팩 (코드, 결정론적)

LLM이 놓치거나 틀리는 것을 잡는 검사. 수십 개로 시작해 계속 쌓인다. **시간이 갈수록 이 앱의 진짜 자산이 되는 부분.**

| 규칙 | 판정 |
|---|---|
| 전압 불일치 | 부품 `v_in` 범위 ∩ 공급 전압 = ∅ |
| 전류 초과 | Σ `i_peak` > 공급 한계 |
| 논리 레벨 | 3.3V ↔ 5V 직결, 레벨 시프터 없음 |
| 버스 주소 충돌 | 동일 I2C 주소 2개 이상 |
| 핀 부족 | 요구 GPIO 수 > 가용 |
| 풀업 누락 | I2C 버스에 풀업 미지정 |
| 돌입전류 | 액추에이터 스톨 전류 합 > 전원 피크 |
| 예산 초과 | 무게·부피·비용·발열 (ConflictDetector와 공유) |

각 규칙은 위반 시 Conflict를 만들고, 그 Conflict가 카드가 된다.

### 5.5 계산은 전부 코드

합계, 여유, 예산 소진율, 토크 마진, 구동시간 추정. **LLM에게 산수를 시키지 않는다.** LLM은 계산 결과를 해석하고 설명만 한다.

하드웨어에서 조용히 틀린 숫자는 태운 부품으로 돌아온다. 이 원칙이 앱 신뢰도의 대부분이다.

---

## 6. 화면

1. **대화 + 스펙 게이트** — 좌측 대화, 우측 8칸 상태. `assumed`는 가정 내용 표시
2. **예산 대시보드** — 예산별 막대, 할당 합계 대 limit, confidence를 색 농도로
3. **결정 카드 큐** — `plain` 해설이 맨 위. 트레이드오프 카드는 선택지 비교, 부품 카드는 스펙 비교표
4. **부품 패널** — 획득된 부품과 필드별 신뢰도. `guess`·`unknown`에 "실물 계측" 버튼
5. **3D 뷰** — 부품 배치, 간섭 표시, 조립 스텝 재생
6. **내보내기** — 명세서(md), BOM(csv), 결선 리스트(txt), STL

---

## 7. 3D 사양

- **부품 형상을 생성하지 않는다.** 획득된 모델을 배치하고, 없으면 치수 기반 직육면체 프록시 + 프록시 표시
- 배치 상태는 `{ part_key, pos, rot }` JSON. 이 JSON이 상태다
- **간섭 검사**는 바운딩박스 교차 + §3.8 여유 규칙
- **커스텀 하우징**만 파라메트릭 생성. GPT가 CadQuery 코드를 짜고 앱이 격리 프로세스에서 실행
- **조립 애니메이션**은 부품별 등장 순서 + 카메라 각도. 물리 시뮬레이션 아님
- 매 스텝 렌더 PNG 저장

렌더러: three.js. 서버 측 스냅샷이 필요하면 headless Chromium.

---

## 8. 관측

- **LLM 호출 로그**: 역할, 모델, 프롬프트·응답 전문, 스키마 검증 결과, 토큰, 지연, 비용
- **상태 스냅샷**: 모든 변경을 append-only 이벤트로
- **씬 JSON 저장**: 3D가 이상할 때 모델 문제인지 렌더 문제인지 갈림
- **턴 리플레이**: 저장된 입력으로 한 턴을 다시 돌리는 CLI
- **부품 출처 추적**: 어떤 필드가 어디서 왔고 언제 확인됐는지
- **룰팩 히트 로그**: 어떤 규칙이 몇 번 걸렸는지. 규칙을 늘려야 할 곳이 보인다

---

## 9. 기술 스택 (제안)

- Next.js (App Router) + TypeScript
- SQLite (개발) → Postgres. 이벤트 테이블 + 뷰 테이블
- three.js / react-three-fiber
- Anthropic SDK, OpenAI SDK — 어댑터 뒤
- CadQuery는 별도 파이썬 워커 (컨테이너 격리)
- **에이전트 프레임워크를 쓰지 않는다.** 루프는 직접 짠다

---

## 10. 마일스톤

| M | 내용 | 완료 판정 |
|---|---|---|
| M0 | 스키마 + 이벤트 저장 + 로그 | 레코드 CRUD, 턴 리플레이 CLI 동작 |
| M1 | 대화 + 스펙 게이트 + ME 단일 에이전트 | 8칸 중 3칸 이상 채워짐 |
| M2 | 예산표 + ConflictDetector + 트레이드오프 카드 | 충돌에서 카드가 자동 생성, `plain` 해설 포함 |
| M3 | PartScout + 부품 선택 카드 | 요구 조건에서 실제 후보 3~5개와 비교표가 뜸 |
| M4 | 4개 도메인 + 룰팩 + 라우팅·폴백 | 룰팩 위반이 카드로 변환, 한 벤더 차단에도 턴 완주 |
| M5 | 3D 배치·간섭 + 조립 스텝 + 내보내기 | BOM csv와 STL 출력, 스텝 PNG 저장 |

**M2와 M3가 이 제품의 증명이다.** M2는 "대가를 보여준다", M3는 "뭘 사야 할지 보여준다". 둘 중 하나라도 안 되면 나머지는 의미 없다.

---

## 11. 1차 완료 검증 기준

로봇 하나를 백지에서 끝까지 설계해 실제로 만들 수 있으면 1차 완료다.

1. 빈 DB에서 시작해 스펙 8칸이 모두 `filled` 또는 명시적 `assumed`가 된다
2. 충돌이 **5건 이상 자동 감지**된다 (손으로 입력한 것 제외)
3. 결정 카드가 **20장 이상** 쌓이고, 4축 비용과 `plain` 해설이 모두 채워져 있다
4. 부품 선택 카드에서 **실제 구매 가능한 후보 3~5개와 비교표**가 제시된다
5. BOM의 모든 항목에 구매 링크와 `checked_at`이 붙는다. **구할 수 없는 부품이 섞이면 실패**
6. `guess` 치수 부품이 3D에서 점선으로 표시되고 간섭 여유가 적용된다
7. 조립 스텝이 10단계 이상 렌더되고 각 스텝 PNG가 저장된다
8. 아무 턴이나 골라 리플레이 CLI로 재현된다
9. **그 BOM과 조립 순서대로 실제 로봇이 조립되어 동작한다** ← 최종 판정

9번이 진짜 기준이다. 나머지 여덟 개는 9번으로 가는 길에 확인하는 것들이다.

---

## 12. 1차 이후로 미룬 것

| 항목 | 미룬 이유 |
|---|---|
| 두 번째 종류 기기로 범용성 검증 | 로봇 하나로도 주요 기능 확인은 된다. 원칙 7은 코드 리뷰로 지킨다 |
| 부품 비교 알고리즘 고도화 | 1차는 §3.7의 단순 정렬 규칙으로 충분 |
| 부품 대체품 자동 제안 (단종·품절 시) | 데이터가 쌓인 뒤 |
| 회로도 생성, PCB | 결선 리스트로 먼저 검증 |

---

## 13. 열린 질문

- 결선 리스트를 핀 대 핀까지 뽑을 것인가 — 핀 좌표가 `unknown`인 동안은 자동으로 모듈 단위가 된다
- `assumed` 슬롯을 AI가 몇 개까지 동시에 세울 수 있게 할 것인가
- 카드를 `deferred`로 미룰 때 예산 계산에 어떤 값을 넣을 것인가
- 부품 3D 모델이 없을 때 직육면체 프록시로 충분한가
- `plain` 해설의 기준 독자를 어디에 맞출 것인가 — 너무 쉬우면 지겹고 너무 어려우면 무용지물
