#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
example_dir="$(cd "$script_dir/.." && pwd)"
repo_root="$(cd "$example_dir/../.." && pwd)"
timestamp="$(date +%Y%m%d-%H%M%S)"
out_dir="${1:-$example_dir/.eval-artifacts/$timestamp}"
behavior_cli="$repo_root/packages/flow-state/scripts/behavior-cli.mjs"
inspect_cli="$repo_root/packages/flow-state/scripts/inspect-cli.mjs"
inspect_proof_script="$example_dir/scripts/generate-inspect-proof.mjs"
collector_entry="$example_dir/scripts/collect-function-outputs.ts"
collector_bundle="$example_dir/.eval-artifacts/.tmp/collect-function-outputs.$timestamp.mjs"

cleanup() {
  rm -f "$collector_bundle"
}
trap cleanup EXIT

mkdir -p "$out_dir"
mkdir -p "$out_dir/cli"
mkdir -p "$example_dir/.eval-artifacts/.tmp"

echo "Writing artifacts to $out_dir"

node "$behavior_cli" behavior build \
  --project-root "$example_dir" \
  --gateway "$example_dir/src/app/behavior.ts" \
  --output "$out_dir/cli/behavior-contract.json" \
  > "$out_dir/cli/behavior-build.txt"

node "$behavior_cli" behavior render \
  --input "$out_dir/cli/behavior-contract.json" \
  > "$out_dir/cli/behavior-brief.txt"

node "$behavior_cli" behavior render \
  --section coverage \
  --project-root "$example_dir" \
  --gateway "$example_dir/src/app/behavior.ts" \
  --module LaunchWorkspace \
  > "$out_dir/cli/behavior-coverage-launchworkspace.txt"

node "$behavior_cli" behavior diff \
  --left-input "$out_dir/cli/behavior-contract.json" \
  --right-input "$repo_root/apps/docs/src/generated/behavior-contract.json" \
  --module LaunchWorkspace \
  > "$out_dir/cli/behavior-diff-launchworkspace-vs-docs.txt"

node "$behavior_cli" behavior diff \
  --left-input "$out_dir/cli/behavior-contract.json" \
  --right-input "$repo_root/apps/docs/src/generated/behavior-contract.json" \
  --module LaunchWorkspace \
  --format json \
  > "$out_dir/cli/behavior-diff-launchworkspace-vs-docs.json"

inspect_proof_path="$(node "$inspect_proof_script" "$out_dir/cli/inspect-local-proof.json")"

node "$inspect_cli" buffer "$inspect_proof_path" \
  > "$out_dir/cli/inspect-buffer.txt"

node "$inspect_cli" trace "$inspect_proof_path" \
  > "$out_dir/cli/inspect-trace.txt"

node "$inspect_cli" trace "$inspect_proof_path" launch-workspace.eval.inspect.machine \
  > "$out_dir/cli/inspect-trace-machine.json"

node "$inspect_cli" failures "$inspect_proof_path" \
  > "$out_dir/cli/inspect-failures.txt"

pnpm exec esbuild "$collector_entry" \
  --bundle \
  --format=esm \
  --platform=node \
  --target=node22 \
  --outfile="$collector_bundle" \
  --external:effect \
  --external:flow-state \
  --external:flow-state/* \
  --external:next \
  --external:react \
  --external:react-dom \
  >/dev/null

node "$collector_bundle" "$out_dir/function-outputs" "$repo_root"

cat > "$out_dir/README.txt" <<EOF
cli/behavior-build.txt
  Confirms the canonical contract file was written.

cli/behavior-contract.json
  Machine-owned JSON artifact for Launch Workspace.

cli/behavior-brief.txt
  Shared brief render for humans and models.

cli/behavior-coverage-launchworkspace.txt
  Module-focused coverage obligations and uncovered behavior.

cli/behavior-diff-launchworkspace-vs-docs.txt
  Real CLI diff output for the LaunchWorkspace module slice.

cli/behavior-diff-launchworkspace-vs-docs.json
  Structured CLI diff output for the same module slice.

cli/inspect-local-proof.json
  Local inspection proof for a tiny throwaway machine with one no-transition and one happy path.

cli/inspect-buffer.txt
  Pretty event timeline from the local inspection proof.

cli/inspect-trace.txt
  High-level trace summary over the same proof.

cli/inspect-trace-machine.json
  Actor-focused JSON slice for the machine id.

cli/inspect-failures.txt
  Failure-only summary; this proof is intentionally mild, so it may say no failure correlations.

function-outputs/manifest.json
  Function-to-output index for testing helpers, inspect helpers, behavior helpers, and .inventory() shapes.
EOF

echo
echo "Done. Start with:"
echo "  sed -n '1,80p' \"$out_dir/cli/behavior-brief.txt\""
echo "  sed -n '1,120p' \"$out_dir/cli/behavior-coverage-launchworkspace.txt\""
echo "  sed -n '1,80p' \"$out_dir/cli/inspect-buffer.txt\""
echo "  sed -n '1,120p' \"$out_dir/cli/inspect-trace.txt\""
echo "  sed -n '1,120p' \"$out_dir/function-outputs/manifest.json\""
