# GitHub WIF Setup

This folder contains `create-github-wif.sh`, a setup script for Google Cloud Workload Identity Federation with GitHub Actions.

## Usage

```bash
./scripts/create-github-wif.sh \
  --project-id YOUR_PROJECT_ID \
  --project-number YOUR_PROJECT_NUMBER \
  --pool-id github \
  --provider-id github-flappydog \
  --service-account flappydog-deployer \
  --repo https://github.com/YOUR_ORG/YOUR_REPO
```

## Required Parameters

- `--project-id`: Google Cloud project ID
- `--pool-id`: workload identity pool ID to create or update
- `--provider-id`: OIDC provider ID inside that pool
- `--service-account`: service account name or full email
- `--repo`: GitHub repo as `OWNER/REPO` or full GitHub URL

## Optional Parameters

- `--project-number`: Google Cloud project number. If omitted, the script resolves it with `gcloud`
- `--location`: pool/provider location. Default: `global`
- `--pool-display-name`: pool display name
- `--provider-display-name`: provider display name
- `--pool-description`: pool description
- `--provider-description`: provider description
- `--skip-enable-apis`: skip enabling required APIs

## What The Script Does

- Enables the required IAM federation APIs unless skipped
- Creates the workload identity pool if it does not exist
- Creates or updates the GitHub OIDC provider
- Creates the service account if it does not exist
- Grants `roles/iam.workloadIdentityUser` for this repo
- Uses GitHub numeric IDs in the provider condition for safer binding

## Output

At the end, the script prints the values you should copy into `.github/workflows/deploy.yml`:

- `workload_identity_provider`
- `service_account`

## Extra Roles For Deployments

This script only sets up federation and impersonation.

For Cloud Run deployment, you still need to grant the deploy service account the product roles it needs, for example:

- `cloudrun`
- `cloudbuild`
- `roles/artifactregistry.writer`

## Help

```bash
./scripts/create-github-wif.sh --help
```
