import { productGid } from './shopify.js';
import { sendInviteEmail } from './email.js';

const INVITE_PREFIX = 'Commande ';
const mask = (link) => (link ? String(link).slice(0, 18) + '…' : '');

export function createDelivery({ cfg, shopify, telegram, fetchImpl = globalThis.fetch, log = console, now = () => Date.now() }) {
  const accessGids = new Set(cfg.shop.accessProductIds.map(productGid));
  const attempts = new Map(); // telegram user id -> [timestamps]

  const hasAccessProduct = (order) => order.productIds.some((id) => accessGids.has(id));

  function eligibility(order) {
    if (!order) return 'not_found';
    if (!hasAccessProduct(order)) return 'no_access_product';
    if (order.cancelled) return 'cancelled';
    if (order.meta.status === 'revoked') return 'revoked';
    if (order.financialStatus !== 'PAID') return 'not_paid';
    return 'ok';
  }

  /** Returns a valid invite for the order, creating (and storing) a new one when needed. */
  async function ensureInvite(order) {
    const expiresAt = Date.parse(order.meta.invite_expires_at || '') || 0;
    if (order.meta.invite_link && expiresAt - now() > 10 * 60 * 1000) {
      return { link: order.meta.invite_link, expiresAt, reused: true };
    }
    if (order.meta.invite_link) {
      await telegram.revokeInvite(order.meta.invite_link).catch((e) => log.warn(`revoke old invite failed for ${order.name}: ${e.message}`));
    }
    const invite = await telegram.createInvite(`${INVITE_PREFIX}${order.name}`, cfg.telegram.inviteTtlHours);
    const exp = invite.expire_date * 1000;
    await shopify.setMeta(order.id, {
      invite_link: invite.invite_link,
      invite_expires_at: new Date(exp).toISOString(),
      status: order.meta.status === 'emailed' ? 'emailed' : 'issued'
    });
    order.meta.invite_link = invite.invite_link;
    order.meta.invite_expires_at = new Date(exp).toISOString();
    log.info(`invite created for ${order.name}: ${mask(invite.invite_link)}`);
    return { link: invite.invite_link, expiresAt: exp, reused: false };
  }

  /** Webhook orders/paid. Idempotent: a second call for the same order does nothing. */
  async function handleOrderPaid(payload) {
    const lineProductIds = (payload.line_items || []).map((li) => productGid(li.product_id));
    if (!lineProductIds.some((id) => accessGids.has(id))) return { skipped: 'no_access_product' };

    const order = await shopify.getOrder(payload.admin_graphql_api_id || payload.id);
    const status = eligibility(order);
    if (status !== 'ok') return { skipped: status };
    if (['emailed', 'joined', 'revoked'].includes(order.meta.status)) return { skipped: 'already_delivered' };

    const invite = await ensureInvite(order);
    const to = order.email || (payload.email || payload.contact_email || '').toLowerCase();

    if (cfg.email.resendApiKey && to) {
      await sendInviteEmail(cfg.email, { to, orderName: order.name, inviteLink: invite.link, expiresAt: invite.expiresAt, botUsername: cfg.telegram.botUsername }, fetchImpl);
      await shopify.setMeta(order.id, { status: 'emailed' });
      await shopify.addTags(order.id, ['acces-telegram-envoye']);
      log.info(`invite e-mailed for ${order.name}`);
      return { delivered: 'email' };
    }
    await shopify.addTags(order.id, ['acces-telegram-pret']);
    return { delivered: 'bot_claim' };
  }

  function rateLimited(userId) {
    const hourAgo = now() - 3600_000;
    const list = (attempts.get(userId) || []).filter((t) => t > hourAgo);
    list.push(now());
    attempts.set(userId, list);
    return list.length > cfg.claim.maxAttemptsPerHour;
  }

  /** Bot message handler: "/start" and "/acces <numéro> <email>". */
  async function handleMessage(message) {
    if (!message || message.chat?.type !== 'private' || !message.text) return { ignored: true };
    const chatId = message.chat.id;
    const userId = String(message.from.id);
    const text = message.text.trim();

    if (/^\/(start|aide|help)\b/i.test(text)) {
      await telegram.sendMessage(chatId, [
        '<b>Bienvenue 👋</b>',
        '',
        'Pour recevoir ton lien d\'invitation au groupe privé, envoie :',
        '<code>/acces NUMÉRO EMAIL</code>',
        '',
        'Exemple : <code>/acces 1001 prenom@exemple.fr</code>',
        'Utilise l\'e-mail saisi lors de ta commande.'
      ].join('\n'));
      return { help: true };
    }

    const m = text.match(/^\/acces(?:@\w+)?\s+#?([0-9A-Za-z-]+)\s+(\S+@\S+)\s*$/i);
    if (!m) {
      if (text.startsWith('/acces')) await telegram.sendMessage(chatId, 'Format attendu : <code>/acces NUMÉRO EMAIL</code>');
      return { ignored: true };
    }
    if (rateLimited(userId)) {
      await telegram.sendMessage(chatId, 'Trop de tentatives. Réessaie dans une heure ou contacte-nous.');
      return { rateLimited: true };
    }

    const [, orderNumber, email] = m;
    const order = await shopify.findOrderByName(orderNumber);
    if (!order || order.email !== email.toLowerCase()) {
      await telegram.sendMessage(chatId, 'Commande introuvable ou e-mail incorrect. Vérifie le numéro et l\'e-mail de ta confirmation de commande.');
      return { denied: 'not_found' };
    }
    const status = eligibility(order);
    if (status !== 'ok') {
      const msg = {
        not_paid: 'Le paiement de cette commande n\'est pas encore confirmé. Réessaie dans quelques minutes.',
        revoked: 'L\'accès lié à cette commande a été désactivé. Contacte-nous si tu penses qu\'il s\'agit d\'une erreur.',
        cancelled: 'Cette commande a été annulée.',
        no_access_product: 'Cette commande ne contient pas l\'accès au groupe.'
      }[status] || 'Commande introuvable.';
      await telegram.sendMessage(chatId, msg);
      return { denied: status };
    }
    if (order.meta.claimed_by && order.meta.claimed_by !== userId) {
      await telegram.sendMessage(chatId, 'Cet accès a déjà été demandé depuis un autre compte Telegram. Contacte-nous avec ton numéro de commande.');
      return { denied: 'claimed_by_other' };
    }
    if (order.meta.status === 'joined') {
      await telegram.sendMessage(chatId, 'Cet accès a déjà été utilisé pour rejoindre le groupe. Contacte-nous si tu as changé de compte.');
      return { denied: 'already_joined' };
    }

    const invite = await ensureInvite(order);
    await shopify.setMeta(order.id, { claimed_by: userId });
    await telegram.sendMessage(chatId, `Paiement confirmé ✅\nVoici ton lien personnel (1 seule utilisation, valable jusqu'au ${new Date(invite.expiresAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}).`, {
      reply_markup: { inline_keyboard: [[{ text: 'Rejoindre le groupe', url: invite.link }]] }
    });
    return { delivered: 'bot', order: order.name };
  }

  /** chat_member update: records which Telegram user joined with which order's invite. */
  async function handleChatMember(update) {
    if (!update || String(update.chat?.id) !== String(cfg.telegram.chatId)) return { ignored: true };
    const joined = ['member', 'restricted'].includes(update.new_chat_member?.status) && !['member', 'administrator', 'creator'].includes(update.old_chat_member?.status);
    const name = update.invite_link?.name || '';
    if (!joined || !name.startsWith(INVITE_PREFIX)) return { ignored: true };

    const order = await shopify.findOrderByName(name.slice(INVITE_PREFIX.length));
    if (!order || order.meta.invite_link !== update.invite_link.invite_link) return { ignored: 'unknown_invite' };
    await shopify.setMeta(order.id, { status: 'joined', telegram_user_id: String(update.new_chat_member.user.id), joined_at: new Date(now()).toISOString() });
    log.info(`member joined for ${order.name}`);
    return { joined: order.name };
  }

  /** Revokes the invite and removes the member (refund, cancellation, manual). */
  async function revokeOrder(orderIdOrName, reason = 'manual') {
    const order = /^\d{6,}$|^gid:/.test(String(orderIdOrName)) ? await shopify.getOrder(orderIdOrName) : await shopify.findOrderByName(orderIdOrName);
    if (!order) return { error: 'not_found' };
    if (order.meta.status === 'revoked') return { skipped: 'already_revoked' };
    if (order.meta.invite_link) await telegram.revokeInvite(order.meta.invite_link).catch((e) => log.warn(`revoke invite: ${e.message}`));
    if (order.meta.telegram_user_id) await telegram.removeMember(order.meta.telegram_user_id, cfg.telegram.revokeMode).catch((e) => log.warn(`remove member: ${e.message}`));
    await shopify.setMeta(order.id, { status: 'revoked', revoked_at: new Date(now()).toISOString(), revoke_reason: reason });
    await shopify.addTags(order.id, ['acces-telegram-revoque']);
    log.info(`access revoked for ${order.name} (${reason})`);
    return { revoked: order.name };
  }

  /** Webhook refunds/create: revoke only when the access product itself is refunded. */
  async function handleRefund(payload) {
    const refunded = (payload.refund_line_items || []).some((r) => accessGids.has(productGid(r.line_item?.product_id)));
    if (!refunded) return { skipped: 'access_not_refunded' };
    return revokeOrder(payload.order_id, 'refund');
  }

  return { handleOrderPaid, handleMessage, handleChatMember, handleRefund, revokeOrder, eligibility };
}
