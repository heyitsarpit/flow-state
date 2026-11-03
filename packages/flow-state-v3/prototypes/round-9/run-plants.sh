#!/bin/zsh
# zsh round-9/run-plants.sh > round-9/plants.txt. From prototypes/.
for pl in twoOut:bare.tight oldWins:bare.tight noMerge:bare.capture partial:bare.tight poisonDeletes:bare.tight poisonAll:two.tight debounce:bare.capture ignoresNow:bare.capture noSilent:bare.capture storedEarly:bare.tight noTicket:bare.tight encodeOnTurn:bare.capture hiddenWaits:bare.capture; do
  n=${pl%%:*}; w=${pl##*:}
  rm -rf round-9-plant; cp -R round-9 round-9-plant; python3 round-9/edge-plants.py $n
  suite=$(bun conformance/main.ts --round 9 --no-catalog --runtime ../round-9-plant/adapter.ts 2>&1 | grep -E "^FAIL" | awk '{print $2}' | head -3 | tr '\n' ' ')
  found=$(bun conformance/watch.ts --rss-mb 1800 --seconds 70 -- bun conformance/search/run.ts --which flush.$w --runtime ../../round-9-plant/adapter.ts --depth 14 --seconds 40 2>&1 | grep -E '"verdict"|"failure"|^error|\(g\)' | tr -d '\n' | cut -c1-200)
  echo "$n | suite: ${suite:-none} | $w: $found"
done
rm -rf round-9-plant
