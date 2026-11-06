// Sends account email through Resend's HTTP API. Without RESEND_API_KEY the
// messages go to an in-memory outbox (tests, local runs with MAIL_MODE=outbox);
// in production without a key, sending fails with MailNotConfigured.
export type Mail = { to: string; subject: string; text: string; html: string };
export const outbox: Mail[] = [];
export class MailNotConfigured extends Error {}

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM) || process.env.MAIL_MODE === "outbox" || process.env.NODE_ENV === "test";
}

export async function sendMail(mail: Mail): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key || !from) {
    if (process.env.MAIL_MODE === "outbox" || process.env.NODE_ENV === "test") { outbox.push(mail); return; }
    throw new MailNotConfigured("메일 발송이 아직 설정되지 않았어요.");
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html })
  });
  // Never log the body: it carries the one-time link.
  if (!response.ok) throw new Error(`mail provider returned ${response.status}`);
}

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, lines: string[], button: { label: string; url: string }, after: string) {
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;color:#1f2a24">
<h2 style="font-size:18px">${escape(title)}</h2>${lines.map((line) => `<p style="line-height:1.7">${escape(line)}</p>`).join("")}
<p><a href="${escape(button.url)}" style="display:inline-block;background:#8fd0bd;color:#10241c;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">${escape(button.label)}</a></p>
<p style="font-size:12px;color:#6b776f;line-height:1.7">${escape(after)}</p><p style="font-size:12px;color:#6b776f">달그락 대장간</p></div>`;
  const text = `${title}\n\n${lines.join("\n")}\n\n${button.label}: ${button.url}\n\n${after}\n\n달그락 대장간`;
  return { html, text };
}

export function verifyMail(to: string, name: string, url: string): Mail {
  return { to, subject: "[달그락 대장간] 이메일 인증", ...layout(`${name}님, 이메일을 인증해주세요`, ["아래 버튼을 누르면 가입이 끝나고 로그인할 수 있어요.", "링크는 48시간 동안 한 번만 쓸 수 있어요."], { label: "이메일 인증하기", url }, "직접 가입하지 않았다면 이 메일을 무시하세요. 계정은 인증 전까지 쓸 수 없어요.") };
}

export function resetMail(to: string, url: string): Mail {
  return { to, subject: "[달그락 대장간] 비밀번호 다시 만들기", ...layout("비밀번호를 다시 만들 수 있어요", ["아래 버튼을 눌러 새 비밀번호를 만들어주세요. 내 기록을 그대로 열려면 가입할 때 받은 복구 코드가 필요해요.", "링크는 30분 동안 한 번만 쓸 수 있어요."], { label: "비밀번호 다시 만들기", url }, "요청하지 않았다면 이 메일을 무시하세요. 비밀번호는 바뀌지 않아요.") };
}
