// 공개 닉네임 검사. 화면(즉시 안내)과 서버(저장 직전) 양쪽에서 쓴다.
// 공백·기호·숫자를 빼고 비교해서 "시 발", "s.h.i.t" 같은 우회도 잡는다.

export const NAMELESS = "이름 없는 도깨비";
export const NAME_MAX = 12;

const BLOCKED = [
  "시발", "씨발", "씨바", "시바", "씨빨", "쉬발", "ㅅㅂ", "ㅆㅂ", "병신", "븅신", "ㅂㅅ", "지랄", "ㅈㄹ", "좆", "존나", "졸라", "개새", "개색", "새끼", "섀끼", "미친놈", "미친년",
  "엿먹", "꺼져", "닥쳐", "닥치", "니애미", "니미", "느금", "애미", "애비", "창녀", "걸레", "섹스", "보지", "자지", "강간", "자살", "살인", "일베", "한남충", "김치녀", "틀딱", "장애인새",
  "fuck", "shit", "bitch", "cunt", "dick", "pussy", "porn", "sex", "nigg", "fag",
  "운영자", "관리자", "admin"
];

function squash(text: string) {
  return text.toLowerCase().normalize("NFC").replace(/[\s\d._\-~!@#$%^&*()+=[\]{}|\\:;"'<>,.?/`·ㆍ…]/g, "");
}

export function nicknameProblem(raw: string): string | null {
  const name = raw.trim();
  if (!name) return null;
  if (name.length > NAME_MAX) return `이름은 ${NAME_MAX}자까지만 돼.`;
  if (/https?:|www\.|\.com|\.kr|@/i.test(name)) return "주소나 연락처는 이름으로 못 써.";
  const flat = squash(name);
  if (BLOCKED.some((w) => flat.includes(w))) return "그 이름은 좀… 다른 걸로 해줘.";
  return null;
}

/** 저장할 때: 문제가 있거나 비어 있으면 "이름 없는 도깨비" */
export function cleanNickname(raw: string | null | undefined): string {
  const name = (raw ?? "").replace(/\s+/g, " ").trim();
  return name && !nicknameProblem(name) ? name : NAMELESS;
}
