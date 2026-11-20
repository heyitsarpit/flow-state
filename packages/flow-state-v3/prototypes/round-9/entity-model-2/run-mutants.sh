#!/bin/sh
# One line per mutant: which suite should kill it, and how many of its configurations fail. Four at a time.
N=${1:-200000}
cd "$(dirname "$0")"
cat <<LIST | xargs -P 4 -L 1 sh -c 'out=$(node --experimental-transform-types --no-warnings run.ts '"$N"' "$0" "$1"); line=$(printf "%s\n" "$out" | grep "^suite" | sed -E "s/suite ([^ ]+) flags \[([^]]*)\] fails ([0-9]+\/[0-9]+);.*/\2 (\1): \3/"); first=$(printf "%s\n" "$out" | grep -m1 FAIL | sed -E "s/^[^ ]+ +FAIL seed [0-9]+: //" | cut -c1-70); echo "$line  | $first"'
base noFieldScope
base noUnknown
base noBehind
base readClearsOpen
base readClearsQuiet
base volatileDoubts
base noGap
base sameKeepsLanded
base fromAtLanding
base claimNoRev
base alsoChangesClean
base rule32Clears
base noRowFree
base noRowVolatile
base proofAtEqual
base reloadNoGap
base helloNoGap
base dropNoGap
base noPresent
base blankAgrees
base markEverything
base recordScopeMarks
base conflictsNeverClose
base noDemote
base noReask
base beforeClosesNothing
base gapEntityWide
base perCollectionBehind
ties noTie
restart silentBefore
boxed identityEq
LIST
