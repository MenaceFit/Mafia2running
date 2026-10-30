# Mafia Running – Boutique Shopify premium

Boutique Shopify (Online Store 2.0) qui vend l'accès au groupe privé Telegram, avec une délivrance automatique et sécurisée du lien d'invitation après paiement.

```
theme/               Thème Shopify complet (à importer dans Shopify)
telegram-delivery/   Service Node.js : webhooks Shopify → invitation Telegram à usage unique
docs/                Guides d'installation + modèles de textes légaux à adapter
scripts/             Outil de création du .zip du thème
```

## Démarrage rapide

1. **Thème** : `bash scripts/build-theme-zip.sh` puis importer `dist/mafia-running-theme.zip` dans *Boutique en ligne > Thèmes > Ajouter un thème > Importer un fichier zip*.
2. **Produit** : créer le produit numérique « Accès au groupe privé » ([docs/INSTALLATION.md](docs/INSTALLATION.md#3-créer-le-produit-daccès)).
3. **Délivrance Telegram** : déployer `telegram-delivery/` et brancher les webhooks ([docs/TELEGRAM.md](docs/TELEGRAM.md)).
4. **Pages légales** : adapter et publier les textes de [docs/legal/](docs/legal/).

Tout le contenu du site (titres, textes, chiffres, FAQ, images, couleurs, prix, boutons) se modifie depuis l'éditeur de thème Shopify, sans toucher au code.
