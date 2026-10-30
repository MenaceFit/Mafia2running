#!/usr/bin/env bash
# Crée dist/mafia-running-theme.zip, prêt à importer dans Shopify.
set -euo pipefail
cd "$(dirname "$0")/../theme"
mkdir -p ../dist
rm -f ../dist/mafia-running-theme.zip
zip -rq ../dist/mafia-running-theme.zip assets config layout locales sections snippets templates
echo "OK : dist/mafia-running-theme.zip"
