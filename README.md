# Suivi des travaux

Application web responsive en français pour suivre des projets de travaux sur ordinateur, Android et iPhone/iPad. Elle peut être installée comme **PWA** depuis un navigateur compatible. Le projet contient l'interface React/TypeScript, l'API Express et une base SQLite persistante ; il ne produit pas de binaires natifs pour Google Play ou l'App Store.

## Démarrer en local

Prérequis : **Node.js 22.12 ou supérieur**, avec npm. SQLite utilise le module intégré `node:sqlite` ; les commandes du projet activent cette fonctionnalité. Un avertissement « experimental » peut apparaître selon la version de Node.

```powershell
npm.cmd install
npm.cmd run dev
```

Sur macOS/Linux, utilisez `npm` à la place de `npm.cmd`. Vite affiche l'adresse du site dans le terminal, normalement `http://localhost:5173`. L'interface en développement transmet les requêtes `/api` au serveur local sur le port 3001.

### Utiliser PostgreSQL en local

SQLite reste le mode local par défaut. Pour utiliser PostgreSQL localement, créez une base `suivi`, copiez `.env.example` vers `.env`, puis adaptez l'URL :

```powershell
createdb suivi
Copy-Item .env.example .env
$env:DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/suivi'
npm.cmd run dev:postgres
```

Vous pouvez aussi mettre directement `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/suivi` dans `.env` puis lancer `npm.cmd run dev`. Les tables sont créées automatiquement au démarrage. Pour revenir à SQLite, supprimez ou commentez `DATABASE_URL` dans `.env`.

Au premier lancement, l'écran de configuration permet de créer le premier **administrateur**. Utilisez votre identité et un mot de passe personnel. Aucun compte ou mot de passe partagé n'est préconfiguré. L'interface propose des projets fictifs pour explorer l'application ; ils ne constituent pas des données de chantier réelles.

Après cette configuration, les inscriptions publiques créent une demande en attente. L'administrateur doit l'approuver dans la gestion des utilisateurs avant que le demandeur puisse se connecter. La validation porte sur l'accès à l'application : aucune vérification de possession de l'adresse e-mail n'est effectuée.

## Production

```powershell
npm.cmd run build
npm.cmd start
```

Le serveur sert l'interface compilée dans `dist` et l'API sur la même origine. Déployez-le sur une machine ou un conteneur capable d'exécuter Node.js et disposant d'un disque persistant. Un hébergement uniquement statique ne suffit pas à faire fonctionner l'authentification, les pièces jointes ou la base.

Le port de production par défaut est **3001**. Variables d'environnement reconnues par le serveur :

| Variable | Valeur par défaut | Usage |
| --- | --- | --- |
| `PORT` | `3001` | Port HTTP du serveur Node |
| `HOST` | `0.0.0.0` | Adresse d'écoute ; `127.0.0.1` pour un proxy sur la même machine |
| `DATA_DIR` | `./data` dans le projet | Chemin du stockage persistant, idéalement absolu |
| `TRUST_PROXY` | Désactivé | `1` si exactement un reverse proxy de confiance termine HTTPS |
| `PUBLIC_ORIGIN` | Origine de la requête | Origine publique exacte, par exemple `https://suivi.exemple.ma`, sans slash final |

Exemple PowerShell derrière un proxy HTTPS installé sur la même machine :

```powershell
$env:HOST = '127.0.0.1'
$env:PORT = '3001'
$env:DATA_DIR = 'C:\suivi-data'
$env:TRUST_PROXY = '1'
$env:PUBLIC_ORIGIN = 'https://suivi.exemple.ma'
npm.cmd start
```

Le reverse proxy doit transmettre `Host` et `X-Forwarded-Proto: https`. Les cookies deviennent `Secure` lorsque le serveur détecte HTTPS ; ils sont aussi `HttpOnly` et `SameSite=Strict`, avec une durée de sept jours. L'adresse du serveur Node doit être inaccessible directement depuis Internet lorsque vous faites confiance aux en-têtes d'un proxy. N'exposez pas le dossier des données comme répertoire web. Chaque déploiement doit conserver son stockage entre redémarrages ; ne montez pas plusieurs processus d'écriture sur une base située sur un partage réseau.

## Installer sur Android ou iOS

1. Déployez l'application avec une adresse **HTTPS** accessible depuis le téléphone. `localhost` désigne le téléphone lui-même, pas votre ordinateur.
2. Sur Android, ouvrez l'adresse dans Chrome puis utilisez l'option d'installation ou « Ajouter à l'écran d'accueil » proposée par le navigateur.
3. Sur iPhone/iPad, ouvrez l'adresse dans Safari, puis le menu Partager → « Sur l'écran d'accueil ».

Les noms et la disponibilité des options dépendent du navigateur et du système. En réseau local, une adresse HTTP peut servir à vérifier la mise en page, mais l'installation et le service worker demandent généralement HTTPS hors `localhost`.

Le service worker ne met en cache que des ressources publiques : icônes, fichiers compilés et page hors connexion. Les appels API, informations de session, projets, historiques et documents ne sont jamais mis en cache par ce service worker. **Une connexion au serveur est nécessaire pour travailler** ; l'application ne synchronise pas de modifications hors ligne.

## Fonctionnalités

- Connexion, déconnexion et demande d'inscription avec approbation administrative.
- Création, recherche, modification et suppression des projets autorisés.
- Titre, description, dates, jours restants, état et avancement d'un projet.
- Ajout de photos et documents, téléchargement individuel, renommage après ajout et suppression.
- Téléchargement PDF d'un projet et export ZIP de tous les projets, avec leurs informations et pièces jointes.
- Historique des changements avec auteur, date et attributs modifiés.
- Mise à jour en temps réel des écrans ouverts quand un projet, un document ou un compte change.
- Gestion des utilisateurs et attribution des rôles selon les droits du compte connecté.

### Droits d'accès

| Action | Administrateur | Utilisateur |
| --- | --- | --- |
| Voir, rechercher, télécharger en PDF et exporter les projets | Tous | Tous |
| Créer, modifier les attributs ou supprimer un projet | Oui | Oui |
| Modifier l'avancement ou l'état | Tous | Tous |
| Ajouter des pièces jointes | Tous | Tous |
| Télécharger les pièces jointes et lire l'historique | Tous | Tous |
| Renommer ou supprimer une pièce jointe | Toutes | Toutes |
| Approuver, refuser ou suspendre un compte utilisateur | Oui | Oui |
| Modifier les rôles ou gérer les comptes | Oui | Oui |

Les autorisations sont vérifiées par l'API sur chaque requête, y compris les exports et téléchargements. Tous les comptes validés disposent des mêmes droits dans l'application, quel que soit leur rôle affiché. Les rôles restent des libellés de compte. Un compte ne peut pas désactiver son propre accès. Une suspension invalide les sessions du compte concerné.

Les pièces jointes sont limitées à **20 Mo par fichier**. Formats pris en charge : PDF, JPEG, PNG, WebP, GIF, HEIC/HEIF, texte/CSV, Microsoft Office et OpenDocument. L'extension et certaines signatures de contenu sont vérifiées ; ce contrôle ne constitue pas une analyse antivirus. Le renommage conserve l'extension d'origine.

### Dates et avancement

L'**avancement réel** est saisi en pourcentage et représenté par une barre de progression. Il décrit le travail constaté. L'**avancement calendaire** est calculé séparément à partir de la date du jour et des dates du projet ; il permet de comparer le travail déclaré au temps écoulé, sans transformer automatiquement le temps passé en travaux réalisés.

Le délai est le nombre de jours entre début et fin, sans ajouter un jour inclusif. La progression calendaire vaut `100 × (aujourd'hui − début) / (fin − début)`, limitée entre 0 et 100 %. Pour un projet commençant et finissant le même jour, elle vaut 0 % avant cette date, puis 100 %. Les dates affichées dans l'interface utilisent le calendrier local du navigateur ; les horodatages de l'historique sont stockés en UTC et affichés dans le fuseau de l'utilisateur.

Un projet non terminé dont la date de fin est passée apparaît en retard. Le changement d'état et le pourcentage doivent rester cohérents : un projet terminé atteint 100 % et un projet à démarrer reste à 0 %.

### Stockage et sauvegardes

Les données sont enregistrées sur le serveur dans `data/suivi.sqlite` et les fichiers joints dans `data/uploads/` (ou sous `DATA_DIR`). Les mots de passe sont dérivés avec scrypt et un sel aléatoire ; seuls les condensats des jetons de session sont conservés en base. Pour une sauvegarde complète, arrêtez proprement le serveur puis copiez **l'ensemble du dossier de données**, en conservant la base et ses éventuels fichiers annexes (`-wal`, `-shm`) ainsi que les uploads. Redémarrez ensuite le serveur. Une restauration doit porter sur cet ensemble cohérent et conserver les permissions du compte système qui exécute Node.

Le téléchargement PDF d'un projet produit une fiche lisible avec les dates, le délai, les jours restants, l'avancement, l'état, les pièces jointes, les images et l'historique récent. Les exports ZIP contiennent `projets.csv`, un dossier par projet avec `fiche-projet.pdf` et ses `pieces-jointes/`. Les fichiers JSON ne sont pas inclus. Ces exports servent à consulter ou partager un instantané des projets. Ils ne remplacent pas une sauvegarde : ils ne restaurent pas les comptes, mots de passe, sessions ou paramètres et aucune fonction d'import de ces ZIP n'est prévue. Un fichier joint manquant provoque un refus explicite de l'export.

## Vérifications

```powershell
npm.cmd test
npm.cmd run build
```

Les tests d'intégration utilisent `node:test`, lancent l'API sur un port temporaire et créent leurs propres bases dans un dossier temporaire. Ils vérifient les parcours d'authentification, l'approbation, les autorisations, les modifications et leur historique, les pièces jointes, les exports et la persistance. Les tests PWA vérifient aussi l'exclusion des données privées du cache, la page hors connexion et les icônes. Ils n'utilisent pas les données de votre instance.

Pour les tests de parcours dans un navigateur, installez Google Chrome sur la machine puis exécutez :

```powershell
npm.cmd run build
npm.cmd run test:e2e
```

Playwright utilise Chrome **sans fenêtre visible**, sur écran de bureau et à une largeur mobile de 390 px. Pour utiliser une installation Microsoft Edge, définissez `$env:PLAYWRIGHT_CHANNEL = 'msedge'`. Le port **3002** doit être libre. Le lancement crée sa propre base temporaire, démarre le serveur compilé, puis ferme et supprime cette base à la fin des tests. Des captures, téléchargements et traces en cas d'échec sont enregistrés dans `test-results/`. Ces tests simulent la taille d'écran d'un téléphone ; ils ne remplacent pas des essais sur des appareils Android et iOS physiques.

Les icônes PNG sont fournies. Pour les régénérer sous Windows :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/generate-icons.ps1
```

## Limites actuelles

L'application ne fournit pas encore de vérification d'e-mail, d'envoi de notifications, de procédure « mot de passe oublié », de double authentification, d'analyse antivirus des fichiers joints ni de client natif. Le serveur et son stockage doivent être déployés et sauvegardés par l'exploitant. L'interface mobile et les mécanismes PWA sont inclus ; la publication sur les boutiques et la validation sur chaque appareil physique restent des étapes distinctes.
