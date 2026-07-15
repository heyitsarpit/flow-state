#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
example_dir="$(cd "$script_dir/.." && pwd)"
repo_root="$(cd "$example_dir/../.." && pwd)"
timestamp="$(date +%Y%m%d-%H%M%S)"
out_dir="${1:-$example_dir/.eval-artifacts/$timestamp}"
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

pnpm --dir "$example_dir" exec flow-state behavior build \
  --project-root "$example_dir" \
  --gateway "$example_dir/src/app/behavior.ts" \
  --output "$out_dir/cli/behavior-contract.json" \
  > "$out_dir/cli/behavior-build.txt"

pnpm --dir "$example_dir" exec flow-state behavior render \
  --input "$out_dir/cli/behavior-contract.json" \
  > "$out_dir/cli/behavior-brief.txt"

pnpm --dir "$example_dir" exec flow-state behavior render \
  --section coverage \
  --project-root "$example_dir" \
  --gateway "$example_dir/src/app/behavior.ts" \
  --module LaunchWorkspace \
  > "$out_dir/cli/behavior-coverage-launchworkspace.txt"

pnpm --dir "$example_dir" exec flow-state behavior diff \
  --left-input "$out_dir/cli/behavior-contract.json" \
  --right-input "$repo_root/apps/docs/src/generated/behavior-contract.json" \
  --module LaunchWorkspace \
  > "$out_dir/cli/behavior-diff-launchworkspace-vs-docs.txt"

pnpm --dir "$example_dir" exec flow-state behavior diff \
  --left-input "$out_dir/cli/behavior-contract.json" \
  --right-input "$repo_root/apps/docs/src/generated/behavior-contract.json" \
  --module LaunchWorkspace \
  --format json \
  > "$out_dir/cli/behavior-diff-launchworkspace-vs-docs.json"

inspect_proof_path="$(node "$inspect_proof_script" "$out_dir/cli/inspect-local-proof.json")"

pnpm --dir "$example_dir" exec flow-state trace summarize "$inspect_proof_path" \
  > "$out_dir/cli/trace-summary.txt"

pnpm --dir "$example_dir" exec flow-state trace proof "$inspect_proof_path" --timeline \
  > "$out_dir/cli/trace-timeline.txt"

pnpm --dir "$example_dir" exec flow-state trace proof \
  "$inspect_proof_path" \
  --actor launch-workspace.eval.inspect.machine \
  > "$out_dir/cli/trace-actor.txt"

pnpm --dir "$example_dir" exec flow-state trace proof "$inspect_proof_path" --issues \
  > "$out_dir/cli/trace-issues.txt"

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

cli/trace-summary.txt
  Compact summary from the local inspection proof.

cli/trace-timeline.txt
  Ordered inspection timeline over the same proof.

cli/trace-actor.txt
  Actor-focused slice for the machine id.

cli/trace-issues.txt
  Issue slice; this proof intentionally records no issues.

function-outputs/manifest.json
  Function-to-output index for testing helpers, inspect helpers, behavior helpers, and .inventory() shapes.
EOF

echo
echo "Done. Start with:"
echo "  sed -n '1,80p' \"$out_dir/cli/behavior-brief.txt\""
echo "  sed -n '1,120p' \"$out_dir/cli/behavior-coverage-launchworkspace.txt\""
echo "  sed -n '1,80p' \"$out_dir/cli/trace-summary.txt\""
echo "  sed -n '1,120p' \"$out_dir/cli/trace-timeline.txt\""
echo "  sed -n '1,120p' \"$out_dir/function-outputs/manifest.json\""
