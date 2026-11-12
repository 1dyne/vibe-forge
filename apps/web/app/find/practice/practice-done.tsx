"use client";
import { useEffect, useState } from "react";

export default function PracticeDone({ kitId }: { kitId: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => { try { setDone(Boolean(JSON.parse(localStorage.getItem("dalgeurak_practice") ?? "{}")[kitId])); } catch { /* 무시 */ } }, [kitId]);
  return done ? <span className="pk-done">✓ 해봤어요</span> : null;
}
