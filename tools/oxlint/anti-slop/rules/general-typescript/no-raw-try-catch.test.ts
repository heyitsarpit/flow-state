import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noRawTryCatchRule } from "./no-raw-try-catch.ts";

const tester = createRuleTester("no-raw-try-catch");

tester.run("no-raw-try-catch", noRawTryCatchRule, {
	valid: [
		{ code: "try { work(); } finally { cleanup(); }", filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts" },
		{ code: "try { work(); } catch (error) { report(error); }", filename: "/project/packages/flow-state-rewrite/src/implementation/live.test.ts" },
		{ code: "try { work(); } catch (error) { report(error); }", filename: "/project/packages/flow-state/src/runtime/host.ts" },
		{ code: "try { work(); } catch (error) { report(error); }", filename: "/project/packages/flow-state-rewrite/src/testing/helpers.ts" },
		{ code: "try { work(); } catch (error) { report(error); }", filename: "/project/packages/flow-state-rewrite/test/support.ts" },
	],
	invalid: [
		{ code: "try { work(); } catch (error) { report(error); }", filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts", errors: [{ messageId: "rawTryCatch" }] },
		{ code: "const value = 1; try { work(value); } catch { recover(); }", filename: "/project/packages/flow-state-rewrite/src/definition/domain.ts", errors: [{ messageId: "rawTryCatch" }] },
		{ code: "try { work(); } catch (error) { report(error); }", filename: "/project/packages/flow-state-rewrite/src/runtime/host.ts", errors: [{ messageId: "rawTryCatch" }] },
		{ code: "try { work(); } catch (error) { report(error); }", filename: "/project/packages/flow-state-rewrite/src/public/root.ts", errors: [{ messageId: "rawTryCatch" }] },
		{ code: "try { work(); } catch (error) { report(error); }", filename: "/project/packages/flow-state-rewrite/src/react/component.ts", errors: [{ messageId: "rawTryCatch" }] },
		{ code: "try { work(); } catch (error) { report(error); }", filename: "/project/packages/flow-state-rewrite/src/server/adapter.ts", errors: [{ messageId: "rawTryCatch" }] },
	],
});
