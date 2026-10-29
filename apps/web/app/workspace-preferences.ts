"use client";
import { useEffect, useState } from "react";

type Preferences = { projectsOpen: boolean; expanded: string[]; workbenches: Record<string, { open: boolean; selected: string }> };
const initial: Preferences = { projectsOpen: true, expanded: [], workbenches: {} };
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
        setPreferences({ projectsOpen: saved.projectsOpen !== false, expanded: Array.isArray(saved.expanded) ? saved.expanded.filter((s: unknown) => typeof s === "string") : [], workbenches });
      }
    } catch { /* Storage may be unavailable. */ }
    setReady(true);
  }, []);
  useEffect(() => { if (ready) try { localStorage.setItem("forge-workspace-v1", JSON.stringify(preferences)); } catch {} }, [preferences, ready]);
  function setWorkbench(projectId: string, open: boolean, selected: string) {
    setPreferences(p => ({ ...p, workbenches: { ...p.workbenches, [projectId]: { open, selected } } }));
  }
  function expand(projectId: string) { setPreferences(p => ({ ...p, projectsOpen: true, expanded: p.expanded.includes(projectId) ? p.expanded : [...p.expanded, projectId] })); }
  return { preferences, setWorkbench, expand,
    toggleProjects: () => setPreferences(p => ({ ...p, projectsOpen: !p.projectsOpen })),
    toggleFolder: (projectId: string) => setPreferences(p => ({ ...p, expanded: p.expanded.includes(projectId) ? p.expanded.filter(id => id !== projectId) : [...p.expanded, projectId] })) };
}
