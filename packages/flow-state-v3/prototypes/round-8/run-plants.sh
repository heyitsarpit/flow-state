#!/bin/zsh
# zsh round-8/run-plants.sh > round-8/plants.txt. From prototypes/.
for pl in twoOut:bare.tight oldWins:bare.tight noMerge:bare.tight partial:bare.tight poisonDeletes:bare.tight poisonAll:two.tight debounce:bare.tight ignoresNow:bare.tight noSilent:bare.tight storedEarly:bare.tight noTicket:bare.tight encodeOnTurn:bare.tight hiddenWaits:bare.tight; do
  n=${pl%%:*}; w=${pl##*:}
  rm -rf round-8-plant; cp -R round-8 round-8-plant; python3 round-8/edge-plants.py $n
  suite=$(bun conformance/main.ts --round 8 --runtime ../round-8-plant/adapter.ts 2>&1 | grep -E "^FAIL" | awk '{print $2}' | head -3 | tr '\n' ' ')
  found=$(bun conformance/watch.ts --rss-mb 1800 --seconds 60 -- bun conformance/search/run.ts --which flush.$w --runtime ../../round-8-plant/adapter.ts --depth 14 --seconds 30 2>&1 | grep -E '"verdict"|"failure"|^error|\(g\)' | tr -d '\n' | cut -c1-200)
  echo "$n | suite: ${suite:-none} | $w: $found"
done
rm -rf round-8-plant
