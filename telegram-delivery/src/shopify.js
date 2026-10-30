import crypto from 'node:crypto';

export const NS = 'telegram_access';

/** Verifies the X-Shopify-Hmac-Sha256 header against the raw request body. */
export function verifyShopifyHmac(rawBody, hmacHeader, secret) {
  if (!hmacHeader || !secret) return false;
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest();
  let received;
  try {
    received = Buffer.from(String(hmacHeader), 'base64');
  } catch {
    return false;
  }
  return received.length === digest.length && crypto.timingSafeEqual(received, digest);
}

export const productGid = (id) => (String(id).startsWith('gid://') ? String(id) : `gid://shopify/Product/${id}`);
export const orderGid = (id) => (String(id).startsWith('gid://') ? String(id) : `gid://shopify/Order/${id}`);

const ORDER_FIELDS = `
  id
  name
  email
  displayFinancialStatus
  cancelledAt
  tags
  lineItems(first: 50) { nodes { quantity product { id } } }
  metafields(namespace: "${NS}", first: 20) { nodes { key value } }
`;

/** Normalises a GraphQL order into a flat object used by the delivery logic. */
export function normaliseOrder(node) {
  if (!node) return null;
  const meta = {};
  for (const m of node.metafields?.nodes || []) meta[m.key] = m.value;
  return {
    id: node.id,
    name: node.name,
    email: (node.email || '').toLowerCase(),
    financialStatus: node.displayFinancialStatus,
    cancelled: Boolean(node.cancelledAt),
    tags: node.tags || [],
    productIds: (node.lineItems?.nodes || []).map((li) => li.product?.id).filter(Boolean),
    meta
  };
}

export class ShopifyClient {
  constructor(cfg, fetchImpl = globalThis.fetch) {
    this.cfg = cfg;
    this.fetch = fetchImpl;
    this.token = cfg.adminToken || null;
    this.tokenExpiresAt = cfg.adminToken ? Infinity : 0;
  }

  /** Admin token: static custom-app token, or client-credentials token (Dev Dashboard apps), cached until expiry. */
  async getToken() {
    if (this.token && Date.now() < this.tokenExpiresAt - 60_000) return this.token;
    const res = await this.fetch(`https://${this.cfg.domain}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: this.cfg.clientId, client_secret: this.cfg.clientSecret, grant_type: 'client_credentials' })
    });
    if (!res.ok) throw new Error(`Shopify token request failed (${res.status})`);
    const data = await res.json();
    this.token = data.access_token;
    this.tokenExpiresAt = Date.now() + (Number(data.expires_in) || 3600) * 1000;
    return this.token;
  }

  async graphql(query, variables = {}) {
    const token = await this.getToken();
    const res = await this.fetch(`https://${this.cfg.domain}/admin/api/${this.cfg.apiVersion}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables })
    });
    if (!res.ok) throw new Error(`Shopify GraphQL HTTP ${res.status}`);
    const data = await res.json();
    if (data.errors?.length) throw new Error(`Shopify GraphQL: ${data.errors.map((e) => e.message).join('; ')}`);
    return data.data;
  }

  async getOrder(id) {
    const data = await this.graphql(`query ($id: ID!) { order(id: $id) { ${ORDER_FIELDS} } }`, { id: orderGid(id) });
    return normaliseOrder(data.order);
  }

  /** Finds an order by its number ("1001" or "#1001"). */
  async findOrderByName(name) {
    const clean = String(name).replace(/[^0-9A-Za-z-]/g, '');
    if (!clean) return null;
    const data = await this.graphql(`query ($q: String!) { orders(first: 1, query: $q) { nodes { ${ORDER_FIELDS} } } }`, { q: `name:#${clean}` });
    return normaliseOrder(data.orders.nodes[0]);
  }

  async setMeta(orderId, values) {
    const metafields = Object.entries(values).map(([key, value]) => ({
      ownerId: orderGid(orderId),
      namespace: NS,
      key,
      type: key.endsWith('_at') ? 'date_time' : 'single_line_text_field',
      value: String(value)
    }));
    const data = await this.graphql(
      `mutation ($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { userErrors { field message } } }`,
      { metafields }
    );
    const errors = data.metafieldsSet.userErrors;
    if (errors.length) throw new Error(`metafieldsSet: ${errors.map((e) => e.message).join('; ')}`);
  }

  async addTags(orderId, tags) {
    const data = await this.graphql(
      `mutation ($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { message } } }`,
      { id: orderGid(orderId), tags }
    );
    const errors = data.tagsAdd.userErrors;
    if (errors.length) throw new Error(`tagsAdd: ${errors.map((e) => e.message).join('; ')}`);
  }
}
