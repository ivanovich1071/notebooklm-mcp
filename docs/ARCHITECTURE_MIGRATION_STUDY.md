# NotebookLM MCP - Étude de Migration d'Architecture

> **Date**: Décembre 2024
> **Statut**: Étude préliminaire
> **Conclusion**: Migration non recommandée actuellement (API incomplète)

---

## Résumé Exécutif

Cette étude analyse les options pour industrialiser l'authentification et migrer vers l'API officielle NotebookLM Enterprise.

**Conclusion principale**: L'API Enterprise ne couvre pas les fonctionnalités essentielles (interrogation du notebook, génération de contenus). La migration n'est pas justifiée actuellement mais devra être réévaluée quand Google étendra l'API.

---

## Table des Matières

1. [Contexte et Objectifs](#1-contexte-et-objectifs)
2. [Architecture Actuelle](#2-architecture-actuelle)
3. [Options d'Architecture](#3-options-darchitecture)
4. [Comparaison des Fonctionnalités](#4-comparaison-des-fonctionnalités)
5. [Analyse des Coûts](#5-analyse-des-coûts)
6. [Matrice Avantages/Limites](#6-matrice-avantageslimites)
7. [Recommandations](#7-recommandations)
8. [Roadmap et Points de Réévaluation](#8-roadmap-et-points-de-réévaluation)

---

## 1. Contexte et Objectifs

### 1.1 Situation Actuelle

Le MCP NotebookLM utilise **Playwright (browser automation)** pour interagir avec NotebookLM car aucune API officielle n'existait au moment du développement.

### 1.2 Objectif Principal

**Industrialiser l'authentification** pour:

- Éliminer la dépendance aux cookies browser
- Permettre l'authentification M2M (Machine-to-Machine)
- Augmenter la fiabilité et réduire les interventions manuelles
- Supporter plusieurs comptes avec rotation

### 1.3 Découverte

Google a lancé une **API NotebookLM Enterprise** (Discovery Engine API) mais celle-ci est **incomplète** pour nos besoins.

---

## 2. Architecture Actuelle

### 2.1 Diagramme

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     ARCHITECTURE ACTUELLE (Playwright)                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────┐     ┌──────────────┐     ┌─────────────────────────────┐  │
│  │  Client  │────▶│  HTTP Server │────▶│     Playwright/Patchright   │  │
│  │  (MCP)   │     │  (Express)   │     │     (Browser Automation)    │  │
│  └──────────┘     └──────────────┘     └──────────────┬───────────────┘  │
│                                                       │                 │
│                                                       ▼                 │
│                                        ┌─────────────────────────────┐  │
│                                        │   NotebookLM Web UI         │  │
│                                        │   (notebooklm.google.com)   │  │
│                                        └─────────────────────────────┘  │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  AUTHENTIFICATION:                                                      │
│  ├── Login manuel initial (setup_auth)                                  │
│  ├── Cookies sauvegardés (~/.notebooklm-mcp/auth-state.json)            │
│  ├── SessionStorage persisté                                            │
│  └── Auto-refresh si cookies expirés                                    │
├─────────────────────────────────────────────────────────────────────────┤
│  LIMITATIONS:                                                           │
│  ├── Compte unique = point de défaillance unique                        │
│  ├── Rate limit 50 queries/jour (compte gratuit)                        │
│  ├── Expiration cookies (~2 semaines)                                   │
│  ├── Détection activité suspecte par Google                             │
│  └── Fragilité si l'UI NotebookLM change                                │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Stack Technique

| Composant      | Technologie                  | Rôle                          |
| -------------- | ---------------------------- | ----------------------------- |
| Runtime        | Node.js 18+                  | Exécution                     |
| Browser Engine | Patchright (Playwright fork) | Automation avec stealth       |
| HTTP Server    | Express.js                   | API REST pour les clients MCP |
| Auth Storage   | JSON files                   | Persistance cookies/session   |
| Stealth        | Custom utils                 | Comportement humain simulé    |

---

## 3. Options d'Architecture

### 3.1 Option A: Statu Quo (Playwright seul)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  OPTION A: PLAYWRIGHT SEUL (actuel)                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Client ──▶ HTTP Server ──▶ Playwright ──▶ NotebookLM Web UI            │
│                                                                         │
│  Améliorations possibles:                                               │
│  ├── Pool de comptes avec rotation                                      │
│  ├── Browser profiles persistants                                       │
│  ├── Quota tracking par compte                                          │
│  └── Failover automatique                                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Option B: API Enterprise (complète)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  OPTION B: API ENTERPRISE SEULE (hypothétique - API incomplète)         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Client ──▶ HTTP Server ──▶ Google Cloud API ──▶ NotebookLM Backend     │
│                                │                                        │
│                                ▼                                        │
│                    Service Account / OAuth 2.0                          │
│                                                                         │
│  ❌ NON VIABLE: L'API ne supporte pas l'interrogation (chat/query)      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Option C: Architecture Hybride

```
┌─────────────────────────────────────────────────────────────────────────┐
│  OPTION C: HYBRIDE (API + Playwright)                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                        MCP NotebookLM v2                         │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                  │                                      │
│          ┌───────────────────────┴───────────────────────┐              │
│          ▼                                               ▼              │
│  ┌─────────────────────┐                   ┌─────────────────────────┐  │
│  │   API Enterprise    │                   │      Playwright         │  │
│  │   (Google Cloud)    │                   │   (Browser Automation)  │  │
│  ├─────────────────────┤                   ├─────────────────────────┤  │
│  │ • Create notebook   │                   │ • Ask questions         │  │
│  │ • Add/manage sources│                   │ • Generate guides       │  │
│  │ • Generate audio    │                   │ • Extract responses     │  │
│  │ • Share notebook    │                   │ • Download content      │  │
│  │ • M2M Auth (OAuth)  │                   │ • Web search sources    │  │
│  └─────────────────────┘                   └─────────────────────────┘  │
│          │                                               │              │
│          ▼                                               ▼              │
│  Service Account                               Cookies/Session          │
│  (pas d'intervention humaine)                  (login manuel requis)    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Comparaison des Fonctionnalités

### 4.1 Fonctionnalités par Mode d'Accès

| Fonctionnalité                 | API Enterprise | Playwright | Notes                         |
| ------------------------------ | :------------: | :--------: | ----------------------------- |
| **Gestion Notebooks**          |                |            |                               |
| Créer notebook                 |       ✅       |     ✅     | API préférable                |
| Lister notebooks               |       ✅       |     ⚠️     | API plus fiable               |
| Supprimer notebook             |       ✅       |     ⚠️     | API préférable                |
| Partager notebook              |       ✅       |     ⚠️     | API avec rôles IAM            |
| **Gestion Sources**            |                |            |                               |
| Ajouter source (fichier)       |       ✅       |     ✅     | API plus simple               |
| Ajouter source (URL)           |       ✅       |     ✅     | API plus simple               |
| Ajouter source (texte)         |       ✅       |     ✅     | API plus simple               |
| Ajouter source (Google Drive)  |       ✅       |     ⚠️     | API native                    |
| Ajouter source (YouTube)       |       ✅       |     ✅     | Équivalent                    |
| Lister sources                 |       ✅       |     ⚠️     | API plus fiable               |
| Supprimer sources              |       ✅       |     ⚠️     | API préférable                |
| Discover sources (web search)  |       ❌       |     ✅     | Playwright seul               |
| **Génération Contenu**         |                |            |                               |
| Audio Overview                 |       ✅       |     ✅     | API préférable                |
| Podcast (standalone)           |       ✅       |     ❌     | API exclusive                 |
| Study Guide                    |       ❌       |     ✅     | Playwright seul               |
| Briefing Doc                   |       ❌       |     ✅     | Playwright seul               |
| Timeline                       |       ❌       |     ✅     | Playwright seul               |
| FAQ                            |       ❌       |     ✅     | Playwright seul               |
| Table of Contents              |       ❌       |     ✅     | Playwright seul               |
| Mind Map                       |       ❌       |     ✅     | Playwright seul               |
| **Interaction**                |                |            |                               |
| **Poser des questions (chat)** |       ❌       |     ✅     | **CRITIQUE: Playwright seul** |
| Extraire réponses              |       ❌       |     ✅     | Playwright seul               |
| Historique conversation        |       ❌       |     ✅     | Playwright seul               |
| **Export**                     |                |            |                               |
| Télécharger audio (WAV)        |       ⚠️       |     ✅     | Via UI                        |
| Télécharger mind map (image)   |       ❌       |     ✅     | Playwright seul               |
| Exporter texte généré          |       ❌       |     ✅     | Playwright seul               |

### 4.2 Résumé Couverture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  COUVERTURE FONCTIONNELLE                                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  API Enterprise:  ████████░░░░░░░░░░░░  ~40% des fonctionnalités       │
│  Playwright:      ████████████████████  ~100% des fonctionnalités      │
│                                                                         │
│  ⚠️  LA FONCTION LA PLUS IMPORTANTE (chat/query) N'EST PAS DANS L'API   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Analyse des Coûts

### 5.1 Coûts Directs

| Option                   | Coût Mensuel | Coût Annuel  | Notes                          |
| ------------------------ | ------------ | ------------ | ------------------------------ |
| **Gratuit (Playwright)** | $0           | $0           | 50 queries/jour, 100 notebooks |
| **NotebookLM Plus**      | ~$10/user    | ~$120/user   | Via Workspace, 5x limites      |
| **Enterprise**           | $9/licence   | $108/licence | API access, M2M auth           |
| **Gemini Enterprise**    | $30/user     | $360/user    | Inclut NotebookLM Enterprise   |

### 5.2 Coûts API (estimés)

| Opération        | Pricing            | Notes                            |
| ---------------- | ------------------ | -------------------------------- |
| API Calls        | Non documenté      | Probablement inclus dans licence |
| Storage          | Standard GCP rates | Si data stores utilisés          |
| Audio Generation | Non documenté      | Potentiellement pay-as-you-go    |

### 5.3 Coûts Cachés

| Élément               | Option Gratuite | Option Enterprise   |
| --------------------- | --------------- | ------------------- |
| Maintenance cookies   | ~1h/mois        | $0 (M2M)            |
| Gestion multi-comptes | Complexe        | Native (IAM)        |
| Debugging UI changes  | Variable        | Réduit (API stable) |
| Support Google        | Aucun           | Inclus              |

---

## 6. Matrice Avantages/Limites

### 6.1 Option A: Playwright Seul (Statu Quo)

| Avantages                   | Limites                          |
| --------------------------- | -------------------------------- |
| ✅ Gratuit                  | ❌ Auth fragile (cookies)        |
| ✅ 100% des fonctionnalités | ❌ Rate limit 50/jour            |
| ✅ Pas de dépendance GCP    | ❌ Maintenance si UI change      |
| ✅ Fonctionne maintenant    | ❌ Pas de M2M natif              |
| ✅ Contrôle total           | ❌ Détection possible par Google |

### 6.2 Option B: API Enterprise Seule

| Avantages                       | Limites                            |
| ------------------------------- | ---------------------------------- |
| ✅ Auth M2M (Service Account)   | ❌ **Pas de chat/query API**       |
| ✅ API stable et versionnée     | ❌ **Pas de génération guides**    |
| ✅ Quotas plus élevés           | ❌ Coût $9/mois minimum            |
| ✅ Support Google               | ❌ Fonctionnalités limitées (~40%) |
| ✅ Sécurité enterprise (VPC-SC) | ❌ Lock-in Google Cloud            |

### 6.3 Option C: Hybride (API + Playwright)

| Avantages                         | Limites                                 |
| --------------------------------- | --------------------------------------- |
| ✅ Meilleur des deux mondes       | ❌ Complexité accrue                    |
| ✅ M2M pour sources/audio         | ❌ Toujours besoin de cookies pour chat |
| ✅ 100% fonctionnalités           | ❌ Coût $9/mois + maintenance           |
| ✅ Migration progressive possible | ❌ Deux systèmes à maintenir            |
| ✅ Fallback si API évolue         | ❌ Overhead développement               |

---

## 7. Recommandations

### 7.1 Décision: NE PAS MIGRER (pour l'instant)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  RECOMMANDATION FINALE                                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ❌ MIGRATION NON RECOMMANDÉE ACTUELLEMENT                              │
│                                                                         │
│  Raison principale:                                                     │
│  L'API Enterprise ne supporte pas la fonctionnalité critique:           │
│  → Interrogation du notebook (chat/query)                               │
│                                                                         │
│  Sans cette fonctionnalité, l'API n'apporte pas de valeur               │
│  suffisante pour justifier le coût de $9/mois/licence.                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Actions Court Terme (0-3 mois)

| Action                         | Priorité | Effort    | Impact            |
| ------------------------------ | -------- | --------- | ----------------- |
| Pool de comptes gratuits (3-5) | Haute    | 2-3 jours | Résilience auth   |
| Quota tracking par compte      | Haute    | 1 jour    | Évite rate limits |
| Browser profiles persistants   | Moyenne  | 2 jours   | Stabilité auth    |
| Failover automatique           | Moyenne  | 1 jour    | Disponibilité     |

### 7.3 Actions si API Évolue

Quand Google ajoutera l'endpoint `notebooks.query` ou équivalent:

1. Réévaluer la migration hybride
2. Implémenter d'abord pour sources/audio (M2M)
3. Migrer progressivement les fonctionnalités supportées
4. Conserver Playwright comme fallback

---

## 8. Roadmap et Points de Réévaluation

### 8.1 Timeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ROADMAP                                                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Q1 2025: Améliorer architecture actuelle                               │
│  ├── Pool multi-comptes                                                 │
│  ├── Quota tracking                                                     │
│  └── Monitoring/alerting                                                │
│                                                                         │
│  Q2 2025: Surveiller évolution API Google                               │
│  ├── Veille sur notebooks.query/chat endpoint                           │
│  ├── Réévaluer si >60% couverture fonctionnelle                         │
│  └── POC hybride si pertinent                                           │
│                                                                         │
│  Q3-Q4 2025: Migration potentielle                                      │
│  ├── Si API complète: migration progressive                             │
│  └── Si API incomplète: continuer Playwright                            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Critères de Réévaluation

Réévaluer la migration si l'API ajoute:

- [ ] `notebooks.query` ou `notebooks.chat` - Interrogation du notebook
- [ ] `notebooks.generate` - Génération de Study Guide, Timeline, etc.
- [ ] `notebooks.export` - Export des contenus générés
- [ ] Pricing transparent pour les API calls

### 8.3 Sources de Veille

| Source                   | URL                                             | Fréquence    |
| ------------------------ | ----------------------------------------------- | ------------ |
| Google Cloud Blog        | cloud.google.com/blog                           | Mensuelle    |
| NotebookLM Release Notes | support.google.com/notebooklm                   | Bi-mensuelle |
| API Documentation        | docs.cloud.google.com/.../notebooklm-enterprise | Mensuelle    |
| Google AI Forum          | discuss.ai.google.dev                           | Hebdomadaire |

---

## Annexes

### A. Endpoints API Enterprise (Décembre 2024)

```
Base URL: https://{LOCATION}-discoveryengine.googleapis.com/v1alpha

Notebooks:
  POST   /projects/{project}/locations/{location}/notebooks                    # Create
  GET    /projects/{project}/locations/{location}/notebooks/{id}               # Get
  GET    /projects/{project}/locations/{location}/notebooks:listRecentlyViewed # List
  POST   /projects/{project}/locations/{location}/notebooks:batchDelete        # Delete
  POST   /projects/{project}/locations/{location}/notebooks/{id}:share         # Share

Sources:
  POST   /projects/{project}/locations/{location}/notebooks/{id}/sources:batchCreate   # Add
  POST   /projects/{project}/locations/{location}/notebooks/{id}/sources:uploadFile    # Upload
  GET    /projects/{project}/locations/{location}/notebooks/{id}/sources/{sourceId}    # Get
  POST   /projects/{project}/locations/{location}/notebooks/{id}/sources:batchDelete   # Delete

Audio:
  POST   /projects/{project}/locations/{location}/notebooks/{id}/audioOverviews        # Create
  DELETE /projects/{project}/locations/{location}/notebooks/{id}/audioOverviews/{aoId} # Delete

Podcasts (standalone):
  POST   /projects/{project}/locations/{location}/podcasts                             # Create
```

### B. Authentification API Enterprise

```bash
# Option 1: Service Account (M2M - recommandé pour production)
gcloud auth activate-service-account \
  --key-file=/path/to/service-account-key.json

# Option 2: User Account (interactif)
gcloud auth login --enable-gdrive-access

# Obtenir token
TOKEN=$(gcloud auth print-access-token)

# Exemple d'appel API
curl -X POST \
  "https://us-discoveryengine.googleapis.com/v1alpha/projects/123/locations/us/notebooks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"displayName": "Mon Notebook"}'
```

### C. Références

- [NotebookLM Enterprise Documentation](https://docs.cloud.google.com/gemini/enterprise/notebooklm-enterprise/docs/overview)
- [API Notebooks](https://docs.cloud.google.com/gemini/enterprise/notebooklm-enterprise/docs/api-notebooks)
- [API Sources](https://docs.cloud.google.com/gemini/enterprise/notebooklm-enterprise/docs/api-notebooks-sources)
- [API Audio Overview](https://docs.cloud.google.com/gemini/enterprise/notebooklm-enterprise/docs/api-audio-overview)
- [NotebookLM Pricing](https://www.elite.cloud/post/notebooklm-pricing-2025-free-plan-vs-paid-plan-which-one-actually-saves-you-time/)
- [NotebookLM for Enterprise](https://cloud.google.com/resources/notebooklm-enterprise)

---

_Document généré le 21 décembre 2024_
_Prochaine réévaluation recommandée: Mars 2025_
