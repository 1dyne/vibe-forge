# 달그락 대장간 v0.5 — 사용자가 채울 설정 안내

작성/공식 문서 확인: 2026-09-17

이 파일은 설정을 어디에서 얻고 어디에 넣는지 설명한다. 현재 앱은 기본 골격과 mock 실행을 지원한다. API key가 있어도 `APP_MODE=mock`이거나 비용 상한이 0이면 유료 모델 호출을 시작하지 않는다.

## 1. 지금 열어볼 파일

- `../달그락-대장간-1차-개발-명세서-v0.5.md`: 제품·데이터·에이전트·검증 기준.
- `../.env.local`: **본인 키와 비밀번호를 실제로 넣을 파일**. 빈칸으로 준비했다.
- `../.env.example`: 공유 가능한 빈 템플릿. 여기에 실제 키를 넣지 않는다.
- `../.gitignore`: `.env.local`과 로컬 데이터·로그를 Git에서 제외한다.

`.env.local`의 `변수명=` 오른쪽에 값을 입력하고 저장하면 된다. 따옴표가 필요한 문자가 있으면 `변수명="값"` 형태로 쓴다. 설명 주석은 그대로 둬도 된다. 키를 대화에 붙이거나 명세에 적을 필요가 없다.

처음에는 아래 순서로만 준비해도 된다.

1. OpenAI API key, Anthropic API key.
2. 앱 접근 비밀번호와 세션 서명용 임의 문자열.
3. 감당할 수 있는 턴당/일일 API 비용 상한.
4. 부품 탐색용 검색 제공자는 M3에서 지원 여부·비용·이용 조건을 확인한 뒤 선택한다.

DB·Supabase·Vercel·워커 배포 관련 값은 나중에 채워도 된다. 사용자가 소스 코드를 직접 작성할 필요는 없다.

## 2. API 키

### OpenAI

- 공식 API 플랫폼에서 프로젝트용 API key를 만들거나 기존 key를 사용한다.
- `.env.local`의 `OPENAI_API_KEY=`에 넣는다.
- 모델 ID 3개와 가격표는 **구현자가 현재 문서와 계정 접근성을 확인해 채울 항목**이다. 사용자가 모델 이름을 추측해서 적을 필요가 없다.
- key를 web client나 `NEXT_PUBLIC_` 변수에 넣지 않는다. worker만 사용한다.

[OpenAI 공식 시작 안내](https://developers.openai.com/api/docs/quickstart)

### Anthropic

- Claude API Console에서 API key를 만든다.
- `.env.local`의 `ANTHROPIC_API_KEY=`에 넣는다.
- 활성 Claude 프로필은 사용자 요구에 따라 **Sonnet 5와 Opus 5만** 쓴다. Haiku는 사용하지 않는다.
- 기본 매핑은 빠른 대화·검색 질의에 Sonnet 5, 심화 설계·코드에 Opus 5다. API ID는 구현자가 계정 접근성과 공식 문서로 확인한다.

[Anthropic 공식 시작 안내](https://platform.claude.com/docs/en/get-started)

### 네이버 쇼핑 검색은 설정하지 않음

네이버 개발자센터의 **네이버 로그인, 인증서, 전자문서, 배송지정보, 카페, 캡처, 캘린더** 중 어느 것도 부품 검색의 대체 API가 아니다. 이 프로젝트 때문에 그 항목을 선택하거나 Client ID를 만들 필요가 없다.

네이버 공식 공지에 따르면 쇼핑 검색 API는 2026년 7월 31일 종료됐고 NAVER API HUB로 이전되지 않았으며 대체 API도 제공되지 않는다. 일반 검색 API의 이전 공지와 쇼핑 API 종료를 혼동하지 않는다.

- [검색 API 이전 안내](https://developers.naver.com/notice/article/32530)
- [쇼핑·책·전문자료 검색 API 종료 및 대체 API 미제공 안내](https://developers.naver.com/notice/article/32564)

달그락 대장간은 국내 판매처의 허용된 페이지, 제조사 자료, 사용자가 붙여 넣은 상품 링크를 취득 후보로 사용한다. 추후 일반 웹 검색 제공자를 연결하더라도 검색 결과는 후보 발견에만 쓰며, 재고는 판매 페이지 또는 사용자의 주문 전 확인으로 별도 판정한다.

## 3. 비밀번호와 비용

| 변수 | 넣을 값 | 비어 있거나 0일 때 |
|---|---|---|
| APP_PASSWORD | 이 앱에 접속할 때 쓸 본인 전용 비밀번호 | 인증 설정 필요 표시 |
| SESSION_SECRET | 다른 비밀번호와 별개인 충분히 긴 임의 문자열 | 세션 발급 금지 |
| POSTGRES_PASSWORD | 로컬 개발 DB용 별도 비밀번호 | 로컬 DB 실행 설정 미완료 |
| LLM_COST_LIMIT_PER_TURN_USD | 한 번의 입력 처리에 허용할 최대 API 비용, USD | 실제 유료 호출 차단 |
| LLM_COST_LIMIT_PER_DAY_USD | UTC 하루에 허용할 최대 API 비용, USD | 실제 유료 호출 차단 |

SESSION_SECRET은 비밀번호 관리 도구로 32바이트 이상의 무작위 값을 생성해 넣는 방법이 편하다. 사람이 기억하는 문장이나 APP_PASSWORD를 재사용하지 않는다.

예산 값은 추천 가격이 아니라 **사용자가 승인하는 상한**이다. `0`을 지우고 원하는 양수를 적는다. 일일 상한은 턴 상한 이상이어야 한다. API 한 번의 예상 최대 비용이 한도보다 크면 앱은 호출을 시작하지 않고 한도가 부족하다고 안내한다.

이 상한에는 LLM과 유료 검색 호출이 포함된다. Vercel/Supabase/VM의 서비스 요금·쇼핑몰 부품 구매액을 자동 차단하는 한도는 아니다. 서버의 월 예산은 공개 배포 전에 따로 정한다.

`APP_MODE=mock`은 실제 API를 쓰지 않는 개발 모드다. 구현 후 설정 검사와 비용 한도 확인이 끝나면 `live`로 바꿀 수 있다. 키가 있어도 mock이면 실제 호출하지 않는다.

## 4. “서버가 있나요?”의 뜻

새 컴퓨터를 사야 한다는 의미가 아니다. **브라우저를 닫아도 AI 작업·검색·3D 렌더·CAD 작업을 처리할 프로그램을 어디에서 계속 실행할지** 묻는 뜻이다.

보유한 계정은 다음처럼 활용할 수 있다.

| 보유 서비스 | 활용 |
|---|---|
| GitHub | 소스와 변경 이력 저장 |
| Vercel | 사용자 화면과 짧은 API |
| Supabase | 프로젝트 DB와 비공개 파일 저장 |
| Firebase | 현재 기본 설계에는 필요 없음 |

우선은 **사용자 PC에서 전체 앱을 실행**한다. Vercel/Supabase에 새 프로젝트를 만들 필요도 없다. Docker Desktop의 Linux 컨테이너 실행 환경 준비는 구현자가 설치 여부부터 확인하고 안내한다.

공개할 때 선택지는 다음과 같다.

- **하나의 VM에 전체 앱 배포:** web·worker·DB·CAD를 한 환경에서 관리.
- **Vercel + Supabase + 별도 워커:** 기존 계정 활용. worker/CAD를 실행할 지속 실행 환경이 추가로 필요.
- **임시로 PC 워커 사용:** Vercel/Supabase를 쓰고 PC가 켜져 있을 때 작업 처리. 항상 켜지는 서비스로 간주하지 않는다.

Vercel에서도 긴 함수 실행을 지원한다. 다만 이 명세는 큐·재시작·CAD 격리를 동일하게 유지하기 위해 워커를 별도 경계로 둔다. Vercel 계정 자체가 부적합하다는 뜻은 아니다. [Vercel 공식 실행 시간 안내](https://vercel.com/changelog/vercel-functions-can-now-run-up-to-30-minutes)

추가 서비스 가입·요금제 선택·도메인은 지금 결정할 필요가 없다. **로컬 구현과 검증은 먼저 진행하고, 공개 배포 전에 비용과 운영 방식을 결정**한다.

## 5. Supabase를 사용할 때만 채울 값

Supabase를 이미 사용하고 있어도 기존 다른 앱의 DB를 그대로 재사용할지는 별도 확인한다. 달그락 대장간 전용 프로젝트 또는 분리된 데이터 공간을 사용한다.

### DB 연결

Dashboard의 **Connect**에서 실제 연결 문자열을 복사한다.

| 변수 | 용도 | Supabase 연결 유형 |
|---|---|---|
| DATABASE_URL_WEB | web의 짧은 DB 요청 | transaction pooler |
| DATABASE_URL_WORKER | 지속 worker | direct, IPv4만 가능하면 session pooler |
| DATABASE_URL_MIGRATIONS | migration/관리 명령 | direct 또는 해당 관리 명령을 지원하는 session 연결 |

문자열 속 비밀번호 placeholder를 실제 **DB 비밀번호**로 바꾼다. API key와 DB 비밀번호는 다르다. 비밀번호에 URL 예약 문자가 있으면 인코딩이 필요하므로 구현자가 키를 출력하지 않고 연결 검사를 하도록 한다. 호스트·포트·사용자명은 계정 화면의 값을 그대로 사용한다.

로컬 compose에서는 이 세 URL을 비워도 POSTGRES_USER/DB/PASSWORD로 내부 주소를 구성하도록 구현한다. 이 값들이 서로 우선 적용되는 규칙은 “명시 URL 우선, 없으면 로컬 compose 설정”이다.

[Supabase 공식 DB 연결 안내](https://supabase.com/docs/guides/database/connecting-to-postgres)

### 파일 저장

- `BLOB_STORE=supabase`로 전환한다. 로컬 개발은 `local` 그대로 둔다.
- `SUPABASE_URL=`에는 해당 프로젝트 URL.
- `SUPABASE_SERVER_KEY=`에는 서버용 secret key 또는 해당 계정에서 사용하는 legacy service_role key. 공개 anon/publishable key와 구별한다.
- `SUPABASE_STORAGE_BUCKET=`에는 앱 전용 **private** bucket 이름. 템플릿 기본 이름은 `dalgeurak-private`이며 실제로 생성한 이름과 일치시킨다.
- 서버용 키는 web/worker 서버의 필요한 부분에만 둔다. 브라우저 환경변수로 전달하지 않는다.

스토리지 관리자 키는 접근 정책을 우회할 권한이 있을 수 있으므로 파일 다운로드마다 앱 세션과 프로젝트 권한을 확인하도록 구현한다. [Supabase Storage 접근 제어](https://supabase.com/docs/guides/storage/security/access-control)

## 6. 구현자가 채울 부분

다음은 사용자에게 코드를 작성해 달라고 넘기지 않는다.

- API adapter, 현재 지원되는 모델 ID와 도구/구조화 출력 capability 검사.
- 모델별 input/output/cached token·검색 비용표와 확인 날짜. `.env.local`의 MODEL 값은 실제 접근성을 확인한 뒤 설정한다.
- config/models.yaml의 역할별 primary/fallback 매핑. designer/reviewer를 다른 호출로 실행하고 서로의 결과를 검사한다.
- 판매처별 페이지 수집·재고 증거 파싱·검색 제공자 adapter.
- DB migration, Supabase 연결 모드별 pool 설정, 스토리지 권한과 signed download.
- compose, worker queue, CadRunner 격리, health, backup/restore, `npm run doctor`.
- 모든 순수 계산·상태 전이·개인 계측·구매 수량·리플레이 테스트.

사용자가 채울 것은 **키·비밀번호·비용 상한·배포 선택·실제 프로젝트 정보**다. API key의 내용을 로그나 답변으로 되읽지 않는다.

## 7. 환경변수와 역할 매핑

템플릿의 MODEL 변수는 실제 모델명이 아니다. 확인된 ID를 넣는 자리다.

| 프로파일 | 기본 primary | fallback | 사용 역할 |
|---|---|---|---|
| small | ANTHROPIC_MODEL_SMALL (Sonnet) | OPENAI_MODEL_SMALL | router, reply, scout_query |
| designer | ANTHROPIC_MODEL_LARGE (Opus) | OPENAI_MODEL_LARGE | 도메인, CardWriter, answer, task_writer, scout_parse |
| reviewer | OPENAI_MODEL_LARGE | ANTHROPIC_MODEL_LARGE | HW/SW Evaluator |
| code | OPENAI_MODEL_CODE | ANTHROPIC_MODEL_CODE (Opus) | firmware_writer, cadquery_codegen, planner |

이것은 수정 가능한 기본 매핑이다. 계정에서 사용 가능한 모델·실제 품질·비용을 검사한 후 확정한다. 모델 이름을 미리 만들어 채우지 않는다. `SEARCH_PROVIDER=disabled`는 검색 제공자 미설정을 뜻한다. 구현 후 기존 API로 가능한 제공자를 설정하고 비용 검사한다.

## 8. 작성 완료 후 확인 방법

환경 파일을 채운 뒤 `npm run doctor`로 비밀값을 출력하지 않는 설정 검사를 실행할 수 있다.

구현 후에는 다음을 확인한다.

1. 필수 변수 누락 여부만 출력하고 비밀값은 출력하지 않는다.
2. mock 모드의 전체 회귀 테스트를 먼저 통과한다.
3. 사용자가 입력한 비용 한도 내에서 LLM과 설정된 검색 제공자의 최소 호출 검사.
4. 로컬 로그인·DB·파일 저장·워커·CAD 격리 확인.
5. 구매·계측·코드 실행 결과를 되돌려주는 시나리오 확인.
6. 공개 배포는 별도 D0 검증 후 진행한다.

`.gitignore`는 새 파일의 추적을 막는 설정이다. 이미 Git에 들어간 비밀을 제거하거나 폐기하는 기능은 아니다. 이번에는 실제 비밀값을 작성하지 않았으며, 향후 `.env.local`은 원격 저장소에 올리지 않는다.
