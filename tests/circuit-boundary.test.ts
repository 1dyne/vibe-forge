import { expect, it } from "vitest";
import { normalizeBlueprintWiring } from "../apps/web/lib/build-pipeline";
import type { BuildBlueprint } from "../apps/web/lib/project-types";

it("keeps a level shifter's high and low voltage terminals on separate electrical nets",()=>{
  const b:BuildBlueprint={
    title:"전압 경계 검증",board:"Nano",supplyVoltage:5,
    components:[{ref:"U1",type:"controller",valueOrModel:"Nano",reason:"제어"},{ref:"CAM1",type:"camera",valueOrModel:"ESP32-CAM",reason:"카메라"},{ref:"PS1",type:"power",valueOrModel:"5V",reason:"전원"}],
    nets:[],enclosure:{widthMm:80,depthMm:60,heightMm:40,wallMm:2},
    firmware:{platform:"arduino",behavior:"카메라 신호",pinAssignments:[{symbol:"CAM_TRIG",pin:6,role:"digital_output"}],loopSteps:[]},assumptions:[],humanChecks:[]
  };
  const wired=normalizeBlueprintWiring(b);
  const high=wired.nets.find(n=>n.members.includes("LS1.HV_IN"))!;
  const low=wired.nets.find(n=>n.members.includes("LS1.LV_OUT"))!;
  expect(high.name).not.toBe(low.name);
  expect(high.members).not.toContain("CAM1.TRIG");
  expect(low.members).not.toContain("U1.GPIO6");
  expect(wired.nets.flatMap(n=>n.members)).not.toContain("S1.VCC");
});
