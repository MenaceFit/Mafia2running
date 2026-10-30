// Registers the Telegram webhook: PUBLIC_URL/telegram/webhook (with secret token).
import { loadConfig } from '../src/config.js';
import { TelegramClient } from '../src/telegram.js';

const cfg = loadConfig();
if (!cfg.publicUrl.startsWith('https://')) { console.error('PUBLIC_URL doit être une URL https publique.'); process.exit(1); }
const tg = new TelegramClient(cfg.telegram);
await tg.setWebhook(`${cfg.publicUrl}/telegram/webhook`, cfg.telegram.webhookSecret);
await tg.call('setMyCommands', { commands: [{ command: 'acces', description: 'Recevoir mon lien : /acces NUMÉRO EMAIL' }, { command: 'aide', description: 'Aide' }] });
console.log(`Webhook Telegram enregistré : ${cfg.publicUrl}/telegram/webhook`);
