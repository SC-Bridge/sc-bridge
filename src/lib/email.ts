import type { Env } from "./types";

export function buildTransactionalEmailHtml(
  title: string,
  bodyHtml: string,
): string {
  return `<!DOCTYPE html>
<html>
<head><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #e0e0e0; background: #1a1a2e; margin: 0; padding: 20px; }
  .container { max-width: 600px; margin: 0 auto; background: #16213e; border-radius: 8px; padding: 30px; }
  .header { text-align: center; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #2a2a4a; }
  .header h1 { color: #00d4ff; font-size: 20px; margin: 0 0 4px 0; letter-spacing: 2px; }
  .header p { color: #666; font-size: 11px; margin: 0; letter-spacing: 3px; text-transform: uppercase; }
  h2 { color: #00d4ff; font-size: 18px; margin: 0 0 16px 0; }
  p { font-size: 14px; line-height: 1.6; color: #ccc; margin: 0 0 16px 0; }
  .cta { display: inline-block; background: #00d4ff; color: #1a1a2e; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 6px; text-decoration: none; letter-spacing: 1px; text-transform: uppercase; margin: 8px 0 16px 0; }
  .footer { font-size: 12px; color: #666; margin-top: 24px; padding-top: 16px; border-top: 1px solid #2a2a4a; text-align: center; }
</style></head>
<body>
<div class="container">
  <div class="header">
    <h1>SC BRIDGE</h1>
    <p>Star Citizen Companion</p>
  </div>
  <h2>${title}</h2>
  ${bodyHtml}
  <div class="footer">
    <p>SC Bridge &mdash; support@scbridge.app</p>
  </div>
</div>
</body>
</html>`;
}

export async function sendEmail(
  env: Env,
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY not set — skipping email send");
    return;
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM || "SC Bridge <noreply@scbridge.app>",
      to,
      subject,
      html,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error(`[email] Failed to send: ${resp.status} ${text}`);
  }
}
