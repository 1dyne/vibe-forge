import { redirect } from "next/navigation";

// 골목 화면은 없앴다 (골목은 이름 없이 마을 안에 모양만 남는다). 예전 링크는 마을로.
export default function OldAlley() {
  redirect("/find/village");
}
