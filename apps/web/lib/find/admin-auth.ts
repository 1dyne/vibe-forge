import { cookies } from "next/headers";
import { viewerFromCookie } from "../viewer";

// /admin/find 는 대기 명단 이메일이 보이므로, 계정 사용자가 아니라 운영자만 연다(기존 /admin 과 같은 기준).
export async function isOperator(): Promise<boolean> {
  return (await viewerFromCookie((await cookies()).get("dalgeurak_session")?.value))?.kind === "operator";
}
