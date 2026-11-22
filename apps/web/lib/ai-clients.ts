// 달그락 커넥터는 원격 MCP(Streamable HTTP) + OAuth다. 그래서 "MCP를 지원한다"만으로는
// 부족하고, 주소 하나로 원격 서버를 붙일 수 있어야 한다. 도구마다 붙이는 자리와 말이
// 달라서, 쓰는 도구를 먼저 고르게 하고 그 도구의 순서만 보여준다.
//
// verified는 우리가 실제로 붙여본 곳만 true다. 공식 문서에 적혀 있다는 것과 실제로
// 되는 것은 다르고, 안 해본 것을 "된다"고 적으면 처음 쓰는 사람이 거기서 막힌다.

export type AiClientId = "claude" | "chatgpt" | "replit" | "editor" | "cli" | "other";

export type AiClient = {
  id: AiClientId;
  label: string;
  verified: boolean;
  intro: string;
  steps: Array<{ title: string; detail: string; command?: string }>;
  caution?: string;
};

export const AI_CLIENTS: AiClient[] = [
  {
    id: "claude", label: "Claude", verified: true,
    intro: "Claude 채팅에서 대화하면 정리된 내용이 이 프로젝트에 쌓여요. 웹 검색으로 부품과 데이터시트를 찾고 출처도 함께 남겨요.",
    steps: [
      { title: "커넥터 추가 (처음 한 번)", detail: "claude.ai → 설정 → 커넥터 → 커스텀 커넥터 추가에 아래 주소를 붙여넣고 연결을 눌러요. 뜨는 창에서 허용하면 끝이에요." },
      { title: "프로젝트 만들고 지침 붙여넣기", detail: "claude.ai에서 이 아이디어용 프로젝트를 만들고, 프로젝트 지침에 아래 문구를 붙여넣어요. 그 프로젝트의 모든 대화가 이 달그락 프로젝트에만 쌓여요." },
      { title: "대화 시작", detail: "새 대화를 열고 + 메뉴에서 달그락 대장간 커넥터를 켠 뒤 “이어서 하자”라고 말해요. 이 화면은 자동으로 새로고침돼요." }
    ]
  },
  {
    id: "chatgpt", label: "ChatGPT", verified: false,
    intro: "ChatGPT에서도 커스텀 커넥터로 붙일 수 있어요. 다만 조건이 있어요.",
    steps: [
      { title: "개발자 모드 켜기", detail: "설정에서 커넥터의 개발자 모드를 켜요. 이 기능은 유료 플랜에서만 보이고, 웹에서만 됩니다." },
      { title: "커넥터 추가", detail: "커넥터 추가에서 아래 주소를 넣고 연결해요. 허용 창이 뜨면 허용합니다." },
      { title: "대화 시작", detail: "새 대화에서 달그락 커넥터를 켜고 아래 지침 문구를 먼저 붙여넣은 뒤 이야기해요." }
    ],
    caution: "플랜에 따라 읽기만 되고 기록이 안 될 수 있어요. 기록이 안 쌓이면 알려주세요."
  },
  {
    id: "replit", label: "Replit", verified: false,
    intro: "Replit Agent가 달그락을 직접 읽고 쓰게 할 수 있어요. 코드까지 Replit에서 만들 때 편해요.",
    steps: [
      { title: "통합 화면 열기", detail: "replit.com/integrations 에서 MCP Servers 쪽으로 내려가요." },
      { title: "서버 추가", detail: "이름을 달그락 대장간으로 적고 아래 주소를 넣은 뒤 Test & save 를 눌러요. 허용 창이 뜨면 허용합니다." },
      { title: "지침 붙여넣기", detail: "Agent에게 아래 지침 문구를 먼저 주고 시작해요." }
    ]
  },
  {
    id: "editor", label: "Cursor · VS Code", verified: false,
    intro: "에디터 안의 AI가 달그락을 읽고 쓰게 해요. 설계를 보면서 바로 코드를 쓸 때 좋아요.",
    steps: [
      { title: "MCP 설정 파일 열기", detail: "Cursor는 설정의 MCP, VS Code는 GitHub Copilot의 MCP 설정에서 서버를 추가해요." },
      { title: "원격 서버로 추가", detail: "전송 방식은 http(Streamable HTTP), 주소는 아래 것을 씁니다. 처음 연결할 때 브라우저로 허용 창이 떠요." }
    ]
  },
  {
    id: "cli", label: "터미널 (Claude Code · Codex · Gemini CLI)", verified: true,
    intro: "터미널에서 쓰는 코딩 에이전트에 붙여요. 명령 한 줄이면 됩니다.",
    steps: [
      { title: "명령으로 추가", detail: "아래 명령을 터미널에 붙여넣어요. 처음 한 번 브라우저로 허용 창이 뜹니다.", command: "claude mcp add --transport http dalgeurak {URL}" },
      { title: "다른 도구라면", detail: "Codex와 Gemini CLI도 같은 주소를 원격 MCP 서버로 등록하면 됩니다. 설정 파일에 전송 방식 http와 이 주소를 적어요." }
    ]
  },
  {
    id: "other", label: "그 밖의 도구", verified: false,
    intro: "원격 MCP 서버를 주소로 추가할 수 있고 OAuth 허용 창을 띄울 수 있는 도구라면 붙습니다.",
    steps: [
      { title: "주소 등록", detail: "그 도구의 MCP 서버 추가 화면에서 전송 방식을 Streamable HTTP로, 주소를 아래 것으로 넣어요." }
    ],
    caution: "로컬(stdio) 서버만 되는 도구는 바로 붙지 않아요. 중계 도구가 따로 필요합니다."
  }
];

export const aiClient = (id: AiClientId) => AI_CLIENTS.find((client) => client.id === id) ?? AI_CLIENTS[0];
