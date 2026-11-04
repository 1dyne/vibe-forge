// Bump a version whenever the text in /terms or /privacy changes in substance;
// new sign-ups record which versions they agreed to.
export const TERMS_VERSION = "2026-11-04";
export const PRIVACY_VERSION = "2026-11-04";

export type SignupMode = "closed" | "invite" | "open";
export function signupMode(): SignupMode {
  const mode = process.env.SIGNUP_MODE;
  return mode === "open" || mode === "invite" ? mode : "closed";
}

export const OPERATOR_CONTACT = () => process.env.OPERATOR_CONTACT_EMAIL || "1dyne.official@gmail.com";
