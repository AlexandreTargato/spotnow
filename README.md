# SpotNow - Marketplace de cours de sport dernière minute

Application web de réservation de cours de sport dernière minute avec réductions. Marketplace bidirectionnelle connectant studios et utilisateurs finaux.

## Stack Technique

- **Frontend/Backend**: Next.js 14 (App Router) + TypeScript
- **UI**: Tailwind CSS + shadcn/ui
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **Paiements**: Stripe Checkout + Webhooks
- **Emails**: Resend + React Email
- **Hosting**: Vercel

## Prérequis

- Node.js 18+
- npm ou yarn
- Compte Supabase
- Compte Stripe
- Compte Resend

## Installation

1. **Cloner et installer les dépendances**

```bash
npm install
```

2. **Configurer les variables d'environnement**

Créer un fichier `.env.local` à la racine du projet :

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxx

# Stripe
STRIPE_SECRET_KEY=sk_test_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx # Depuis Stripe CLI

# Resend
RESEND_API_KEY=re_xxx

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

3. **Configurer la base de données Supabase**

Exécuter le script SQL dans `supabase/schema.sql` dans votre projet Supabase (SQL Editor).

4. **Lancer le serveur de développement**

```bash
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000) dans votre navigateur.

## Structure du Projet

```
spotnow/
├── app/                    # Routes Next.js (App Router)
│   ├── api/                # API Routes
│   ├── cours/              # Pages publiques cours
│   ├── studio/             # Dashboard studio
│   └── confirmation/       # Page confirmation réservation
├── components/             # Composants React réutilisables
│   └── ui/                 # Composants shadcn/ui
├── lib/                    # Utilitaires et configurations
│   ├── supabase/           # Clients Supabase
│   ├── stripe/             # Clients Stripe
│   └── validations.ts      # Schémas Zod
├── emails/                 # Templates email React Email
└── supabase/               # Scripts SQL
```

## Fonctionnalités

### Côté Utilisateurs

- ✅ Voir les cours disponibles (yoga, Pilates, HIIT, barre, cycling)
- ✅ Filtrer par activité
- ✅ Réserver un cours en 3 clics
- ✅ Payer en ligne via Stripe
- ✅ Recevoir confirmation par email

### Côté Studios

- ✅ Se connecter à un dashboard
- ✅ Publier un cours (date, heure, places, prix)
- ✅ Voir leurs réservations en temps réel
- ✅ Suivre leurs stats (places vendues, revenu généré)
- ✅ Annuler un cours

## Déploiement

### Vercel

1. Connecter votre repo GitHub à Vercel
2. Ajouter toutes les variables d'environnement dans les paramètres Vercel
3. Déployer

### Configuration Stripe Webhooks

1. Aller sur Stripe Dashboard → Developers → Webhooks
2. Ajouter endpoint : `https://ton-domaine.vercel.app/api/webhooks/stripe`
3. Sélectionner les événements suivants :
   - **`checkout.session.completed`** (requis) - Crée la réservation après paiement réussi
   - **`payment_intent.payment_failed`** (recommandé) - Gère les échecs de paiement
   - **`charge.refunded`** (recommandé) - Gère les remboursements
4. Copier le webhook secret dans `.env.local` et Vercel

## Scripts Disponibles

```bash
npm run dev          # Serveur de développement
npm run build        # Build production
npm run start        # Serveur production
npm run lint         # Linter ESLint
npm run type-check   # Vérification TypeScript
```

## GitLab CI/CD

Le projet inclut un pipeline GitLab CI qui vérifie automatiquement le code avant chaque déploiement :

### Stages du Pipeline

1. **Type Check** - Vérifie les erreurs TypeScript
2. **Lint** - Exécute ESLint pour vérifier la qualité du code
3. **Build** - Compile l'application Next.js (vérifie que tout fonctionne)
4. **Deploy** - Déploiement (optionnel si vous utilisez Vercel)

### Déclenchement

Le pipeline s'exécute automatiquement sur :

- Toutes les branches
- Merge requests
- Push vers `main` et `develop`

### Configuration

Le fichier `.gitlab-ci.yml` est déjà configuré. Aucune action supplémentaire n'est nécessaire.

**Note** : Si vous utilisez Vercel, le stage `deploy` n'est pas nécessaire car Vercel se connecte directement à GitLab et déploie automatiquement.

## Notes Importantes

- Les studios doivent être créés dans Supabase Auth avec leur email
- Le `studio_id` correspond à l'`id` de l'utilisateur dans Supabase Auth
- Les prix sont stockés en centimes dans la base de données
- Le webhook Stripe doit être configuré pour créer les réservations automatiquement

## Support

Pour toute question, consultez le fichier `implementation-plan.md` pour les détails techniques complets.
