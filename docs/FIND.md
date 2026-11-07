# 내 도깨비불 찾기 (`/find`) 운영 메모

달그락 대장간의 공개 온보딩·바이럴 페이지. 기획과 화면 기준은 [`FIND-HANDOFF.md`](./FIND-HANDOFF.md)와 [`find-prototype.html`](./find-prototype.html).

## 주소

| 주소 | 내용 | 로그인 |
|---|---|---|
| `/find` | 시작 → 판별 → 장작 → 공개 → 대장간 대기 | 필요 없음 |
| `/f/:id` | 친구가 공유한 도깨비불 + "나도 찾기". `?ref=코드`가 붙으면 추천으로 기록 | 필요 없음 |
| `/f/:id/og.png`, `/find/og.png` | 카톡·SNS 미리보기 이미지(2:1) | 필요 없음 |
| `/f/:id/card.png` | 저장·스토리용 카드(9:16) | 필요 없음 |
| `/f/:id` (대장간) | 주민의 대장간: 아이디어가 쌓일수록 변하는 3D 방(화로·선반·설계도·작업대·공구 걸이·장작더미·진열대·우체통), 장작·나도 갖고 싶어·정해진 말·이웃 | 필요 없음 (행동은 내 대장간이 있어야) |
| `/find/world` | 걷는 3D 도깨비 마을: 광장(본관)과 다섯 마을, 집 외형·기척 연출. 규칙은 [`FIND-WORLD.md`](./FIND-WORLD.md) | 필요 없음 |
| `/find/village` | 2D 마을 지도(3D가 안 되는 기기용): 마을 5개, 본관 공사 게이지, 이번 주 갖고 싶은 발명품, 소식판, 공사 계획판 | 필요 없음 |
| `/find/village/:theme-:seq` | 골목 지도(집 외형: 굴뚝 불·창문 불·깃발, 이웃 끈, 빈 터) | 필요 없음 |
| `/find/home` · `/find/neighbors` · `/find/dex` · `/find/random` | 내 집 · 이웃 · 도감 · 아무 집이나 | 필요 없음 |
| `/admin/find` | 지표, 대기 명단(삭제·CSV·쿠폰), 우체통(상태·답장·노션 동기화), 소식판, 공사 계획판, 신고된 집 | 운영자만 |

## 환경 변수

| 이름 | 설명 |
|---|---|
| `DATABASE_URL` (또는 `DATABASE_URL_WEB`) | Postgres. 없으면 `.data/find.json`에 저장(로컬 전용 — 재배포하면 사라짐). 표는 처음 요청 때 자동으로 만들어지고, `packages/db/migrations/0002_find.sql`도 같은 내용 |
| `FIND_HOSTS` | 온보딩 전용 도메인(쉼표로 여러 개). 이 도메인의 `/`는 바로 `/find`를 보여준다 |
| `FIND_COUPON_TEXT` | 메밀묵(추천) 안내 끝에 붙는 쿠폰 문구. 비어 있으면 쿠폰 얘기를 숨긴다 |
| `FIND_REFERRAL_BOOST` | 추천 1명당 앞당길 순번(기본 3) |
| `FIND_FUEL_BOOST` | 내 대장간이 받은 장작 1개당 앞당길 순번(기본 1) |
| `FIND_ALLEY_CAPACITY` | 골목당 터 수(기본 100) |
| `FIND_HALL_GOAL` | 본관 완공에 필요한 마을 장작 수(기본 1000, 25%마다 한 단계) |
| `FIND_FLAG_WANTS` | 집에 깃발이 서는 "나도 갖고 싶어" 수(기본 5) |
| `FIND_PLAN_MAX` | 공사 계획판 후보 하나에 넣을 수 있는 장작 수(기본 3) |
| `NOTION_TOKEN` | 우체통 → 노션 '달그락 우체통' 연동(없으면 앱에만 쌓였다가 넣으면 옮겨짐). `NOTION_MAILBOX_DS_ID`로 데이터 소스 변경 가능 |

## 바꿀 때 보는 곳

- **장작 키워드·문장 규칙·불 규칙**: `apps/web/lib/find/chips.ts` (`ROOTS`, `FOLLOW`, `FIRE`)
- **하드/소프트·안전 판별**: `apps/web/lib/find/classify.ts`. 지금은 규칙 기반. AI로 바꿀 땐 `analyzeFind()`가 같은 모양(HANDOFF §4)을 돌려주면 화면은 그대로 쓴다
- **닮은 프로젝트 DB**: `apps/web/lib/find/projects.json`. 이미지는 `apps/web/public/find/projects/`에 직접 두고, 라이선스가 CC BY·BY-SA·CC0·MIT·GPL 등 재게시 허용일 때만 보여준다(NC·ND·표기 없음은 링크만). 일치율 공식은 `projects.ts`의 `matchScore()`
- **캐릭터**: 원본 시트는 `asset/dokkaebi/`. 바꾸면 `python3 scripts/build-dokkaebi-sprites.py`로 웹용 스트립과 공유 카드용 색 변형을 다시 만든다
- **카톡 미리보기 캐시**: 카톡은 이미지 주소 기준으로 캐시한다. 대표 이미지를 바꾸면 `app/find/page.tsx`의 `og.png?v=` 숫자를 올린다
