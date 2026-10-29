# 바이브 포저 — 1차 개발 명세서 v0.1

작성일 2026-09-15 · 1 dyne · 검증 대상 프로젝트: 로봇 모(백지 상태에서 시작)

---

## 0. 한 줄 정의

하드웨어 아이디어를 넣으면, 확정에 필요한 스펙 칸을 대화로 채워가고, 도메인별 AI 에이전트가 낸 제약들 사이의 충돌을 자동으로 찾아내, **각 결정마다 트레이드오프와 예상 매몰비용을 카드로 제시하는** 개인용 설계 웹앱.

3D는 결정된 것을 보여주는 화면이지 제품의 본체가 아니다. 본체는 **결정과 그 대가**다.

---

## 1. 설계 원칙

이 여섯 개가 흔들리면 다른 제품이 된다.

1. **생성이 아니라 판단이 가치다.** 형상을 만들어내는 능력은 범용 모델이 계속 가져간다. 이 앱이 파는 건 "그 선택을 하면 무엇을 잃는가"다.
2. **대화는 휘발, 상태는 영구.** 확정된 것은 채팅 로그가 아니라 구조화된 레코드로 남는다. 에이전트 호출 시에는 전체 히스토리가 아니라 그 레코드의 필요한 조각만 넣는다.
3. **충돌은 손으로 적지 않고 예산에서 도출한다.** 트레이드오프를 케이스별로 미리 열거하는 건 불가능하다. 도메인이 숫자 제약을 내면 충돌은 코드가 찾는다.
4. **모든 선택지에는 네 축의 대가가 붙는다.** 시간 / 돈 / 되돌리기 비용 / 학습 비용. 넷 중 하나라도 비면 그건 아직 선택지가 아니다.
5. **개인 맥락과 일반 지식은 처음부터 분리한다.** 기능은 1인용으로 만들되 스키마에서만 나눠 둔다. 나중에 공개할 때 데이터 이관 비용을 0으로 만들기 위해서다.
6. **관측 가능하게 만든다.** 결과가 이상할 때 프롬프트 문제인지 상태 문제인지 렌더 문제인지 구분할 수 있어야 한다. 이건 기능이 아니라 디버깅의 전제조건이다.

---

## 2. 범위

### 1차에 포함

- 아이디어 대화 → 스펙 게이트 충족 판정
- HW / SW / ME / ID 네 도메인 에이전트와 핸드오프
- 예산표 기반 충돌 자동 감지
- 결정 카드 생성 (트레이드오프 + 4축 매몰비용)
- 부품 라이브러리 (모 설계에 필요한 범위, 20~30개로 시작)
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

---

## 3. 데이터 모델

이 앱에서 제일 중요한 부분이다. 여기가 틀리면 나머지가 다 틀어진다.

### 3.1 공통 규칙

모든 레코드에 다음을 둔다.

```json
{
  "id": "uuid",
  "project_id": "uuid",
  "scope": "personal | general",
  "created_at": "iso8601",
  "created_by": "user | agent:ME | agent:HW | agent:SW | agent:ID | system",
  "source": { "model": "claude-opus-5", "call_id": "uuid" }
}
```

- `scope: personal` — 다인의 장비, 예산, 숙련도, 보유 부품, 작업 환경에 의존하는 것
- `scope: general` — 누가 써도 성립하는 것 (부품 스펙, 재료 물성, 일반 트레이드오프)

**공개 시점에 general만 남기면 그대로 공용 DB가 된다.** 이 한 필드가 6번 원칙의 전부다.

### 3.2 Project

```json
{
  "name": "모",
  "one_liner": "부엉이형 이족보행 반려 로봇",
  "stage": "idea | spec | blueprint | build",
  "spec_gate": { /* 3.3 */ },
  "budgets": [ /* 3.4 */ ]
}
```

`stage`가 `spec → blueprint`로 넘어가는 순간이 청사진 전환 지점이다. 조건은 3.3의 모든 칸이 `filled`.

### 3.3 SpecGate — 스펙 칸

대화 단계에서 채워야 하는 칸. AI가 속으로 판단하지 말고 **UI에 그대로 노출한다.**

```json
{
  "slots": [
    { "key": "power",      "label": "전원",        "status": "empty | assumed | filled",
      "value": null, "unlocks": ["배터리", "레귤레이터", "충전회로"] },
    { "key": "wireless",   "label": "무선 필요 여부", "unlocks": ["MCU 계열 전체"] },
    { "key": "sensing",    "label": "감지 대상과 정밀도", "unlocks": ["센서"] },
    { "key": "actuation",  "label": "움직임·표시",   "unlocks": ["액추에이터", "전류 예산"] },
    { "key": "data_sink",  "label": "데이터 행선지", "unlocks": ["통신", "저장"] },
    { "key": "form",       "label": "폼팩터·환경 제약", "unlocks": ["하우징", "재료"] },
    { "key": "runtime",    "label": "구동 시간",     "unlocks": ["배터리 용량", "절전 설계"] },
    { "key": "fab",        "label": "제작 방식",     "unlocks": ["조립 단계 전체"] }
  ]
}
```

세 가지 상태를 쓴다.

- `empty` — 아직 모름
- `assumed` — **AI가 가정을 세워 채움.** 반드시 가정 내용을 표시하고 언제든 뒤집을 수 있게 한다. 백지에서 시작할 때 대화가 멈추지 않게 하는 장치다.
- `filled` — 사용자가 확정

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
    { "owner": "ME:housing",  "value": 220, "confidence": "estimate" },
    { "owner": "HW:servo_x6", "value": 330, "confidence": "datasheet" },
    { "owner": "HW:battery",  "value": 180, "confidence": "datasheet" }
  ]
}
```

1차 필수 예산 키:

| key | 단위 | 주 소유 도메인 |
|---|---|---|
| `mass_total` | g | ME |
| `current_peak` / `current_avg` | mA | HW |
| `volume_envelope` | mm (bbox) | ME |
| `cost_total` | 원 | 전체 |
| `thermal_dissipation` | W | HW |
| `torque_margin` | kg·cm | ME↔HW 공동 |
| `build_hours` | h | 전체 |

`confidence`는 `datasheet | estimate | guess` 세 단계. **guess가 하나라도 섞인 예산으로는 카드를 확정 처리하지 않는다.**

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

`hard`는 어기면 물건이 안 되는 것, `soft`는 어기면 품질이 떨어지는 것. 충돌 판정에서 다르게 다룬다.

### 3.6 Conflict — 충돌

**LLM이 아니라 코드가 만든다.** 이게 이 앱의 핵심 로직이다.

판정 규칙:

1. 같은 `target`에 대해 `hard` 제약들의 교집합이 공집합 → 충돌
2. `allocations` 합계 > `limit` → 충돌
3. `hard` 제약을 만족하는 부품이 라이브러리에 0개 → 충돌
4. `soft` 제약 위반 → 충돌 아님, 경고

```json
{
  "target": "mass_total",
  "constraints": ["constraint:ME-07", "constraint:HW-03"],
  "gap": { "required": 52, "allowed": 40, "unit": "g" },
  "severity": "blocking | warning"
}
```

충돌이 생기면 곧바로 Decision을 만든다. **충돌 없이 생성되는 Decision은 없다.**

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
      "label": "PLA 출력",
      "satisfies": { "mass_total": false, "protection": true },
      "cost": {
        "time_h": { "design": 2, "make": 6, "finish": 1 },
        "money_krw": 1800,
        "undo": { "kind": "reprintable", "cost_h": 6, "note": "재출력 가능" },
        "learning": []
      },
      "expected_trouble": [
        { "what": "얇은 벽 휨으로 2차 출력", "likelihood": "high",
          "realistic_time_h": 12 }
      ]
    },
    {
      "label": "연질 PP 출력",
      "cost": {
        "time_h": { "design": 2, "make": 8, "finish": 1 },
        "money_krw": 3000,
        "undo": { "kind": "reprintable", "cost_h": 8 },
        "learning": [{ "topic": "유연 필라멘트 프린터 세팅", "est_h": 3 }]
      }
    },
    {
      "label": "기성 케이스 활용",
      "cost": {
        "time_h": { "search": 1, "mod": 2 },
        "money_krw": 8000,
        "undo": { "kind": "irreversible",
                  "note": "치수 불일치 시 케이스 폐기" },
        "learning": []
      },
      "expected_trouble": [
        { "what": "커넥터 개구부 직접 가공", "likelihood": "certain" }
      ]
    }
  ]
}
```

`cost.learning`이 비어있지 않은 옵션은 **KnowledgeGap 레코드를 자동 생성**한다. 1차에서는 UI에 표시만 하고, 4차에서 Moons로 넘긴다.

`undo.kind`는 `reprintable | repurchasable | irreversible` 세 가지. 매몰비용의 실체는 사실 여기다.

### 3.8 Part — 부품 라이브러리

```json
{
  "sku": "esp32-s3-devkitc-1",
  "name": "ESP32-S3-DevKitC-1",
  "category": "mcu",
  "scope": "general",
  "dims_mm": { "x": 63, "y": 25.5, "z": 12 },
  "mass_g": 9.5,
  "electrical": { "v_in": [3.3, 5.5], "i_avg_ma": 80, "i_peak_ma": 350 },
  "pins": [ { "id": "GPIO13", "pos_mm": [4.2, 18.0, 1.6], "caps": ["adc","pwm"] } ],
  "model_3d": "parts/esp32-s3-devkitc.glb",
  "sources": [
    { "vendor": "디바이스마트", "url": "...", "price_krw": 12000, "stock": true }
  ]
}
```

**모 설계에 필요한 최소 세트 (초기 구축 목록)**

- MCU 3~4 (ESP32-S3 계열, RP2040, 보조 MCU 1)
- 서보 4~6 (마이크로/표준/고토크, 금속기어 포함)
- IMU 2 (6축/9축)
- 배터리·전원 5 (리포 셀, 홀더, BMS, 벅컨버터, USB-C PD 보드)
- 오디오 3 (스피커, 앰프, 마이크)
- 입출력 4 (LED, 터치, 거리센서, 소형 디스플레이)
- 기구 부속 5 (베어링, 나사 규격, 힌지, 자석, 케이블)

약 26개. 여기까지면 모 설계는 돌아간다.

### 3.9 Assembly — 조립 스텝

```json
{
  "step": 3,
  "title": "서보 브래킷 고정",
  "parts_added": ["servo-mg90s#1", "bracket-a"],
  "connections": [],
  "camera": { "pos": [120, 90, 140], "target": [0, 30, 0] },
  "render_png": "renders/mo/step-03.png",
  "photo_guide": {
    "angle": "정면 45도 위",
    "must_show": ["브래킷 나사 2개", "서보 케이블 방향"]
  }
}
```

> `render_png`와 `photo_guide`는 1차에서 쓰지 않는다. **3차(사진 기반 디버깅)의 정답지가 될 데이터라 지금 만들어 두는 것이다.** 이걸 빼면 3차에서 조립 단계 렌더를 처음부터 다시 만들어야 한다.

### 3.10 KnowledgeGap — 4차 시드

```json
{
  "topic": "유연 필라멘트 프린터 세팅",
  "origin": "option:ME-04-B",
  "kind": "blocking_choice | empty_slot | repeated_question",
  "est_h": 3,
  "status": "open"
}
```

세 가지 경로로 쌓인다: 선택지가 요구하는 학습, 오래 비어 있는 스펙 칸, 대화에서 반복된 같은 질문.

---

## 4. 에이전트 구조

### 4.1 구성

```
Orchestrator (코드)
 ├─ ME  기구·재료·강성·무게·간섭
 ├─ HW  전자·전원·전류·발열·부품 선정
 ├─ SW  펌웨어·제어·통신·데이터
 ├─ ID  형태·사용성·마감·브랜드 일관성
 ├─ ConflictDetector (코드, LLM 아님)
 └─ CardWriter (LLM)
```

### 4.2 각 도메인 에이전트의 계약

입력: `Project.spec_gate` + 자기 도메인 관련 `Budget`·`Constraint`·`Decision(decided)` + 마지막 사용자 발화
출력: **반드시 아래 형태만.** 산문 금지.

```json
{
  "constraints": [ /* 3.5 */ ],
  "allocations": [ { "budget_key": "mass_total", "owner": "ME:housing", "value": 220, "confidence": "estimate" } ],
  "questions": [ { "slot": "form", "ask": "실내 전용인가, 바닥 낙하 가능성이 있나?" } ],
  "notes": "사용자에게 보여줄 한 문단"
}
```

출력 스키마는 각 모델의 structured output / tool use로 강제한다. 파싱 실패 시 1회 재시도 후 실패 로그.

### 4.3 호출 순서

한 턴에 네 에이전트를 전부 돌리지 않는다. **스펙 칸이 바뀐 도메인만 돌린다.**

```
사용자 발화
 → Orchestrator: 어떤 slot이 영향받는가 판정 (소형 모델)
 → 영향받는 도메인만 병렬 호출
 → allocations/constraints 저장
 → ConflictDetector 실행 (코드, 0원)
 → 충돌 있으면 CardWriter 호출
 → 없으면 다음 빈 slot 질문
```

전부 돌리면 턴당 8회가 되지만 이 방식이면 평균 2~3회다.

### 4.4 모델 매핑

| 역할 | 1순위 | 폴백 |
|---|---|---|
| 도메인 판단 (ME/HW/SW/ID) | Claude | GPT |
| 충돌 해석·카드 작성 | Claude | GPT |
| 3D 생성·CadQuery 코드 | GPT | Claude |
| 코드 구현 전반 | GPT (코덱스) | Claude |
| 슬롯 판정·요약·JSON 정리 | 소형 모델 | — |

**모델은 어댑터 뒤에 둔다.**

```ts
interface ModelAdapter {
  call(role: Role, input: object, schema: JSONSchema): Promise<object>
}
```

역할별 모델 매핑은 설정 파일에 두고 코드에 박지 않는다. 한 벤더가 죽어도 매핑만 바꿔 계속 작업할 수 있어야 한다 — 멀티 에이전트를 쓰는 이유 중 하나가 이거다.

---

## 5. 화면

1. **대화 + 스펙 게이트** — 좌측 대화, 우측에 8칸 상태(`empty`/`assumed`/`filled`). `assumed`는 가정 내용을 접힌 상태로 표시.
2. **예산 대시보드** — 예산별 막대. 할당 합계와 limit, 초과 시 빨강. confidence를 색 농도로.
3. **결정 카드 큐** — open 카드 목록. 각 카드에 선택지와 4축 비용, 예상 시행착오. 선택하면 `decided`로 잠기고 그 결과가 Constraint로 되돌아감.
4. **3D 뷰** — 부품 배치, 간섭 표시, 조립 스텝 재생 슬라이더.
5. **내보내기** — 명세서(md), BOM(csv), 결선 리스트(txt), STL.

---

## 6. 3D 사양

- **부품은 생성하지 않는다.** 라이브러리의 `.glb`를 배치한다. 배치는 `{ sku, pos, rot }` JSON이고, 이 JSON이 곧 상태다.
- **간섭 검사**는 바운딩박스 교차로 시작. 정밀 메쉬 충돌은 1차 범위 밖.
- **커스텀 하우징**만 파라메트릭 생성. 부품 치수를 알고 있으므로 개구부·보스 위치는 계산 가능. GPT에게 CadQuery 파이썬 코드를 짜게 하고, 앱이 실행해 STL과 미리보기를 만든다. 실행은 반드시 격리된 프로세스에서.
- **조립 애니메이션**은 부품별 등장 순서 + 카메라 각도. 물리 시뮬레이션 아님.
- 매 스텝 렌더 PNG를 저장한다 (3.9 참조).

렌더러: three.js. 서버 측 스냅샷이 필요하면 headless Chromium.

---

## 7. 관측 (Observability)

"만들고 나서 안 되는 걸 디버깅한다"를 성립시키는 최소 장치. 기능보다 먼저 깐다.

- **LLM 호출 로그**: 역할, 모델, 프롬프트 전문, 응답 전문, 스키마 검증 결과, 토큰, 지연, 비용
- **상태 스냅샷**: 모든 레코드 변경을 append-only 이벤트로. 어느 시점으로든 되돌려 재현 가능
- **씬 JSON 저장**: 3D가 이상할 때 배치 JSON만 보면 모델 문제인지 렌더 문제인지 바로 갈림
- **턴 리플레이**: 저장된 입력으로 한 턴을 다시 돌리는 CLI

이 넷이 있으면 "결과가 이상하다"에서 원인까지 대개 한 번에 간다.

---

## 8. 기술 스택 (제안)

- Next.js (App Router) + TypeScript
- SQLite (개발) → Postgres (필요 시). 이벤트 테이블 + 뷰 테이블
- three.js / react-three-fiber
- Anthropic SDK, OpenAI SDK — 어댑터 뒤
- CadQuery는 별도 파이썬 워커 (컨테이너 격리)
- **에이전트 프레임워크는 쓰지 않는다.** 루프는 직접 짠다. LangChain류는 이 구조에서 디버깅 비용이 이득보다 크다.

---

## 9. 마일스톤

| M | 내용 | 완료 판정 |
|---|---|---|
| M0 | 스키마 + 이벤트 저장 + 로그 | 레코드 CRUD, 턴 리플레이 CLI 동작 |
| M1 | 대화 + 스펙 게이트 + ME 단일 에이전트 | 모 아이디어로 8칸 중 3칸 이상 `filled` |
| M2 | 예산표 + ConflictDetector + 카드 1종 | 하우징 재료 카드가 충돌에서 자동 생성 |
| M3 | 4개 도메인 + 라우팅 + 폴백 | 한 벤더 차단 상태에서도 턴 완주 |
| M4 | 부품 라이브러리 26개 + 3D 배치·간섭 | 모 부품 배치가 화면에 뜨고 간섭 1건 이상 검출 |
| M5 | 조립 스텝 + 렌더 저장 + 내보내기 | BOM csv와 STL이 나옴 |

M2까지가 이 제품의 증명이다. M2가 안 되면 나머지는 의미 없다.

---

## 10. 1차 완료 검증 기준

모를 백지에서 넣고 돌렸을 때:

1. 스펙 8칸이 모두 `filled` 또는 명시적 `assumed`로 채워진다
2. 충돌이 **5건 이상 자동 감지**된다 (손으로 입력한 것 제외)
3. 결정 카드가 **20장 이상** 쌓이고, 각 카드의 4축 비용이 모두 채워져 있다
4. BOM의 모든 부품에 실제 구매 링크와 재고 상태가 붙는다
5. 조립 스텝이 10단계 이상 렌더되고 각 스텝 PNG가 저장된다
6. 아무 턴이나 골라 리플레이 CLI로 재현된다

4번이 특히 중요하다. **구할 수 없는 부품이 섞인 BOM은 실패다.**

---

## 11. 2·3·4차를 위해 1차에서 반드시 깔아둘 것

이걸 빼면 나중에 두 배로 든다.

| 차수 | 1차에서 깔 것 |
|---|---|
| 2차 (웹 내 에이전트 구현) | 어댑터 인터페이스, 이벤트 저장, 턴 리플레이 |
| 3차 (사진 디버깅) | 조립 스텝 렌더 PNG + `photo_guide` |
| 4차 (학습 체계) | KnowledgeGap 레코드, 스펙 칸 상태 변화 이력 |
| 공개 | 모든 레코드의 `scope` 필드 |

---

## 12. 열린 질문

- 결선 리스트를 어느 수준까지 뽑을 것인가 — 핀 대 핀까지인가, 모듈 대 모듈까지인가
- `assumed` 슬롯을 AI가 몇 개까지 동시에 세울 수 있게 할 것인가 (너무 많으면 사용자가 검토를 포기한다)
- 카드를 `deferred`로 미룰 때 예산 계산에 어떤 값을 넣을 것인가
- 부품 라이브러리 초기 26개를 손으로 채울 것인가, 데이터시트에서 뽑게 할 것인가
