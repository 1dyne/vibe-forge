# Vibe Forge — 1차 개발 명세서 v0.4

작성 2026-09-15 · 1 dyne / 구현용 정리 2026-09-16

> **이 문서 하나만으로 구현할 수 있게 쓴 것이다.** v0.1~v0.3은 이력일 뿐 구현 기준이 아니다. 내용이 충돌하면 항상 이 문서가 이긴다. v0.3에서 무엇이 바뀌었는지는 부록 A에 있다.

---

## 0. 구현 담당 AI에게 — 이 문서를 읽고 일하는 법

### 0.1 읽는 순서

1. §1 한 줄 정의, §3 설계 원칙 — 제품이 무엇이고 무엇을 하면 안 되는지
2. §2 용어 — 이후 모든 절이 이 용어를 쓴다
3. §6 데이터 모델 — 가장 중요하다. 여기가 틀리면 나머지가 다 틀어진다
4. §7~§10 — 턴 처리, 충돌 감지, 룰팩, 부품 탐색
5. §17 마일스톤 — **실제 작업 순서**

### 0.2 우선순위

원칙(§3) > 데이터 모델(§6) > 처리 규칙(§7~§13) > 화면(§14) > 기술 스택(§16)

앞 순위와 부딪히면 앞 순위를 따르고, 부딪혔다는 사실을 기록한다(§0.4).

### 0.3 절대 하지 말 것

- LLM에게 합계·여유·비율·단위 변환을 시키는 것 (§3 원칙 8)
- 코드, 프롬프트, 시드 데이터에 특정 부품명·모델번호·기기 종류를 넣는 것 (§3 원칙 7)
- LangChain 같은 에이전트 프레임워크를 쓰는 것. 루프는 직접 짠다
- 서버리스 함수(요청당 수십 초 제한)를 전제로 설계하는 것. 턴 하나가 1분 이상 걸릴 수 있다 (§5)
- 앞 마일스톤의 완료 판정을 통과하기 전에 다음 마일스톤을 시작하는 것
- 이 문서에 정의되지 않은 필드를 레코드에 몰래 추가하는 것. 필요하면 §0.4에 따라 기록한다

### 0.4 모호할 때

- **아래에 해당하면 멈추고 사용자에게 묻는다.**
  - 원칙(§3)이나 데이터 모델(§6)을 바꿔야만 진행할 수 있을 때
  - 판매처 약관이나 robots.txt 때문에 부품 정보 수집이 막힐 때
  - 유료 서비스에 새로 가입하거나 비용이 생기는 선택이 필요할 때
  - 클라우드 업체, 도메인, 접근 비밀번호를 정해야 할 때
  - 검증 기준(§18)의 수치를 낮춰야 할 때
- **그 외에는 가장 단순한 쪽을 고르고 계속 진행한다.** 고른 내용은 저장소의 `docs/DECISIONS.md`에 `날짜 / 관련 절 / 결정 / 이유` 형식으로 한 줄씩 남긴다.

---

## 1. 한 줄 정의

하드웨어 아이디어를 넣으면 이렇게 동작하는 1인용 설계 웹앱이다.

1. 확정에 필요한 스펙 칸을 대화로 채운다.
2. 도메인별 AI 에이전트가 낸 제약들 사이의 충돌을 코드가 자동으로 찾는다.
3. **각 결정마다 실제 부품 후보, 트레이드오프, 예상 매몰비용을 카드로 제시한다.**

3D는 결정된 것을 보여주는 화면이지 제품의 본체가 아니다. 본체는 **결정과 그 대가**다.

---

## 2. 용어

| 용어 | 뜻 | 레코드 |
|---|---|---|
| 스펙 칸(슬롯) | 설계를 시작하려면 정해야 하는 8개 항목 (전원, 무선 여부 등) | `SpecSlot` |
| 예산 | 프로젝트 전체의 한도가 있는 수치 (총 중량, 피크 전류, 비용 등) | `Budget` |
| 할당 | 예산 중 한 도메인이나 부품이 차지하는 몫 | `Allocation` |
| 제약 | 도메인이 선언한 수치 조건 ("하우징 무게 ≤ 40g") | `Constraint` |
| 부품 요구 | 도메인이 "이런 조건의 부품이 필요하다"고 낸 것. 부품 이름은 들어가지 않는다 | `PartNeed` |
| 부품 | 실제 제품 하나의 스펙. 모든 프로젝트가 공유한다 | `Part` |
| 판매 정보 | 부품 하나를 파는 곳 하나 (가격, 링크, 재고) | `Offer` |
| 넷 | 전기적으로 연결된 핀·모듈의 묶음 | `Net` |
| 충돌 | 코드가 판정한 문제 | `Conflict` |
| 결정 카드 | 사용자가 골라야 하는 선택. `tradeoff`와 `part_pick` 두 종류 | `Decision` |
| 룰팩 | 전기·기구 규칙을 결정론적으로 검사하는 코드 모음 | 코드 모듈 |
| 신뢰도 | 값이 얼마나 믿을 만한지 (`measured > datasheet > estimate > guess > unknown`) | 필드 속성 |
| 계측 요청 | 사용자에게 실물을 재서 입력해 달라는 요청 | `MeasurementRequest` |
| 턴 | 사용자 입력 하나(대화 또는 UI 조작)와 그로 인한 처리 전체 | `Turn` |
| 인스턴스 | 부품이 설계에 실제로 쓰인 한 개. `<part_key>#<n>` 형식 | 문자열 |

---

## 3. 설계 원칙

이 여덟 개가 흔들리면 다른 제품이 된다.

1. **생성이 아니라 판단이 가치다.** 형상을 만드는 능력은 범용 모델이 계속 가져간다. 이 앱이 파는 건 "그 선택을 하면 무엇을 잃는가"다.

2. **대화는 휘발, 상태는 영구.** 확정된 것은 채팅 로그가 아니라 구조화된 레코드로 남는다. 에이전트를 호출할 때는 전체 대화 기록이 아니라 레코드에서 필요한 조각만 넣는다.

3. **충돌은 손으로 적지 않고 예산과 제약에서 코드가 도출한다.**
   - 트레이드오프 카드는 충돌에서만 생긴다.
   - **예외는 부품 선택 카드 하나다.** 부품 선택 카드는 충돌이 아니라 부품 요구(`PartNeed`)에서 생긴다.

4. **모든 선택지에는 네 축의 대가가 붙는다.** 시간 / 돈 / 되돌리기 비용 / 학습 비용.
   - 넷 중 하나라도 `null`이면 그건 아직 선택지가 아니다. 스키마 검증에서 실패로 처리한다.
   - "배울 것 없음"은 빈 배열 `[]`로 명시한다.

5. **개인 맥락과 일반 지식은 처음부터 분리한다.** 기능은 1인용으로 만들되 스키마에서만 나눠 둔다(§6.1 `scope`). 나중에 공개할 때 데이터 이관 비용을 0으로 만들기 위해서다.

6. **관측 가능하게 만든다.** 결과가 이상할 때 프롬프트 문제인지, 상태 문제인지, 렌더 문제인지 구분할 수 있어야 한다. 기능보다 먼저 깐다.

7. **부품 지식을 코드·프롬프트·시드 데이터에 박지 않는다.** 앱은 부품이 0개인 상태로 출발하고, 부품은 전부 실행 중에 획득한다.
   - 앱에 미리 들어가는 것은 *구조*뿐이다: 스키마, 필드 사전(§6.2), 룰팩 규칙, 에이전트 계약, 판매처 목록 설정.
   - **금지:** 앱 코드·프롬프트·시드 DB에 특정 부품이나 특정 기기 종류(예: "이족보행", 특정 모터 모델명)를 넣는 것.
   - **금지 아님, 오히려 필수:** 설계 중에 AI가 실제 부품을 찾아 사용자에게 구체적으로 보여주는 것. "토크 8kg·cm 이상인 액추에이터"만 말하면 사용자는 뭘 사야 할지 모른다.
   - **자동 검사:** 시드 데이터의 `Part`는 0건이어야 한다(테스트). 프롬프트 파일에서 모델번호처럼 생긴 토큰(`[A-Z]{2,}[0-9]{2,}` 등)을 찾는 린트를 CI에서 경고로 돌린다.

8. **숫자는 LLM이 아니라 코드가 계산한다.** 합계, 여유, 예산 소진율, 토크 마진, 구동시간 추정, 단위 변환이 모두 해당한다.
   - LLM은 추정값(예: "하우징은 대략 220g")을 낼 수는 있다. 그 값은 반드시 `confidence: estimate` 이하로 저장된다.
   - LLM은 계산 결과를 해석하고 설명만 한다.
   - 하드웨어에서 조용히 틀린 숫자는 태운 부품으로 돌아온다.

---

## 4. 범위

### 4.1 1차에 포함

- 아이디어 대화 → 스펙 칸 충족 판정
- HW / SW / ME / ID 네 도메인 에이전트
- 예산표 기반 충돌 자동 감지 + 룰팩 검사
- 결정 카드 — 트레이드오프 카드, 부품 선택 카드
- 부품 추천·비교·획득 (PartScout) — 국내 쇼핑몰과 네이버 쇼핑 중심
- 3D 뷰 — 부품 배치, 간섭 표시, 조립 스텝 재생
- 커스텀 하우징 파라메트릭 생성 (CadQuery → STL)
- 명세서(md) / BOM(csv) / 결선 리스트(txt) / STL 내보내기
- LLM 호출·외부 도구 호출·상태 변경 전체 로그, 턴 리플레이 CLI
- 서버 배포 + **단일 접근 비밀번호** (멀티유저 인증과는 별개, §5.3)

### 4.2 1차에서 제외

- 멀티유저, 계정 인증, 과금
- 회로도(schematic) 자동 생성 — 결선 리스트 텍스트까지만
- PCB 레이아웃 / Gerber
- 사진 기반 디버깅 (3차) — 데이터만 1차에 준비
- 학습 제안 UI (4차) — 데이터는 1차부터 적재
- 커뮤니티
- 부품 카탈로그 사전 구축
- 해외 판매처 (Digikey, Mouser, AliExpress 등)
- 정밀 메쉬 충돌 검사, 물리 시뮬레이션

---

## 5. 시스템 구성과 배포

### 5.1 프로세스 구성

```
[브라우저]
   │  HTTPS + 접근 비밀번호 세션 쿠키
   ▼
[web]  Next.js 서버 (상시 실행 컨테이너)
   │  - UI, API
   │  - 턴 요청을 jobs 테이블에 넣고 즉시 turn_id 반환
   │  - 진행 상황은 SSE로 브라우저에 스트리밍
   ▼
[postgres]  이벤트 · 현재 상태(projection) · jobs · 로그
   ▲
[worker]  Node 프로세스 (web과 같은 코드베이스)
   │  - jobs를 가져가 턴 파이프라인(§7.3) 실행
   │  - LLM 호출, 웹 검색, 페이지 수집
   │  - headless Chromium(Playwright)으로 조립 스텝 PNG 렌더
   ▼
[cadquery]  파이썬 워커 컨테이너 (격리, §12.5)
   ▼
[blob]  파일 저장소 — S3 호환 저장소 또는 서버 볼륨 (BlobStore 인터페이스 뒤)
```

### 5.2 배포 전제

- 클라우드 업체는 미정이다. 정해야 할 때 사용자에게 묻는다(§0.4).
- 구성은 **docker compose로 VM 한 대에 올릴 수 있어야 한다** (web, worker, cadquery, postgres). 특정 클라우드의 전용 서비스에 묶지 않는다.
- 로컬 개발도 같은 compose로 돌린다. DB는 개발·운영 모두 Postgres다.

### 5.3 접근 보호와 비용 보호

1차는 계정 인증이 없지만 서버에 공개되므로 아래는 필수다.

- **접근 비밀번호:** 환경변수 `APP_PASSWORD`. 로그인 화면 하나, 세션 쿠키(httpOnly, secure). 틀리면 5회마다 1분 지연.
- **API 키:** Anthropic, OpenAI, 네이버 키는 서버 환경변수로만 둔다. 클라이언트로 절대 보내지 않는다.
- **비용 상한:** `config/limits.yaml`에 턴당 LLM 비용 상한(USD)과 일일 상한(USD)을 둔다. 상한을 넘으면 그 이후 호출을 중단하고, 턴은 `partial`로 끝난다(§7.7).

---

## 6. 데이터 모델

타입은 TypeScript로 적는다. 구현에서는 zod 스키마로 옮기고, 같은 스키마에서 LLM 구조화 출력용 JSON Schema를 생성한다.

### 6.1 공통 규칙

```ts
type ID = string                       // UUID v7
type ISO = string                      // ISO 8601, UTC
type Scope = "personal" | "general"
type Actor =
  | "user" | "system"
  | "agent:ME" | "agent:HW" | "agent:SW" | "agent:ID"
  | "router" | "scout" | "card_writer" | "planner" | "reply"

interface BaseRecord {
  id: ID
  project_id: ID | null
  scope: Scope
  created_at: ISO
  created_by: Actor
  source: { call_id: ID | null; model: string | null }  // LLM이 만든 레코드는 둘 다 필수
}
```

**scope 판정 기준**

| scope | 조건 | 해당 레코드 |
|---|---|---|
| `general` | 누가 써도 성립한다. `project_id: null` | `Part`, `Offer` |
| `personal` | 이 사용자·프로젝트의 장비, 예산, 숙련도, 보유 부품, 작업 환경에 의존한다 | 그 외 전부 (`Inventory`, `Glossary`, `KnowledgeGap` 포함) |

`project_id: null` + `scope: general` 레코드가 프로젝트를 넘어 재사용되는 자산이다.

**레코드 참조 문자열**은 `<종류>:<식별자>` 형식으로 통일한다.
예: `constraint:<id>`, `decision:ME-04`, `slot:power`, `need:<id>`, `part:<part_key>`, `inst:<part_key>#2`, `net:<name>`, `budget:mass_total`

**이벤트 저장 (append-only)**

```ts
interface Event {
  seq: number                 // 전역 단조 증가
  id: ID
  project_id: ID | null
  type: string                // "slot.updated", "constraint.upserted", "decision.decided" …
  entity: string              // "SpecSlot", "Constraint" …
  entity_id: ID
  payload: object             // 변경 후 레코드 전체
  caused_by: { turn_id: ID | null; call_id: ID | null; actor: Actor }
  created_at: ISO
}
```

- 모든 상태 변경은 이벤트 추가와 projection 테이블 갱신을 **같은 트랜잭션**에서 한다.
- projection은 이벤트로부터 언제든 다시 만들 수 있어야 한다. 재생성 스크립트와 "재생성 결과 = 현재 projection" 테스트를 둔다.
- 레코드를 삭제하지 않는다. `active: false`나 상태값으로 비활성화한다.

### 6.2 신뢰도 · 단위 · 필드 사전

**신뢰도**

```ts
type Confidence = "measured" | "datasheet" | "estimate" | "guess" | "unknown"
// 순서: measured > datasheet > estimate > guess > unknown
// unknown이면 value는 null
```

- `measured`가 `datasheet`보다 높다. 손에 있는 물건이 최종 권위다.
- 여러 값을 합친 결과의 신뢰도는 **가장 낮은 것**을 따른다.

**정규 단위** — 저장과 LLM 입출력은 모두 이 단위만 쓴다. 다른 단위로 출력하면 스키마 검증에서 실패한다. 단위 변환은 코드가 한다.

| 물리량 | 단위 | 물리량 | 단위 |
|---|---|---|---|
| 길이 | `mm` | 토크 | `kg·cm` |
| 질량 | `g` | 용량 | `mAh` |
| 전압 | `V` | 시간 | `h` |
| 전류 | `mA` | 돈 | `KRW` |
| 전력·발열 | `W` | 온도 | `°C` |
| 각도 | `deg` | 속도(회전) | `rpm` |

**필드 사전 (FieldRegistry)** — 부품 스펙과 제약의 `target`이 쓰는 키. 이 목록은 부품 지식이 아니라 구조이므로 코드에 둔다.

| key | 타입 | 단위 | 의미 |
|---|---|---|---|
| `dims_mm` | `{x,y,z}` | mm | 외형 바운딩박스 |
| `mass_g` | number | g | 질량 |
| `v_in` | `[min,max]` | V | 허용 입력 전압 |
| `v_out` | number | V | 출력 전압 (전원 부품) |
| `i_avg_ma` | number | mA | 평균 소비 전류 |
| `i_peak_ma` | number | mA | 피크 전류. **액추에이터는 스톨 전류를 여기 넣는다** |
| `i_out_cont_ma` | number | mA | 연속 공급 가능 전류 (전원 부품) |
| `i_out_peak_ma` | number | mA | 순간 공급 가능 전류 (전원 부품) |
| `p_w` | number | W | 소비 전력 / 발열 |
| `logic_level_v` | number | V | 신호 논리 레벨 (3.3, 5 등) |
| `level_shifter` | bool | — | 논리 레벨 변환 기능 여부 |
| `interfaces` | `{bus, address?}[]` | — | `bus`: `i2c`·`spi`·`uart`·`gpio`·`pwm`·`analog`·`usb`. `address`는 `"0x68"` 형식 |
| `gpio_available` | number | 개 | 사용 가능한 GPIO 수 (연산 부품) |
| `i2c_pullup_onboard` | bool | — | 보드에 I2C 풀업 내장 여부 |
| `torque_kgcm` | number | kg·cm | 토크 |
| `speed_rpm` | number | rpm | 회전 속도 |
| `capacity_mah` | number | mAh | 배터리 용량 |
| `temp_range_c` | `[min,max]` | °C | 동작 온도 |

- 도메인 에이전트는 새 키가 필요하면 `x_` 접두사로 만들고 단위를 함께 낸다. 코드가 FieldRegistry에 등록한다.
- 룰팩은 `x_` 키를 쓰지 않는다.

### 6.3 Project와 stage

```ts
interface Project extends BaseRecord {
  name: string                 // 기본 "무제 프로젝트"
  one_liner: string            // 사용자가 쓴 한 줄
  stage: "idea" | "spec" | "blueprint" | "build"
}
```

| 전환 | 조건 | 방식 |
|---|---|---|
| `idea → spec` | 첫 턴 처리가 끝남 | 자동 |
| `spec → blueprint` | 모든 슬롯이 `filled`이거나, `assumed`이면서 `acknowledged: true` | 조건을 만족하면 버튼이 활성화되고, 사용자가 누른다 |
| `blueprint → spec` | 슬롯 수정으로 위 조건이 깨짐 | 자동, 사용자에게 알림 |
| `blueprint → build` | 아래 여섯 가지를 모두 만족 | 버튼, 사용자가 누른다 |

`blueprint → build` 조건:
1. `open` 상태의 blocking 충돌 0건
2. `open`·`deferred` 결정 0건
3. 모든 PartNeed가 `resolved` 또는 `cancelled`
4. 모든 인스턴스에 배치(Placement)가 있음
5. 간섭 0건
6. 조립 스텝 생성 완료

잠기지 않은 결정(`locked: false`)은 남아 있어도 된다. 대신 그에 해당하는 계측 스텝이 조립 순서 맨 앞에 들어간다(§12.4).

충돌 감지와 카드 생성은 `spec` 단계부터 돈다.

### 6.4 SpecSlot — 스펙 칸

```ts
interface SpecSlot extends BaseRecord {
  key: SlotKey
  label: string
  status: "empty" | "assumed" | "filled"
  value_text: string | null     // 확정·가정된 내용 요약
  assumption: string | null     // status가 assumed일 때 AI가 세운 가정과 그 이유
  acknowledged: boolean         // 사용자가 "그 가정대로 진행"을 명시했는가
  unlocks: string[]
}
type SlotKey = "power" | "wireless" | "sensing" | "actuation" | "data_sink" | "form" | "runtime" | "fab"
```

| key | label | unlocks | 담당 도메인 (§7.2) |
|---|---|---|---|
| `power` | 전원 | 에너지원, 전압 변환, 충전 | HW |
| `wireless` | 무선 필요 여부 | 연산 유닛 계열 | HW, SW |
| `sensing` | 감지 대상과 정밀도 | 센서 | HW, SW |
| `actuation` | 움직임·표시 | 액추에이터, 전류 예산 | HW, ME |
| `data_sink` | 데이터 행선지 | 통신, 저장 | SW |
| `form` | 폼팩터·환경 제약 | 하우징, 재료 | ME, ID |
| `runtime` | 구동 시간 | 에너지 용량, 절전 설계 | HW, SW |
| `fab` | 제작 방식 | 조립 단계 전체 | ME, ID |

- 슬롯 이름에 특정 기기를 암시하는 단어를 쓰지 않는다. "액추에이터"는 모터일 수도, 펌프일 수도, 스피커일 수도 있다.
- **확인받지 않은 `assumed` 슬롯(`acknowledged: false`)은 동시에 최대 3개.** 라우터가 네 번째를 만들려 하면 코드가 거부하고, 그 슬롯은 `empty`로 두고 질문으로 돌린다.
- 상태 변화는 이벤트로 모두 남는다. 4차의 입력값이다.

### 6.5 Budget과 Allocation

```ts
interface Budget extends BaseRecord {
  key: string                   // 기본 키 아래 표, 도메인이 새로 만들 수 있음
  label: string
  unit: string
  kind: "sum" | "envelope"      // sum: 할당 합계로 판정 / envelope: 배치 바운딩박스로 판정
  limit: number | { x: number; y: number; z: number } | null
  limit_source: `slot:${SlotKey}` | `decision:${string}` | "user" | null
  limit_confidence: Confidence
}

interface Allocation extends BaseRecord {
  budget_key: string
  owner: string                 // "<DOMAIN>:<applies_to>" 또는 "inst:<part_key>#<n>"
  value: number
  confidence: Confidence
  for_need: ID | null           // 이 추정이 어떤 부품 요구를 대신하는가
  derived_from: string | null   // 참조 문자열. 코드가 만든 할당은 "part:<key>.mass_g" 등
  active: boolean
}
```

**기본 예산 키**

| key | 단위 | kind | 주 소유 도메인 (카드 코드 접두사) |
|---|---|---|---|
| `mass_total` | g | sum | ME |
| `current_peak_ma` | mA | sum | HW |
| `current_avg_ma` | mA | sum | HW |
| `volume_envelope` | mm | envelope | ME |
| `cost_total` | KRW | sum | GEN |
| `thermal_dissipation` | W | sum | HW |
| `build_hours` | h | sum | GEN |

**계산 (코드)**
- `used = Σ value` (active 할당만)
- `ratio = used / limit`
- 예산의 신뢰도 = 할당들 중 가장 낮은 신뢰도

**한도의 출처** — 닭과 달걀 문제를 이렇게 푼다.
1. `limit`이 `null`이면, 슬롯이 채워질 때 도메인 에이전트가 한도를 제안할 수 있다. 이때 `limit_source: "slot:<key>"`.
2. 같은 슬롯이 다시 바뀌면 그 슬롯에서 온 한도만 다시 제안받아 교체할 수 있다.
3. `user`나 `decision:`에서 온 한도는 에이전트가 덮어쓰지 못한다.
4. 사용자는 예산 대시보드에서 언제든 한도를 직접 입력할 수 있다 (`limit_source: "user"`).

**부품이 결정되면** 코드가 두 가지를 한다.
1. 그 PartNeed를 `for_need`로 가진 추정 할당을 `active: false`로 바꾼다.
2. 부품 필드에서 파생 할당을 만든다. 신뢰도는 해당 필드의 것을 따른다.
   - `mass_g × 수량` → `mass_total`
   - `i_peak_ma × 수량` → `current_peak_ma`
   - `i_avg_ma × 수량` → `current_avg_ma`
   - `p_w × 수량` → `thermal_dissipation`
   - `판매가 × 수량` → `cost_total`

### 6.6 Constraint

```ts
interface Constraint extends BaseRecord {
  domain: "ME" | "HW" | "SW" | "ID"
  target: string                // 예산 key 또는 필드 사전 key
  applies_to: string            // "project" | "need:<id>" | 자유 식별자(예: "housing")
  op: "lte" | "gte" | "eq" | "range"
  value: number | [number, number]
  unit: string
  hardness: "hard" | "soft"     // hard: 어기면 물건이 안 됨 / soft: 어기면 품질이 떨어짐
  rationale: string
  derived_from: string | null
  active: boolean
}
```

- 업서트 키는 `(domain, target, applies_to, op)`다. 같은 키로 다시 내면 교체된다.
- PartNeed의 `must` 항목은 코드가 자동으로 `hard` 제약으로 만든다. 이때 `applies_to: "need:<id>"`.
- **현재값** — 충돌 판정에서 제약과 비교하는 값이다.
  - `target`이 예산 key이고 `applies_to`가 `project`: 그 예산의 `used`
  - `target`이 예산 key이고 `applies_to`가 그 외: owner가 `*:<applies_to>`인 할당들의 합
  - `target`이 필드 key이고 `applies_to`가 `need:<id>`: 그 요구에 결정된 부품의 필드값 (결정 전이면 판정하지 않음)

### 6.7 PartNeed — 부품 요구

```ts
interface Requirement { field: string; op: "lte" | "gte" | "eq" | "range"; value: number | [number, number]; unit: string }

interface PartNeed extends BaseRecord {
  domain: "ME" | "HW" | "SW" | "ID"
  need_key: string              // 도메인이 붙이는 영문 슬러그, 예: "leg-joint-actuator"
  category: PartCategory
  context: string               // 사용자에게 보일 용도 설명, 예: "다리 관절"
  quantity: number
  must: Requirement[]
  nice: Requirement[]
  status: "open" | "searching" | "carded" | "resolved" | "no_candidate" | "cancelled"
  decision_code: string | null
}
```

- 업서트 키는 `(domain, need_key)`다.
- 이미 `resolved`인 요구의 `must`가 바뀌면 이렇게 처리한다.
  - 상태를 `open`으로 되돌린다.
  - 기존 결정은 `obsolete`로 바꾼다.
  - 그 결정으로 만든 파생 할당은 `active: false`로 바꾼다.

### 6.8 Part · Offer · Inventory

**앱은 부품 카탈로그를 갖고 출발하지 않는다. 부품 라이브러리는 카탈로그가 아니라 캐시다.** 설계에 필요해진 부품만 그때그때 획득하고, `scope: general`로 남아 다음 프로젝트에서 재사용된다.

```ts
type PartCategory = "compute" | "sensor" | "actuator" | "power" | "io" | "passive" | "mechanical" | "fastener" | "cable"

interface FieldValue<T = unknown> {
  value: T | null
  confidence: Confidence
  source: {
    kind: "datasheet" | "shop_page" | "marketplace_listing" | "derived_estimate" | "user_measured" | "user_input"
    url?: string
    locator?: string            // "p.12 표 3" 등
    tool_call_id?: ID
    note?: string
  }
  checked_at: ISO
}

interface Part extends BaseRecord {        // project_id: null, scope: "general"
  key: string                  // "<category>-<slug(mpn 또는 name)>", 소문자·하이픈
  name: string
  manufacturer: string | null
  mpn: string | null           // 제조사 부품번호. 같은 mpn이면 같은 부품으로 병합
  category: PartCategory
  fields: Record<string, FieldValue>       // 필드 사전 key만
  pins: FieldValue<{ id: string; pos_mm: [number, number, number] | null; caps: string[] }[]>
  model_3d: string | null      // blob 경로 (.glb)
  datasheet_urls: string[]
}

interface Offer extends BaseRecord {       // project_id: null, scope: "general"
  part_key: string
  vendor: string               // 설정 파일의 판매처 id
  vendor_type: "shop" | "naver_shopping"
  url: string
  price_krw: number
  shipping_krw: number | null
  stock: true | false | null   // null = 확인 불가
  checked_at: ISO
  tool_call_id: ID
}

interface Inventory extends BaseRecord {   // scope: "personal", project_id: null
  part_key: string
  qty: number                  // 사용자가 이미 가진 수량
}
```

같은 부품이라도 필드마다 신뢰도가 다르기 때문에, 필드마다 `confidence`와 `source`를 따로 갖는다.

**필드별 취득 정책 — 코드가 강제한다.** 자동으로 취득한 값의 신뢰도는 아래 상한을 넘을 수 없다. 넘게 파싱되면 상한으로 낮춰 저장한다.

| 필드 | datasheet에서 | shop_page에서 | marketplace_listing에서 | 비고 |
|---|---|---|---|---|
| 전압·전류·전력·토크·인터페이스·논리레벨 | `datasheet` | `estimate` | `guess` | |
| 질량 | `datasheet`(명시된 경우) | `estimate` | `guess` | 기재가 없으면 부피×밀도로 `derived_estimate`, 신뢰도 `estimate` |
| **외형 치수** | `guess` | `guess` | `guess` | 자동 취득은 항상 `guess`. 기계도면을 읽어야 정확하다 |
| **핀 좌표** | 금지 | 금지 | 금지 | 항상 `unknown`. 사용자 입력으로만 채운다 |
| 카테고리·명칭 | `datasheet` | `datasheet` | `estimate` | |

- `shop_page`는 설정 파일에 등록된 국내 쇼핑몰의 상품 상세 페이지다.
- `marketplace_listing`은 네이버 쇼핑 검색 결과, 스마트스토어 상품명·설명이다.
- 사용자 입력은 `user_input`(신뢰도 `datasheet`)이나 `user_measured`(신뢰도 `measured`)로 저장한다.

**낮은 신뢰도의 전파 규칙**

| 조건 | 결과 |
|---|---|
| `dims_mm`이 `guess` | 3D 간섭 검사에서 바운딩박스를 **각 면마다 3mm씩 확장**. 뷰에서 점선 외곽선으로 표시 |
| `pins`가 `unknown` | 3D 결선 표시 비활성화. 결선 리스트는 모듈 단위까지만 |
| 결정의 판정이 `guess`·`unknown` 값에 의존 | 그 결정은 `locked: false`. 해당 부품 필드마다 `MeasurementRequest` 생성 (§6.11) |
| 사용자가 실물을 재서 입력 | `measured`로 승격. 그 부품에 의존하는 판정 전부 재계산 (충돌 감지, 비교표, 잠금 상태) |

### 6.9 Net — 결선

룰팩의 전기 규칙과 결선 리스트 내보내기가 이 레코드를 쓴다. 만드는 쪽은 HW 에이전트다.

```ts
interface NetMember {
  instance: string              // "<part_key>#<n>"
  pin: string | null            // 핀 정보가 unknown이면 null → 모듈 단위
  role: "source" | "sink" | "bidirectional"   // 전원 넷에서 source = 공급하는 쪽
}

interface Net extends BaseRecord {
  name: string                  // 프로젝트 안에서 유일, 예: "VBAT", "I2C0", "SERVO_PWR"
  kind: "power" | "ground" | "i2c" | "spi" | "uart" | "gpio" | "pwm" | "analog" | "usb" | "other"
  voltage_v: number | null      // power 넷은 필수
  members: NetMember[]
  active: boolean
}
```

업서트 키는 `name`이다.

### 6.10 Conflict — 충돌

**LLM이 아니라 코드가 만든다.** 판정 규칙은 §8에 있다.

```ts
interface Conflict extends BaseRecord {
  rule: "R1_HARD_EMPTY" | "R2_HARD_VIOLATED" | "R3_BUDGET_OVER" | "R4_NO_CANDIDATE" | "R5_RULEPACK"
      | "W_SOFT_VIOLATED" | "W_BUDGET_NEAR" | "W_INSUFFICIENT_DATA"
  rulepack_id: string | null
  severity: "blocking" | "warning"
  fingerprint: string           // sha256(rule + rulepack_id + target + applies_to + 정렬된 involved)
  target: string | null
  applies_to: string | null
  involved: string[]            // 참조 문자열
  gap: { required: number; allowed: number; unit: string } | null   // 코드 계산
  message: string               // 코드가 템플릿으로 만든 한 줄 (LLM 아님)
  status: "open" | "resolved"
  resolved_at: ISO | null
}
```

### 6.11 Decision — 결정 카드

```ts
interface Term { term: string; gloss: string }   // 해설에 쓴 전문 용어와 쉬운 풀이

interface Cost {
  time_h: Record<string, number>   // 단계별 시간, 예: { design: 2, make: 6 }. 합계는 코드가 계산
  money_krw: number
  undo: { kind: "remakeable" | "repurchasable" | "irreversible"; cost_h?: number; cost_krw?: number; note?: string }
  learning: { topic: string; est_h: number }[]   // 없으면 []
}

interface Decision extends BaseRecord {
  code: string                  // §7.5 규칙
  kind: "tradeoff" | "part_pick"
  title: string
  plain: string                 // 전문 용어 없이 무엇을 고르는지 설명하는 2~3문장
  terms: Term[]
  conflict_id: ID | null        // tradeoff면 필수, part_pick이면 null
  part_need_id: ID | null       // part_pick이면 필수, tradeoff면 null
  status: "open" | "decided" | "deferred" | "obsolete"
  chosen_option_id: ID | null
  locked: boolean               // decided이면서 판정에 guess/unknown 의존이 없을 때 true
  lock_blockers: { ref: string; field: string | null; reason: string }[]
  number_check: "passed" | "failed"   // §7.6
  options: TradeoffOption[] | PartPickOption[]
}
```

**`plain`이 카드의 핵심이다.** 이게 없으면 초보 사용자에게 카드는 암호문이다. 각 옵션에도 `plain`을 둔다.
- 기준 독자: **고등학교 물리 수준, 전자·기구 경험 없음.**
- 해설에 쓴 전문 용어는 `terms`에 풀이와 함께 넣는다. UI는 용어에 밑줄을 긋고 풀이를 툴팁으로 보여준다.

**상태 규칙**
- `obsolete`: 원인이 사라진 카드. 충돌이 `resolved`됐거나 PartNeed가 취소·변경된 경우다. 이미 `decided`인 카드는 obsolete로 바꾸지 않는다. 단, PartNeed의 `must`가 바뀐 경우는 예외다(§6.7).
- `deferred`: 결정을 미룬 카드. 예산 계산에는 **가장 나쁜 값**을 넣는다.
  - tradeoff: 옵션들의 효과를 각각 시뮬레이션해서, 예산 key마다 가장 많이 쓰는 값을 넣는다.
  - part_pick: 필드마다 후보 중 최댓값을 넣는다.
  - 이렇게 만든 할당은 `derived_from: "decision:<code>:deferred_worst"`로 표시한다.

#### kind: tradeoff — 방법 선택 (충돌에서만 생성)

```ts
interface TradeoffOption {
  id: ID
  label: string
  plain: string
  effects: {                                // 이 옵션을 고르면 바뀌는 것. LLM이 쓰고 코드가 적용
    constraints_upsert: ConstraintDraft[]
    constraints_remove: ID[]
    allocations_upsert: AllocationDraft[]
    budget_limits_set: { budget_key: string; limit: number }[]
    part_needs_upsert: PartNeedDraft[]
    part_needs_cancel: string[]             // need_key
    notify_domains: ("ME" | "HW" | "SW" | "ID")[]
  }
  cost: Cost
  expected_trouble: { what: string; likelihood: "low" | "medium" | "high" | "certain"; realistic_time_h: number | null }[]
  satisfies: Record<string, boolean | null>  // 코드 계산: 효과 적용 시 관련 제약·예산 만족 여부. null = 판정 불가
  residual_gaps: { target: string; gap: number; unit: string }[]  // 코드 계산
}
// ConstraintDraft / AllocationDraft / PartNeedDraft는 BaseRecord 필드를 뺀 해당 레코드
```

- 옵션은 2~4개.
- `effects`가 완전히 빈 옵션은 스키마 실패다.
- 코드가 각 옵션의 효과를 가상으로 적용해 충돌이 풀리는지 계산한다. 푸는 옵션이 하나도 없으면 CardWriter를 1회 재시도한다. 그래도 없으면 카드를 저장하되 로그에 경고를 남긴다.

#### kind: part_pick — 부품 선택 (PartNeed에서 생성)

부품을 고르는 것도 결정이다. 토크가 높은 액추에이터는 무겁고 비싸다. 그게 정확히 트레이드오프이므로 같은 카드 구조에 들어간다.

```ts
interface PartPickOption {
  id: ID
  part_key: string
  offer_id: ID | null           // 보유 부품만으로 충족하면 null
  label: string                 // 제품명
  plain: string                 // 예: "가장 흔한 표준 크기. 자료가 많아 막혔을 때 검색이 잘 됩니다."
  specs: Record<string, { value: unknown; confidence: Confidence }>  // 코드가 Part에서 복사
  satisfies: Record<string, boolean | null>   // 코드: must 항목별
  margins: Record<string, number>             // 코드: must 항목별 여유율(%)
  violates_hard: boolean                      // 코드
  is_owned: boolean                           // 코드: Inventory에 있으면 true, money_krw = 0
  cost: Cost                    // money_krw는 코드가 Offer에서 채움. time_h·undo·learning은 LLM
  why_recommended: string       // 코드가 준 margins 수치만 인용할 수 있음
  trade: string                 // 예: "무게 예산을 6g 초과"
}
```

- 후보는 3~5개다. 그 이상은 사용자가 고르지 못한다.
- 비교표 규칙은 §10.4에 있다.

**결정 적용 (코드)** — 사용자가 옵션을 고르면 아래 순서로 처리한다.
1. `chosen_option_id`를 기록하고 `status: decided`로 바꾼다.
2. 옵션을 적용한다.
   - tradeoff: `effects`를 적용한다.
   - part_pick: PartNeed를 `resolved`로 바꾸고, 인스턴스 `<part_key>#1..quantity`를 만들고, 파생 할당을 만든다(§6.5).
3. 충돌 감지(§8)와 룰팩(§9)을 다시 돌린다.
4. `locked`를 계산한다. 판정에 쓰인 값 중 `guess`·`unknown`이 있으면 `locked: false`로 하고, `lock_blockers`를 채우고, 부품 필드마다 `MeasurementRequest`를 만든다.
5. `notify_domains`에 있는 도메인을 **한 번만** 다시 호출한다. 그 결과로 생긴 새 결정 카드에 대해서는 연쇄 호출을 하지 않는다.

```ts
interface MeasurementRequest extends BaseRecord {
  part_key: string
  field: string                 // "dims_mm", "mass_g", "pins" 등
  reason_ref: string            // "decision:PART-03"
  status: "open" | "done" | "dismissed"
}
```

### 6.12 Placement — 3D 배치

```ts
interface Placement extends BaseRecord {
  instance: string              // "<part_key>#<n>" 또는 "housing:<id>"
  pos_mm: [number, number, number]
  rot_deg: [number, number, number]   // XYZ 오일러
  set_by: "planner" | "user"
}
```

- 좌표계: 오른손 좌표계, **Y축이 위**, 원점은 기기 바닥면 중심, 단위 mm.
- 사용자가 직접 옮긴 배치(`set_by: "user"`)는 planner가 덮어쓰지 않는다.
- 배치가 바뀔 때마다 씬 JSON 전체를 blob에 저장한다(§15).

### 6.13 AssemblyStep — 조립 스텝

```ts
interface AssemblyStep extends BaseRecord {
  step: number                  // 1부터 연속
  kind: "measure" | "assemble" | "wire" | "test"
  title: string
  instructions: string
  instances_added: string[]
  nets_connected: string[]
  camera: { pos: [number, number, number]; target: [number, number, number] }
  render_png: string | null     // "renders/{project_id}/step-03.png"
  photo_guide: { angle: string; must_show: string[] }
}
```

`render_png`·`photo_guide`는 1차 화면에서 쓰지 않는다. **3차(사진 기반 디버깅)의 정답지**라 지금 만들어 둔다. 빼면 3차에서 조립 단계 렌더를 처음부터 다시 만들어야 한다.

### 6.14 KnowledgeGap · Glossary — 4차 준비

```ts
interface KnowledgeGap extends BaseRecord {
  topic: string
  origin: string                // 참조 문자열, 예: "decision:HW-07.plain"
  kind: "new_term" | "blocking_choice" | "empty_slot" | "repeated_question"
  est_h: number | null
  status: "open" | "closed"
}

interface Glossary extends BaseRecord {   // scope: personal, project_id: null (사용자 전체 기준)
  term_normalized: string       // 소문자, 공백·기호 제거
  first_seen_ref: string
  seen_count: number
}
```

KnowledgeGap이 생기는 경로는 네 가지다. 모두 코드가 판정한다.

| kind | 조건 |
|---|---|
| `new_term` | 카드 `terms[].term`을 정규화한 값이 Glossary에 없음. Glossary에 추가하고 Gap을 만든다 |
| `blocking_choice` | 카드가 생성될 때 옵션의 `cost.learning`이 비어 있지 않음. topic을 정규화해 중복 제거 |
| `empty_slot` | 프로젝트가 `spec`에 들어간 뒤 사용자 턴이 5번 지나도 슬롯이 `empty` |
| `repeated_question` | 라우터가 `repeated_of_turn_id`를 표시한 질문이 같은 원 질문에 대해 2회 이상 |

### 6.15 Turn · LlmCall · ToolCall — 실행 기록

```ts
interface Turn extends BaseRecord {
  kind: "chat" | "card_action" | "measurement" | "placement_edit" | "limit_edit" | "export"
  input: object                 // 사용자 텍스트 또는 UI 조작 내용
  seq_before: number            // 턴 시작 직전 이벤트 seq
  seq_after: number | null
  status: "running" | "done" | "partial" | "failed"
  steps: { name: string; status: "ok" | "failed" | "skipped"; started_at: ISO; ended_at: ISO | null; error: string | null }[]
}

interface LlmCall {
  id: ID; turn_id: ID; role: Role; provider: "anthropic" | "openai"; model: string
  attempt: number; fallback_of: ID | null
  input_json: object; prompt_text: string; response_text: string
  parsed_json: object | null; schema_valid: boolean; error: string | null
  tokens_in: number; tokens_out: number; latency_ms: number; cost_usd: number
  created_at: ISO
}

interface ToolCall {
  id: ID; turn_id: ID; call_id: ID | null
  tool: "naver_shop_search" | "web_search" | "page_fetch" | "cadquery_run" | "render_step" | "db_tool"
  request: object
  response_blob: string         // 응답 원문은 blob에 저장. 리플레이 재료
  latency_ms: number; error: string | null
  created_at: ISO
}
```

---

## 7. 에이전트와 턴 처리

### 7.1 구성

```
Orchestrator (코드)
 ├─ router       슬롯 판정 (소형 LLM)
 ├─ ME           기구·재료·강성·무게·간섭 (LLM)
 ├─ HW           전자·전원·전류·발열·결선 (LLM)
 ├─ SW           펌웨어·제어·통신·데이터 (LLM)
 ├─ ID           형태·사용성·마감 (LLM)
 ├─ PartScout    부품 후보 탐색·파싱 (LLM + 검색 도구 + 코드)
 ├─ RulePack     전기·기구 규칙 검사 (코드)
 ├─ ConflictDetector 충돌 판정 (코드)
 ├─ CardWriter   카드 문구와 plain 해설 (LLM)
 ├─ planner      3D 배치·조립 순서 제안 (LLM)
 └─ reply        사용자에게 보낼 응답 문장 (소형 LLM)
```

### 7.2 슬롯과 도메인 대응

§6.4 표의 "담당 도메인"을 따른다. 한 턴에 네 에이전트를 전부 돌리지 않고, **바뀐 슬롯의 담당 도메인만 돌린다.** 전부 돌리면 턴당 8회 이상이지만, 이 방식이면 평균 2~3회다.

### 7.3 턴 파이프라인 (kind: chat)

각 단계는 `Turn.steps`에 기록된다. 진행 상황은 SSE로 화면에 보낸다.

```
1. Turn 저장
2. router 호출
     입력: 슬롯 상태, 열린 카드 제목 목록, 직전 2턴, 사용자 발화
     출력: { slot_updates[], mode: "advance" | "answer_only", repeated_of_turn_id }
   → 코드가 assumed 개수 상한(3) 검사 후 슬롯 갱신

3. mode가 answer_only이면 (슬롯 변화 없이 질문만 한 경우)
   → answer 역할이 L1 컨텍스트 + L2 도구로 답한다. 상태 변경 없음. 턴 종료

4. 바뀐 슬롯의 담당 도메인을 병렬 호출 (§7.4)
5. 도메인 출력 저장
     제약·할당·부품 요구·넷 업서트
     PartNeed.must → hard 제약 자동 생성
     한도 제안 적용 (§6.5 규칙)
6. status가 open인 PartNeed마다 PartScout 실행 (§10, 동시 최대 3개)
     → 후보가 있으면 status: carded, 없으면 status: no_candidate
7. RulePack(§9) + ConflictDetector(§8) 실행 (코드, LLM 비용 0원)
8. CardWriter 호출
     새 blocking 충돌마다 tradeoff 카드 1장
     PartScout 결과마다 part_pick 카드 1장
   → 코드가 satisfies·margins·money 채우고 숫자 검증 (§7.6)
9. Glossary · KnowledgeGap 갱신
10. reply 호출
     입력: 도메인 notes, 새 카드 제목, 질문 후보
     출력: 사용자 응답 문장
     질문은 empty 슬롯 순서(§6.4 표 순서)대로 최대 2개 고른다
11. Turn 종료 (done 또는 partial)
```

다른 kind의 턴은 아래처럼 처리한다. 모두 Turn으로 기록되고 리플레이할 수 있다.

| kind | 처리 |
|---|---|
| `card_action` | 결정 적용(§6.11) → 7 → 8 → 9 → 10 |
| `measurement` | 필드 갱신 → 전체 재계산 → 7 → 8 |
| `placement_edit` | 배치 저장 → 간섭 검사 |
| `limit_edit` | 한도 저장 → 7 → 8 |
| `export` | §13 |

### 7.4 도메인 에이전트 계약

**입력 (L1 컨텍스트, 목표 2~4천 토큰)**

```ts
interface DomainInput {
  project: { one_liner: string; stage: string }
  slots: { key: SlotKey; status: string; value_text: string | null; assumption: string | null }[]
  changed_slots: SlotKey[]
  budgets: { key: string; unit: string; limit: unknown; used: number; ratio: number | null; confidence: Confidence }[]  // 코드 계산값
  my_constraints: Constraint[]    // 자기 도메인, active만
  my_needs: PartNeed[]            // 자기 도메인
  my_nets: Net[]                  // HW만
  decided: { code: string; title: string; chosen_label: string }[]
  open_conflicts: { rule: string; target: string | null; message: string }[]
  recent_turns: { user: string; reply: string }[]   // 직전 2턴 + 이번 발화
}
```

**사용할 수 있는 도구 (L2)**
- `get_part(key)`
- `get_decision(code)`
- `get_budget(key)`
- `list_nets()`
- `measure_request(part_key, field, reason)`

`search_parts`는 PartScout 전용이다. 도메인 에이전트에게 주지 않는다.

**출력 — 이 형태만 허용한다. 산문은 금지.**

```ts
interface DomainOutput {
  constraints_upsert: ConstraintDraft[]
  constraints_remove: ID[]
  allocations_upsert: AllocationDraft[]       // 업서트 키 (budget_key, owner)
  budget_limits_propose: { budget_key: string; limit: number | { x: number; y: number; z: number }; unit: string; confidence: Confidence; slot_key: SlotKey }[]
  new_budgets: { key: string; label: string; unit: string; kind: "sum" | "envelope" }[]
  part_needs_upsert: PartNeedDraft[]
  part_needs_cancel: string[]                 // need_key
  nets_upsert: NetDraft[]                     // HW만, 다른 도메인이 내면 무시하고 경고 로그
  nets_remove: string[]                       // name
  questions: { slot: SlotKey; ask: string }[]
  notes: string                               // 사용자에게 보여줄 한 문단
}
```

- **도메인 에이전트는 부품 이름을 지목하지 않고 요구 조건만 낸다.** 구체적인 제품을 찾아 보여주는 건 PartScout의 일이다. 이렇게 나눠야 프롬프트에 부품이 박히지 않으면서도 사용자는 실물을 본다.
- `PartNeedDraft`에 모델번호처럼 생긴 토큰이 들어 있으면 코드가 거부하고 재시도한다.
- `notes`와 `questions`에는 입력으로 받은 수치만 쓸 수 있다.

### 7.5 결정 카드 코드

형식은 `<접두사>-<프로젝트 안 순번 2자리>`다. 예: `ME-04`, `PART-01`.

| 카드 원인 | 접두사 |
|---|---|
| part_pick | `PART` |
| R5 룰팩 위반 | `RULE` |
| R3 예산 초과 | 그 예산의 주 소유 도메인 (§6.5 표: ME / HW / GEN) |
| R1·R2·R4 | 관련 제약 중 가장 최근에 만들어진 제약의 domain |

### 7.6 CardWriter 계약과 숫자 검증

**tradeoff 입력**
- 충돌 레코드 (코드가 계산한 `gap` 포함)
- 관련 제약·할당
- 관련 슬롯
- 확정된 결정 요약
- `allowed_numbers`

**tradeoff 출력**
- `title`, `plain`, `terms`
- `options[2..4]` — 각각 `label`, `plain`, `effects`, `cost`, `expected_trouble`

**part_pick 입력**
- PartNeed
- 코드가 고른 후보 목록 (specs, margins, offer, is_owned, violates_hard)
- `allowed_numbers`

**part_pick 출력**
- `title`, `plain`, `terms`
- 후보마다 `label`, `plain`, `why_recommended`, `trade`, `cost.time_h`, `cost.undo`, `cost.learning`

**숫자 검증 (코드)**
1. `allowed_numbers`를 만든다. 입력에 들어간 모든 수치와, 그 수치의 반올림 표기(정수, 소수 1자리)를 담는다.
2. 카드의 `title`, `plain`, `label`, 옵션 `plain`, `why_recommended`, `trade`에서 숫자를 추출한다. `terms[].gloss`는 설명용 예시가 필요하므로 검사하지 않는다.
3. `allowed_numbers`에 없는 숫자가 있으면, 그 숫자 목록을 첨부해 1회 재시도한다.
4. 그래도 있으면 카드를 저장하되 `number_check: "failed"`로 표시한다. UI에 작은 경고 배지를 단다.

`cost`·`effects` 안의 추정값(시간, 재료비, 추정 할당)은 LLM의 판단이므로 이 검사 대상이 아니다. 대신 `confidence: estimate` 이하로 저장된다.

### 7.7 실패 · 재시도 · 폴백

| 상황 | 처리 |
|---|---|
| 응답이 스키마에 맞지 않음 | 같은 모델로 1회 재시도. 검증 오류 메시지를 첨부한다 |
| API 오류, 타임아웃(기본 90초, scout_parse 30초) | 폴백 모델로 1회 |
| 폴백도 실패 | 그 단계를 `failed`로 기록하고, 서로 독립인 나머지 단계는 계속한다. 턴은 `partial`. UI에 "HW 판단 실패 — 다시 시도" 버튼 |
| 비용 상한 초과 (§5.3) | 이후 LLM 호출을 모두 건너뛰고(`skipped`), 턴은 `partial` |
| 외부 검색·페이지 수집 실패 | 1회 재시도. 그래도 실패하면 해당 출처를 빼고 진행 |

모든 시도는 `LlmCall`·`ToolCall`에 남는다.

### 7.8 모델 매핑

역할별 매핑은 `config/models.yaml`에 두고 코드에 박지 않는다. **한 벤더가 막혀도 매핑만 바꾸면 계속 작업할 수 있어야 하므로, 모든 역할에 다른 벤더의 폴백을 둔다.**

```yaml
# OpenAI 모델명은 배포 시점에 사용 가능한 것으로 채운다
roles:
  router:           { primary: anthropic/claude-haiku-4-5, fallback: openai/<small> }
  domain:           { primary: anthropic/claude-opus-5,    fallback: openai/<large> }
  card_writer:      { primary: anthropic/claude-opus-5,    fallback: openai/<large> }
  answer:           { primary: anthropic/claude-sonnet-5,  fallback: openai/<large> }
  reply:            { primary: anthropic/claude-haiku-4-5, fallback: openai/<small> }
  scout_query:      { primary: anthropic/claude-haiku-4-5, fallback: openai/<small> }
  scout_parse:      { primary: anthropic/claude-haiku-4-5, fallback: openai/<large> }
  planner:          { primary: openai/<large>,             fallback: anthropic/claude-opus-5 }
  cadquery_codegen: { primary: openai/<code>,              fallback: anthropic/claude-opus-5 }
```

```ts
interface ModelAdapter {
  call(role: Role, input: object, schema: JSONSchema, tools?: ToolDef[]): Promise<{ parsed: object; call_id: ID }>
}
```

- 구조화 출력은 각 벤더의 structured output 또는 tool use로 강제한다.
- 이 표는 **앱 실행 중에 쓰는 모델**만 다룬다. 이 앱을 개발하는 데 어떤 코딩 도구를 쓰는지와는 무관하다.

---

## 8. ConflictDetector — 충돌 판정

턴마다 전체를 다시 계산한다. 코드이며 결정론적이다.

| 규칙 | 조건 | severity |
|---|---|---|
| `R1_HARD_EMPTY` | 같은 `(target, applies_to)`의 active hard 제약들의 허용 구간 교집합이 공집합 | blocking |
| `R2_HARD_VIOLATED` | active hard 제약의 현재값(§6.6)이 조건을 어김 | blocking |
| `R3_BUDGET_OVER` | sum 예산: `used > limit`. envelope 예산: 배치 전체 바운딩박스가 limit를 넘음 | blocking |
| `R4_NO_CANDIDATE` | PartScout가 끝났는데 hard 조건을 모두 만족하는 후보가 0개 | blocking |
| `R5_RULEPACK` | 룰팩 위반 (§9) | 규칙별 |
| `W_SOFT_VIOLATED` | active soft 제약의 현재값이 조건을 어김 | warning |
| `W_BUDGET_NEAR` | `0.9 ≤ ratio ≤ 1.0` | warning |
| `W_INSUFFICIENT_DATA` | 판정에 필요한 값이 `unknown` | warning |

**판정 세부**
- 구간 표현: `lte v → (-∞, v]`, `gte v → [v, ∞)`, `eq v → [v, v]`, `range [a,b] → [a, b]`
- 비교 전에 모든 값을 정규 단위로 변환한다.
- 현재값의 신뢰도가 `guess`이면 R2·R3는 그대로 판정하되, `involved`에 그 값의 출처를 넣는다. 잠금 계산(§6.11)이 이것을 참조한다.

**중복 방지와 해소**
1. 이번 계산 결과의 fingerprint 집합과 `open` 충돌을 비교한다.
2. 새 fingerprint → 충돌 생성.
3. 사라진 fingerprint → `resolved`로 바꾸고, 연결된 `open`·`deferred` 카드를 `obsolete`로 바꾼다.

**카드로 만드는 것:** blocking만 tradeoff 카드가 된다. warning은 예산 대시보드와 카드 큐 상단에 표시만 한다.

---

## 9. RulePack — 규칙 검사

LLM이 놓치거나 틀리는 것을 잡는다. 수십 개로 시작해 계속 쌓이며, **시간이 갈수록 이 앱의 진짜 자산이 되는 부분**이다.

각 규칙은 `id`, `requires`(필요한 필드), `check(state) → Violation[]`, `severity`를 가진 모듈이다. 규칙마다 통과·위반 픽스처로 단위 테스트를 둔다.

필요한 값이 `unknown`이면 위반으로 판정하지 않는다. 대신 `W_INSUFFICIENT_DATA`를 내고, 해당 필드에 계측 요청이나 사용자 입력 요청을 만든다.

| id | 판정 | severity |
|---|---|---|
| `VOLTAGE_MISMATCH` | power 넷의 `voltage_v`가 sink 멤버 부품의 `v_in` 범위 밖 | blocking |
| `CURRENT_CONT_OVER` | power 넷에서 Σ(sink `i_avg_ma`) > source `i_out_cont_ma` | blocking |
| `INRUSH_OVER` | power 넷에서 Σ(sink 중 actuator의 `i_peak_ma`) + Σ(나머지 sink의 `i_avg_ma`) > source `i_out_peak_ma` | blocking |
| `LOGIC_LEVEL` | 신호 넷(i2c·spi·uart·gpio·pwm) 멤버들의 `logic_level_v`가 서로 다르고, 그 넷에 `level_shifter: true` 부품이 없음 | blocking |
| `I2C_ADDRESS_DUP` | 같은 i2c 넷에 `interfaces[].address`가 같은 멤버가 2개 이상 | blocking |
| `GPIO_SHORTAGE` | compute 인스턴스에 연결된 gpio·pwm 넷 수 > `gpio_available` | blocking |
| `I2C_PULLUP_MISSING` | i2c 넷에 `i2c_pullup_onboard: true`인 멤버가 없고 passive 부품도 없음. 멤버 중 unknown이 있으면 warning | blocking / warning |
| `BUDGET_OVER` | ConflictDetector R3와 같은 판정 (공유 구현) | blocking |

규칙이 걸릴 때마다 룰팩 히트 로그에 남긴다(§15).

---

## 10. PartScout — 부품 추천과 획득

**PartScout의 출력은 DB 레코드가 아니라 화면에 뜨는 비교표다.** 획득한 Part·Offer는 부산물로 캐시에 남는다.

### 10.1 판매처 설정

`config/vendors.yaml`에서 관리한다. 코드에 박지 않는다.

```yaml
vendors:
  - id: naver_shopping
    type: naver_shopping          # 네이버 검색 API(쇼핑). 스마트스토어 상품 포함
  - id: devicemart
    type: shop
    domain: devicemart.co.kr
  - id: eleparts
    type: shop
    domain: eleparts.co.kr
  # 초기값 예시. 추가·삭제는 설정만 바꾼다
```

- 네이버 쇼핑은 **공식 검색 API**로 조회한다. 스마트스토어 상세 페이지 수집은 약관과 robots.txt가 허용하는 범위에서만 한다. 허용되지 않으면 API 결과만 쓴다.
- 국내 쇼핑몰 상세 페이지 수집도 같은 조건이다.
- 요청 간격은 판매처당 최소 1초.
- 호출 한도와 약관은 M3 시작 시 공식 문서로 확인하고 `docs/DECISIONS.md`에 적는다. 수집이 막히면 §0.4에 따라 묻는다.

### 10.2 탐색 흐름

```
입력: PartNeed (category, must, nice, quantity, context)

1. 캐시 조회 (코드)
   category가 같고 must를 만족하는 Part.
   guess 값으로만 만족하는 것은 판정 불가(null)로 포함한다.
   Inventory에 있는 부품은 항상 후보에 넣는다.

2. 캐시 후보가 3개 미만이면 웹 탐색
   a. scout_query: 요구 조건에서 검색어 최대 5개 생성 (한국어 일반명 + 영문 사양 키워드)
      모델이 내장 지식으로 제품명을 떠올려 검색어에 쓰는 것은 허용한다 (실행 중 획득이므로 원칙 7 위반 아님)
   b. naver_shop_search, web_search(vendors.yaml 도메인으로 한정) 실행
      판매 목록 최대 20개 수집
   c. 제품명·mpn으로 묶어서 후보 최대 8개 선정
   d. 후보마다
      - 판매 페이지 수집 → 가격·재고·링크 → Offer
      - 제조사 데이터시트 검색·수집 → 스펙
   e. scout_parse: 페이지·데이터시트에서 필드 사전 key로 추출
   f. 코드: 취득 정책 상한 적용 (§6.8) → Part·Offer 저장 (mpn 기준 병합)

3. 코드: 필터·정렬·선정 (§10.4) → 후보 3~5개
4. 결과
   hard 만족 후보가 0개 → R4 충돌 (PartNeed status: no_candidate)
   후보가 1개 이상 → CardWriter가 part_pick 카드 작성 (PartNeed status: carded)
   후보가 3개 미만이면 카드 상단에 "후보 부족" 표시
```

모든 검색·수집 응답 원문은 `ToolCall.response_blob`에 저장한다. 리플레이 재료다.

### 10.3 사용자 입력 경로

- **보유 부품 등록:** 부품 패널에서 이름과 링크(선택)를 입력한다. PartScout가 2-d~2-f를 그 부품 하나에 대해 실행하고, Inventory에 추가한다.
- **자동 취득 실패 필드:** 부품 패널에서 직접 입력한다. 신뢰도는 `user_input` 또는 `user_measured`.

### 10.4 후보 선정과 비교표 규칙 (1차 기준, 이후 개선 대상)

**정렬**
1. hard 조건 만족 여부 — 전부 true → null 포함 → false 순
2. 예산 초과 총량 오름차순 — 이 후보를 넣었을 때 예산별 초과량을 limit 대비 %로 바꿔 합산
3. 가격 오름차순

**선정**
- 보유 부품은 무조건 넣는다.
- 그다음 정렬 순서대로 hard 만족 후보를 채운다.
- hard를 어기는 후보는 **1개까지** 넣는다. 위반 폭(%)이 가장 작은 것을 고른다. "조금 넘지만 다른 게 다 좋은" 경우가 실제로 많고, 그 초과분이 곧 다음 트레이드오프 카드가 된다.
- 총 3~5개.

**비교표 열**
- `must`에 등장한 필드 (강조 표시)
- 4축 비용: 시간 합계, 돈, 되돌리기 종류, 학습 시간 합계
- 재고, `checked_at`

값이 `guess`·`unknown`인 칸은 회색 + 물음표로 표시하고, 비교 근거(정렬 1·2)로 쓰지 않는다.

---

## 11. 지식 아키텍처 — 회로·부품 지식을 AI에 어떻게 주는가

### 11.1 L1 — 상시 컨텍스트 (매 호출, 얇게)

- 역할 정의와 출력 스키마
- 현재 프로젝트 상태 조각 (§7.4 DomainInput)
- 직전 2턴과 이번 발화

목표는 2~4천 토큰. **부품 데이터는 여기 들어가지 않는다.**

### 11.2 L2 — 조회 (tool call)

```
get_part(key)                           → 전체 필드
get_decision(code)                      → 과거 결정 상세
get_budget(key)                         → 예산 현황 (코드 계산값)
list_nets()                             → 결선 현황
measure_request(part_key, field, reason)→ 사용자에게 실물 계측 요청
search_parts({category, must, nice})    → PartScout 전용. 캐시 우선, 부족하면 웹 탐색
```

AI는 부품을 **암기하지 않고 조회한다.** 부품 DB를 프롬프트에 붓는 방식은 확장되지 않는다(수백 개만 돼도 안 들어간다). 가격·재고는 어차피 실시간이라 넣을 의미가 없다.

### 11.3 L3 — 모델 내장 지식 (주지 않음)

옴의 법칙, 전압 분배, 풀업/풀다운, I2C·SPI·UART 기초, 액추에이터 돌입전류, 리튬셀 취급, 3D 출력 공차와 오버행. 모델이 이미 안다. 프롬프트에 넣지 않는다.

**단, 이 층은 틀릴 수 있다.** 그래서 L4가 있다.

### 11.4 L4 — 룰팩 (코드, 결정론적)

§9. LLM 판단 뒤에 항상 돌고, 위반은 충돌이 되며, 충돌은 카드가 된다.

---

## 12. 3D · 하우징 · 조립

### 12.1 원칙

- **부품 형상을 생성하지 않는다.** 부품의 `model_3d`(.glb)를 배치한다.
- 모델이 없으면 `dims_mm` 기반 직육면체 대체 형상을 쓰고 "대체 형상"이라고 표시한다. 1차는 이것으로 충분하며, 형상 생성은 시도하지 않는다.
- 배치 상태는 Placement 레코드다. 이 JSON이 상태다.
- 조립 애니메이션은 부품별 등장 순서 + 카메라 이동이다. 물리 시뮬레이션이 아니다.
- 렌더러는 three.js / react-three-fiber.

### 12.2 배치 제안 (planner)

**planner 입력**
- 모든 인스턴스와 `dims_mm`(신뢰도 포함)
- 넷 목록
- `form`·`fab` 슬롯
- ME 제약
- 기존 `set_by: user` 배치

**planner 출력:** `set_by: user`가 아닌 인스턴스의 `{ instance, pos_mm, rot_deg }[]`

**코드 처리:** 저장 → 간섭 검사 → 간섭이 있으면 간섭 목록을 첨부해 planner를 1회 재호출한다. 그래도 남으면 화면에 간섭을 표시하고 사용자가 드래그로 옮긴다.

### 12.3 간섭 검사 (코드)

1. 회전을 적용한 바운딩박스(OBB)를 축 정렬 바운딩박스(AABB)로 변환한다.
2. `dims_mm`이 `guess`인 부품은 각 면을 3mm씩 확장한다.
3. 두 AABB가 겹치면 간섭이다.

정밀 메쉬 충돌은 1차 범위 밖이다.

### 12.4 조립 순서 (planner)

**planner 출력:** `AssemblyStep[]` (step, kind, title, instructions, instances_added, nets_connected, camera, photo_guide)

**코드 검증**
- 모든 인스턴스가 정확히 한 번 추가되는가
- `nets_connected`의 넷 멤버가 그 스텝까지 모두 추가되었는가
- 스텝 번호가 1부터 연속인가

위반이 있으면 목록을 첨부해 1회 재시도한다.

**계측 스텝 자동 삽입:** open 상태의 `MeasurementRequest`마다 `kind: "measure"` 스텝을 코드가 **맨 앞에** 넣고 번호를 다시 매긴다.

**렌더:** worker가 headless Chromium으로 스텝별 PNG를 렌더해 `renders/{project_id}/step-NN.png`에 저장한다.

### 12.5 커스텀 하우징 (CadQuery)

**cadquery_codegen 입력**
- 배치(Placement)
- 인스턴스별 바운딩박스 (guess 여유 적용 후)
- 넷에서 도출한 외부 노출 필요 부품 (usb, 스위치 등)
- `fab` 슬롯
- ME 제약 (최소 벽 두께 등)

**출력:** 하나의 파이썬 CadQuery 스크립트. `/out/housing.stl`을 쓴다.

**격리 실행 조건 (cadquery 컨테이너)**
- 네트워크 없음
- 루트가 아닌 사용자
- 쓰기 가능한 경로는 `/out`뿐
- CPU 2코어, 메모리 2GB, 제한 시간 60초

**코드 검증**
1. STL이 생성되었는가
2. 모든 내부 인스턴스 바운딩박스를 감싸는가
3. 내부 부품과 간섭이 없는가

실패하면 오류·검증 결과를 첨부해 최대 2회 재시도한다.

**산출물:** STL, 미리보기 PNG. 하우징은 `housing:<id>` 인스턴스로 배치에 들어간다.

---

## 13. 내보내기

| 파일 | 내용 |
|---|---|
| `spec.md` | 프로젝트 한 줄, 슬롯, 예산표, 결정 목록(선택과 4축 비용), 남은 경고, 잠기지 않은 결정과 계측 요청 |
| `bom.csv` | 열: `part_key, name, mpn, category, qty, owned_qty, unit_price_krw, total_krw, vendor, url, stock, checked_at, min_confidence, note` |
| `netlist.txt` | 넷마다 한 줄. 핀 정보가 있으면 `NET VBAT: pwr-x#1.OUT+ -> actuator-y#1.V+, ...`, 없으면 `NET I2C0: compute-a#1 <-> sensor-b#1` |
| `housing.stl` | §12.5 |
| `scene.json` | 배치 전체 |

**BOM 내보내기 전 처리 (코드)**
1. `checked_at`이 24시간보다 오래된 Offer는 다시 확인한다.
2. `stock: false`인 항목은 행에 `note: 품절`을 쓰고 화면에 경고한다.
3. `stock: null`은 `note: 재고 미확인`을 쓴다.

---

## 14. 화면

1. **대화 + 스펙 칸** — 좌측 대화, 우측 8칸 상태. `assumed`는 가정 내용과 "이대로 진행"(acknowledge) 버튼. 턴 진행 단계 표시(SSE)
2. **예산 대시보드** — 예산별 막대. 할당 합계 대 limit, 초과는 빨강, 신뢰도는 색 농도. 한도 직접 입력. warning 목록
3. **결정 카드 큐** — `plain` 해설이 맨 위, 용어는 툴팁. 트레이드오프 카드는 옵션별 4축 비용·예상 시행착오·satisfies, 부품 카드는 비교표. 선택 / 미루기 버튼. `locked: false` 표시
4. **부품 패널** — 획득된 부품과 필드별 신뢰도·출처. `guess`·`unknown` 필드에 "실물 계측" 입력. 보유 부품 등록
5. **3D 뷰** — 배치, 간섭 표시(빨강), guess 치수 점선, 대체 형상 표시, 드래그 이동, 조립 스텝 재생 슬라이더
6. **내보내기** — §13 파일 다운로드
7. **로그 뷰어 (개발용)** — 턴 목록 → 단계 → LlmCall·ToolCall 전문, 룰팩 히트 수

---

## 15. 관측과 리플레이

기능보다 먼저 깐다(M0).

- **LLM 호출 로그:** `LlmCall` 전 필드 (역할, 모델, 프롬프트·응답 전문, 스키마 검증 결과, 토큰, 지연, 비용)
- **외부 도구 로그:** `ToolCall`과 응답 원문 blob
- **상태:** 모든 변경을 append-only 이벤트로 (§6.1)
- **씬 JSON:** 배치가 바뀔 때마다 저장. 3D가 이상할 때 모델 문제인지 렌더 문제인지 갈린다
- **부품 출처 추적:** 필드별 `source`·`checked_at`. BOM이 틀렸을 때 여기부터 본다
- **룰팩 히트 로그:** 규칙 id별 발생 횟수. 규칙을 늘려야 할 곳이 보인다

**턴 리플레이 CLI**

```
forge replay <turn_id>            # 기본: 기록 재생
forge replay <turn_id> --live     # 실제 재호출
```

**기본 모드 (기록 재생)**
1. 빈 임시 DB에 `seq_before`까지의 이벤트를 적용한다.
2. 턴을 다시 실행하되, LLM 호출과 외부 도구 호출은 기록된 응답을 `(role 또는 tool, 호출 순서)` 기준으로 돌려준다.
3. 새로 생긴 이벤트와 원래 이벤트(`seq_before`~`seq_after`)를 비교해 diff를 출력한다.
4. **diff가 없어야 통과다.**

**`--live` 모드:** LLM과 외부 도구를 실제로 다시 호출하고 diff를 출력한다. 프롬프트를 수정한 뒤 비교하는 용도다.

코드 쪽 비결정 요소(현재 시각, UUID 생성, 정렬)는 리플레이에서 고정할 수 있게 주입 가능한 형태로 만든다.

---

## 16. 기술 스택

- Next.js (App Router) + TypeScript — web과 worker가 같은 코드베이스
- Postgres (개발·운영 동일), ORM은 Drizzle 권장
- 작업 큐: Postgres `jobs` 테이블 + `SELECT … FOR UPDATE SKIP LOCKED`. 별도 큐 인프라는 쓰지 않는다
- zod — 레코드·LLM 입출력 스키마의 단일 출처
- three.js / react-three-fiber
- Playwright (headless Chromium) — 스텝 PNG 렌더
- Anthropic SDK, OpenAI SDK — ModelAdapter 뒤
- 네이버 검색 API(쇼핑), 웹 검색 제공자 — `SearchProvider` 인터페이스 뒤
- CadQuery — 별도 파이썬 워커 컨테이너
- docker compose — 로컬과 운영 동일
- **에이전트 프레임워크를 쓰지 않는다.** 루프는 직접 짠다

---

## 17. 마일스톤

앞 마일스톤의 완료 판정을 모두 통과해야 다음으로 넘어간다. 코드로 된 판정 로직(충돌 감지, 룰팩, 예산 계산, 취득 정책, 숫자 검증, 간섭 검사)은 LLM 없이 도는 단위 테스트가 필수다.

| M | 내용 | 완료 판정 |
|---|---|---|
| **M0** | 저장소 골격, docker compose, 서버 배포 + 접근 비밀번호, 전체 zod 스키마, 이벤트 저장 + projection, ModelAdapter + 호출 로그, 리플레이 CLI, 원칙 7 테스트·린트 | ① 레코드 CRUD 테스트 통과 ② 이벤트로 projection을 다시 만들면 현재와 같음 ③ 가짜 LLM 응답으로 만든 턴이 기록 재생에서 diff 0 ④ 서버 URL이 비밀번호 뒤에서 열림 ⑤ 시드 Part 0건 테스트 통과 |
| **M1** | 대화 + 스펙 칸 UI + router + ME 에이전트 1개 + reply | ① 임의의 아이디어로 10턴 이내에 8칸 중 3칸 이상이 `filled` ② 확인받지 않은 assumed가 4개째 생기지 않음 ③ 슬롯 변화 이력이 이벤트로 보임 |
| **M2** | Budget·Constraint·Allocation + ConflictDetector(R1~R3, W) + CardWriter(tradeoff) + 결정 적용 + 예산 대시보드 + 카드 큐 + 숫자 검증 + Glossary·KnowledgeGap | ① 충돌 판정 단위 테스트 통과 ② 시나리오 테스트에서 blocking 충돌이 **자동으로** tradeoff 카드가 됨 ③ 카드에 `plain`, `terms`, 4축 비용이 모두 있고 `satisfies`는 코드가 계산함 ④ 옵션을 고르면 효과가 적용되고 충돌이 `resolved` ⑤ 새 용어가 KnowledgeGap을 만듦 |
| **M3** | PartNeed + PartScout(캐시·네이버 API·웹 검색·페이지 수집·파싱) + Part·Offer·Inventory + part_pick 카드 + 비교표 + 부품 패널 + 계측 요청 + R4 | ① 요구 조건 하나에서 **실제로 구매 가능한** 후보 3~5개가 링크·가격·`checked_at`과 함께 비교표로 뜸 ② 취득 정책 상한 테스트 통과 (치수는 항상 guess, 핀은 unknown) ③ 실물 계측 입력 시 measured로 승격되고 판정이 재계산됨 ④ 두 번째 같은 요구에서 캐시가 먼저 쓰임 |
| **M4** | HW·SW·ID 에이전트 추가 + Net + RulePack 8개 + 폴백 + 비용 상한 + 잠금·lock_blockers | ① 룰팩 8개 규칙 각각 통과·위반 픽스처 테스트 통과 ② 룰팩 위반이 `RULE-` 카드가 됨 ③ Anthropic 키를 막은 상태, OpenAI 키를 막은 상태 각각에서 chat 턴이 `done`으로 끝남 ④ 비용 상한을 넘기면 턴이 `partial`로 멈춤 |
| **M5** | planner 배치 + 간섭 검사 + 3D 뷰 + 조립 스텝 + PNG 렌더 + CadQuery 하우징 + 내보내기 | ① BOM csv, netlist txt, STL, scene.json이 나옴 ② guess 치수 부품이 점선이고 +3mm 여유가 간섭 검사에 적용됨 ③ 스텝마다 PNG가 저장됨 ④ 계측 요청이 조립 맨 앞 스텝으로 들어감 |

**M2와 M3가 이 제품의 증명이다.** M2는 "대가를 보여준다", M3는 "뭘 사야 할지 보여준다". 둘 중 하나라도 안 되면 나머지는 의미 없다.

---

## 18. 1차 완료 검증 기준

로봇 하나를 백지에서 끝까지 설계해 실제로 만들 수 있으면 1차 완료다.

1. 부품 0개인 DB에서 시작해 스펙 8칸이 모두 `filled` 또는 `assumed + acknowledged`가 된다
2. blocking 충돌이 **5건 이상 자동 감지**된다 (사용자가 직접 입력한 제약·한도에서만 생긴 것은 제외)
3. 결정 카드가 **20장 이상** 쌓이고, 모든 카드에 4축 비용과 `plain` 해설이 채워져 있다
4. 부품 선택 카드에서 **실제 구매 가능한 후보 3~5개와 비교표**가 제시된다
5. BOM의 모든 항목에 구매 링크와 24시간 이내 `checked_at`이 붙고, `stock: false` 항목이 0건이다. **구할 수 없는 부품이 섞이면 실패**
6. `guess` 치수 부품이 3D에서 점선으로 표시되고 간섭 여유가 적용된다
7. 조립 스텝이 10단계 이상 렌더되고 각 스텝 PNG가 저장된다
8. 아무 턴이나 골라 리플레이 CLI 기록 재생에서 diff 0으로 재현된다
9. **그 BOM과 조립 순서대로 실제 로봇이 조립되어 동작한다** ← 최종 판정

9번이 진짜 기준이다. 나머지 여덟 개는 9번으로 가는 길에 확인하는 것들이다.

---

## 19. 1차 이후로 미룬 것과 지금 깔아둘 것

### 19.1 미룬 것

| 항목 | 미룬 이유 |
|---|---|
| 두 번째 종류 기기로 범용성 검증 | 로봇 하나로도 주요 기능은 확인된다. 원칙 7은 §3의 자동 검사와 코드 리뷰로 지킨다 |
| 부품 비교 알고리즘 고도화 | 1차는 §10.4의 단순 규칙으로 충분 |
| 단종·품절 시 대체품 자동 제안 | 데이터가 쌓인 뒤 |
| 회로도 생성, PCB | 결선 리스트로 먼저 검증 |
| 해외 판매처 | 국내 조달로 1차 검증 |
| 부품 3D 형상 자동 생성 | 직육면체 대체 형상으로 1차 검증 |

### 19.2 다음 차수를 위해 1차에서 반드시 깔아둘 것

이걸 빼면 나중에 두 배로 든다.

| 차수 | 1차에서 깔 것 |
|---|---|
| 2차 (웹 안에서 에이전트 구현) | ModelAdapter, 이벤트 저장, 턴 리플레이 |
| 3차 (사진 디버깅) | 조립 스텝 PNG + `photo_guide` |
| 4차 (학습 체계) | KnowledgeGap, Glossary, 슬롯 상태 변화 이력 |
| 공개 | 모든 레코드의 `scope`, `project_id: null` 자산 분리 |

---

## 20. 남은 열린 질문

1차 구현을 막지 않는 것만 남겼다.

- 클라우드 업체와 도메인 — 배포 단계(M0)에서 사용자가 정한다
- 네이버 스마트스토어·국내 쇼핑몰 상세 페이지를 어디까지 수집할 수 있는가 — M3 시작 시 약관 확인. 막히면 API 정보만 쓰고 스펙은 데이터시트에 의존
- `plain` 해설 난이도 — 1차 기준 독자(§6.11)로 시작해, 실제 사용 후 조정
- 사용자가 핀 정보를 입력한 부품에 대해 결선 리스트를 핀 대 핀으로 뽑는 것 — 형식은 §13에 정의돼 있다. 핀 입력 UI의 편의성은 1차 이후 개선

---

## 부록 A. v0.3 → v0.4 변경 이력

**문서 성격**
- 다른 문서 없이 읽히도록 v0.2에서 빠졌던 내용을 다시 넣음: Conflict 스키마, `chosen_option_id`, 에이전트 입력 계약, 스키마 강제·재시도, scope 판정 기준, 다음 차수 대비 표
- 구현 담당 AI용 지시 절(§0)과 용어 절(§2) 추가

**결정된 사항**
- 원칙 3에 예외를 명시: 부품 선택 카드는 충돌이 아니라 PartNeed에서 생성 (`conflict_id` / `part_need_id` 분리)
- 판매처: 국내 쇼핑몰 + 네이버 쇼핑 중심, 설정 파일로 관리 (§10.1)
- 서버·클라우드 배포 전제: 상시 실행 컨테이너 + jobs 큐 + SSE, 단일 접근 비밀번호, 비용 상한, 개발·운영 모두 Postgres (§5)
- v0.3 §13 열린 질문의 1차 기본값 확정
  - 확인받지 않은 assumed 최대 3개
  - deferred는 가장 나쁜 값으로 계산
  - 직육면체 대체 형상으로 충분
  - plain 기준 독자는 고등학교 물리 수준
  - 결선은 핀 정보가 있으면 핀 단위, 없으면 모듈 단위

**모순 해소**
- 신뢰도 단계를 `measured > datasheet > estimate > guess > unknown` 하나로 통일
- 룰팩 `i_peak`와 부품 `i_stall_ma` 불일치 → 필드 사전(§6.2)으로 통일. 스톨 전류는 `i_peak_ma`
- 정규 단위 표 추가, 단위 변환은 코드가 담당

**새로 정의한 것**
- Net(결선) 레코드 — 룰팩 전기 규칙과 결선 리스트의 데이터
- 예산 한도의 최초 출처 (`limit_source: slot:<key>`)
- 부품 결정 시 추정 할당을 파생 할당으로 교체하는 규칙
- 업서트 키 (제약·할당·부품 요구·넷)
- 카드 코드 부여 규칙, Decision `obsolete` 상태, `locked` / `lock_blockers`, MeasurementRequest
- tradeoff 옵션의 `effects`와 코드 시뮬레이션에 의한 `satisfies`
- CardWriter 숫자 검증
- stage 전환 조건 전체
- 슬롯 ↔ 도메인 대응표
- 턴 파이프라인 단계와 kind별 처리, 실패·폴백 표
- 모든 역할에 다른 벤더 폴백 (v0.3은 슬롯 판정 역할에 폴백이 없어 "한 벤더 차단 시 턴 완주" 기준을 만족할 수 없었음)
- 배치·조립 순서의 담당(planner)과 코드 검증, 좌표계, 간섭 여유 적용 방식(각 면 3mm)
- CadQuery 격리 조건과 검증
- 리플레이 CLI의 두 모드와 통과 기준 (외부 도구 응답도 기록)
- 원칙 7 자동 검사

**정리**
- 모델 매핑 표에서 개발 도구 행("코드 구현 전반")을 제거. 앱 실행 중에 쓰는 모델만 남김
- 룰팩 전류 규칙을 연속(`CURRENT_CONT_OVER`)과 순간(`INRUSH_OVER`)으로 분리
