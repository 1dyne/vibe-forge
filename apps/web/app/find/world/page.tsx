import { redirect } from "next/navigation";

// 걷는 마을은 /find/village 로 옮겼다 (예전 링크 호환)
export default async function World({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const q = new URLSearchParams(await searchParams).toString();
  redirect(`/find/village${q ? `?${q}` : ""}`);
}
