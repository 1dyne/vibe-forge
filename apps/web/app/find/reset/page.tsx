import type { Metadata } from "next";
import ResetDevice from "./reset-device";
import "../fonts";

export const metadata: Metadata = { title: "처음부터 다시 · 달그락 대장간", robots: { index: false } };

export default function ResetPage() {
  return (
    <main className="find">
      <header className="top"><a className="brand" href="/find">달그락 대장간</a><div className="step">처음부터 다시</div></header>
      <ResetDevice />
    </main>
  );
}
