# Pécule

Application personnelle pour suivre son budget et ses investissements. Elle tourne sur l'ordinateur, sans compte ni
serveur distant : les données restent dans le dossier `data/`.

## Lancer l'application

- **Double-cliquer sur `Lancer-Pecule.bat`**, ou dans un terminal :

  ```bash
  npm start
  ```

  L'application s'ouvre sur <http://localhost:5180>. Fermer la fenêtre du terminal pour l'arrêter.

- Pour modifier le code avec rechargement instantané : `npm run dev`.
- Tests des calculs : `npm test` · vérification des types : `npm run typecheck`.

Il faut [Node.js](https://nodejs.org) 20 ou plus récent.

## Ce que l'on peut faire

- **Accueil** : patrimoine net et son évolution, bilan du mois, budgets, placements, dernières transactions.
- **Transactions** : saisie rapide (touche `N`), recherche, filtres, classement en masse, transactions récurrentes
  (loyer, salaire, abonnements…) créées automatiquement.
- **Import de relevés** : CSV de n'importe quelle banque (colonnes détectées, correspondance mémorisée par compte),
  OFX et QIF. Les doublons sont repérés et les catégories proposées d'après l'historique et des règles.
- **Budget** : une enveloppe mensuelle par catégorie, repère du jour dans le mois, moyenne des trois mois précédents.
- **Investissements** : PEA, compte-titres, assurance-vie, PER, crypto. PRU au coût moyen pondéré, plus-values,
  dividendes, rendement annualisé (TRI), répartition. Cours automatiques via Yahoo Finance (actions, ETF, fonds) et
  CoinGecko (cryptos), ou saisis à la main.
- **Comptes** : liquidités, placements, biens immobiliers et crédits, avec corrections de solde datées.
- **Réglages** : thème clair/sombre, mode discret (montants floutés), catégories, règles, export/restauration.

Chaque modification peut être annulée (`Ctrl+Z`) et est enregistrée automatiquement.

## Données et sauvegardes

- Fichier principal : `data/pecule.json` (écriture atomique).
- Une copie par jour dans `data/backups/`, conservée 30 jours.
- Export manuel (JSON ou CSV des transactions) depuis **Réglages**.
- Le dossier `data/` est exclu de Git : ne jamais le publier.

Pour ranger les données ailleurs (ex. un dossier synchronisé), définir la variable d'environnement
`PECULE_DATA_DIR` avant le lancement.

## Accès depuis un téléphone (même Wi-Fi)

```bash
set PECULE_LAN=1 && npx vite --host
```

Puis ouvrir l'adresse « Network » affichée, depuis le téléphone. Sans `PECULE_LAN=1`, l'API refuse les accès
autres que `localhost`.
