import { eslintCompatPlugin } from "@oxlint/plugins";

import { bans } from "./rules/bans.ts";
import { derivedReportsRule } from "./rules/derived-reports.ts";
import { noHandOptionRule } from "./rules/no-hand-option.ts";
import { noEventNameFilterRule } from "./rules/no-event-name-filter.ts";
import { noMarkProbeRule } from "./rules/no-mark-probe.ts";
import { noRawEventRule } from "./rules/no-raw-event.ts";
import { noSpecIdsRule } from "./rules/no-spec-ids.ts";
import { ownersOnlyRule } from "./rules/owners-only.ts";

const flowStateLintPlugin = eslintCompatPlugin({
  meta: { name: "flow-state" },
  rules: {
    "no-spec-ids": noSpecIdsRule,
    "derived-reports": derivedReportsRule,
    "no-mark-probe": noMarkProbeRule,
    "no-raw-event": noRawEventRule,
    "no-event-name-filter": noEventNameFilterRule,
    "no-hand-option": noHandOptionRule,
    "owners-only": ownersOnlyRule,
    ...bans,
  },
});

export default flowStateLintPlugin;
