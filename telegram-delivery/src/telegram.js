// Minimal Telegram Bot API client (https://core.telegram.org/bots/api).
export class TelegramClient {
  constructor(cfg, fetchImpl = globalThis.fetch) {
    this.cfg = cfg;
    this.fetch = fetchImpl;
  }

  async call(method, payload = {}) {
    const res = await this.fetch(`https://api.telegram.org/bot${this.cfg.botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description || res.status}`);
    return data.result;
  }

  /** Single-use invite link: one member max, expires after `ttlHours`. */
  createInvite(name, ttlHours) {
    return this.call('createChatInviteLink', {
      chat_id: this.cfg.chatId,
      name: String(name).slice(0, 32),
      member_limit: 1,
      expire_date: Math.floor(Date.now() / 1000) + Math.round(ttlHours * 3600)
    });
  }

  revokeInvite(inviteLink) {
    return this.call('revokeChatInviteLink', { chat_id: this.cfg.chatId, invite_link: inviteLink });
  }

  async removeMember(userId, mode = 'remove') {
    await this.call('banChatMember', { chat_id: this.cfg.chatId, user_id: Number(userId) });
    if (mode === 'remove') {
      // Unban right away: the user is removed but could rejoin later with a new paid invite.
      await this.call('unbanChatMember', { chat_id: this.cfg.chatId, user_id: Number(userId), only_if_banned: true });
    }
  }

  sendMessage(chatId, text, extra = {}) {
    return this.call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });
  }

  setWebhook(url, secret) {
    return this.call('setWebhook', { url, secret_token: secret, allowed_updates: ['message', 'chat_member'], drop_pending_updates: true });
  }
}
