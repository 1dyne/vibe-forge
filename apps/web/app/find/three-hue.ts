import type * as T from "three";

// 온보딩 화면의 달그락은 CSS hue-rotate(각도)로 불 색을 입는다(REACT_HUE).
// 3D에서도 같은 색이 나오도록 CSS filter 규격의 hue-rotate 행렬을 sRGB 공간에서 그대로 적용한다.
export function hueSpriteMaterial(three: typeof T, map: T.Texture, deg: number) {
  const m = new three.SpriteMaterial({ map, transparent: true });
  if (!deg) return m;
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  // Matrix3.set 은 행 순서로 받는다 (r' = 첫 행 · rgb)
  const mat = new three.Matrix3().set(
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072
  );
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uHue = { value: mat };
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", "uniform mat3 uHue;\nvoid main() {")
      .replace("#include <map_fragment>", `#include <map_fragment>
        vec3 srgb = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(1.0 / 2.2));
        srgb = clamp(uHue * srgb, 0.0, 1.0);
        diffuseColor.rgb = pow(srgb, vec3(2.2));`);
  };
  m.customProgramCacheKey = () => `hue${deg}`;
  return m;
}
