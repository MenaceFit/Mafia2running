import http from 'node:http';
import crypto from 'node:crypto';
import { loadConfig, validateConfig } from './config.js';
import { ShopifyClient, verifyShopifyHmac } from './shopify.js';
import { TelegramClient } from './telegram.js';
import { createDelivery } from './delivery.js';

const MAX_BODY = 1024 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const send = (res, status, body = '') => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export function createApp({ cfg, delivery, log = console }) {
  const seenWebhooks = new Map(); // X-Shopify-Webhook-Id -> timestamp (dedupe retries)

  const shopifyRoutes = {
    '/webhooks/shopify/orders-paid': (p) => delivery.handleOrderPaid(p),
    '/webhooks/shopify/refunds-create': (p) => delivery.handleRefund(p),
    '/webhooks/shopify/orders-cancelled': (p) => delivery.revokeOrder(p.admin_graphql_api_id || p.id, 'cancelled')
  };

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true });
      if (req.method !== 'POST') return send(res, 404, { error: 'not_found' });

      if (shopifyRoutes[url.pathname]) {
        const raw = await readBody(req);
        if (!verifyShopifyHmac(raw, req.headers['x-shopify-hmac-sha256'], cfg.shop.webhookSecret)) return send(res, 401, { error: 'invalid_hmac' });
        const shopHeader = req.headers['x-shopify-shop-domain'];
        if (shopHeader && cfg.shop.domain && shopHeader !== cfg.shop.domain) return send(res, 401, { error: 'unknown_shop' });

        const webhookId = req.headers['x-shopify-webhook-id'];
        if (webhookId && seenWebhooks.has(webhookId)) return send(res, 200, { duplicate: true });

        const result = await shopifyRoutes[url.pathname](JSON.parse(raw.toString('utf8')));
        if (webhookId) {
          seenWebhooks.set(webhookId, Date.now());
          if (seenWebhooks.size > 5000) seenWebhooks.delete(seenWebhooks.keys().next().value);
        }
        log.info(`${url.pathname} → ${JSON.stringify(result)}`);
        return send(res, 200, result);
      }

      if (url.pathname === '/telegram/webhook') {
        if (!safeEqual(req.headers['x-telegram-bot-api-secret-token'], cfg.telegram.webhookSecret)) return send(res, 401, { error: 'invalid_secret' });
        const update = JSON.parse((await readBody(req)).toString('utf8'));
        // Always answer 200 to Telegram, errors are logged (Telegram would otherwise retry forever).
        try {
          if (update.message) await delivery.handleMessage(update.message);
          else if (update.chat_member) await delivery.handleChatMember(update.chat_member);
        } catch (e) {
          log.error(`telegram update failed: ${e.message}`);
        }
        return send(res, 200, { ok: true });
      }

      return send(res, 404, { error: 'not_found' });
    } catch (e) {
      log.error(`${url.pathname} failed: ${e.message}`);
      // 500 → Shopify retries the webhook later (the handlers are idempotent).
      return send(res, 500, { error: 'internal_error' });
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = loadConfig();
  const missing = validateConfig(cfg);
  if (missing.length) {
    console.error(`Configuration incomplète. Variables manquantes :\n- ${missing.join('\n- ')}`);
    process.exit(1);
  }
  const shopify = new ShopifyClient(cfg.shop);
  const telegram = new TelegramClient(cfg.telegram);
  const delivery = createDelivery({ cfg, shopify, telegram });
  http.createServer(createApp({ cfg, delivery })).listen(cfg.port, () => console.log(`telegram-delivery listening on :${cfg.port}`));
}
