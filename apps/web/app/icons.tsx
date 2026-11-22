import type { SVGProps } from "react";

// 달그락 캐릭터는 굵은 먹선에 둥근 모서리, 면은 비운 손그림이다. 그런데 화면의 아이콘은
// 이모지(🗑 ⚙ 🔗 💻)여서 글꼴과 플랫폼에 따라 제각각 그려지고, 캐릭터와 따로 놀았다.
// 같은 선으로 다시 그린다: 굵기 1.7, 둥근 끝과 이음, 면은 비우고 색은 글자색을 따른다.
// 대장간에 있는 물건으로 고를 수 있으면 그렇게 했다(작업대는 모루, 제작 프로필은 망치).
function Ink({ children, size = 15, ...rest }: SVGProps<SVGSVGElement> & { size?: number }) {
  return <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.7}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className="ink-icon" {...rest}>{children}</svg>;
}

export const IconPlus = (p: SVGProps<SVGSVGElement>) => <Ink {...p}><path d="M10 4.4v11.2M4.4 10h11.2" /></Ink>;

// 모루 — 작업대
export const IconAnvil = (p: SVGProps<SVGSVGElement>) => <Ink {...p}>
  <path d="M3 7.4h9.3c1.9 0 3.1 1.3 4.4 1.3-.5 1.9-2.3 3-4.5 3H8.6" />
  <path d="M8.6 11.7 7.4 15M5 15.6h6.4" /><path d="M3 7.4 4.6 5h3.2" />
</Ink>;

// 망치 — 제작 프로필(가진 장비와 경험)
export const IconHammer = (p: SVGProps<SVGSVGElement>) => <Ink {...p}>
  <path d="M4.2 15.8 11 9" /><path d="M9.3 5.6 8 6.9l4.6 4.6 1.3-1.3" />
  <path d="M11.4 3.6 9.3 5.6l5.2 5.2 2-2c.6-.6.6-1.6 0-2.2l-3-3a1.6 1.6 0 0 0-2.1 0Z" />
</Ink>;

// 3D 프린터 — 메이커스페이스
export const IconPrinter = (p: SVGProps<SVGSVGElement>) => <Ink {...p}>
  <path d="M3.6 3.8h12.8v8.4H3.6z" /><path d="M6.4 12.2v2.1h7.2v-2.1" />
  <path d="M8.3 7h3.4l-.7 2.6H9z" /><path d="M5 16.4h10" />
</Ink>;

export const IconTrash = (p: SVGProps<SVGSVGElement>) => <Ink {...p}>
  <path d="M3.9 5.6h12.2" /><path d="M8 5.6V4.2c0-.5.4-.9.9-.9h2.2c.5 0 .9.4.9.9v1.4" />
  <path d="M5.4 5.6 6.2 16c0 .5.5.9 1 .9h5.6c.5 0 1-.4 1-.9l.8-10.4" />
  <path d="M8.6 8.5v5.2M11.4 8.5v5.2" />
</Ink>;

export const IconPencil = (p: SVGProps<SVGSVGElement>) => <Ink {...p}>
  <path d="M13.2 3.6 16.4 6.8 7.6 15.6 3.6 16.4l.8-4z" /><path d="M11.6 5.2l3.2 3.2" />
</Ink>;

export const IconLink = (p: SVGProps<SVGSVGElement>) => <Ink {...p}>
  <path d="M8.4 11.6a3 3 0 0 0 4.3 0l2.4-2.4a3 3 0 0 0-4.3-4.3l-1.2 1.2" />
  <path d="M11.6 8.4a3 3 0 0 0-4.3 0l-2.4 2.4a3 3 0 0 0 4.3 4.3l1.2-1.2" />
</Ink>;

export const IconLaptop = (p: SVGProps<SVGSVGElement>) => <Ink {...p}>
  <path d="M5 4.6h10v7.6H5z" /><path d="M2.8 14.6h14.4" /><path d="M8.2 7.6 6.8 9l1.4 1.4M11.8 7.6 13.2 9l-1.4 1.4" />
</Ink>;

export const IconUndo = (p: SVGProps<SVGSVGElement>) => <Ink {...p}>
  <path d="M4.2 9.2a6 6 0 1 1 1.4 5" /><path d="M3.4 4.8v4.4h4.4" />
</Ink>;

export const IconPeople = (p: SVGProps<SVGSVGElement>) => <Ink {...p}>
  <path d="M7.4 9.2a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8Z" />
  <path d="M2.8 16c0-2.5 2-4.2 4.6-4.2s4.6 1.7 4.6 4.2" />
  <path d="M13 4.8a2.3 2.3 0 0 1 0 4.4" /><path d="M14.2 11.9c1.8.4 3 1.9 3 4.1" />
</Ink>;

export const IconPerson = (p: SVGProps<SVGSVGElement>) => <Ink {...p}>
  <path d="M10 9.6a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Z" />
  <path d="M4.4 16.4c0-2.9 2.4-4.9 5.6-4.9s5.6 2 5.6 4.9" />
</Ink>;
