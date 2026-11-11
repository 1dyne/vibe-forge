import type { AssemblyGuide, LocalProject } from "../project-types";
import { findCard, type PartCard } from "../parts/catalog";
import { resolvePin } from "../parts/rules";
import wokwiSizes from "../parts/wokwi-pins.json";
import type { BenchFaq, BenchKit, BenchOp, BenchPart, BenchStep } from "./types";

// 프로젝트 조립 가이드(set_assembly_guide) → 3D 조립 책상 입력 (명세서 2차 v0.1 §1·§3).
// 가이드의 기판 좌표(왼쪽 위 기준 mm)와 부품 카드 핀 위치를 그대로 쓴다. 새 값을 지어내지 않는다:
// 카드에도 가이드에도 핀 위치가 없으면 그 핀은 3D에서 부품 가운데에 표시하고 '대략 위치'로 알린다.

type Placed = { ref: string; label: string; x: number; y: number; w: number; h: number; rotation: number; card: PartCard | null; pins?: Array<{ name: string; x: number; y: number }>; color?: string };

function rotatePoint(x: number, y: number, w: number, h: number, rotation: number): [number, number] {
  const cx = w / 2, cy = h / 2, dx = x - cx, dy = y - cy, r = (rotation * Math.PI) / 180;
  return [cx + dx * Math.cos(r) - dy * Math.sin(r), cy + dx * Math.sin(r) + dy * Math.cos(r)];
}

function placeAll(guide: AssemblyGuide, catalogOf: (ref: string) => string | undefined): Placed[] {
  return guide.parts.map((part) => {
    const card = findCard(part.catalogId ?? catalogOf(part.ref));
    const tag = card?.renderer.type === "wokwi" ? card.renderer.ref.replace(/^wokwi-/, "") : null;
    const size = tag ? (wokwiSizes as Record<string, { widthMm: number; heightMm: number }>)[tag] : null;
    return { ref: part.ref, label: part.label, x: part.x, y: part.y, w: size?.widthMm ?? part.width, h: size?.heightMm ?? part.height, rotation: part.rotation ?? 0, card, pins: part.pins, color: part.color };
  });
}

/** 가이드 기판 좌표계의 핀 위치. 못 찾으면 null */
export function pinXY(p: Placed, pin: string): [number, number] | null {
  const cp = p.card ? resolvePin(p.card, pin) : null;
  const own = p.pins?.find((x) => x.name === pin);
  const local = cp && cp.xMm != null && cp.yMm != null ? [cp.xMm, cp.yMm] : own ? [own.x, own.y] : null;
  if (!local) return null;
  const [rx, ry] = rotatePoint(local[0], local[1], p.w, p.h, p.rotation);
  return [p.x + rx, p.y + ry];
}

const HW_FAQ: BenchFaq[] = [
  { q: "냉납 같아요", a: "회색이고 울퉁불퉁하면 냉납이에요. 인두를 다리와 패드에 같이 1초 대고 납을 조금 더 녹여 반짝이는 원뿔이 되게 해 보세요. 사진을 보내 주면 같이 볼게요." },
  { q: "전원이 안 켜져요", a: "먼저 USB나 전지를 빼고, 멀티미터 통전 모드로 5V(또는 3V3)와 GND 사이가 붙어 있지 않은지 봐요. 붙어 있으면 합선이에요. 아니면 전원을 넣고 DC 20V로 두 핀 사이 전압을 재서 알려 주세요." },
  { q: "선이 짧아요", a: "핀 사이 거리보다 2cm 이상 길게 잘라야 당겨지지 않아요. 짧은 선을 이어 붙였다면 열수축 튜브로 꼭 감싸 주세요." },
  { q: "어느 핀인지 헷갈려요", a: "판매 페이지 사진과 기판 뒷면 글자를 같이 봐요. 3D의 핀 이름은 부품 카드 기준이라, 판매처마다 순서가 다를 수 있어요. 다르면 알려 주세요." }
];

export function guideToKit(project: LocalProject): BenchKit | null {
  const guide = project.assembly;
  if (!guide) return null;
  const components = project.build?.blueprint.components ?? [];
  const nets = project.build?.blueprint.nets ?? [];
  const catalogOf = (ref: string) => components.find((c) => c.ref === ref)?.catalogId;
  const placed = placeAll(guide, catalogOf);
  const method = project.buildPlan?.connection.method ?? (guide.base.kind === "perfboard" ? "perfboard" : "breadboard");
  const solderAll = method === "solder" || method === "perfboard" || method === "pcb";

  const baseRef = "BASE";
  const baseKind: BenchPart["kind"] = guide.base.kind === "breadboard" ? "breadboard" : guide.base.kind === "perfboard" ? "perfboard" : "plate";
  const parts: BenchPart[] = [{
    ref: baseRef, kind: baseKind, label: guide.base.name,
    about: `${guide.base.width}×${guide.base.height}mm. 모든 부품이 이 위에 놓여요.`,
    spec: { widthMm: guide.base.width, heightMm: guide.base.height, cols: Math.max(4, Math.floor((guide.base.width - 6) / 2.54) + 1), rows: Math.max(4, Math.floor((guide.base.height - 6) / 2.54) + 1) }
  }];
  for (const p of placed) {
    const comp = components.find((c) => c.ref === p.ref);
    const pinNames = new Set<string>();
    for (const s of guide.steps) for (const w of s.wires) for (const end of [w.from, w.to]) { const [r, ...rest] = end.split("."); if (r === p.ref) pinNames.add(rest.join(".")); }
    for (const n of nets) for (const m of n.members) { const [r, ...rest] = m.split("."); if (r === p.ref) pinNames.add(rest.join(".")); }
    for (const c of p.card?.pins ?? []) pinNames.add(c.name);
    for (const c of p.pins ?? []) pinNames.add(c.name);
    const pinXYs = [...pinNames].map((name) => { const xy = pinXY(p, name); return xy ? { name, x: xy[0], y: xy[1] } : null; }).filter((x): x is { name: string; x: number; y: number } => !!x);
    parts.push({
      ref: p.ref, kind: "module", label: p.label,
      about: [p.card?.model ?? comp?.valueOrModel ?? p.label, comp?.reason, p.card ? null : "부품 카드가 없어 대략 모양으로 보여요"].filter(Boolean).join(" · "),
      spec: { catalogId: p.card?.id, partType: p.card?.type ?? comp?.type, model: p.card?.model ?? comp?.valueOrModel ?? p.label, color: p.color, foot: { x: p.x, y: p.y, w: p.w, h: p.h, rotation: p.rotation }, pinXY: pinXYs }
    });
  }

  const netKind = (a: string, b: string) => nets.find((n) => n.members.includes(a) || n.members.includes(b))?.kind;
  const steps: BenchStep[] = guide.steps.map((s, i) => {
    const ops: BenchOp[] = [];
    if (i === 0) ops.push({ op: "place", ref: baseRef, at: [0, -6] });
    for (const ref of s.place) ops.push({ op: "seat", ref, onto: baseRef });
    for (const w of s.wires) {
      const kind = netKind(w.from, w.to);
      ops.push({ op: "jumper", from: w.from, to: w.to, color: kind === "power" ? "#d8322a" : kind === "ground" ? "#1c1c1e" : w.color, label: w.label });
    }
    const explicit = s.ops ?? [];
    for (const o of explicit) ops.push(o.op === "solder" ? { op: "solder", joints: o.joints, side: o.side } : o.op === "trim" ? { op: "trim", refs: o.refs } : { op: "check", how: o.how, targets: o.targets, expected: o.expected });
    if (solderAll && !explicit.some((o) => o.op === "solder") && s.wires.length) {
      const joints = [...new Set(s.wires.flatMap((w) => [w.from, w.to]))];
      ops.push({ op: "solder", joints, side: "top" });
    }
    if (!ops.length) ops.push({ op: "check", how: "look", targets: s.place.length ? s.place : [baseRef], expected: s.check });
    const solders = ops.some((o) => o.op === "solder");
    const phase: BenchStep["phase"] = solders ? "납땜" : s.wires.length ? "전선" : s.place.length ? "꽂기" : "검사";
    const firstWire = s.wires[0];
    return {
      phase, title: s.title, action: s.action, why: s.check ? `확인: ${s.check}` : "",
      ops, view: s.wires.length || solders ? "top" : "34",
      tapHint: firstWire ? `${firstWire.from} 핀을 눌러` : s.place[0] ? `${s.place[0]}가 놓일 빛나는 자리를 눌러` : "빛나는 곳을 눌러",
      caution: s.cards[0] ? `막히면: ${s.cards[0].symptom} → ${s.cards[0].check}` : undefined,
      mistakes: solders ? [{ kind: "cold", title: "냉납", looks: "회색이고 울퉁불퉁", fix: "다리와 패드를 같이 데우고 납을 조금 더" }, { kind: "bridge", title: "브리지", looks: "이웃 핀까지 납이 이어짐", fix: "깨끗한 인두로 쓸어내거나 솔더윅" }] : undefined,
      doneWhen: s.check || "설명대로 놓였다"
    };
  });

  return {
    id: `project-${project.id}`,
    title: project.name,
    subtitle: guide.stage,
    level: "처음",
    minutes: Math.max(5, steps.length * 4),
    learn: [],
    parts,
    tools: solderAll ? ["인두", "실납", "니퍼", "와이어 스트리퍼", "멀티미터"] : ["점퍼선", "멀티미터"],
    safety: solderAll ? ["인두 끝은 330℃ 이상, 받침에만", "납땜 중에는 전원 빼기", "창문 열기"] : ["선을 옮길 때는 전원 빼기"],
    steps,
    faq: HW_FAQ
  };
}
