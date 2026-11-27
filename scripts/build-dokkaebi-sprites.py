"""다인이 그린 도깨비 스프라이트 시트(5x5, 512px 프레임)를 웹용으로 변환한다.

- apps/web/public/find/sprites/<motion>.webp : 256px 프레임 25장을 가로 한 줄로 이어 붙인 스트립 (CSS steps(25)로 재생)
- apps/web/lib/find/og/dokkaebi-<달그락>.png : 공유 카드용 정지 프레임. 화면의 CSS filter와 같은 행렬로 달그락 색을 입힌다.
원본은 asset/dokkaebi/ 에 그대로 보관한다. 실행: python3 scripts/build-dokkaebi-sprites.py
"""
import math
from collections import deque
from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "asset" / "dokkaebi"
OUT = ROOT / "apps" / "web" / "public" / "find" / "sprites"
OG = ROOT / "apps" / "web" / "lib" / "find" / "og"
MOTIONS = ["idle", "tilt", "stoke", "blaze", "fallen"]
FRAME, SIZE, COLS = 512, 256, 5
# 달그락 종류별 색 옮김 값 (hue-rotate 각도, saturate, brightness). apps/web/lib/find/classify.ts 의 MAKER.tint · CHIEF_TINT 와 같아야 한다.
# 도깨비 그림의 민트를 달그락 색 한 벌(대장 #9DD2C8, 하드웨어 #B7B3D7, 소프트웨어 #AAC8DF, 제품 디자인 #F0DFA7)로 정확히 옮긴다.
TINT = {"none": (1.4, 1.045, 1.058), "hardware": (89.5, 0.9, 0.975), "software": (46.2, 0.97, 1.044), "design": (-108.9, 1.32, 1.19)}


def frames(sheet):
    return [sheet.crop(((i % COLS) * FRAME, (i // COLS) * FRAME, (i % COLS + 1) * FRAME, (i // COLS + 1) * FRAME)) for i in range(25)]


def tint(img, degrees, sat, bri):
    """CSS filter: hue-rotate() saturate() brightness() 를 차례로 건 것과 같은 행렬 (Filter Effects spec)."""
    a = math.radians(degrees)
    c, s = math.cos(a), math.sin(a)
    m = np.array([
        [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928],
        [0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283],
        [0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072],
    ])
    k = np.array([
        [0.213 + 0.787 * sat, 0.715 - 0.715 * sat, 0.072 - 0.072 * sat],
        [0.213 - 0.213 * sat, 0.715 + 0.285 * sat, 0.072 - 0.072 * sat],
        [0.213 - 0.213 * sat, 0.715 - 0.715 * sat, 0.072 + 0.928 * sat],
    ])
    arr = np.asarray(img.convert("RGBA")).astype(np.float32) / 255.0
    rgb = np.clip(arr[..., :3] @ m.T, 0, 1)
    rgb = np.clip(rgb @ k.T, 0, 1)
    rgb = np.clip(rgb * bri, 0, 1)
    out = np.concatenate([rgb, arr[..., 3:]], axis=-1)
    return Image.fromarray((out * 255).round().astype(np.uint8), "RGBA")


def eye_dots(frame):
    """프레임에서 점 눈 두 개(작고 둥근 검은 점)를 찾는다. 외곽선은 커서 걸러진다."""
    a = np.asarray(frame).astype(int)
    dark = (a[..., 3] > 160) & (a[..., :3].sum(-1) < 240)
    seen = np.zeros_like(dark)
    found = []
    H, W = dark.shape
    for y in range(H):
        for x in range(W):
            if not dark[y, x] or seen[y, x]:
                continue
            q = deque([(y, x)]); seen[y, x] = 1; pts = []
            while q:
                cy, cx = q.popleft(); pts.append((cy, cx))
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < H and 0 <= nx < W and dark[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = 1; q.append((ny, nx))
            if 40 <= len(pts) <= 600:
                found.append(pts)
    if len(found) != 2:
        raise SystemExit(f"점 눈을 2개 찾아야 하는데 {len(found)}개를 찾았어")
    return sorted(found, key=lambda pts: sum(p[1] for p in pts))


def blink(frame):
    """점 눈 자리를 몸 색으로 지우고, 같은 자리에 감은 눈(짧은 가로선)을 그린다."""
    from PIL import ImageDraw
    out = frame.copy()
    arr = np.asarray(out).copy()
    for pts in eye_dots(frame):
        ys = [p[0] for p in pts]; xs = [p[1] for p in pts]
        cy, cx = sum(ys) / len(ys), sum(xs) / len(xs)
        r = max(max(xs) - min(xs), max(ys) - min(ys)) / 2
        # 점 둘레의 몸 색으로 채운다
        ring = [arr[int(cy + (r + 5) * math.sin(t)), int(cx + (r + 5) * math.cos(t))] for t in np.linspace(0, 2 * math.pi, 24, endpoint=False)]
        body = np.median(np.array([c for c in ring if c[3] > 200 and c[:3].sum() > 300]), axis=0).astype(np.uint8)
        for y in range(int(cy - r - 3), int(cy + r + 4)):
            for x in range(int(cx - r - 3), int(cx + r + 4)):
                if (y - cy) ** 2 + (x - cx) ** 2 <= (r + 2.5) ** 2:
                    arr[y, x] = body
        out = Image.fromarray(arr, "RGBA")
        d = ImageDraw.Draw(out)
        half, thick = r * 1.25, max(4, r * 0.7)
        d.rounded_rectangle([cx - half, cy + 1 - thick / 2, cx + half, cy + 1 + thick / 2], radius=thick / 2, fill=(35, 35, 35, 255))
        arr = np.asarray(out).copy()
    return out


def build_og():
    """공유 카드용 정지 프레임만 다시 만든다 (색 값만 바꿨을 때는 이것만 돌리면 된다)."""
    OG.mkdir(parents=True, exist_ok=True)
    still = frames(Image.open(SRC / "blaze.png").convert("RGBA"))[0].resize((360, 360), Image.LANCZOS)
    for name, (deg, sat, bri) in TINT.items():
        tint(still, deg, sat, bri).save(OG / f"dokkaebi-{name}.png", optimize=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for motion in MOTIONS:
        sheet = Image.open(SRC / f"{motion}.png").convert("RGBA")
        strip = Image.new("RGBA", (SIZE * 25, SIZE), (0, 0, 0, 0))
        for i, frame in enumerate(frames(sheet)):
            strip.alpha_composite(frame.resize((SIZE, SIZE), Image.LANCZOS), (i * SIZE, 0))
        strip.save(OUT / f"{motion}.webp", "WEBP", quality=88, method=6)
        if motion == "idle":
            frames(sheet)[0].resize((SIZE, SIZE), Image.LANCZOS).save(OUT / "idle-still.png", optimize=True)
    # 오프닝 클로즈업용 정지 프레임: 뜬 눈 / 감은 눈 (원본 해상도 그대로)
    first = frames(Image.open(SRC / "idle.png").convert("RGBA"))[0]
    first.save(OUT / "blink-open.webp", "WEBP", quality=90, method=6)
    blink(first).save(OUT / "blink-closed.webp", "WEBP", quality=90, method=6)
    build_og()
    for p in sorted(OUT.iterdir()) + sorted(OG.glob("*.png")):
        print(f"{p.relative_to(ROOT)}  {p.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
