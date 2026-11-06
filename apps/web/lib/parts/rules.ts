import type { CircuitComponent, CircuitNet } from "../project-types";
import { findCard, type CardPin, type PartCard } from "./catalog";

// Electrical rules judged by code from part cards, never by the model.
// blocked findings stop circuit approval and the assembly steps.
export type Severity = "info" | "warning" | "blocked";
export type RuleFinding = { ruleId: string; severity: Severity; affectedRefs: string[]; message: string; evidence: string };

type Endpoint = { ref: string; pin: string; component: CircuitComponent | undefined; card: PartCard | null; cardPin: CardPin | null };

export function resolvePin(card: PartCard | null, pin: string): CardPin | null {
  if (!card || !card.pins.length) return null;
  const exact = card.pins.find((p) => p.name === pin);
  if (exact) return exact;
  const upper = pin.toUpperCase();
  const candidates = [upper, upper.replace(/^D(?=\d)/, ""), upper === "3V3" || upper === "3.3V" ? "3.3V" : "", upper === "3.3V" ? "3V3" : "", upper === "VCC" ? "VIN" : ""].filter(Boolean);
  for (const name of candidates) { const hit = card.pins.find((p) => p.name.toUpperCase() === name); if (hit) return hit; }
  if (upper === "GND") return card.pins.find((p) => p.roles.includes("ground")) ?? null;
  return null;
}

function netVoltage(net: CircuitNet, ends: Endpoint[], supply: number): number | null {
  if (net.kind !== "power") return null;
  if (ends.some((e) => e.cardPin?.roles.includes("power_3v3"))) return 3.3;
  if (ends.some((e) => e.cardPin?.roles.includes("power_5v"))) return 5;
  const named = /3V3|3\.3V/i.test(net.name) ? 3.3 : Number(net.name.match(/(\d+(?:\.\d+)?)\s*V/i)?.[1] ?? NaN);
  return Number.isFinite(named) ? named : supply;
}

export function evaluateRules(components: CircuitComponent[], nets: CircuitNet[], supplyVoltage: number): RuleFinding[] {
  const findings: RuleFinding[] = [];
  const add = (ruleId: string, severity: Severity, affectedRefs: string[], message: string, evidence: string) => findings.push({ ruleId, severity, affectedRefs, message, evidence });
  const byRef = new Map(components.map((c) => [c.ref, c]));
  const cardOf = (ref: string) => findCard(byRef.get(ref)?.catalogId);
  const endpoints = (net: CircuitNet): Endpoint[] => net.members.map((member) => {
    const [ref, ...rest] = member.split(".");
    const pin = rest.join(".");
    const card = cardOf(ref);
    return { ref, pin, component: byRef.get(ref), card, cardPin: resolvePin(card, pin) };
  });
  const boards = components.filter((c) => findCard(c.catalogId)?.type === "board" || c.type === "controller");
  const board = boards[0];
  const boardCard = findCard(board?.catalogId);

  // Card coverage.
  for (const component of components) {
    const card = findCard(component.catalogId);
    if (!component.catalogId) add("CARD_MISSING", "warning", [component.ref], `${component.ref}(${component.valueOrModel})는 부품 카드에 없어요. 사양을 확인하지 않은 부품이라 전압·전류 검사를 못 해요.`, "catalogId 없음");
    else if (!card) add("CARD_MISSING", "warning", [component.ref], `${component.ref}의 부품 카드 ${component.catalogId}를 찾을 수 없어요.`, `catalogId=${component.catalogId}`);
    else {
      const unknown = [card.type !== "passive" && card.type !== "input" && card.voltageMin == null && card.voltageMax == null && "동작 전압", card.type === "board" && card.logicVoltage == null && "로직 전압", !card.pins.length && "핀 배치", !card.dimensionsMm && "치수"].filter(Boolean);
      if (unknown.length) add("CARD_UNKNOWN_SPEC", "info", [component.ref], `${component.ref}(${card.model})의 ${unknown.join("·")}은 카드에서 확인 필요예요. 구매 전 공식 문서로 확인하세요.`, card.sourceUrls[0] ?? "출처 없음");
    }
  }

  const resolved = nets.map((net) => ({ net, ends: endpoints(net) }));

  // Pins must exist on the card.
  for (const { net, ends } of resolved) for (const end of ends) {
    if (!end.component) continue;
    if (end.card?.pins.length && !end.cardPin) add("PIN_UNKNOWN", "blocked", [end.ref], `${end.ref}.${end.pin}은 ${end.card.model}에 없는 핀이에요.`, `${net.name} · 카드 핀: ${end.card.pins.map((p) => p.name).slice(0, 12).join(", ")}…`);
  }

  // GND: every part with a ground pin needs it on a ground net.
  const groundMembers = new Set(resolved.filter((r) => r.net.kind === "ground").flatMap((r) => r.ends.map((e) => e.ref)));
  if (!resolved.some((r) => r.net.kind === "ground")) add("GND_MISSING", "blocked", components.map((c) => c.ref), "공통 GND net이 없어요. 모든 부품의 GND를 보드 GND에 이어야 해요.", "ground net 0개");
  else for (const component of components) {
    const card = findCard(component.catalogId);
    if (card?.pins.some((p) => p.roles.includes("ground")) && !groundMembers.has(component.ref) && component.connection !== "socket" && component.connection !== "builtin") {
      add("GND_MISSING", "blocked", [component.ref], `${component.ref}(${card.model})의 GND가 연결되지 않았어요.`, "ground net에 없음");
    }
  }

  // Supply voltage against the part's allowed range.
  for (const { net, ends } of resolved) {
    const volts = netVoltage(net, ends, supplyVoltage);
    if (volts == null) continue;
    for (const end of ends) {
      const card = end.card;
      if (!card || card.type === "board" || !end.cardPin?.roles.some((r) => r === "power_in" || r === "power_3v3")) continue;
      if (card.voltageMax != null && volts > card.voltageMax) add("SUPPLY_OVER", "blocked", [end.ref], `${end.ref}(${card.model})에 ${volts}V가 들어가요. 허용 최대 ${card.voltageMax}V를 넘어요.`, `${net.name} ${volts}V · ${card.sourceUrls[0] ?? ""}`);
      else if (card.voltageMin != null && volts < card.voltageMin) add("SUPPLY_UNDER", "warning", [end.ref], `${end.ref}(${card.model})에 ${volts}V가 들어가요. 최소 ${card.voltageMin}V보다 낮아 제대로 동작하지 않을 수 있어요.`, `${net.name} ${volts}V`);
    }
  }

  // Logic levels between the board and part signal pins.
  if (boardCard?.logicVoltage != null) {
    for (const { net, ends } of resolved.filter((r) => r.net.kind === "signal")) {
      for (const end of ends) {
        if (end.ref === board?.ref || !end.card?.logicVoltage) continue;
        if (end.card.logicVoltage > boardCard.logicVoltage && boardCard.board?.ioTolerates5V === false) add("LOGIC_LEVEL", "blocked", [end.ref, board!.ref], `${end.ref}의 ${end.card.logicVoltage}V 신호가 ${boardCard.logicVoltage}V 보드(${boardCard.model}) 핀으로 들어가요. 레벨 시프터나 분압 저항이 필요해요.`, net.name);
        else if (end.card.logicVoltage < boardCard.logicVoltage) add("LOGIC_LEVEL", "warning", [end.ref, board!.ref], `${boardCard.logicVoltage}V 보드 신호가 ${end.card.logicVoltage}V 부품 ${end.ref}로 가요. 부품이 견디는지 확인하세요.`, net.name);
      }
    }
  }

  // Board pins: duplicates and roles.
  if (board) {
    const used = new Map<string, string[]>();
    for (const { net, ends } of resolved.filter((r) => r.net.kind === "signal")) {
      const boardEnds = ends.filter((e) => e.ref === board.ref);
      for (const be of boardEnds) {
        const key = be.cardPin?.name ?? be.pin;
        used.set(key, [...(used.get(key) ?? []), net.name]);
        const others = ends.filter((e) => e.ref !== board.ref);
        const needs = [...others.flatMap((e) => e.cardPin?.roles ?? []), ...(others.some((e) => e.card?.interface.some((i) => /아날로그/.test(i))) ? ["analog" as const] : [])];
        const has = be.cardPin?.roles ?? [];
        if (!be.cardPin) continue;
        if (needs.includes("analog") && !has.includes("analog")) add("PIN_ROLE", "blocked", [board.ref], `${board.ref}.${key}에는 아날로그 입력 기능이 없어요. 아날로그 핀으로 옮기세요.`, net.name);
        if (needs.includes("pwm") && !has.includes("pwm")) add("PIN_ROLE", "warning", [board.ref], `${board.ref}.${key}은 PWM 표시가 없는 핀이에요. PWM이 필요한 부품이면 PWM 핀으로 옮기세요.`, net.name);
        for (const bus of ["i2c_sda", "i2c_scl"] as const) if (needs.includes(bus) && !has.includes(bus)) add("PIN_ROLE", boardCard?.id.startsWith("esp32") || boardCard?.id.startsWith("xiao") ? "info" : "warning", [board.ref], `${board.ref}.${key}은 기본 ${bus === "i2c_sda" ? "SDA" : "SCL"} 핀이 아니에요.${boardCard?.id.startsWith("esp32") || boardCard?.id.startsWith("xiao") ? " ESP32는 코드에서 핀을 지정하면 돼요." : " 기본 I2C 핀으로 옮기세요."}`, net.name);
        if (has.some((r) => r === "ground" || r === "power_5v" || r === "power_3v3" || r === "power_in")) add("PIN_ROLE", "blocked", [board.ref], `${board.ref}.${key}은 전원 핀인데 신호선에 연결됐어요.`, net.name);
      }
    }
    for (const [pin, netsUsing] of used) if (netsUsing.length > 1) add("PIN_DUPLICATE", "blocked", [board.ref], `${board.ref}.${pin}이 여러 신호(${netsUsing.join(", ")})에 함께 쓰였어요.`, netsUsing.join(" · "));
  }

  // Motors straight off the board's power pin.
  for (const { net, ends } of resolved.filter((r) => r.net.kind === "power")) {
    const fromBoard = ends.some((e) => e.ref === board?.ref && e.cardPin?.roles.some((r) => r === "power_5v" || r === "power_3v3"));
    for (const end of ends) if (fromBoard && end.card?.isMotor) add("MOTOR_ON_BOARD_POWER", "warning", [end.ref], `${end.ref}(${end.card.model})가 보드의 전원 핀에서 직접 전원을 받아요. 움직일 때 전압이 떨어져 보드가 리셋될 수 있어요. 별도 5V 전원을 쓰고 GND만 공통으로 연결하세요.`, net.name);
  }

  // Current on a board rail.
  if (board && boardCard?.board) {
    for (const { net, ends } of resolved.filter((r) => r.net.kind === "power")) {
      const rail = ends.find((e) => e.ref === board.ref && e.cardPin?.roles.some((r) => r === "power_3v3" || r === "power_5v"));
      if (!rail) continue;
      const is3v3 = rail.cardPin!.roles.includes("power_3v3");
      const limit = is3v3 ? boardCard.board.rail3v3MaxMa : boardCard.board.rail5vMaxMa;
      const loads = ends.filter((e) => e.ref !== board.ref && e.card);
      const known = loads.filter((e) => e.card!.typicalCurrentMa != null);
      const total = known.reduce((sum, e) => sum + e.card!.typicalCurrentMa!, 0);
      if (limit != null && total > limit) add("CURRENT_BUDGET", "blocked", loads.map((e) => e.ref), `${board.ref} ${is3v3 ? "3.3V" : "5V"} 핀 부하 합계 ${total}mA가 허용 ${limit}mA를 넘어요.`, net.name);
      else if (loads.length && known.length < loads.length) add("CURRENT_BUDGET", "info", loads.map((e) => e.ref), `${net.name}의 전류 합계는 일부 부품(${loads.filter((e) => e.card!.typicalCurrentMa == null).map((e) => e.ref).join(", ")})의 전류를 몰라 계산할 수 없어요.${limit != null ? ` 허용 ${limit}mA.` : ""}`, net.name);
    }
  }

  // I2C address conflicts on the same bus.
  for (const { net, ends } of resolved.filter((r) => r.ends.some((e) => e.cardPin?.roles.includes("i2c_sda")))) {
    const devices = ends.filter((e) => e.card && e.card.type !== "board" && e.card.i2cAddresses.length);
    for (let i = 0; i < devices.length; i++) for (let j = i + 1; j < devices.length; j++) {
      const a = devices[i].card!.i2cAddresses, b = devices[j].card!.i2cAddresses;
      if (a.length === 1 && b.length === 1 && a[0] === b[0]) add("I2C_ADDRESS", "blocked", [devices[i].ref, devices[j].ref], `${devices[i].ref}와 ${devices[j].ref}의 I2C 주소(${a[0]})가 같아요.`, net.name);
      else if (a.some((x) => b.includes(x))) add("I2C_ADDRESS", "warning", [devices[i].ref, devices[j].ref], `${devices[i].ref}와 ${devices[j].ref}의 I2C 주소가 겹칠 수 있어요(${a.filter((x) => b.includes(x)).join(", ")}). 한쪽 주소를 바꾸세요.`, net.name);
    }
  }

  // LEDs need a series resistor.
  for (const component of components) {
    const card = findCard(component.catalogId);
    if (!card?.needsSeriesResistor) continue;
    const touching = resolved.filter((r) => r.ends.some((e) => e.ref === component.ref));
    const withResistor = touching.some((r) => r.ends.some((e) => findCard(byRef.get(e.ref)?.catalogId)?.id === "resistor" || /저항|resistor|ohm|Ω/i.test(byRef.get(e.ref)?.valueOrModel ?? "")));
    if (!withResistor) add("LED_RESISTOR", "blocked", [component.ref], `${component.ref}(LED)에 직렬 저항이 없어요. 저항 없이 연결하면 LED나 보드 핀이 손상될 수 있어요.`, touching.map((r) => r.net.name).join(" · ") || "연결 없음");
  }

  return findings;
}
