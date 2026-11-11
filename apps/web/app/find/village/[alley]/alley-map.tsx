"use client";

type House = { forgeId: string | null; plotNo: number; nickname: string; locked: boolean; color: string; reactKind: string; chimney: 1 | 2 | 3; lit: boolean; flag: boolean; mine: boolean; wants: number };
const COLS = 3;
const CELL_W = 100 / COLS;
const ROW_H = 132;
const SHOW_EMPTY = 6;

function HouseIcon({ h }: { h: House }) {
  const flame = [0, 8, 12, 17][h.chimney];
  return (
    <svg viewBox="0 0 100 92" className="house-svg" aria-hidden>
      {/* 굴뚝 불 */}
      {!h.locked && <ellipse cx="70" cy={18 - flame / 2} rx={flame / 2.2} ry={flame / 1.4} fill={h.color} stroke="#232323" strokeWidth="1.5" className="chimney-fire" />}
      <rect x="64" y="18" width="12" height="20" fill="#B9B4A8" stroke="#232323" strokeWidth="2" />
      {/* 지붕·벽 (등축 느낌) */}
      <polygon points="12,44 50,20 88,44" fill={h.locked ? "#CFCBC2" : h.mine ? "#E2574C" : "#8FBFB7"} stroke="#232323" strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="18" y="44" width="64" height="40" fill={h.locked ? "#E9E6DF" : "#FBFAF6"} stroke="#232323" strokeWidth="2.5" />
      {/* 창문 불 */}
      <rect x="28" y="54" width="16" height="14" rx="2" fill={h.lit ? "#FFD27A" : "#DDD8CC"} stroke="#232323" strokeWidth="2" />
      <rect x="56" y="58" width="14" height="26" rx="2" fill="#C99A6B" stroke="#232323" strokeWidth="2" />
      {/* 깃발 */}
      {h.flag && <g><line x1="20" y1="44" x2="20" y2="18" stroke="#232323" strokeWidth="2" /><polygon points="20,18 36,23 20,28" fill="#9B7BFF" stroke="#232323" strokeWidth="1.5" /></g>}
      {h.locked && <g><rect x="44" y="68" width="12" height="10" rx="2" fill="#9E9E9E" stroke="#232323" strokeWidth="1.5" /><path d="M46 68 v-3 a4 4 0 0 1 8 0 v3" fill="none" stroke="#232323" strokeWidth="1.5" /></g>}
    </svg>
  );
}

export default function AlleyMap({ houses, strings, capacity, myForgeId }: { houses: House[]; strings: Array<{ follower: string; followee: string }>; capacity: number; myForgeId: string | null }) {
  const empties = Math.min(SHOW_EMPTY, Math.max(0, capacity - houses.length));
  const total = houses.length + empties;
  const rows = Math.ceil(total / COLS);
  const pos = (i: number) => ({ x: (i % COLS) * CELL_W + CELL_W / 2, y: Math.floor(i / COLS) * ROW_H + 46 });
  const index = new Map(houses.map((h, i) => [h.forgeId, i]));
  return (
    <div className="alley" style={{ height: rows * ROW_H + 10 }}>
      <svg className="alley-strings" viewBox={`0 0 100 ${rows * ROW_H + 10}`} preserveAspectRatio="none" aria-hidden>
        {strings.map((s, k) => {
          const a = index.get(s.follower), b = index.get(s.followee);
          if (a === undefined || b === undefined) return null;
          const p = pos(a), q = pos(b);
          return <path key={k} d={`M ${p.x} ${p.y} Q ${(p.x + q.x) / 2} ${Math.max(p.y, q.y) + 30} ${q.x} ${q.y}`} stroke="#E2574C" strokeWidth="1.2" fill="none" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />;
        })}
      </svg>
      {houses.map((h, i) => {
        const p = pos(i);
        const body = (
          <>
            <HouseIcon h={h} />
            <span className="house-name">{h.mine ? "내 대장간" : h.nickname}</span>
            <span className="house-plot">{h.plotNo}번 터</span>
          </>
        );
        return h.forgeId ? (
          <a key={h.plotNo} className={`house${h.mine ? " mine" : ""}`} href={`/f/${h.forgeId}`} style={{ left: `${p.x}%`, top: p.y - 46 }}>{body}</a>
        ) : (
          <div key={h.plotNo} className="house" style={{ left: `${p.x}%`, top: p.y - 46 }}>{body}</div>
        );
      })}
      {Array.from({ length: empties }).map((_, k) => {
        const p = pos(houses.length + k);
        return <a key={`e${k}`} className="house empty" href="/find" style={{ left: `${p.x}%`, top: p.y - 46 }}><span className="plot-empty">빈 터</span><span className="house-plot">{houses.length + k + 1}번 터</span></a>;
      })}
      {capacity - houses.length > empties && <div className="more-empty" style={{ top: rows * ROW_H - 6 }}>빈 터 {capacity - houses.length - empties}개 더 · 선착순이야</div>}
    </div>
  );
}
