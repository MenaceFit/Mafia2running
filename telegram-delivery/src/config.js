// Configuration read from environment variables. Never commit real values.
const env = process.env;

function list(value) {
  return String(value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export function loadConfig(overrides = {}) {
  const cfg = {
    port: Number(env.PORT || 3000),
    publicUrl: (env.PUBLIC_URL || '').replace(/\/$/, ''),

    shop: {
      domain: env.SHOPIFY_SHOP_DOMAIN || '', // ex: ma-boutique.myshopify.com
      apiVersion: env.SHOPIFY_API_VERSION || '2025-10',
      adminToken: env.SHOPIFY_ADMIN_TOKEN || '', // custom app Admin API token (shpat_...)
      clientId: env.SHOPIFY_CLIENT_ID || '', // or: Dev Dashboard app (client credentials)
      clientSecret: env.SHOPIFY_CLIENT_SECRET || '',
      webhookSecret: env.SHOPIFY_WEBHOOK_SECRET || '',
      accessProductIds: list(env.ACCESS_PRODUCT_IDS) // numeric product IDs, comma separated
    },

    telegram: {
      botToken: env.TELEGRAM_BOT_TOKEN || '',
      chatId: env.TELEGRAM_CHAT_ID || '', // private group/supergroup id, ex: -1001234567890
      webhookSecret: env.TELEGRAM_WEBHOOK_SECRET || '',
      inviteTtlHours: Number(env.INVITE_TTL_HOURS || 72),
      revokeMode: env.REVOKE_MODE === 'ban' ? 'ban' : 'remove',
      botUsername: env.TELEGRAM_BOT_USERNAME || ''
    },

    email: {
      resendApiKey: env.RESEND_API_KEY || '',
      from: env.EMAIL_FROM || '',
      replyTo: env.EMAIL_REPLY_TO || '',
      brand: env.BRAND_NAME || 'Mafia Running'
    },

    claim: {
      maxAttemptsPerHour: Number(env.CLAIM_MAX_ATTEMPTS_PER_HOUR || 5)
    },

    ...overrides
  };
  return cfg;
}

export function validateConfig(cfg) {
  const missing = [];
  if (!cfg.shop.domain) missing.push('SHOPIFY_SHOP_DOMAIN');
  if (!cfg.shop.adminToken && !(cfg.shop.clientId && cfg.shop.clientSecret)) missing.push('SHOPIFY_ADMIN_TOKEN (ou SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET)');
  if (!cfg.shop.webhookSecret) missing.push('SHOPIFY_WEBHOOK_SECRET');
  if (cfg.shop.accessProductIds.length === 0) missing.push('ACCESS_PRODUCT_IDS');
  if (!cfg.telegram.botToken) missing.push('TELEGRAM_BOT_TOKEN');
  if (!cfg.telegram.chatId) missing.push('TELEGRAM_CHAT_ID');
  if (!cfg.telegram.webhookSecret) missing.push('TELEGRAM_WEBHOOK_SECRET');
  if (cfg.email.resendApiKey && !cfg.email.from) missing.push('EMAIL_FROM (requis avec RESEND_API_KEY)');
  return missing;
}
