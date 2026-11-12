import { cookies } from "next/headers";
import { OWNER_COOKIE, ownerTokenFrom } from "./owner";
import { forgeFires, forgeForOwner, hashToken, villageOpenFor, type ForgeRecord } from "./village-store";

/**
 * 달그락 마을은 '내 도깨비불 → 대장간 오픈 알림 이메일'까지 한 사람에게 열린다.
 * - none: 이 기기에 대장간이 없음 → 도깨비불부터
 * - locked: 대장간은 있는데 이메일을 아직 안 남김 → 마을 문 앞에서 신청
 * - open: 들어갈 수 있음
 */
export async function villageGate(): Promise<
  | { state: "none" }
  | { state: "locked"; forge: ForgeRecord; fire: { id: string; name: string } | null }
  | { state: "open"; forge: ForgeRecord }
> {
  const token = ownerTokenFrom((await cookies()).get(OWNER_COOKIE)?.value);
  const forge = token ? await forgeForOwner(hashToken(token)) : null;
  if (!forge) return { state: "none" };
  if (await villageOpenFor(forge.id)) return { state: "open", forge };
  const fire = (await forgeFires(forge.id))[0];
  return { state: "locked", forge, fire: fire ? { id: fire.id, name: fire.name } : null };
}
