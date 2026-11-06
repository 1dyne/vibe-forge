"""다인이 그린 도깨비 스프라이트 시트(5x5, 512px 프레임)를 웹용으로 변환한다.

- apps/web/public/find/sprites/<motion>.webp : 256px 프레임 25장을 가로 한 줄로 이어 붙인 스트립 (CSS steps(25)로 재생)
- apps/web/lib/find/og/dokkaebi-<color>.png : 공유 카드용 정지 프레임. 화면의 CSS hue-rotate와 같은 행렬로 색을 돌린다.
원본은 asset/dokkaebi/ 에 그대로 보관한다. 실행: python3 scripts/build-dokkaebi-sprites.py
"""
import math
from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "asset" / "dokkaebi"
OUT = ROOT / "apps" / "web" / "public" / "find" / "sprites"
OG = ROOT / "apps" / "web" / "lib" / "find" / "og"
MOTIONS = ["idle", "tilt", "stoke", "blaze", "fallen"]
FRAME, SIZE, COLS = 512, 256, 5
# 반응 갈래별 불 색 → 캐릭터 청록(#9ED3CB, 약 171도)에서 돌릴 각도. find-fire.ts의 HUE와 같아야 한다.
HUE = {"none": 0, "light": 83, "sound": -146, "move": -29}


def frames(sheet):
    return [sheet.crop(((i % COLS) * FRAME, (i // COLS) * FRAME, (i % COLS + 1) * FRAME, (i // COLS + 1) * FRAME)) for i in range(25)]


def hue_rotate(img, degrees):
    """CSS filter: hue-rotate()와 같은 행렬 (Filter Effects spec feColorMatrix hueRotate)."""
    if degrees == 0:
        return img
    a = math.radians(degrees)
    c, s = math.cos(a), math.sin(a)
    m = np.array([
        [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928],
        [0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283],
        [0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072],
    ])
    arr = np.asarray(img.convert("RGBA")).astype(np.float32) / 255.0
    rgb = np.clip(arr[..., :3] @ m.T, 0, 1)
    out = np.concatenate([rgb, arr[..., 3:]], axis=-1)
    return Image.fromarray((out * 255).round().astype(np.uint8), "RGBA")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    OG.mkdir(parents=True, exist_ok=True)
    for motion in MOTIONS:
        sheet = Image.open(SRC / f"{motion}.png").convert("RGBA")
        strip = Image.new("RGBA", (SIZE * 25, SIZE), (0, 0, 0, 0))
        for i, frame in enumerate(frames(sheet)):
            strip.alpha_composite(frame.resize((SIZE, SIZE), Image.LANCZOS), (i * SIZE, 0))
        strip.save(OUT / f"{motion}.webp", "WEBP", quality=88, method=6)
        if motion == "idle":
            frames(sheet)[0].resize((SIZE, SIZE), Image.LANCZOS).save(OUT / "idle-still.png", optimize=True)
    still = frames(Image.open(SRC / "blaze.png").convert("RGBA"))[0].resize((360, 360), Image.LANCZOS)
    for name, deg in HUE.items():
        hue_rotate(still, deg).save(OG / f"dokkaebi-{name}.png", optimize=True)
    for p in sorted(OUT.iterdir()) + sorted(OG.glob("*.png")):
        print(f"{p.relative_to(ROOT)}  {p.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
