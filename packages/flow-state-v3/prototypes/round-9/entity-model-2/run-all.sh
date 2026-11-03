#!/bin/sh
# Everything that was run for entity-proposal-2. Usage: run-all.sh [walks per configuration]. Writes results.txt beside it. Under 5 minutes at 600000 on 4 cores.
N=${1:-600000}
cd "$(dirname "$0")"
OUT=results.txt
: > "$OUT"
echo "== baseline, $N walks per configuration" >> "$OUT"
printf "base\nties\nrestart\nanswers\nboxed\n" | xargs -P 4 -I{} sh -c "node --experimental-transform-types --no-warnings run.ts $N {} | grep -E 'FAIL|^suite' | cut -c1-400" >> "$OUT"
echo "== trust list: each claim made false. These are meant to fail, 100000 walks" >> "$OUT"
printf "trust.lag\ntrust.restartFeed\ntrust.arrival\ntrust.lossy\ntrust.dedupe\ntrust.feedOmitsDerived\ntrust.noAlsoChanges\n" | xargs -P 4 -I{} sh -c "node --experimental-transform-types --no-warnings run.ts 100000 {} | grep -E '^suite' | cut -c1-90" >> "$OUT"
echo "== mutants, 100000 walks per configuration: configurations failed, first failure" >> "$OUT"
./run-mutants.sh 100000 | sort >> "$OUT"
echo "== sim: refresh" >> "$OUT"
node --experimental-transform-types --no-warnings sim.ts >> "$OUT"
echo "== traces" >> "$OUT"
node --experimental-transform-types --no-warnings traces.ts >> "$OUT"
