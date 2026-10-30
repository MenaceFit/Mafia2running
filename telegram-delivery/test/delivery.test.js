import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { verifyShopifyHmac } from '../src/shopify.js';
import { createDelivery } from '../src/delivery.js';
import { createApp } from '../src/server.js';

const silent = { info() {}, warn() {}, error() {} };

function makeCfg(extra = {}) {
  return {
    shop: { domain: 'test.myshopify.com', webhookSecret: 'whsec', accessProductIds: ['111'] },
    telegram: { chatId: '-100123', inviteTtlHours: 72, revokeMode: 'remove', webhookSecret: 'tgsecret', botUsername: 'acces_bot' },
    email: { resendApiKey: 'rk', from: 'a@b.c', brand: 'Test' },
    claim: { maxAttemptsPerHour: 3 },
    ...extra
  };
}

function makeOrder(over = {}) {
  return {
    id: 'gid://shopify/Order/5550001',
    name: '#1001',
    email: 'client@exemple.fr',
    financialStatus: 'PAID',
    cancelled: false,
    tags: [],
    productIds: ['gid://shopify/Product/111'],
    meta: {},
    ...over
  };
}

function fakes(order) {
  const calls = { telegram: [], tags: [], emails: [] };
  const orders = new Map([[order.id, order]]);
  const clone = (o) => o && structuredClone(o);
  const shopify = {
    async getOrder(id) { return clone(orders.get(String(id).startsWith('gid') ? id : `gid://shopify/Order/${id}`)); },
    async findOrderByName(name) { return clone([...orders.values()].find((o) => o.name === `#${String(name).replace('#', '')}`)); },
    async setMeta(id, values) { Object.assign(orders.get(id).meta, values); },
    async addTags(id, tags) { calls.tags.push(...tags); }
  };
  let n = 0;
  const telegram = {
    async createInvite(name, ttl) { n += 1; calls.telegram.push(['create', name, ttl]); return { invite_link: `https://t.me/+invite${n}`, expire_date: Math.floor(Date.now() / 1000) + ttl * 3600, name, member_limit: 1 }; },
    async revokeInvite(link) { calls.telegram.push(['revoke', link]); },
    async removeMember(id, mode) { calls.telegram.push(['remove', id, mode]); },
    async sendMessage(chatId, text, extra) { calls.telegram.push(['send', chatId, text, extra]); }
  };
  const fetchImpl = async (url, init) => { calls.emails.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({}) }; };
  return { shopify, telegram, fetchImpl, calls, orders };
}

const paidPayload = (o) => ({ id: 5550001, admin_graphql_api_id: o.id, email: o.email, line_items: [{ product_id: 111 }] });

test('HMAC verification', () => {
  const body = Buffer.from('{"a":1}');
  const good = crypto.createHmac('sha256', 's3cret').update(body).digest('base64');
  assert.equal(verifyShopifyHmac(body, good, 's3cret'), true);
  assert.equal(verifyShopifyHmac(body, good, 'wrong'), false);
  assert.equal(verifyShopifyHmac(body, undefined, 's3cret'), false);
  assert.equal(verifyShopifyHmac(body, 'Zm9v', 's3cret'), false);
});

test('orders/paid creates a single-use invite, e-mails it once, and is idempotent', async () => {
  const order = makeOrder();
  const f = fakes(order);
  const d = createDelivery({ cfg: makeCfg(), ...f, log: silent });

  const r1 = await d.handleOrderPaid(paidPayload(order));
  assert.deepEqual(r1, { delivered: 'email' });
  assert.deepEqual(f.calls.telegram[0], ['create', 'Commande #1001', 72]);
  const stored = f.orders.get(order.id).meta;
  assert.equal(stored.status, 'emailed');
  assert.match(stored.invite_link, /^https:\/\/t\.me\/\+invite1$/);
  assert.equal(f.calls.emails.length, 1);
  assert.deepEqual(f.calls.emails[0].body.to, ['client@exemple.fr']);
  assert.ok(f.calls.emails[0].body.html.includes(stored.invite_link));
  assert.ok(f.calls.tags.includes('acces-telegram-envoye'));

  const r2 = await d.handleOrderPaid(paidPayload(order));
  assert.deepEqual(r2, { skipped: 'already_delivered' });
  assert.equal(f.calls.emails.length, 1);
  assert.equal(f.calls.telegram.filter((c) => c[0] === 'create').length, 1);
});

test('orders/paid ignores orders without the access product, and unpaid orders', async () => {
  const order = makeOrder({ financialStatus: 'PENDING' });
  const f = fakes(order);
  const d = createDelivery({ cfg: makeCfg(), ...f, log: silent });
  assert.deepEqual(await d.handleOrderPaid({ ...paidPayload(order), line_items: [{ product_id: 999 }] }), { skipped: 'no_access_product' });
  assert.deepEqual(await d.handleOrderPaid(paidPayload(order)), { skipped: 'not_paid' });
  assert.equal(f.calls.telegram.length, 0);
});

test('without e-mail provider, the customer claims the invite through the bot', async () => {
  const order = makeOrder();
  const f = fakes(order);
  const cfg = makeCfg({ email: { resendApiKey: '' } });
  const d = createDelivery({ cfg, ...f, log: silent });
  assert.deepEqual(await d.handleOrderPaid(paidPayload(order)), { delivered: 'bot_claim' });
  assert.equal(f.calls.emails.length, 0);

  const msg = (text, from = 42) => ({ chat: { id: from, type: 'private' }, from: { id: from }, text });

  assert.deepEqual(await d.handleMessage(msg('/acces 1001 autre@exemple.fr')), { denied: 'not_found' });
  const ok = await d.handleMessage(msg('/acces #1001 Client@Exemple.fr'));
  assert.equal(ok.delivered, 'bot');
  const sent = f.calls.telegram.filter((c) => c[0] === 'send').at(-1);
  assert.equal(sent[3].reply_markup.inline_keyboard[0][0].url, f.orders.get(order.id).meta.invite_link);
  assert.equal(f.calls.telegram.filter((c) => c[0] === 'create').length, 1, 'valid invite is reused');
  assert.equal(f.orders.get(order.id).meta.claimed_by, '42');

  assert.deepEqual(await d.handleMessage(msg('/acces 1001 client@exemple.fr', 77)), { denied: 'claimed_by_other' });
});

test('claim attempts are rate limited', async () => {
  const f = fakes(makeOrder());
  const d = createDelivery({ cfg: makeCfg(), ...f, log: silent });
  const msg = { chat: { id: 9, type: 'private' }, from: { id: 9 }, text: '/acces 9999 x@y.z' };
  for (let i = 0; i < 3; i++) await d.handleMessage(msg);
  assert.deepEqual(await d.handleMessage(msg), { rateLimited: true });
});

test('chat_member join is recorded, then refund revokes invite and removes the member', async () => {
  const order = makeOrder();
  const f = fakes(order);
  const d = createDelivery({ cfg: makeCfg(), ...f, log: silent });
  await d.handleOrderPaid(paidPayload(order));
  const link = f.orders.get(order.id).meta.invite_link;

  const joined = await d.handleChatMember({
    chat: { id: -100123 },
    old_chat_member: { status: 'left', user: { id: 4242 } },
    new_chat_member: { status: 'member', user: { id: 4242 } },
    invite_link: { invite_link: link, name: 'Commande #1001' }
  });
  assert.deepEqual(joined, { joined: '#1001' });
  assert.equal(f.orders.get(order.id).meta.telegram_user_id, '4242');
  assert.equal(f.orders.get(order.id).meta.status, 'joined');

  assert.deepEqual(await d.handleRefund({ order_id: 5550001, refund_line_items: [{ line_item: { product_id: 999 } }] }), { skipped: 'access_not_refunded' });
  const r = await d.handleRefund({ order_id: 5550001, refund_line_items: [{ line_item: { product_id: 111 } }] });
  assert.deepEqual(r, { revoked: '#1001' });
  assert.ok(f.calls.telegram.some((c) => c[0] === 'revoke' && c[1] === link));
  assert.ok(f.calls.telegram.some((c) => c[0] === 'remove' && c[1] === '4242' && c[2] === 'remove'));
  assert.equal(f.orders.get(order.id).meta.status, 'revoked');

  const again = await d.handleMessage({ chat: { id: 4242, type: 'private' }, from: { id: 4242 }, text: '/acces 1001 client@exemple.fr' });
  assert.deepEqual(again, { denied: 'revoked' });
});

test('HTTP endpoints check Shopify HMAC and Telegram secret', async () => {
  const cfg = makeCfg();
  const seen = [];
  const delivery = {
    handleOrderPaid: async (p) => { seen.push(p); return { delivered: 'email' }; },
    handleMessage: async () => ({}),
    handleChatMember: async () => ({})
  };
  const server = http.createServer(createApp({ cfg, delivery, log: silent }));
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const body = JSON.stringify({ id: 1, line_items: [] });
  const hmac = crypto.createHmac('sha256', 'whsec').update(body).digest('base64');

  let res = await fetch(`${base}/webhooks/shopify/orders-paid`, { method: 'POST', body, headers: { 'x-shopify-hmac-sha256': 'bad' } });
  assert.equal(res.status, 401);
  res = await fetch(`${base}/webhooks/shopify/orders-paid`, { method: 'POST', body, headers: { 'x-shopify-hmac-sha256': hmac, 'x-shopify-shop-domain': 'test.myshopify.com', 'x-shopify-webhook-id': 'w1' } });
  assert.equal(res.status, 200);
  res = await fetch(`${base}/webhooks/shopify/orders-paid`, { method: 'POST', body, headers: { 'x-shopify-hmac-sha256': hmac, 'x-shopify-webhook-id': 'w1' } });
  assert.deepEqual(await res.json(), { duplicate: true });
  assert.equal(seen.length, 1);

  res = await fetch(`${base}/telegram/webhook`, { method: 'POST', body: '{}', headers: { 'x-telegram-bot-api-secret-token': 'nope' } });
  assert.equal(res.status, 401);
  res = await fetch(`${base}/telegram/webhook`, { method: 'POST', body: '{"message":{}}', headers: { 'x-telegram-bot-api-secret-token': 'tgsecret' } });
  assert.equal(res.status, 200);
  res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  server.close();
});
