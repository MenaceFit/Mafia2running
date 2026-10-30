// Manual revocation: npm run revoke -- 1001   (order number)
import { loadConfig } from '../src/config.js';
import { ShopifyClient } from '../src/shopify.js';
import { TelegramClient } from '../src/telegram.js';
import { createDelivery } from '../src/delivery.js';

const orderRef = process.argv[2];
if (!orderRef) { console.error('Usage : npm run revoke -- <numéro de commande>'); process.exit(1); }
const cfg = loadConfig();
const delivery = createDelivery({ cfg, shopify: new ShopifyClient(cfg.shop), telegram: new TelegramClient(cfg.telegram) });
console.log(await delivery.revokeOrder(orderRef, 'manual'));
