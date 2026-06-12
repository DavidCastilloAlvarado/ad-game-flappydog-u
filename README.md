# Flappy Dog

A browser-based Flappy Bird clone featuring a dog face, 5 lives, and dynamic theming.

## Features

- Classic Flappy Bird gameplay with a dog character
- 5 lives system with invincibility frames
- Auto-switching light/dark theme every 20 seconds
- Animated cats on the ground
- Difficulty increases as you score

## Play

Open `index.html` in any browser. Click, tap, or press Space/W/ArrowUp to flap.

## Deploy

### Local Docker

```bash
sudo docker compose up --build
```

Visit http://localhost:8080

### Google Cloud Run

This repo includes a setup script for GitHub OIDC Workload Identity Federation.

See `scripts/README.md` for the full setup details.

Built-in help is also available:

```bash
./scripts/create-github-wif.sh --help
```

Basic usage:

```bash
./scripts/create-github-wif.sh \
  --project-id YOUR_PROJECT_ID \
  --project-number YOUR_PROJECT_NUMBER \
  --pool-id github \
  --provider-id github-flappydog \
  --service-account flappydog-deployer \
  --repo https://github.com/YOUR_ORG/YOUR_REPO
```

After the script finishes, use the printed values in `.github/workflows/deploy.yml`:

- `workload_identity_provider`
- `service_account`

You still need to grant the deploy service account the product roles it needs, for example:

- `roles/run.admin`
- `roles/artifactregistry.writer`

1. Create a Google Cloud project
2. Enable Cloud Run, Artifact Registry, and IAM APIs
3. Create an Artifact Registry repository: `gcloud artifacts repositories create flappydog-repo --location=us-central1 --repository-format=docker`
4. Set up Workload Identity Federation between GitHub and GCP:

```bash
gcloud iam workload-identity-pools create "github" \
  --project="YOUR_PROJECT_ID" \
  --location="global" \
  --display-name="GitHub Actions Pool"

gcloud iam workload-identity-pools providers create-oidc "my-repo" \
  --project="YOUR_PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="github" \
  --display-name="My GitHub repo Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository_owner == 'YOUR_GITHUB_ORG'" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```

5. Create a service account and grant permissions:

```bash
gcloud iam service-accounts create "flappydog-deployer" \
  --project "YOUR_PROJECT_ID"

gcloud iam service-accounts add-iam-policy-binding "flappydog-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --project "YOUR_PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/YOUR_WORKLOAD_IDENTITY_POOL_ID/attribute.repository/YOUR_GITHUB_ORG/YOUR_REPO"

gcloud projects add-iam-policy-binding "YOUR_PROJECT_ID" \
  --member="serviceAccount:flappydog-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding "YOUR_PROJECT_ID" \
  --member="serviceAccount:flappydog-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"
```

6. Update `.github/workflows/deploy.yml` with your project details
7. Push to main branch

## Monetization

Includes Google AdSense integration. Replace the publisher ID in `index.html` with your own.
