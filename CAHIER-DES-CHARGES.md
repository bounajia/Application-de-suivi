# Cahier des charges — « Suivi des travaux »

| | |
| --- | --- |
| **Projet** | Application web de suivi de projets de travaux |
| **Référence** | suivi-travaux v1.0 |
| **Date** | 10 septembre 2026 |
| **Statut** | Application développée — document de référence |
| **Public visé** | Maître d'ouvrage, exploitant, équipe de développement |

---

## 1. Présentation du projet

### 1.1 Contexte

Les équipes conduisant des projets de travaux (chantiers, rénovations, aménagements) ont besoin d'un outil simple, accessible depuis le bureau comme depuis le terrain, pour suivre l'avancement, les échéances et les documents de chaque opération. Les tableurs partagés ne garantissent ni traçabilité, ni contrôle d'accès, ni centralisation des pièces jointes.

### 1.2 Objectifs

- Proposer une **application web responsive en français** de suivi de projets, utilisable sur ordinateur, Android et iPhone/iPad.
- Permettre l'**installation sur l'écran d'accueil** des téléphones (PWA).
- Centraliser les **informations, dates, avancements, documents et historiques** des projets sur un serveur maîtrisé par l'exploitant.
- Garantir un **contrôle d'accès** par comptes individuels approuvés, sans compte partagé.

### 1.3 Périmètre

**Inclus :** interface React/TypeScript, API Express, base SQLite persistante, gestion des pièces jointes, exports PDF et ZIP, temps réel, PWA, gestion des comptes et des rôles.

**Exclus :** applications natives publiées sur Google Play ou l'App Store, vérification d'e-mail, procédure « mot de passe oublié », double authentification, analyse antivirus des fichiers, notifications par e-mail/push, synchronisation hors ligne des modifications, import des archives ZIP.

---

## 2. Acteurs et utilisateurs

| Acteur | Description | Droits |
| --- | --- | --- |
| **Visiteur** | Personne non connectée | Écran de configuration (premier lancement) ou demande d'inscription |
| **Utilisateur** | Compte actif validé | Consultation, création et modification des projets, pièces jointes, exports |
| **Administrateur** | Compte actif avec rôle « admin » | Mêmes droits que l'utilisateur, plus la gestion des comptes (approbation, refus, suspension, rôles) |

> Note : dans la version actuelle, tous les comptes actifs disposent des mêmes droits applicatifs. Le rôle est un libellé de compte ; seules les fonctions d'administration des comptes sont réservées au rôle « admin ».

---

## 3. Exigences fonctionnelles

Priorités : **I** = indispensable, **M** = majeure, **O** = optionnelle.

### 3.1 Module « Comptes et accès »

| Réf. | Exigence | Prio. |
| --- | --- | --- |
| EF-01 | Au premier lancement (base vide), un écran de configuration permet de créer le premier compte administrateur ; aucun compte ni mot de passe partagé n'est préconfiguré. | I |
| EF-02 | L'inscription publique crée une demande en attente ; l'administrateur doit l'approuver avant que le demandeur puisse se connecter. Aucune vérification de possession de l'adresse e-mail n'est effectuée. | I |
| EF-03 | La connexion requiert une adresse e-mail et un mot de passe (10 à 128 caractères à l'inscription). | I |
| EF-04 | La session dure 7 jours ; la déconnexion est disponible à tout moment. | I |
| EF-05 | L'administrateur peut approuver, refuser, suspendre, réactiver un compte et modifier les rôles. Une suspension invalide immédiatement les sessions du compte concerné. | I |
| EF-06 | Un compte ne peut pas désactiver son propre accès. | I |
| EF-07 | L'application notifie l'utilisateur quand sa session a expiré ou que son accès a changé. | M |

### 3.2 Module « Projets »

| Réf. | Exigence | Prio. |
| --- | --- | --- |
| EF-08 | Création, consultation, modification et suppression d'un projet avec : titre, description, date de début, date de fin, avancement (%), état. | I |
| EF-09 | Recherche et filtrage des projets ; fiche détaillée par projet. | I |
| EF-10 | Quatre états : à démarrer, en cours, en pause, terminé. La cohérence est imposée : un projet terminé atteint 100 %, un projet à démarrer reste à 0 %. | I |
| EF-11 | L'avancement réel est saisi en pourcentage ; l'avancement calendaire est calculé séparément (100 × (aujourd'hui − début) / (fin − début), borné 0–100 %) et permet la comparaison travail déclaré / temps écoulé. | I |
| EF-12 | Affichage du délai (nombre de jours entre début et fin), des jours restants et du retard éventuel ; un projet non terminé dont la date de fin est passée apparaît en retard. | I |
| EF-13 | Tableau de bord : nombre de projets, chantiers en cours, projets terminés, avancement moyen, projets en retard, demandes d'accès en attente, dernières échéances, activité récente. | M |
| EF-14 | Écran « Calendrier des travaux » : échéances triées par date de fin, double barre (travaux / délai écoulé) par projet. | M |

### 3.3 Module « Pièces jointes »

| Réf. | Exigence | Prio. |
| --- | --- | --- |
| EF-15 | Ajout de photos et documents : **20 Mo maximum par fichier, 10 fichiers maximum par envoi**. | I |
| EF-16 | Formats pris en charge : PDF, JPEG, PNG, WebP, GIF, HEIC/HEIF, texte/CSV, Microsoft Office, OpenDocument. L'extension **et** certaines signatures de contenu sont vérifiées (sans valeur d'analyse antivirus). | I |
| EF-17 | Téléchargement individuel, renommage après ajout (l'extension d'origine est conservée) et suppression de chaque pièce jointe. | I |

### 3.4 Module « Exports »

| Réf. | Exigence | Prio. |
| --- | --- | --- |
| EF-18 | Téléchargement PDF d'une fiche projet : dates, délai, jours restants, avancement, état, pièces jointes, historique récent. | I |
| EF-19 | Export ZIP de tous les projets (ou d'un projet) : `projets.json`, `projets.csv`, `historique.json`, un dossier par projet avec `projet.json` et ses `pieces-jointes/`. | I |
| EF-20 | Un fichier joint manquant provoque un refus explicite de l'export. Les exports sont des instantanés de consultation : aucune fonction d'import n'est prévue et ils ne remplacent pas une sauvegarde. | I |

### 3.5 Module « Historique et temps réel »

| Réf. | Exigence | Prio. |
| --- | --- | --- |
| EF-21 | Chaque changement (projet, pièce jointe, compte) est tracé : auteur, date, attributs modifiés (avant/après). Les horodatages sont stockés en UTC et affichés dans le fuseau de l'utilisateur. | I |
| EF-22 | Les écrans ouverts se mettent à jour en temps réel (événements serveur) quand un projet, un document ou un compte change, avec rafraîchissement complémentaire au focus et périodique. | M |
| EF-23 | Notifications visuelles (toasts) pour les succès et erreurs ; bannière et indicateur d'état hors connexion. | M |

### 3.6 Module « PWA »

| Réf. | Exigence | Prio. |
| --- | --- | --- |
| EF-24 | L'application est installable depuis Chrome (Android) et Safari (iOS) ; icônes et manifeste fournis. | I |
| EF-25 | Le service worker ne met en cache que des ressources publiques (icônes, fichiers compilés, page hors connexion). Les appels API, sessions, projets, historiques et documents ne sont jamais mis en cache. Une connexion au serveur est nécessaire pour travailler. | I |
| EF-26 | Une page hors connexion explicite est affichée hors réseau. | M |

---

## 4. Exigences non fonctionnelles

| Réf. | Exigence |
| --- | --- |
| ENF-01 | **Sécurité — mots de passe** : dérivation scrypt avec sel aléatoire ; seuls les condensats des jetons de session sont stockés en base. |
| ENF-02 | **Sécurité — sessions** : cookies `HttpOnly`, `SameSite=Strict`, `Secure` en HTTPS ; contrôle d'origine sur les requêtes de modification ; limitation de débit sur les routes d'authentification. |
| ENF-03 | **Sécurité — en-têtes** : `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY` ; pas de cache sur les réponses API. |
| ENF-04 | **Sécurité — autorisations** : vérification côté API sur chaque requête, y compris exports et téléchargements. |
| ENF-05 | **Données personnelles** : minimisation (nom, e-mail uniquement) ; mots de passe jamais stockés en clair ; hébergement maîtrisé par l'exploitant, qui en assume la conformité RGPD. |
| ENF-06 | **Compatibilité** : navigateurs mobiles et de bureau récents ; interface responsive (référence mobile 390 px) ; Node.js ≥ 22.12. |
| ENF-07 | **Langue** : interface et messages intégralement en français ; dates au format local navigateur. |
| ENF-08 | **Persistance** : base SQLite en mode WAL et fichiers joints sur disque persistant (`DATA_DIR`) ; chaque déploiement conserve son stockage entre redémarrages ; pas d'écriture multi-processus sur un partage réseau. |
| ENF-09 | **Sauvegarde** : procédure documentée — arrêt propre du serveur, copie de l'ensemble du dossier de données (base, fichiers `-wal`/`-shm`, uploads), restauration cohérente. |
| ENF-10 | **Qualité** : tests automatisés d'intégration (`node:test`), tests de parcours navigateur (Playwright) et tests PWA (exclusion des données privées du cache, page hors connexion, icônes). |
| ENF-11 | **Lisibilité des exports** : le PDF doit rester lisible sans dépendance externe ; le CSV doit être protégé contre l'injection de formules. |

---

## 5. Architecture technique

### 5.1 Stack

| Couche | Technologie |
| --- | --- |
| Interface | React 19, TypeScript 5.7, Vite 6, lucide-react |
| API | Node.js 22 (module `node:sqlite`), Express 5, multer, archiver |
| Base de données | SQLite (fichier `suivi.sqlite`, mode WAL) |
| Stockage fichiers | Dossier `uploads/` sous `DATA_DIR` |
| PWA | Manifeste web, service worker, page hors connexion |
| Tests | `node:test` (intégration), Playwright (e2e), tests PWA |

### 5.2 Modèle de données

`users` (comptes), `sessions` (jetons hachés), `projects` (projets), `project_members` (rattachements), `attachments` (pièces jointes), `activities` (historique), avec clés étrangères et suppression en cascade.

### 5.3 Déploiement

- Le serveur sert l'interface compilée (`dist`) et l'API sur la **même origine** ; port de production par défaut **3001**.
- Variables d'environnement : `PORT`, `HOST`, `DATA_DIR`, `TRUST_PROXY`, `PUBLIC_ORIGIN`.
- Un reverse proxy HTTPS de confiance doit transmettre `Host` et `X-Forwarded-Proto: https` ; l'adresse du serveur Node doit rester inaccessible directement depuis Internet dans ce cas.
- Le dossier de données ne doit jamais être exposé comme répertoire web.
- L'installation PWA exige une adresse HTTPS hors `localhost`.

---

## 6. Livrables

1. Code source de l'interface (`src/`) et du serveur (`server/`).
2. Icônes et manifeste PWA (`public/`).
3. Jeux de tests : intégration, e2e navigateur, PWA, dates ; script de génération d'icônes.
4. Documentation : `README.md` (démarrage, production, sécurité, sauvegardes) et le présent cahier des charges.
5. Scripts npm : `dev`, `build`, `start`, `test`, `test:e2e`, `format`.

---

## 7. Recette et critères d'acceptation

| # | Critère d'acceptation |
| --- | --- |
| CA-01 | Le premier lancement sur une base vide affiche l'écran de création du premier administrateur ; ensuite, les inscriptions passent par l'approbation. |
| CA-02 | Un compte refusé ou suspendu ne peut pas ouvrir de session ; une suspension en cours de session déconnecte l'utilisateur. |
| CA-03 | Créer, modifier, supprimer un projet met à jour la liste, la fiche et l'historique sur tous les écrans ouverts. |
| CA-04 | Le refus d'un fichier non conforme (extension ou signature) est explicite ; un fichier de plus de 20 Mo est refusé. |
| CA-05 | Le PDF d'un projet et l'export ZIP se téléchargent et restent exploitables ; un fichier joint manquant bloque l'export avec un message clair. |
| CA-06 | L'historique reflète chaque modification avec auteur, date et valeurs avant/après. |
| CA-07 | `npm test` et `npm run build` passent sans erreur ; les tests e2e valident les parcours sur écran de bureau et à 390 px. |
| CA-08 | Le service worker ne met en cache aucune donnée privée ; la page hors connexion s'affiche sans réseau. |

---

## 8. Évolutions envisagées (hors périmètre actuel)

1. Vérification d'adresse e-mail et procédure « mot de passe oublié ».
2. Double authentification (2FA).
3. Notifications (e-mail ou push) sur échéances et demandes d'accès.
4. Analyse antivirus des pièces jointes.
5. Permissions réellement différenciées par rôle et par projet.
6. Import/ restauration depuis les archives ZIP d'export.
7. Mode hors connexion avec synchronisation des modifications.
8. Internationalisation de l'interface.
9. Publication en boutiques d'applications (embarquement natif).

---

## 9. Glossaire

| Terme | Définition |
| --- | --- |
| **PWA** | Progressive Web App : application web installable sur l'écran d'accueil. |
| **Service worker** | Script navigateur gérant le cache et la page hors connexion. |
| **SSE** | Server-Sent Events : flux unidirectionnel serveur → navigateur utilisé pour le temps réel. |
| **Scrypt** | Fonction de dérivation de mot de passe résistante aux attaques par force brute. |
| **WAL** | Write-Ahead Logging : mode journalisé de SQLite améliorant la robustesse. |
| **DATA_DIR** | Répertoire de stockage persistant (base + pièces jointes), configurable par variable d'environnement. |
| **Avancement calendaire** | Pourcentage de temps écoulé entre les dates de début et de fin, calculé automatiquement. |
