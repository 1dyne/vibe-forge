# Vibe Forge — 1차 개발 명세서 v0.2

작성일 2026-09-15 · 1 dyne
v0.1 대비 변경: 부품 라이브러리를 사전 구축 카탈로그에서 런타임 획득 캐시로 전환, 원칙 7 추가, 검증 기준에서 프로젝트 의존 제거

---

## 0. 한 줄 정의

하드웨어 아이디어를 넣으면, 확정에 필요한 스펙 칸을 대화로 채워가고, 도메인별 AI 에이전트가 낸 제약들 사이의 충돌을 자동으로 찾아내, **각 결정마다 트레이드오프와 예상 매몰비용을 카드로 제시하는** 설계 웹앱.

3D는 결정된 것을 보여주는 화면이지 제품의 본체가 아니다. 본체는 **결정과 그 대가**다.

---

## 1. 설계 원칙

이 일곱 개가 흔들리면 다른 제품이 된다.

1. **생성이 아니라 판단이 가치다.** 형상을 만들어내는 능력은 범용 모델이 계속 가져간다. 이 앱이 파는 건 "그 선택을 하면 무엇을 잃는가"다.
2. **대화는 휘발, 상태는 영구.** 확정된 것은 채팅 로그가 아니라 구조화된 레코드로 남는다. 에이전트 호출 시에는 전체 히스토리가 아니라 그 레코드의 필요한 조각만 넣는다.
3. **충돌은 손으로 적지 않고 예산에서 도출한다.** 트레이드오프를 케이스별로 미리 열거하는 건 불가능하다. 도메인이 숫자 제약을 내면 충돌은 코드가 찾는다.
4. **모든 선택지에는 네 축의 대가가 붙는다.** 시간 / 돈 / 되돌리기 비용 / 학습 비용. 넷 중 하나라도 비면 그건 아직 선택지가 아니다.
5. **개인 맥락과 일반 지식은 처음부터 분리한다.** 기능은 1인용으로 만들되 스키마에서만 나눠 둔다. 나중에 공개할 때 데이터 이관 비용을 0으로 만들기 위해서다.
6. **관측 가능하게 만든다.** 결과가 이상할 때 프롬프트 문제인지 상태 문제인지 렌더 문제인지 구분할 수 있어야 한다. 기능이 아니라 디버깅의 전제조건이다.
7. **앱은 특정 프로젝트를 모른다.** 어떤 종류의 기기를 만드는지, 어떤 부품을 쓰는지에 대한 지식을 미리 심지 않는다. 프로젝트 지식은 전부 런타임에 획득된다. 앱에 미리 들어가는 것은 *구조*(스키마, 판정 규칙, 에이전트 계약)뿐이다.

> 원칙 7의 시험: 앱을 받은 사람이 로봇이 아니라 온실 자동관수기를 만들려 해도 똑같이 작동해야 한다. 코드나 시드 데이터 어디에도 "이족보행", "서보", "부엉이"가 나타나서는 안 된다.

---

## 2. 범위

### 1차에 포함

- 아이디어 대화 → 스펙 게이트 충족 판정
- HW / SW / ME / ID 네 도메인 에이전트와 핸드오프
- 예산표 기반 충돌 자동 감지
- 결정 카드 생성 (트레이드오프 + 4축 매몰비용)
- **PartResolver** — 런타임 부품 획득과 캐시
- 3D 뷰 — 부품 배치 + 조립 스텝 재생
- 커스텀 하우징 파라메트릭 생성 (CadQuery 코드 생성 → STL)
- 명세서 / BOM 내보내기
- LLM 호출·상태 변경 전체 로그

### 1차에서 제외

- 멀티유저, 인증, 과금
- 회로도(schematic) 자동 생성 — 1차는 결선 리스트(netlist) 텍스트까지만
- PCB 레이아웃 / Gerber
- 사진 기반 디버깅 (3차)
- 학습 제안 UI (4차) — 단, 데이터는 1차부터 적재
- 커뮤니티
- **부품 카탈로그 사전 구축** — 원칙 7에 따라 명시적으로 제외

---

## 3. 데이터 모델

### 3.1 공통 규칙

모든 레코드에 다음을 둔다.

```json
{
  "id": "uuid",
  "project_id": "uuid | null",
  "scope": "personal | general",
  "created_at": "iso8601",
  "created_by": "user | agent:ME | agent:HW | agent:SW | agent:ID | resolver | system",
  "source": { "model": "claude-opus-5", "call_id": "uuid" }
}
```

- `scope: personal` — 사용자의 장비, 예산, 숙련도, 보유 부품, 작업 환경에 의존하는 것
- `scope: general` — 누가 써도 성립하는 것 (부품 스펙, 재료 물성, 일반 트레이드오프)

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

`stage`가 `spec → blueprint`로 넘어가는 순간이 청사진 전환 지점이다. 조건은 3.3의 모든 칸이 `filled` 또는 명시적 `assumed`.

### 3.3 SpecGate — 스펙 칸

대화 단계에서 채워야 하는 칸. AI가 속으로 판단하지 말고 **UI에 그대로 노출한다.**

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

각 슬롯 상태는 세 단계.

- `empty` — 아직 모름
- `assumed` — **AI가 가정을 세워 채움.** 가정 내용을 항상 표시하고 언제든 뒤집을 수 있게 한다. 백지에서 시작할 때 대화가 멈추지 않게 하는 장치다.
- `filled` — 사용자가 확정

슬롯 이름에 특정 기기 종류를 암시하는 단어를 쓰지 않는다 (원칙 7). "액추에이터"는 서보일 수도 펌프일 수도 스피커일 수도 있다.

> 어떤 칸이 오래 `empty`로 남는지가 곧 사용자가 무엇을 모르는지다. 이 기록이 4차 개발의 입력값이므로 **상태 변화 이력을 남긴다.**

### 3.4 Budget — 예산 항목

핸드오프의 실체. 자유 텍스트가 아니라 이 테이블이 도메인 사이를 오간다.

```json
{
  "key": "mass_total",
  "label": "총 중량",
  "unit": "g",
  "limit": 900,
  "limit_source": "decision:HW-01",
  "allocations": [
    { "owner": "ME:housing", "value": 220, "confidence": "estimate" },
    { "owner": "HW:actuators", "value": 330, "confidence": "datasheet" }
  ]
}
```

예산 키는 **프로젝트마다 다르게 생성된다.** 아래는 대부분의 기기에 공통으로 적용되는 기본 키이고, 도메인 에이전트가 필요하면 새 키를 만들 수 있다.

| key | 단위 | 주 소유 도메인 |
|---|---|---|
| `mass_total` | g | ME |
| `current_peak` / `current_avg` | mA | HW |
| `volume_envelope` | mm (bbox) | ME |
| `cost_total` | 원 | 전체 |
| `thermal_dissipation` | W | HW |
| `build_hours` | h | 전체 |

`confidence`는 `datasheet | estimate | guess` 세 단계. **guess가 섞인 예산으로는 결정을 `decided`로 잠그지 않는다.**

### 3.5 Constraint — 도메인이 내는 제약

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

`hard`는 어기면 물건이 안 되는 것, `soft`는 어기면 품질이 떨어지는 것.

### 3.6 Conflict — 충돌

**LLM이 아니라 코드가 만든다.** 이게 앱의 핵심 로직이다.

판정 규칙:

1. 같은 `target`에 대해 `hard` 제약들의 교집합이 공집합 → 충돌
2. `allocations` 합계 > `limit` → 충돌
3. `hard` 제약을 만족하는 부품 후보가 0개 → 충돌 (PartResolver 탐색 후 판정)
4. `soft` 제약 위반 → 충돌 아님, 경고

```json
{
  "target": "mass_total",
  "constraints": ["constraint:ME-07", "constraint:HW-03"],
  "gap": { "required": 52, "allowed": 40, "unit": "g" },
  "severity": "blocking | warning"
}
```

**충돌 없이 생성되는 Decision은 없다.**

### 3.7 Decision / Option — 결정 카드

```json
{
  "code": "ME-04",
  "title": "하우징 재료",
  "conflict_id": "uuid",
  "status": "open | decided | deferred",
  "chosen_option_id": null,
  "options": [
    {
      "label": "경질 수지 출력",
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
    },
    {
      "label": "연질 수지 출력",
      "cost": {
        "time_h": { "design": 2, "make": 8, "finish": 1 },
        "money_krw": 3000,
        "undo": { "kind": "remakeable", "cost_h": 8 },
        "learning": [{ "topic": "유연 소재 장비 세팅", "est_h": 3 }]
      }
    },
    {
      "label": "기성품 활용",
      "cost": {
        "time_h": { "search": 1, "mod": 2 },
        "money_krw": 8000,
        "undo": { "kind": "irreversible", "note": "치수 불일치 시 폐기" },
        "learning": []
      },
      "expected_trouble": [
        { "what": "개구부 직접 가공 필요", "likelihood": "certain" }
      ]
    }
  ]
}
```

`undo.kind`는 `remakeable | repurchasable | irreversible`. 매몰비용의 실체는 사실 여기다.

`cost.learning`이 비어있지 않은 옵션은 **KnowledgeGap 레코드를 자동 생성**한다. 1차에서는 표시만, 4차에서 Moons로 넘긴다.

### 3.8 Part — 부품 레코드와 획득 (v0.2 전면 개정)

**앱은 부품 카탈로그를 갖고 출발하지 않는다. 라이브러리는 카탈로그가 아니라 캐시다.**

빈 DB로 시작해서, 설계가 진행되며 필요해진 부품만 그때그때 획득한다. 첫 프로젝트가 끝나면 그 프로젝트가 쓴 만큼의 부품이 `scope: general`로 남아 다음 프로젝트에서 재사용된다.

#### 레코드

```json
{
  "key": "mcu-esp32s3-devkitc1",
  "name": "ESP32-S3-DevKitC-1",
  "category": "compute | sensor | actuator | power | io | mechanical | fastener",
  "scope": "general",
  "fields": {
    "dims_mm":    { "value": { "x": 63, "y": 25.5, "z": 12 }, "confidence": "guess",     "source": "vendor_page" },
    "mass_g":     { "value": 9.5,  "confidence": "estimate",  "source": "vendor_page" },
    "v_in":       { "value": [3.3, 5.5], "confidence": "datasheet", "source": "ds p.12" },
    "i_avg_ma":   { "value": 80,   "confidence": "datasheet",  "source": "ds p.14" },
    "i_peak_ma":  { "value": 350,  "confidence": "datasheet",  "source": "ds p.14" }
  },
  "pins": { "value": [], "confidence": "unknown" },
  "model_3d": null,
  "sources": [
    { "vendor": "...", "url": "...", "price_krw": 12000, "stock": true, "checked_at": "iso8601" }
  ]
}
```

필드마다 `confidence`와 `source`를 따로 갖는다. 부품 하나가 통째로 믿을 만한 게 아니라, **같은 부품이라도 필드마다 신뢰도가 다르기 때문**이다.

#### PartResolver — 획득 경로

제약이 부품을 요구하면 순서대로 시도한다.

1. **캐시 조회** — 기존 레코드 중 `hard` 제약을 만족하는 것
2. **자동 취득** — 벤더 페이지 / 데이터시트에서 파싱 (LLM + 검색 tool)
3. **사용자 입력** — 보유 부품 등록, 또는 자동 취득이 실패하거나 신뢰도가 부족할 때

#### 필드별 취득 정책

이게 이 섹션의 핵심이다. 전부 자동으로 뽑으면 3D가 조용히 거짓말을 한다.

| 필드 | 자동 취득 | 기본 confidence | 비고 |
|---|---|---|---|
| 전압·전류·전력 | 가능 | `datasheet` | 데이터시트 표에서 안정적으로 나옴 |
| 가격·재고 | 가능 | `datasheet` | 벤더 페이지, `checked_at` 필수 |
| 질량 | 부분 | `estimate` | 기재 없으면 부피×밀도 추정 |
| 카테고리·명칭 | 가능 | `datasheet` | |
| **외형 치수** | 위험 | `guess` | 기계도면을 읽어야 정확함 |
| **핀 좌표** | 사실상 불가 | `unknown` | 자동 취득 금지 |

#### 낮은 신뢰도의 전파 규칙

`guess` / `unknown`을 그냥 두면 하류가 전부 오염된다. 그래서:

- `dims_mm`이 `guess`면 → 3D 간섭 검사에 **여유 +3mm를 강제**하고, 뷰에 해당 부품을 점선으로 표시
- `pins`가 `unknown`이면 → **3D 결선 표시를 비활성화**하고, 결선 리스트는 모듈 단위까지만 출력
- 어떤 `hard` 제약이 `guess` 필드에 의존하면 → 그 Decision은 `decided`로 잠기지 않고, "실물 계측 필요" 항목이 조립 단계 앞에 자동 삽입
- 사용자가 실물을 재서 입력하면 `confidence: measured`로 승격되고, 해당 부품에 의존하던 판정이 전부 재계산

**`measured`는 `datasheet`보다 높다.** 손에 있는 물건이 최종 권위다.

### 3.9 Assembly — 조립 스텝

```json
{
  "step": 3,
  "title": "액추에이터 브래킷 고정",
  "parts_added": ["part:...#1", "part:bracket-a"],
  "connections": [],
  "camera": { "pos": [120, 90, 140], "target": [0, 30, 0] },
  "render_png": "renders/{project_id}/step-03.png",
  "photo_guide": { "angle": "정면 45도 위", "must_show": ["체결부 2개", "케이블 방향"] }
}
```

> `render_png`와 `photo_guide`는 1차에서 쓰지 않는다. **3차(사진 기반 디버깅)의 정답지가 될 데이터라 지금 만들어 두는 것이다.** 빼면 3차에서 조립 단계 렌더를 처음부터 다시 만들어야 한다.

### 3.10 KnowledgeGap — 4차 시드

```json
{
  "topic": "유연 소재 장비 세팅",
  "origin": "option:ME-04-B",
  "kind": "blocking_choice | empty_slot | repeated_question",
  "est_h": 3,
  "status": "open"
}
```

세 경로로 쌓인다: 선택지가 요구하는 학습, 오래 비어 있는 스펙 칸, 대화에서 반복된 같은 질문.

---

## 4. 에이전트 구조

### 4.1 구성

```
Orchestrator (코드)
 ├─ ME  기구·재료·강성·무게·간섭
 ├─ HW  전자·전원·전류·발열·부품 선정
 ├─ SW  펌웨어·제어·통신·데이터
 ├─ ID  형태·사용성·마감·브랜드 일관성
 ├─ PartResolver (LLM + 검색 tool + 사용자 입력)
 ├─ ConflictDetector (코드, LLM 아님)
 └─ CardWriter (LLM)
```

### 4.2 도메인 에이전트의 계약

입력: `spec_gate` + 자기 도메인 관련 `Budget`·`Constraint`·`Decision(decided)` + 마지막 사용자 발화
출력: **아래 형태만.** 산문 금지.

```json
{
  "constraints": [ ],
  "allocations": [ { "budget_key": "mass_total", "owner": "ME:housing", "value": 220, "confidence": "estimate" } ],
  "part_needs": [ { "category": "actuator", "must": [ { "target": "torque", "op": "gte", "value": 8, "unit": "kg·cm" } ] } ],
  "questions": [ { "slot": "form", "ask": "실내 전용인가, 낙하 가능성이 있나?" } ],
  "notes": "사용자에게 보여줄 한 문단"
}
```

`part_needs`가 PartResolver의 입력이다. 도메인 에이전트는 **부품 이름을 지목하지 않고 요구 조건만 낸다.** 특정 부품을 프롬프트에 박아두면 원칙 7이 깨진다.

출력 스키마는 structured output / tool use로 강제. 파싱 실패 시 1회 재시도 후 실패 로그.

### 4.3 호출 순서

한 턴에 네 에이전트를 전부 돌리지 않는다. **스펙 칸이 바뀐 도메인만 돌린다.**

```
사용자 발화
 → Orchestrator: 영향받는 slot 판정 (소형 모델)
 → 해당 도메인만 병렬 호출
 → constraints / allocations / part_needs 저장
 → PartResolver: 미해결 part_needs 처리
 → ConflictDetector 실행 (코드, 0원)
 → 충돌 있으면 CardWriter 호출
 → 없으면 다음 빈 slot 질문
```

전부 돌리면 턴당 8회 이상이지만 이 방식이면 평균 2~3회다.

### 4.4 모델 매핑

| 역할 | 1순위 | 폴백 |
|---|---|---|
| 도메인 판단 (ME/HW/SW/ID) | Claude | GPT |
| 충돌 해석·카드 작성 | Claude | GPT |
| 3D 생성·CadQuery 코드 | GPT | Claude |
| 코드 구현 전반 | GPT (코덱스) | Claude |
| PartResolver 파싱 | 소형 모델 | 1순위 모델 |
| 슬롯 판정·요약·JSON 정리 | 소형 모델 | — |

**모델은 어댑터 뒤에 둔다.**

```ts
interface ModelAdapter {
  call(role: Role, input: object, schema: JSONSchema): Promise<object>
}
```

역할별 매핑은 설정 파일. 한 벤더가 죽어도 매핑만 바꿔 계속 작업할 수 있어야 한다.

---

## 5. 화면

1. **대화 + 스펙 게이트** — 좌측 대화, 우측 8칸 상태. `assumed`는 가정 내용을 접힌 상태로 표시
2. **예산 대시보드** — 예산별 막대, 할당 합계 대 limit, confidence를 색 농도로
3. **결정 카드 큐** — open 카드, 선택지와 4축 비용, 예상 시행착오. 선택하면 `decided`로 잠기고 결과가 Constraint로 되돌아감
4. **부품 패널** — 획득된 부품과 각 필드의 신뢰도. `guess`·`unknown` 필드에 "실물 계측" 버튼
5. **3D 뷰** — 부품 배치, 간섭 표시, 조립 스텝 재생
6. **내보내기** — 명세서(md), BOM(csv), 결선 리스트(txt), STL

---

## 6. 3D 사양

- **부품 형상을 생성하지 않는다.** 획득된 부품의 모델을 배치한다. 3D 모델이 없으면 치수 기반 직육면체 프록시로 대체하고 프록시임을 표시
- 배치 상태는 `{ part_key, pos, rot }` JSON. 이 JSON이 상태다
- **간섭 검사**는 바운딩박스 교차 + 3.8의 여유 규칙. 정밀 메쉬 충돌은 1차 범위 밖
- **커스텀 하우징**만 파라메트릭 생성. GPT에게 CadQuery 파이썬 코드를 짜게 하고 앱이 격리 프로세스에서 실행해 STL과 미리보기 생성
- **조립 애니메이션**은 부품별 등장 순서 + 카메라 각도. 물리 시뮬레이션 아님
- 매 스텝 렌더 PNG 저장 (3.9 참조)

렌더러: three.js. 서버 측 스냅샷이 필요하면 headless Chromium.

---

## 7. 관측

"만들고 나서 안 되는 걸 디버깅한다"를 성립시키는 최소 장치. 기능보다 먼저 깐다.

- **LLM 호출 로그**: 역할, 모델, 프롬프트 전문, 응답 전문, 스키마 검증 결과, 토큰, 지연, 비용
- **상태 스냅샷**: 모든 레코드 변경을 append-only 이벤트로. 어느 시점으로든 재현 가능
- **씬 JSON 저장**: 3D가 이상할 때 배치 JSON만 보면 모델 문제인지 렌더 문제인지 갈림
- **턴 리플레이**: 저장된 입력으로 한 턴을 다시 돌리는 CLI
- **부품 출처 추적**: 어떤 필드가 어디서 왔고 언제 확인됐는지. BOM이 틀렸을 때 여기부터 본다

---

## 8. 기술 스택 (제안)

- Next.js (App Router) + TypeScript
- SQLite (개발) → Postgres. 이벤트 테이블 + 뷰 테이블
- three.js / react-three-fiber
- Anthropic SDK, OpenAI SDK — 어댑터 뒤
- CadQuery는 별도 파이썬 워커 (컨테이너 격리)
- **에이전트 프레임워크는 쓰지 않는다.** 루프는 직접 짠다

---

## 9. 마일스톤

| M | 내용 | 완료 판정 |
|---|---|---|
| M0 | 스키마 + 이벤트 저장 + 로그 | 레코드 CRUD, 턴 리플레이 CLI 동작 |
| M1 | 대화 + 스펙 게이트 + ME 단일 에이전트 | 임의 아이디어로 8칸 중 3칸 이상 채워짐 |
| M2 | 예산표 + ConflictDetector + 카드 | 충돌에서 카드가 자동 생성 |
| M3 | 4개 도메인 + 라우팅 + 폴백 | 한 벤더 차단 상태에서도 턴 완주 |
| M4 | PartResolver + 신뢰도 전파 | 빈 DB에서 시작해 부품이 획득되고, guess 필드가 하류에 규칙대로 전파 |
| M5 | 3D 배치·간섭 + 조립 스텝 + 내보내기 | BOM csv와 STL 출력, 스텝 PNG 저장 |

M2까지가 이 제품의 증명이다. M2가 안 되면 나머지는 의미 없다.

---

## 10. 1차 완료 검증 기준

**프로젝트 종류에 의존하지 않는 기준으로 쓴다.** 아래를 서로 다른 두 종류의 기기로 시험한다. 하나는 실제로 만들 것(로봇), 하나는 성격이 전혀 다른 것(예: 정지형 관수 장치)을 골라 원칙 7을 함께 검증한다.

1. 빈 DB에서 시작해 스펙 8칸이 모두 `filled` 또는 명시적 `assumed`가 된다
2. 충돌이 **5건 이상 자동 감지**된다 (손으로 입력한 것 제외)
3. 결정 카드가 **20장 이상** 쌓이고, 각 카드의 4축 비용이 모두 채워져 있다
4. BOM의 모든 항목에 실제 구매 링크와 `checked_at`이 붙는다. **구할 수 없는 부품이 섞이면 실패**
5. `guess` 치수를 가진 부품이 3D에서 점선으로 표시되고, 간섭 검사에 여유가 적용된다
6. 조립 스텝이 10단계 이상 렌더되고 각 스텝 PNG가 저장된다
7. 아무 턴이나 골라 리플레이 CLI로 재현된다
8. 두 번째 프로젝트를 시작했을 때, 첫 프로젝트가 획득한 부품이 캐시에서 재사용된다

---

## 11. 2·3·4차를 위해 1차에서 반드시 깔아둘 것

| 차수 | 1차에서 깔 것 |
|---|---|
| 2차 (웹 내 에이전트 구현) | 어댑터 인터페이스, 이벤트 저장, 턴 리플레이 |
| 3차 (사진 디버깅) | 조립 스텝 렌더 PNG + `photo_guide` |
| 4차 (학습 체계) | KnowledgeGap 레코드, 스펙 칸 상태 변화 이력 |
| 공개 | 모든 레코드의 `scope` 필드, `project_id: null` 자산 분리 |

---

## 12. 열린 질문

- 결선 리스트를 어느 수준까지 뽑을 것인가 — 핀 대 핀까지인가, 모듈 대 모듈까지인가 (핀 좌표가 `unknown`인 동안은 자동으로 모듈 단위가 된다)
- `assumed` 슬롯을 AI가 몇 개까지 동시에 세울 수 있게 할 것인가 — 너무 많으면 사용자가 검토를 포기한다
- 카드를 `deferred`로 미룰 때 예산 계산에 어떤 값을 넣을 것인가
- 부품 3D 모델이 없을 때 직육면체 프록시로 충분한가, 아니면 획득 시점에 생성을 시도할 것인가
- 두 번째 검증용 프로젝트를 무엇으로 할 것인가 (원칙 7 시험용)
