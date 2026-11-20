import { eslintCompatPlugin } from "@oxlint/plugins";

import { bans } from "./rules/bans.ts";
import { derivedReportsRule } from "./rules/derived-reports.ts";
import { noHandOptionRule } from "./rules/no-hand-option.ts";
import { noIdTextRule } from "./rules/no-id-text.ts";
import { noTagChainRule } from "./rules/no-tag-chain.ts";
import { noEventNameFilterRule } from "./rules/no-event-name-filter.ts";
import { noMarkProbeRule } from "./rules/no-mark-probe.ts";
import { noRawEventRule } from "./rules/no-raw-event.ts";
import { noSpecIdsRule } from "./rules/no-spec-ids.ts";
import { ownersOnlyRule } from "./rules/owners-only.ts";
import { pairedRefusalsRule } from "./rules/paired-refusals.ts";
import { timersDecidedRule } from "./rules/timers-decided.ts";

const flowStateLintPlugin = eslintCompatPlugin({
  meta: { name: "flow-state" },
  rules: {
    "no-spec-ids": noSpecIdsRule,
    "derived-reports": derivedReportsRule,
    "no-mark-probe": noMarkProbeRule,
    "no-raw-event": noRawEventRule,
    "no-event-name-filter": noEventNameFilterRule,
    "no-hand-option": noHandOptionRule,
    "no-id-text": noIdTextRule,
    "no-tag-chain": noTagChainRule,
    "owners-only": ownersOnlyRule,
    "paired-refusals": pairedRefusalsRule,
    "timers-decided": timersDecidedRule,
    ...bans,
  },
});

export default flowStateLintPlugin;
