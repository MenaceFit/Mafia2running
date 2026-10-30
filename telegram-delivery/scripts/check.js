// Checks the configuration: bot token, bot admin rights in the private group, Shopify access.
import { loadConfig, validateConfig } from '../src/config.js';
import { TelegramClient } from '../src/telegram.js';
import { ShopifyClient } from '../src/shopify.js';

const cfg = loadConfig();
const missing = validateConfig(cfg);
if (missing.length) { console.error('Variables manquantes :\n- ' + missing.join('\n- ')); process.exit(1); }

const tg = new TelegramClient(cfg.telegram);
const me = await tg.call('getMe');
console.log(`✓ Bot : @${me.username}`);
const chat = await tg.call('getChat', { chat_id: cfg.telegram.chatId });
console.log(`✓ Groupe : ${chat.title} (${chat.type})`);
const member = await tg.call('getChatMember', { chat_id: cfg.telegram.chatId, user_id: me.id });
if (member.status !== 'administrator') throw new Error('Le bot doit être administrateur du groupe.');
if (!member.can_invite_users) throw new Error('Le bot doit avoir le droit « Inviter des utilisateurs via un lien ».');
if (!member.can_restrict_members) console.warn('! Sans le droit « Bannir des utilisateurs », la révocation ne pourra pas retirer un membre.');
console.log('✓ Droits du bot OK');

const shop = new ShopifyClient(cfg.shop);
const data = await shop.graphql('{ shop { name } }');
console.log(`✓ Shopify : ${data.shop.name}`);
for (const id of cfg.shop.accessProductIds) {
  const p = await shop.graphql('query ($id: ID!) { product(id: $id) { title status } }', { id: `gid://shopify/Product/${id}` });
  if (!p.product) throw new Error(`Produit ${id} introuvable`);
  console.log(`✓ Produit d'accès : ${p.product.title} (${p.product.status})`);
}
console.log('Configuration valide.');
