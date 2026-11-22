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

// 작업 책상 — 작업대. 처음엔 모루로 그렸는데 "작업대"로 읽히지 않았다.
// 상판 위에 만들던 것이 놓여 있어야 '작업 중인 책상'으로 보인다.
export const IconDesk = (p: SVGProps<SVGSVGElement>) => <Ink {...p}>
  <path d="M2.4 8.6h15.2" /><path d="M4.6 8.6v7.6M15.4 8.6v7.6" /><path d="M4.6 13.2h10.8" />
  <path d="M7.8 4.8h4.4v3.8H7.8z" />
</Ink>;

// 망치 — 제작 프로필(가진 장비와 경험)
export const IconHammer = (p: SVGProps<SVGSVGElement>) => <Ink {...p}>
  <path d="M4.2 15.8 11 9" /><path d="M9.3 5.6 8 6.9l4.6 4.6 1.3-1.3" />
  <path d="M11.4 3.6 9.3 5.6l5.2 5.2 2-2c.6-.6.6-1.6 0-2.2l-3-3a1.6 1.6 0 0 0-2.1 0Z" />
</Ink>;

// 3D 프린터 — 메이커스페이스. 처음엔 네모 상자로 그렸더니 바로 옆 '개발 연결'(노트북)과
// 구분이 안 됐다. 열린 문틀 모양 뼈대에 가로 레일, 매달린 노즐, 바닥판 위에 출력 중인
// 덩어리를 두어 프린터로 읽히게 했다.
export const IconPrinter = (p: SVGProps<SVGSVGElement>) => <Ink {...p}>
  <path d="M3.6 16.4V3.6h12.8v12.8" /><path d="M3.6 7.2h12.8" />
  <path d="M10 7.2v1.5" /><path d="M8.9 8.7h2.2l-1.1 1.6z" />
  <path d="M8.2 11.8h3.6v2.9H8.2z" /><path d="M5.6 14.7h8.8" />
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
