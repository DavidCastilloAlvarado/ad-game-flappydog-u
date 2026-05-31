#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Create or update a Google Cloud Workload Identity Federation setup for one GitHub repository.

Required:
  --project-id PROJECT_ID
  --pool-id POOL_ID
  --provider-id PROVIDER_ID
  --service-account SERVICE_ACCOUNT_ID_OR_EMAIL
  --repo GITHUB_REPO_OR_URL

Optional:
  --project-number PROJECT_NUMBER
  --location LOCATION                     Default: global
  --pool-display-name NAME                Default: GitHub Actions Pool
  --provider-display-name NAME            Default: GitHub provider for <repo>
  --pool-description TEXT                 Default: GitHub Actions Workload Identity Pool
  --provider-description TEXT             Default: GitHub Actions provider for <repo>
  --skip-enable-apis                      Skip enabling required Google APIs
  --help                                  Show this help

Examples:
  ./scripts/create-github-wif.sh \
    --project-id my-project \
    --pool-id github \
    --provider-id github-flappydog \
    --service-account flappydog-deployer \
    --repo https://github.com/my-org/my-repo

Notes:
  - This script follows Google IAM Workload Identity Federation docs for GitHub Actions.
  - It maps repository and owner IDs and uses numeric GitHub IDs in the provider condition.
  - It creates or updates the pool, provider, service account, and the workloadIdentityUser binding.
EOF
}

log() {
  printf '==> %s\n' "$*"
}

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

normalize_repo() {
  local raw="$1"
  raw="${raw%.git}"
  raw="${raw#https://github.com/}"
  raw="${raw#http://github.com/}"
  raw="${raw#git@github.com:}"

  [[ "$raw" == */* ]] || die "--repo must be OWNER/REPO or a GitHub repo URL"

  local owner="${raw%%/*}"
  local repo="${raw#*/}"

  [[ -n "$owner" && -n "$repo" && "$repo" != *"/"* ]] || die "Could not parse repo from: $1"
  printf '%s/%s\n' "$owner" "$repo"
}

github_repo_metadata() {
  local repo_path="$1"
  local token="${GITHUB_TOKEN:-${GH_TOKEN:-}}"

  if [[ -n "$token" ]]; then
    curl -fsSL \
      -H "Accept: application/vnd.github+json" \
      -H "Authorization: Bearer ${token}" \
      "https://api.github.com/repos/${repo_path}"
  else
    curl -fsSL \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/${repo_path}"
  fi
}

PROJECT_ID=""
PROJECT_NUMBER=""
POOL_ID=""
PROVIDER_ID=""
SERVICE_ACCOUNT_INPUT=""
REPO_INPUT=""
LOCATION="global"
POOL_DISPLAY_NAME="GitHub Actions Pool"
PROVIDER_DISPLAY_NAME=""
POOL_DESCRIPTION="GitHub Actions Workload Identity Pool"
PROVIDER_DESCRIPTION=""
SKIP_ENABLE_APIS="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-id)
      PROJECT_ID="$2"
      shift 2
      ;;
    --project-number)
      PROJECT_NUMBER="$2"
      shift 2
      ;;
    --pool-id)
      POOL_ID="$2"
      shift 2
      ;;
    --provider-id)
      PROVIDER_ID="$2"
      shift 2
      ;;
    --service-account)
      SERVICE_ACCOUNT_INPUT="$2"
      shift 2
      ;;
    --repo)
      REPO_INPUT="$2"
      shift 2
      ;;
    --location)
      LOCATION="$2"
      shift 2
      ;;
    --pool-display-name)
      POOL_DISPLAY_NAME="$2"
      shift 2
      ;;
    --provider-display-name)
      PROVIDER_DISPLAY_NAME="$2"
      shift 2
      ;;
    --pool-description)
      POOL_DESCRIPTION="$2"
      shift 2
      ;;
    --provider-description)
      PROVIDER_DESCRIPTION="$2"
      shift 2
      ;;
    --skip-enable-apis)
      SKIP_ENABLE_APIS="true"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

[[ -n "$PROJECT_ID" ]] || die "--project-id is required"
[[ -n "$POOL_ID" ]] || die "--pool-id is required"
[[ -n "$PROVIDER_ID" ]] || die "--provider-id is required"
[[ -n "$SERVICE_ACCOUNT_INPUT" ]] || die "--service-account is required"
[[ -n "$REPO_INPUT" ]] || die "--repo is required"

require_cmd gcloud
require_cmd curl
require_cmd python3

REPO_PATH="$(normalize_repo "$REPO_INPUT")"
REPO_OWNER="${REPO_PATH%%/*}"
REPO_NAME="${REPO_PATH#*/}"

if [[ -z "$PROVIDER_DISPLAY_NAME" ]]; then
  # Truncate to 32 characters to comply with GCP limits
  PROVIDER_DISPLAY_NAME="GitHub provider for ${REPO_NAME}"
  if [ ${#PROVIDER_DISPLAY_NAME} -gt 32 ]; then
    PROVIDER_DISPLAY_NAME="${PROVIDER_DISPLAY_NAME:0:32}"
  fi
fi

if [[ -z "$PROVIDER_DESCRIPTION" ]]; then
  PROVIDER_DESCRIPTION="GitHub Actions provider for ${REPO_PATH}"
fi

log "Resolving GitHub metadata for ${REPO_PATH}"
GITHUB_META="$(github_repo_metadata "$REPO_PATH")" || die "Failed to read GitHub metadata for ${REPO_PATH}"

mapfile -t GITHUB_VALUES < <(
  printf '%s' "$GITHUB_META" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["full_name"]); print(d["id"]); print(d["owner"]["login"]); print(d["owner"]["id"])'
)

CANONICAL_REPO="${GITHUB_VALUES[0]}"
REPO_ID="${GITHUB_VALUES[1]}"
OWNER_LOGIN="${GITHUB_VALUES[2]}"
OWNER_ID="${GITHUB_VALUES[3]}"

[[ "$CANONICAL_REPO" == "$REPO_PATH" ]] || die "GitHub returned ${CANONICAL_REPO}, expected ${REPO_PATH}"

if [[ -z "$PROJECT_NUMBER" ]]; then
  log "Resolving project number for ${PROJECT_ID}"
  PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
fi

[[ -n "$PROJECT_NUMBER" ]] || die "Could not resolve project number"

if [[ "$SERVICE_ACCOUNT_INPUT" == *"@"* ]]; then
  SERVICE_ACCOUNT_EMAIL="$SERVICE_ACCOUNT_INPUT"
  SERVICE_ACCOUNT_ID="${SERVICE_ACCOUNT_INPUT%@*}"
else
  SERVICE_ACCOUNT_ID="$SERVICE_ACCOUNT_INPUT"
  SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
fi

ATTRIBUTE_MAPPING="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id"
ATTRIBUTE_CONDITION="assertion.repository_owner_id=='${OWNER_ID}' && assertion.repository_id=='${REPO_ID}'"
ISSUER_URI="https://token.actions.githubusercontent.com/"
PRINCIPAL_SET="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/${LOCATION}/workloadIdentityPools/${POOL_ID}/attribute.repository_id/${REPO_ID}"
WORKLOAD_IDENTITY_PROVIDER="projects/${PROJECT_NUMBER}/locations/${LOCATION}/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"

if [[ "$SKIP_ENABLE_APIS" != "true" ]]; then
  log "Enabling required IAM federation APIs"
  gcloud services enable \
    iam.googleapis.com \
    cloudresourcemanager.googleapis.com \
    iamcredentials.googleapis.com \
    sts.googleapis.com \
    --project="$PROJECT_ID"
fi

if gcloud iam workload-identity-pools describe "$POOL_ID" \
  --project="$PROJECT_ID" \
  --location="$LOCATION" >/dev/null 2>&1; then
  log "Pool ${POOL_ID} already exists"
else
  log "Creating pool ${POOL_ID}"
  gcloud iam workload-identity-pools create "$POOL_ID" \
    --project="$PROJECT_ID" \
    --location="$LOCATION" \
    --display-name="$POOL_DISPLAY_NAME" \
    --description="$POOL_DESCRIPTION"
fi

if gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --project="$PROJECT_ID" \
  --location="$LOCATION" \
  --workload-identity-pool="$POOL_ID" >/dev/null 2>&1; then
  log "Updating provider ${PROVIDER_ID}"
  gcloud iam workload-identity-pools providers update-oidc "$PROVIDER_ID" \
    --project="$PROJECT_ID" \
    --location="$LOCATION" \
    --workload-identity-pool="$POOL_ID" \
    --display-name="$PROVIDER_DISPLAY_NAME" \
    --description="$PROVIDER_DESCRIPTION" \
    --issuer-uri="$ISSUER_URI" \
    --attribute-mapping="$ATTRIBUTE_MAPPING" \
    --attribute-condition="$ATTRIBUTE_CONDITION"
else
  log "Creating provider ${PROVIDER_ID}"
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
    --project="$PROJECT_ID" \
    --location="$LOCATION" \
    --workload-identity-pool="$POOL_ID" \
    --display-name="$PROVIDER_DISPLAY_NAME" \
    --description="$PROVIDER_DESCRIPTION" \
    --issuer-uri="$ISSUER_URI" \
    --attribute-mapping="$ATTRIBUTE_MAPPING" \
    --attribute-condition="$ATTRIBUTE_CONDITION"
fi

if gcloud iam service-accounts describe "$SERVICE_ACCOUNT_EMAIL" \
  --project="$PROJECT_ID" >/dev/null 2>&1; then
  log "Service account ${SERVICE_ACCOUNT_EMAIL} already exists"
else
  log "Creating service account ${SERVICE_ACCOUNT_EMAIL}"
  gcloud iam service-accounts create "$SERVICE_ACCOUNT_ID" \
    --project="$PROJECT_ID" \
    --display-name="$SERVICE_ACCOUNT_ID"
fi

log "Granting roles/iam.workloadIdentityUser to ${PRINCIPAL_SET}"
gcloud iam service-accounts add-iam-policy-binding "$SERVICE_ACCOUNT_EMAIL" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="$PRINCIPAL_SET" >/dev/null

cat <<EOF

Done.

Repository:                ${CANONICAL_REPO}
GitHub repository ID:      ${REPO_ID}
GitHub owner:              ${OWNER_LOGIN}
GitHub owner ID:           ${OWNER_ID}
Project ID:                ${PROJECT_ID}
Project number:            ${PROJECT_NUMBER}
Pool ID:                   ${POOL_ID}
Provider ID:               ${PROVIDER_ID}
Service account:           ${SERVICE_ACCOUNT_EMAIL}

Use these values in GitHub Actions:
  workload_identity_provider: ${WORKLOAD_IDENTITY_PROVIDER}
  service_account:            ${SERVICE_ACCOUNT_EMAIL}

The service account impersonation binding that was applied:
  ${PRINCIPAL_SET}

Next step for Cloud Run deploys:
  grant the service account only the runtime/deploy roles you actually need,
  such as roles/run.admin and roles/artifactregistry.writer.
EOF
