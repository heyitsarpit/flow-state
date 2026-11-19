import { eslintCompatPlugin } from "@oxlint/plugins";

import { bans } from "./rules/bans.ts";
import { derivedReportsRule } from "./rules/derived-reports.ts";
import { noMarkProbeRule } from "./rules/no-mark-probe.ts";
import { noRawEventRule } from "./rules/no-raw-event.ts";
import { noSpecIdsRule } from "./rules/no-spec-ids.ts";

const flowStateLintPlugin = eslintCompatPlugin({
  meta: { name: "flow-state" },
  rules: {
    "no-spec-ids": noSpecIdsRule,
    "derived-reports": derivedReportsRule,
    "no-mark-probe": noMarkProbeRule,
    "no-raw-event": noRawEventRule,
    ...bans,
  },
});

export default flowStateLintPlugin;
