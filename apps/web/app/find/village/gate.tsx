"use client";
import { track } from "../track";

// 마을 문 앞. 대장간은 생겼는데 아직 오픈 알림을 안 받은 사람에게: 이메일을 남기면 문이 열린다.
export default function VillageGate({ state, fire, forgeId, couponText }: { state: "none" | "locked"; fire: { id: string; name: string } | null; forgeId: string | null; couponText: string | null }) {
  return (
    <section className="screen village-gate">
      {state === "none" ? (
        <>
          <h1 style={{ fontSize: 26 }}>마을엔 도깨비불이 있어야 들어갈 수 있어</h1>
          <p className="body">만들고 싶은 거나 요즘 귀찮은 거 하나만 말해줘. 네 도깨비불을 찾아주면 마을에 네 대장간 터가 생겨.</p>
          <a className="btn btn-fire" href="/find" onClick={() => track("gate_find")} style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>내 도깨비불 찾기</a>
        </>
      ) : (
        <>
          <h1 style={{ fontSize: 26 }}>마을은 가입하면 열려</h1>
          <p className="body">달그락 대장간에 가입하면 마을 문이 열려. 들어가면 다른 도깨비들이 구상 중인 것들을 구경하고, 네 대장간도 꾸밀 수 있어. 네 도깨비불{fire ? ` “${fire.name}”` : ""}도 그대로 들고 가.</p>
          <a className="btn btn-fire" href="/find/about" onClick={() => track("gate_about")} style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>달그락 대장간이 뭐야?</a>
          <a className="link" href="/find/home" style={{ textAlign: "center" }}>이미 가입했어 (내 대장간으로)</a>
          {forgeId && <a className="link" href={`/f/${forgeId}`} style={{ textAlign: "center" }}>먼저 내 대장간 안 보기</a>}
        </>
      )}
    </section>
  );
}
