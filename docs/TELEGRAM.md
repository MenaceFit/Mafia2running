# Délivrance automatique de l'accès Telegram

> ⚠️ Ce service est codé et testé avec des simulations (`npm test` : 7 tests OK). Il **n'est pas encore branché** à ta boutique ni à ton bot. Suis les étapes ci-dessous, puis fais une commande test avant d'ouvrir les ventes.

## Fonctionnement

```
Client paie ─► Shopify (orders/paid, signé HMAC) ─► telegram-delivery
                                                     ├─ vérifie la signature, la boutique et le produit
                                                     ├─ vérifie le statut « payé » via l'Admin API
                                                     ├─ crée un lien Telegram : 1 seul membre, expire après 72 h
                                                     ├─ l'enregistre dans les métachamps de la commande (telegram_access.*)
                                                     └─ l'envoie par e-mail (Resend, optionnel)
Client ─► bot Telegram : /acces 1001 email  ─► vérifie numéro + e-mail + paiement ─► envoie son lien
Client rejoint le groupe ─► Telegram (chat_member) ─► l'ID Telegram est enregistré sur la commande
Remboursement / annulation ─► lien révoqué + membre retiré du groupe
```

- Le lien privé du groupe n'apparaît **jamais** sur le site ni dans le code du thème.
- Aucune clé API n'est dans le thème : tout reste côté serveur (variables d'environnement).
- Chaque commande reçoit son propre lien, nommé « Commande #1001 », visible dans Telegram (*Gérer le groupe > Liens d'invitation*).
- Idempotent : si Shopify renvoie le webhook, aucun second lien ni e-mail n'est créé.
- Révocation manuelle : `npm run revoke -- 1001`.

## 1. Préparer Telegram

1. Avec **@BotFather** : `/newbot` → récupère le **token** (`TELEGRAM_BOT_TOKEN`) et le nom d'utilisateur du bot.
2. Le groupe privé doit être un **supergroupe** (c'est automatique dès qu'il a des topics, comme le tien).
3. Ajoute le bot au groupe et nomme-le **administrateur** avec au minimum :
   - *Inviter des utilisateurs via un lien*
   - *Bannir des utilisateurs* (nécessaire pour retirer un membre après remboursement)
4. ID du groupe (`TELEGRAM_CHAT_ID`, ex. `-1001234567890`) : transfère un message du groupe à un bot comme @RawDataBot, ou lis-le dans `getUpdates`.
5. Recommandé : désactive les anciens liens d'invitation permanents du groupe (*Gérer le groupe > Liens d'invitation*), sinon ils continuent de fonctionner.

## 2. Accès Shopify

Le service a besoin des scopes `read_orders` et `write_orders` (et `read_products` pour `npm run check`).

- **Option A** (si tu as une app personnalisée « legacy ») : *Paramètres > Applications > Développer des applications* → Admin API token `shpat_…` → `SHOPIFY_ADMIN_TOKEN`.
- **Option B** (nouvelles boutiques) : crée une app dans le **Dev Dashboard** Shopify, installe-la sur ta boutique, puis renseigne `SHOPIFY_CLIENT_ID` et `SHOPIFY_CLIENT_SECRET`. Le service obtient lui-même un jeton temporaire (client credentials) et le renouvelle.

## 3. Déployer le service

Tout hébergeur Node.js 18+ avec une URL HTTPS publique convient : Render, Railway, Fly.io, un VPS…

- Dossier : `telegram-delivery/`
- Commande de démarrage : `npm start` (aucune dépendance à installer)
- Variables : copie `.env.example` et remplis-les **dans l'interface de l'hébergeur** (ne commite jamais `.env`).
- Génère les secrets avec : `openssl rand -hex 32`

Puis :

```bash
npm run check
```

```bash
npm run setup-telegram
```

`check` vérifie le bot, ses droits, l'accès Shopify et le produit. `setup-telegram` enregistre le webhook Telegram (`PUBLIC_URL/telegram/webhook`) et la commande `/acces`.

## 4. Brancher les webhooks Shopify

*Paramètres > Notifications > Webhooks > Créer un webhook* (format JSON, dernière version de l'API) :

| Événement | URL |
|---|---|
| Paiement de commande (`orders/paid`) | `https://TON-SERVICE/webhooks/shopify/orders-paid` |
| Création de remboursement (`refunds/create`) | `https://TON-SERVICE/webhooks/shopify/refunds-create` |
| Annulation de commande (`orders/cancelled`) | `https://TON-SERVICE/webhooks/shopify/orders-cancelled` |

Le secret de signature affiché sous la liste des webhooks va dans `SHOPIFY_WEBHOOK_SECRET`. Si tu crées les webhooks depuis une app, c'est le **secret client** de l'app.

## 5. E-mail (optionnel mais recommandé)

Avec `RESEND_API_KEY` et `EMAIL_FROM` (domaine vérifié chez Resend), le lien est envoyé automatiquement par e-mail. Sans eux, le client récupère son lien via le bot (`/acces NUMÉRO EMAIL`) : mentionne-le dans l'e-mail de confirmation de commande Shopify.

## 6. Tester

1. Active le mode test du paiement et passe une commande du produit d'accès.
2. Vérifie : e-mail reçu, et dans la commande Shopify les métachamps `telegram_access.status = emailed` et le tag `acces-telegram-envoye`.
3. Rejoins le groupe avec le lien → statut `joined` et `telegram_user_id` renseigné.
4. Rouvre le même lien depuis un autre compte : il doit être refusé (limite 1 membre).
5. Rembourse la commande → lien révoqué, membre retiré, statut `revoked`.

## Bon à savoir

- Sécurité du bot : il faut le numéro de commande **et** l'e-mail exact. Les tentatives sont limitées (5 par heure et par compte Telegram), et un accès déjà réclamé par un autre compte Telegram est refusé.
- Les compteurs anti-spam et l'anti-doublon des webhooks sont en mémoire : un redémarrage les remet à zéro, mais l'idempotence repose sur les métachamps Shopify, donc sans risque de double envoi.
- Le webhook Shopify doit répondre en moins de 5 s. En cas d'erreur, le service répond 500 et Shopify réessaie automatiquement.
