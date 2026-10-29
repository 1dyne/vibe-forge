import { describe, expect, it } from "vitest";
import { checkPowerNet } from "@dalgeurak/rules";

describe("initial electrical rule pack", () => {
  it("detects a voltage mismatch and current overload", () => {
    const result = checkPowerNet([
      { instanceId: "source", role: "source", vOut: 5, iOutContMa: 500 },
      { instanceId: "sink", role: "sink", vIn: [3, 3.6], iAvgMa: 700 }
    ], 5);
    expect(result.find((item) => item.checkerId === "VOLTAGE_MISMATCH")?.verdict).toBe("fail");
    expect(result.find((item) => item.checkerId === "CURRENT_CONT_OVER")?.verdict).toBe("fail");
  });

  it("reports unknown instead of pass when data is missing", () => {
    const result = checkPowerNet([{ instanceId: "sink", role: "sink", vIn: null, iAvgMa: null }], null);
    expect(result.every((item) => item.verdict === "unknown")).toBe(true);
  });
});
