#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

before_head="$(git rev-parse HEAD)"
before_status="$(git status --porcelain=v1 --untracked-files=all)"
scratch="$(mktemp -d /tmp/allura-epic30-controlled-red.XXXXXX)"

cleanup() {
  case "$scratch" in
    /tmp/allura-epic30-controlled-red.*) rm -rf -- "$scratch" ;;
    *) printf 'Controlled-red cleanup refused an unexpected path.\n' >&2; return 1 ;;
  esac
}
trap cleanup EXIT

if [[ ! -d "$repo_root/node_modules" ]]; then
  printf 'Controlled-red requires the existing local dependency installation.\n' >&2
  exit 66
fi

git archive --format=tar "$before_head" | tar -xf - -C "$scratch"
ln -s "$repo_root/node_modules" "$scratch/node_modules"
if [[ -d "$repo_root/packages/sdk/node_modules" ]]; then
  ln -s "$repo_root/packages/sdk/node_modules" "$scratch/packages/sdk/node_modules"
fi
cd "$scratch"

baseline_log="$scratch/.baseline.log"
mutation_log="$scratch/.mutation.log"

if ! bunx tsc --noEmit --incremental false >"$baseline_log" 2>&1; then
  printf 'Epic 30 controlled-red baseline typecheck FAILED.\n' >&2
  exit 1
fi
if ! bunx vitest run --cache=false --config vitest.config.epic30-hermetic.ts >"$baseline_log" 2>&1; then
  printf 'Epic 30 controlled-red baseline hermetic gate FAILED.\n' >&2
  exit 1
fi
printf 'Epic 30 controlled-red baseline PASS (%s).\n' "$before_head"

cp src/lib/digital-brain/read-service.ts "$scratch/.read-service.safe"
target='    .filter((row) => canDisclose(row, scope))'
if [[ "$(grep -Fxc "$target" src/lib/digital-brain/read-service.ts)" != "2" ]]; then
  printf 'Controlled-red mutation precondition FAILED.\n' >&2
  exit 1
fi
perl -0pi -e 's/    \.filter\(\(row\) => canDisclose\(row, scope\)\)/    .filter(() => true)/g' src/lib/digital-brain/read-service.ts
mutation_hash="$(sha256sum src/lib/digital-brain/read-service.ts | cut -d' ' -f1)"
printf 'Epic 30 controlled-red mutation bypass-row-disclosure-filter (%s).\n' "$mutation_hash"

set +e
bunx vitest run --cache=false --config vitest.config.epic30-hermetic.ts --reporter=verbose >"$mutation_log" 2>&1
mutation_status=$?
set -e

if [[ "$mutation_status" -eq 0 ]]; then
  printf 'Epic 30 controlled-red FAILED: privacy regression escaped the gate.\n' >&2
  exit 1
fi
expected_witness='denies a removed tenant member even with active department authority'
if ! grep -Fq "$expected_witness" "$mutation_log"; then
  printf 'Epic 30 controlled-red FAILED: gate failed without the named privacy witness.\n' >&2
  exit 1
fi
printf 'Epic 30 controlled-red observed PASS (expected authorization-test failure).\n'

cp "$scratch/.read-service.safe" src/lib/digital-brain/read-service.ts
receipt_target='  const acknowledgement = await writer.persist(receipt)'
if [[ "$(grep -Fxc "$receipt_target" src/lib/digital-brain/read-receipt.ts)" != "1" ]]; then
  printf 'Controlled-red receipt mutation precondition FAILED.\n' >&2
  exit 1
fi
perl -0pi -e 's/  const acknowledgement = await writer\.persist\(receipt\)/  const acknowledgement = { receiptId: receipt.receiptId, witnessHash: receipt.witnessHash }/' src/lib/digital-brain/read-receipt.ts
receipt_mutation_hash="$(sha256sum src/lib/digital-brain/read-receipt.ts | cut -d' ' -f1)"
printf 'Epic 30 controlled-red mutation bypass-receipt-acknowledgement (%s).\n' "$receipt_mutation_hash"

set +e
bunx vitest run --cache=false --config vitest.config.epic30-hermetic.ts --reporter=verbose >"$mutation_log" 2>&1
receipt_mutation_status=$?
set -e

if [[ "$receipt_mutation_status" -eq 0 ]]; then
  printf 'Epic 30 controlled-red FAILED: receipt regression escaped the gate.\n' >&2
  exit 1
fi
expected_receipt_witness='fails closed on sink outage or mismatched acknowledgement'
if ! grep -Fq "$expected_receipt_witness" "$mutation_log"; then
  printf 'Epic 30 controlled-red FAILED: gate failed without the named receipt witness.\n' >&2
  exit 1
fi
printf 'Epic 30 controlled-red receipt observed PASS (expected receipt-test failure).\n'

cd "$repo_root"
if [[ "$(git rev-parse HEAD)" != "$before_head" || "$(git status --porcelain=v1 --untracked-files=all)" != "$before_status" ]]; then
  printf 'Epic 30 controlled-red FAILED: canonical repository state changed.\n' >&2
  exit 1
fi
printf 'Epic 30 controlled-red cleanup and canonical-state verification PASS.\n'
