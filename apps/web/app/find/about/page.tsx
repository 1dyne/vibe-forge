import { MAKER } from "../../../lib/find/classify";
import { readSeed } from "../../../lib/find/seed";
import AboutView from "./about-view";
import { OPERATOR_CONTACT } from "../../../lib/policies";

export const dynamic = "force-dynamic";
export const metadata = { title: "달그락 대장간이 뭐예요?", description: "아이디어를 말하면 설계도·회로·3D 미리보기·출력 파일이 되고, 조립은 내 손으로 해요. AI로 하드웨어에 입문한 문과생 메이커가 만들었어요." };

// 내 달그락을 받은 다음에 오는 자리: 달그락 대장간이 무엇을, 왜, 어떻게 하는지.
export default async function About({ searchParams }: { searchParams: Promise<{ seed?: string }> }) {
  const token = (await searchParams).seed ?? null;
  const seed = readSeed(token);
  // 가입은 대장간 주소에서 한다(온보딩이 다른 주소에서 열려 있어도 그쪽으로 보낸다).
  const base = (process.env.APP_BASE_URL ?? "").replace(/\/+$/, "");
  const joinUrl = `${base}/join${seed && token ? `?seed=${encodeURIComponent(token)}` : ""}`;
  return <AboutView contact={OPERATOR_CONTACT()} joinUrl={joinUrl} token={seed ? token : null} seed={seed ? { idea: seed.idea, name: MAKER[seed.kind].name, color: MAKER[seed.kind].color } : null} />;
}
