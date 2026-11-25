# 달그락 도우미 (dalgrak-helper)

내 컴퓨터에서 돌면서, **내 ChatGPT 요금제**로 [달그락 대장간](https://dalgrak.app) 대화를 이어주는 작은 오픈소스 앱입니다.

도우미를 켜 두면 달그락 대장간 화면에서(휴대폰이든 다른 PC든) 바로 대화할 수 있어요. API 키는 필요 없습니다.

## 쓰는 법

Node.js 20 이상이 필요합니다.

```bash
npx dalgrak-helper
```

1. 브라우저가 열리면 **달그락 대장간**에 로그인하고 연결을 허용합니다.
2. 이어서 **ChatGPT**에 로그인하고 "ChatGPT 요금제 사용"을 허용합니다.
3. 터미널에 "준비됐어요"가 뜨면 달그락 대장간 화면에서 대화를 시작합니다.

창을 닫으면 대화가 멈춥니다. 기록·설계·파일은 달그락 대장간에 그대로 남고, 다시 켜면 이어집니다.

| 명령 | 하는 일 |
|---|---|
| `dalgrak-helper` | 연결이 없으면 로그인하고 바로 시작 |
| `dalgrak-helper status` | 연결 상태 보기 |
| `dalgrak-helper models` | 쓸 수 있는 모델 보기 |
| `dalgrak-helper model <이름>` | 쓸 모델 정하기 |
| `dalgrak-helper logout` | ChatGPT와 달그락 연결 모두 끊기 |

## 무엇이 어디로 가나요

```
달그락 대장간 화면 (어느 기기든)
        │  내가 쓴 말 / 화면에 보일 답
달그락 대장간 서버 ── 대화 기록·설계·파일 보관, 설계 규칙 검사
        │  내가 쓴 말 / 도구 호출 / 답
달그락 도우미 (이 컴퓨터) ── ChatGPT 로그인 보관
        │  AI 요청 (내 ChatGPT 요금제)
api.openai.com
```

- **ChatGPT 로그인 정보는 이 컴퓨터 밖으로 나가지 않습니다.** `~/.config/dalgrak-helper/`에 본인만 읽을 수 있게(0600) 저장되고, `auth.openai.com`과 `api.openai.com`으로만 보냅니다. 달그락 대장간 서버는 이 토큰을 받지 않습니다.
- **ChatGPT의 대화나 메모리에는 접근하지 않습니다.** 요청하는 권한은 이름·이메일·프로필과 "요금제로 AI 요청하기"뿐입니다.
- **달그락 대장간 서버가 받는 것**은 달그락 로그인, 설계를 기록하는 도구 호출, 화면에 보여줄 답입니다.
- 이 컴퓨터로 들어오는 연결은 없습니다. 도우미가 밖으로 묻는 연결만 쓰므로 공유기 설정이 필요 없습니다(로그인할 때만 잠깐 `127.0.0.1`에서 결과를 받습니다).

## 사용량

AI 요청은 내 ChatGPT 요금제 사용량에서 나갑니다. [ChatGPT 설정 → 사용량](https://chatgpt.com/settings/usage)에서 이 앱의 사용량을 보고 한도를 정하거나 연결을 끊을 수 있어요. ChatGPT Plus·Pro 요금제에서 쓸 수 있습니다.

## 어떻게 동작하나요

- ChatGPT 연결은 OpenAI의 [Sign in with ChatGPT · ChatGPT plan usage](https://developers.openai.com/siwc/token-sharing-open-source) 공개 흐름을 그대로 따릅니다(PKCE, 클라이언트 시크릿 없음, `127.0.0.1` 콜백, ID 토큰 검증).
- 달그락 연결은 Claude 커넥터와 같은 OAuth와 같은 MCP 도구를 씁니다. 설계 규칙과 검사는 전부 달그락 서버의 도구 안에 있습니다.
- 의존 패키지가 없습니다. `src/`의 파일 여섯 개가 전부라 직접 읽어볼 수 있어요.

| 파일 | 하는 일 |
|---|---|
| `src/openai-auth.mjs` | ChatGPT 로그인, 토큰 갱신, 로그아웃 |
| `src/dalgrak.mjs` | 달그락 대장간 로그인과 도구 호출 |
| `src/agent.mjs` | 한 번의 대화 턴(모델 호출 ↔ 도구 호출) |
| `src/relay.mjs` | 달그락 서버에서 말을 받아 답을 올려보내기 |
| `src/loopback.mjs` · `src/store.mjs` | 로그인 결과 받기, 로컬 저장 |

## 개발

```bash
npm test                              # 실제 로그인 없이 도는 테스트
DALGRAK_SERVER=http://localhost:3000 node bin/dalgrak-helper.mjs   # 로컬 서버에 붙이기
```

## 라이선스

MIT. 이 앱은 OpenAI나 ChatGPT의 공식 제품이 아닙니다.
