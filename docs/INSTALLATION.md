# Installation et configuration

## 1. Installer le thème

**Option A – fichier zip (le plus simple)**

```bash
bash scripts/build-theme-zip.sh
```

Shopify Admin → *Boutique en ligne > Thèmes > Ajouter un thème > Importer un fichier zip* → `dist/mafia-running-theme.zip`. Clique sur *Personnaliser* pour vérifier, puis *Publier*.

**Option B – Shopify CLI (pour développer)**

```bash
cd theme
shopify theme dev --store ma-boutique.myshopify.com
```

```bash
shopify theme push --unpublished
```

## 2. Paramètres du thème

*Personnaliser > Paramètres du thème* :

| Groupe | À faire |
|---|---|
| Marque | Nom, logo (fond clair), logo blanc (footer), favicon, image de partage 1200×630 |
| Couleurs | Préréglées sur la palette (#FFFFFF, #101B35, #1C3156, #F5F6F8, #777F8D) |
| Produit d'accès | **Choisir le produit « Accès au groupe privé »** (utilisé par tous les boutons d'achat) |
| Produit d'accès | « Envoyer directement au paiement » activé : le bouton mène directement au checkout |
| Produit d'accès | Case « exécution immédiate / renonciation au droit de rétractation » obligatoire (recommandé) |
| Réseaux sociaux | Liens TikTok / Instagram / Snapchat / canal Telegram **public** uniquement |

Chaque section de la page d'accueil (Hero, chiffres, Running, Semi-luxe, Ressources, Bot Vinted UK, Accompagnement, Offre, FAQ) a ses propres réglages et blocs : textes, icônes, chiffres, images, questions. Dans les titres, entoure un mot de `*astérisques*` pour le mettre en évidence.

**Images** : les emplacements d'images (Running, Semi-luxe, Accompagnement) affichent un visuel neutre tant qu'aucune image n'est ajoutée. Utilise uniquement des photos dont tu as les droits (tes propres photos, banque d'images sous licence). Les photos de sites de marques ou de revendeurs ne sont généralement pas réutilisables. Shopify les sert automatiquement en WebP, avec lazy loading.

## 3. Créer le produit d'accès

*Produits > Ajouter un produit* :

- Titre : `Accès au groupe privé` (ou ton choix)
- Prix : **ton prix** (il s'affiche automatiquement partout sur le site)
- Décocher *Il s'agit d'un produit physique* (aucune livraison)
- Inventaire : *Ne pas suivre la quantité*
- Statut : Actif, disponible sur la boutique en ligne
- Note l'**ID numérique** du produit (dans l'URL de l'admin : `/products/1234567890`). Il te servira pour `ACCESS_PRODUCT_IDS`.

**Métachamps optionnels** (*Paramètres > Données personnalisées > Produits*) :

| Définition | Type | Effet |
|---|---|---|
| `custom.included` | Liste de texte sur une ligne | Liste « Ce qui est inclus » sur la page produit |
| `custom.price_note` | Texte sur une ligne | Note sous le prix (ex. « Paiement unique ») |

## 4. Paiement

- *Paramètres > Paiements* : activer Shopify Payments (CB, Apple Pay, Google Pay) ou un autre prestataire.
- *Paramètres > Paiement (checkout)* : e-mail obligatoire (sert à identifier la commande).
- *Paramètres > Notifications > Confirmation de commande* : ajoute une phrase du type :
  « Ton lien d'invitation Telegram personnel t'est envoyé par e-mail dès la confirmation du paiement. Tu peux aussi l'obtenir en écrivant `/acces {{ order_number }} {{ email }}` à @TonBot sur Telegram. »

## 5. Pages et politiques

1. *Paramètres > Politiques* : remplis CGV, confidentialité, remboursement et mentions légales (modèles dans `docs/legal/`, à faire relire). Ils s'affichent automatiquement dans le footer et sous le bouton d'achat.
2. *Boutique en ligne > Pages* :
   - `Contact` → modèle **page.contact** (URL : `/pages/contact`)
   - `Conditions d'accès` → modèle **page.conditions** (URL : `/pages/conditions-acces`). Colle le texte de `docs/legal/conditions-acces.md`.
3. *Boutique en ligne > Navigation* : crée le menu `main-menu` si tu veux personnaliser les liens. Sinon les liens par défaut s'affichent (Accueil, Nos ressources, Fonctionnalités, FAQ, Contact).

## 6. Suivi et cookies

- *Paramètres > Confidentialité des clients* : active la **bannière de cookies** (obligatoire en UE).
- Le thème envoie `cta_click`, `view_item`, `add_to_cart`, `begin_checkout`, `faq_open` vers `dataLayer` et Shopify Customer Events, **seulement si le visiteur a accepté**.
- Achat confirmé (`checkout_completed`), consultation produit, ajout au panier : Shopify les émet nativement. Connecte GA4, Meta, TikTok ou Snapchat via leurs apps officielles ou un pixel personnalisé dans *Paramètres > Événements clients*. Ils respectent le consentement.

## 7. SEO

- *Boutique en ligne > Préférences* : titre de la page d'accueil et méta-description, par exemple :
  - Titre : `Mafia Running – Groupe privé achat-revente : running, semi-luxe, Vinted UK`
  - Description : `Ressources pour l'achat-revente de vêtements : contacts Nike Running, plateformes neuves et seconde main, agents de livraison, bot Vinted UK et accompagnement.`
- Déjà intégré : balises Open Graph/Twitter, données structurées (Organization, WebSite, Product, FAQPage), H1 unique, images WebP responsive, lazy loading.

## 8. Checklist avant lancement

- [ ] Produit d'accès choisi dans les paramètres du thème, prix vérifié
- [ ] Commande test (mode test Shopify Payments ou passerelle « Bogus »), lien Telegram reçu (voir `docs/TELEGRAM.md`)
- [ ] Politiques remplies et page Conditions d'accès publiée
- [ ] Bannière cookies active
- [ ] Test sur iPhone et Android (menu, barre d'achat, FAQ, achat)
- [ ] Mot de passe de la boutique retiré
