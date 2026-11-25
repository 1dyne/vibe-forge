// Bump a version whenever the text in /terms or /privacy changes in substance;
// new sign-ups record which versions they agreed to.
export const TERMS_VERSION = "2026-11-04";
export const PRIVACY_VERSION = "2026-11-05";
// The notice shown before Google sign-up; bump when its meaning changes.
export const GOOGLE_NOTICE_VERSION = "2026-11-05";

export type SignupMode = "closed" | "invite" | "open";
export function signupMode(): SignupMode {
  const mode = process.env.SIGNUP_MODE;
  return mode === "open" || mode === "invite" ? mode : "closed";
}

export const OPERATOR_CONTACT = () => process.env.OPERATOR_CONTACT_EMAIL || "1dyne.official@gmail.com";

// 이메일·비밀번호 가입은 기록을 본인 비밀번호로만 열 수 있게 잠그는 길이라, 개인정보에
// 민감한 사람을 위해 남겨 둔다. 다만 운영 준비(인증 메일 발송, 복구 안내)가 끝나 열기로
// 정하기 전까지는 가입 화면에 내놓지 않고 가입 요청도 받지 않는다. 이미 가입한 사람의
// 이메일 로그인은 이 값과 관계없이 된다.
export const emailSignupOpen = () => process.env.EMAIL_SIGNUP === "on";
