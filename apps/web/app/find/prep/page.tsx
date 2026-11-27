import PrepView from "./prep-view";
import { OPERATOR_CONTACT } from "../../../lib/policies";

export const metadata = { title: "밋업 오기 전에 · 달그락 대장간", description: "노트북에 미리 해 올 것 세 가지. 15분이면 돼요." };

// 밋업 참가자가 오기 전에 노트북에 해 올 것. 로그인 없이 볼 수 있다.
export default function Prep() {
  return <PrepView contact={OPERATOR_CONTACT()} />;
}
