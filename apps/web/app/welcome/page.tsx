import WelcomeView from "./welcome-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "달그락 마을에 온 걸 환영해요 · 달그락 대장간" };

// 가입 직후에 오는 자리: 달그락 마을에서 할 수 있는 것, 홈 화면에 추가하는 법, 내 아이디어로 시작하기.
export default function Welcome() {
  return <WelcomeView />;
}
