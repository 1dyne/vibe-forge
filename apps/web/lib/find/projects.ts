import { CATS, MATCH_WEIGHTS, byCat, type Cat, type Chip } from "./chips";
import seed from "./projects.json";

// HANDOFF §5 프로젝트 레코드. 이미지는 라이선스가 재게시를 허용할 때만 넣는다(그 밖엔 링크만).
export type MakerProject = {
  id: string;
  title: string;
  title_ko: string;
  summary_ko: string;
  source: string;
  source_url: string;
  author: string | null;
  license: string | null;
  images: Array<{ url: string; kind: "circuit" | "photo"; credit: string }>;
  tags: Record<Cat, string[]>;
  parts: string[];
  checked_at: string;
};

export const PROJECTS = seed as MakerProject[];

// 재게시해도 되는 라이선스. NC(비영리)·ND(변경금지)·표기 없음은 링크만 보여준다.
const REPUBLISHABLE = [/^CC0/i, /^Public Domain/i, /^CC[ -]BY(?:[ -]SA)?(?:[ -]\d|$)/i, /^MIT/i, /^Apache/i, /^GPL/i, /^CERN[ -]OHL/i, /^OSHW/i];
export function canShowImage(license: string | null) {
  if (!license) return false;
  if (/\b(NC|ND)\b/i.test(license)) return false;
  return REPUBLISHABLE.some((r) => r.test(license.trim()));
}

export type ProjectMatch = {
  id: string;
  title_ko: string;
  summary_ko: string;
  source: string;
  source_url: string;
  author: string | null;
  license: string | null;
  image: { url: string; kind: "circuit" | "photo"; credit: string } | null;
  match: number;
  shared: string[];
};

// 실제로 만들어보기 전엔 100%라고 하지 않는다.
const MAX_PERCENT = 92;
const MIN_PERCENT = 15;

export function userTags(picked: string[], find: (id: string) => Chip | undefined): Record<Cat, string[]> {
  const grouped = byCat(picked, find);
  return Object.fromEntries(CATS.map((cat) => [cat, [...new Set((grouped[cat] ?? []).flatMap((c) => c.tags))]])) as Record<Cat, string[]>;
}

/** 일치율 = 갈래별 (겹친 태그 수 / 내가 고른 태그 수)의 가중합. 고르지 않은 갈래는 빼고 가중치를 다시 나눈다. */
export function matchScore(mine: Record<Cat, string[]>, project: MakerProject) {
  let weight = 0, got = 0;
  const shared: string[] = [];
  for (const cat of CATS) {
    if (!mine[cat].length) continue;
    const overlap = mine[cat].filter((t) => project.tags[cat]?.includes(t));
    weight += MATCH_WEIGHTS[cat];
    got += MATCH_WEIGHTS[cat] * (overlap.length / mine[cat].length);
    shared.push(...overlap);
  }
  const core = shared.some((t) => mine["감지"].includes(t) || mine["반응"].includes(t));
  return { percent: weight ? Math.min(MAX_PERCENT, Math.round((got / weight) * 100)) : 0, shared, core };
}

export function matchProjects(picked: string[], find: (id: string) => Chip | undefined, limit = 3): ProjectMatch[] {
  const mine = userTags(picked, find);
  return PROJECTS
    .map((p) => ({ p, ...matchScore(mine, p) }))
    // 감지나 반응이 하나도 안 겹치면 출발점이 못 된다.
    .filter((m) => m.core && m.percent >= MIN_PERCENT)
    .sort((a, b) => b.percent - a.percent || b.shared.length - a.shared.length)
    .slice(0, limit)
    .map(({ p, percent, shared }) => {
      const image = canShowImage(p.license) ? p.images[0] ?? null : null;
      return { id: p.id, title_ko: p.title_ko, summary_ko: p.summary_ko, source: p.source, source_url: p.source_url, author: p.author, license: p.license, image, match: percent, shared };
    });
}

/** 내가 골랐는데 화면에 보이는 닮은 프로젝트 어디에도 없는 것 = 추가 설계가 필요한 부분 */
export function uniqueToIdea(picked: string[], find: (id: string) => Chip | undefined, shown: ProjectMatch[]): string[] {
  const projects = shown.map((m) => PROJECTS.find((p) => p.id === m.id)).filter((p): p is MakerProject => Boolean(p));
  return picked
    .map((id) => find(id))
    .filter((c): c is Chip => Boolean(c))
    .filter((c) => c.tags.length === 0 || !projects.some((p) => c.tags.some((t) => p.tags[c.cat]?.includes(t))))
    .map((c) => c.label);
}
