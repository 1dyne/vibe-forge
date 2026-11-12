import { describe, expect, it } from "vitest";
import { contractHeader, contractTs, crossCheck, selfCheck, validateLine, validateLog } from "../apps/web/lib/contract";
import type { DataContract, LocalProject } from "../apps/web/lib/project-types";

// 펌웨어 ↔ 앱 데이터 약속
const kv: DataContract = { transport: "serial", format: "kv", baud: 115200, runs: [], updatedAt: "", messages: [
  { id: "state", direction: "device_to_app", prefix: "state=", description: "램프 상태", every: "1초마다", fields: [{ name: "state", type: "bool" }, { name: "temp", type: "float", unit: "℃", min: -20, max: 80 }], example: "state=1;temp=23.5" },
  { id: "cmd", direction: "app_to_device", prefix: "cmd=", description: "앱 명령", fields: [{ name: "cmd", type: "enum", values: ["on", "off"] }], example: "cmd=on" }
] };

describe("data contract", () => {
  it("reads lines and explains what is wrong", () => {
    expect(validateLine(kv, "state=1;temp=23.5").ok).toBe(true);
    expect(validateLine(kv, "state=1;temp=99").errors.join()).toContain("최대 80");
    expect(validateLine(kv, "state=1").errors.join()).toContain("temp 값이 없어요");
    expect(validateLine(kv, "state=1;temp=20;hum=40").errors.join()).toContain("hum");
    expect(validateLine(kv, "cmd=blink", "app_to_device").errors.join()).toContain("on/off");
    expect(validateLine(kv, "Booting...").messageId).toBeNull();
    const log = validateLog(kv, "ets Jun  8 2016\nstate=1;temp=23.1\nstate=0;temp=x\n", { dir: "device_to_app", ignoreNoise: true });
    expect(log).toMatchObject({ total: 2, ok: 1, missing: [] });
  });
  it("handles csv and json", () => {
    const csv: DataContract = { ...kv, format: "csv", messages: [{ ...kv.messages[0], prefix: "S", example: "S,1,23.5" }] };
    expect(validateLine(csv, "S,1,23.5").ok).toBe(true);
    expect(validateLine(csv, "S,1").errors.join()).toContain("2개");
    const json: DataContract = { ...kv, format: "json", messages: [{ ...kv.messages[0], prefix: '{"t":"state"', example: '{"t":"state","state":1,"temp":23.5}' }] };
    expect(validateLine(json, '{"t":"state","state":1,"temp":23.5}').ok).toBe(true);
    expect(validateLine(json, '{"t":"state","state":1,').errors.join()).toContain("JSON");
  });
  it("checks its own examples before saving", () => {
    expect(selfCheck(kv)).toEqual([]);
    expect(selfCheck({ ...kv, messages: [{ ...kv.messages[0], example: "state=2;temp=1" }] }).join()).toContain("state");
    expect(selfCheck({ ...kv, baud: null }).join()).toContain("baud");
  });
  it("compares firmware, SW spec and tests against the contract", () => {
    const fw = 'void setup(){ Serial.begin(9600); } void loop(){ Serial.print("state="); }';
    const p = { dataContract: kv, build: { artifacts: [{ kind: "firmware", content: fw }] }, swInterface: { transport: "serial", format: "state=1;temp=hot 를 1초마다", at: "" }, testPlan: { cases: [{ id: "t1", expect: { serial: ["state=1;temp=22"] } }] } } as unknown as LocalProject;
    const f = crossCheck(p);
    expect(f.find((x) => x.side === "firmware" && x.text.includes("통신 속도"))?.level).toBe("fail");
    expect(f.find((x) => x.side === "firmware" && x.text.startsWith("cmd"))?.level).toBe("warn");
    expect(f.find((x) => x.side === "sw" && x.text.includes("temp=hot"))?.level).toBe("fail");
    expect(f.find((x) => x.side === "tests")?.level).toBe("ok");
  });
  it("generates matching firmware and app code", () => {
    const h = contractHeader(kv, { name: "램프" });
    expect(h).toContain("const long CONTRACT_BAUD = 115200;");
    expect(h).toContain("inline void send_state(int state, float temp)");
    expect(h).toContain('Serial.print(";temp=")');
    const ts = contractTs(kv);
    expect(ts).toContain("export function parseLine");
    expect(ts).toContain("export function make_cmd(cmd: \"on\" | \"off\")");
    const evil: DataContract = { ...kv, messages: [{ ...kv.messages[0], description: "끝 */ process.exit(1) /*\n둘째 줄", prefix: 'state=' }] };
    expect(contractTs(evil)).not.toContain("*/ process.exit");
    expect(contractHeader(evil, { name: "a\nb" }).split("\n")[0]).toContain("a b");
  });
});
