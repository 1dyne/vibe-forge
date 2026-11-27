import type * as T from "three";
import { tintMatrix } from "../../lib/find/classify";

// 온보딩 화면의 달그락은 CSS filter(hue-rotate → saturate → brightness)로 달그락 색을 입는다(MAKER.tint).
// 3D에서도 같은 색이 나오도록 같은 행렬을 sRGB 공간에서 그대로 적용한다.
export function hueSpriteMaterial(three: typeof T, map: T.Texture, tint: string) {
  const m = new three.SpriteMaterial({ map, transparent: true });
  const k = tintMatrix(tint);
  // Matrix3.set 은 행 순서로 받는다 (r' = 첫 행 · rgb)
  const mat = new three.Matrix3().set(k[0], k[1], k[2], k[3], k[4], k[5], k[6], k[7], k[8]);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uHue = { value: mat };
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", "uniform mat3 uHue;\nvoid main() {")
      .replace("#include <map_fragment>", `#include <map_fragment>
        vec3 srgb = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(1.0 / 2.2));
        srgb = clamp(uHue * srgb, 0.0, 1.0);
        diffuseColor.rgb = pow(srgb, vec3(2.2));`);
  };
  m.customProgramCacheKey = () => `tint-${tint}`;
  return m;
}
