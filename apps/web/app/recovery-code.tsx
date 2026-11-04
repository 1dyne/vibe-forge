"use client";
import { useState } from "react";

// Shows a recovery code once, with copy and download, and asks the person to
// confirm they saved it before going on.
export default function RecoveryCode({ code, onSaved }: { code: string; onSaved?: (saved: boolean) => void }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const download = () => {
    const blob = new Blob([`달그락 대장간 복구 코드\n\n${code}\n\n비밀번호를 잊었을 때 내 기록을 되살리는 예비 열쇠예요. 다른 사람에게 보여주지 마세요.\n`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "dalgeurak-recovery-code.txt"; a.click();
    URL.revokeObjectURL(url);
  };
  return <div className="recovery-box">
    <p><b>복구 코드</b> · 비밀번호를 잊었을 때 내 기록을 되살리는 예비 열쇠예요. <b>지금 한 번만 보여드려요.</b></p>
    <code className="recovery-code">{code}</code>
    <div className="delete-actions">
      <button type="button" onClick={() => { void navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>{copied ? "복사됨" : "복사"}</button>
      <button type="button" onClick={download}>파일로 받기</button>
    </div>
    <label className="remember-session"><input type="checkbox" checked={saved} onChange={(e) => { setSaved(e.target.checked); onSaved?.(e.target.checked); }} />복구 코드를 안전한 곳(비밀번호 관리자, 출력물 등)에 저장했어요</label>
  </div>;
}
