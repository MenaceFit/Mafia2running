// Optional e-mail delivery through Resend (https://resend.com/docs/api-reference/emails/send-email).
// Any provider works: replace sendInviteEmail() if you use another one.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function inviteEmailHtml({ brand, orderName, inviteLink, expiresAt, botUsername }) {
  const until = new Date(expiresAt).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });
  const botLine = botUsername
    ? `<p style="margin:0 0 12px">Lien expiré ou déjà utilisé ? Écris à <a href="https://t.me/${esc(botUsername)}">@${esc(botUsername)}</a> : <code>/acces ${esc(orderName.replace('#', ''))} ton@email</code></p>`
    : '';
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#F5F6F8;font-family:Arial,Helvetica,sans-serif;color:#101B35">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:16px;padding:32px" cellpadding="0" cellspacing="0"><tr><td>
    <p style="margin:0 0 8px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#777F8D">${esc(brand)}</p>
    <h1 style="margin:0 0 16px;font-size:24px;line-height:1.2">Ton accès au groupe privé</h1>
    <p style="margin:0 0 20px;line-height:1.6">Merci pour ta commande ${esc(orderName)}. Voici ton lien d'invitation Telegram personnel. Il fonctionne <strong>une seule fois</strong> et expire le ${esc(until)}.</p>
    <p style="margin:0 0 24px"><a href="${esc(inviteLink)}" style="display:inline-block;background:#101B35;color:#fff;text-decoration:none;padding:14px 26px;border-radius:40px;font-weight:bold">Rejoindre le groupe</a></p>
    <p style="margin:0 0 12px;line-height:1.6;font-size:14px;color:#777F8D">Ouvre ce lien depuis le compte Telegram avec lequel tu veux rejoindre le groupe. Ne le partage pas : il ne fonctionnera que pour une personne.</p>
    <div style="font-size:14px;color:#777F8D;line-height:1.6">${botLine}</div>
  </td></tr></table></td></tr></table></body></html>`;
}

export async function sendInviteEmail(cfg, { to, orderName, inviteLink, expiresAt, botUsername }, fetchImpl = globalThis.fetch) {
  if (!cfg.resendApiKey) return { skipped: true };
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: cfg.from,
      to: [to],
      ...(cfg.replyTo ? { reply_to: cfg.replyTo } : {}),
      subject: `Ton accès au groupe privé – commande ${orderName}`,
      html: inviteEmailHtml({ brand: cfg.brand, orderName, inviteLink, expiresAt, botUsername })
    })
  });
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}`);
  return { sent: true };
}
