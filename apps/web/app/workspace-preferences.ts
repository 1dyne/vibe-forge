"use client";
import { useEffect, useState } from "react";

// seen: 프로젝트마다 "이미 본 것"의 표식 목록(item:<id> / task:<id>).
// 새 작업물과 새 할 일이 조용히 늘어나기만 해서 어디를 봐야 할지 알 수 없었다.
// 본 것을 기억해 두어야 "새로 온 것"을 가려낼 수 있다.
type Preferences = { projectsOpen: boolean; expanded: string[]; workbenches: Record<string, { open: boolean; selected: string }>; seen: Record<string, string[]>; shortNames: boolean; tutorialSeen: boolean };
const initial: Preferences = { projectsOpen: true, expanded: [], workbenches: {}, seen: {}, shortNames: false, tutorialSeen: false };
export function useWorkspacePreferences() {
  const [preferences, setPreferences] = useState(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("forge-workspace-v1") ?? "null");
      if (saved && typeof saved === "object") {
        const workbenches: Preferences["workbenches"] = {};
        if (saved.workbenches && typeof saved.workbenches === "object") for (const [key, entry] of Object.entries(saved.workbenches)) {
          const value = entry as { open?: unknown; selected?: unknown } | null;
          if (value && typeof value.open === "boolean" && typeof value.selected === "string") workbenches[key] = { open: value.open, selected: value.selected };
        }
        const seen: Preferences["seen"] = {};
        if (saved.seen && typeof saved.seen === "object") for (const [key, marks] of Object.entries(saved.seen)) {
          if (Array.isArray(marks)) seen[key] = marks.filter((m: unknown) => typeof m === "string").slice(-400);
        }
        setPreferences({ projectsOpen: saved.projectsOpen !== false, expanded: Array.isArray(saved.expanded) ? saved.expanded.filter((s: unknown) => typeof s === "string") : [], workbenches, seen, shortNames: saved.shortNames === true, tutorialSeen: saved.tutorialSeen === true });
      }
    } catch { /* Storage may be unavailable. */ }
    setReady(true);
  }, []);
  useEffect(() => { if (ready) try { localStorage.setItem("forge-workspace-v1", JSON.stringify(preferences)); } catch {} }, [preferences, ready]);
  function setWorkbench(projectId: string, open: boolean, selected: string) {
    setPreferences(p => ({ ...p, workbenches: { ...p.workbenches, [projectId]: { open, selected } } }));
  }
  // 본 것으로 적는다. 오래된 표식이 무한히 쌓이지 않게 프로젝트마다 400개까지만 둔다.
  function markSeen(projectId: string, marks: string[]) {
    setPreferences(p => {
      const current = p.seen[projectId] ?? [];
      const added = marks.filter(mark => !current.includes(mark));
      if (!added.length) return p;
      return { ...p, seen: { ...p.seen, [projectId]: [...current, ...added].slice(-400) } };
    });
  }
  function expand(projectId: string) { setPreferences(p => ({ ...p, projectsOpen: true, expanded: p.expanded.includes(projectId) ? p.expanded : [...p.expanded, projectId] })); }
  return { preferences, setWorkbench, expand, markSeen, ready,
    toggleShortNames: () => setPreferences(p => ({ ...p, shortNames: !p.shortNames })),
    setShortNames: (value: boolean) => setPreferences(p => ({ ...p, shortNames: value })),
    setTutorialSeen: (value: boolean) => setPreferences(p => ({ ...p, tutorialSeen: value })),
    toggleProjects: () => setPreferences(p => ({ ...p, projectsOpen: !p.projectsOpen })),
    toggleFolder: (projectId: string) => setPreferences(p => ({ ...p, expanded: p.expanded.includes(projectId) ? p.expanded.filter(id => id !== projectId) : [...p.expanded, projectId] })) };
}
