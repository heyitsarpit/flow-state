// Archived: superseded by anti-slop/no-unknown. Retained for historical reference; not registered.
import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noUnknownParametersRule } from "./no-unknown-parameters.ts";

const tester = createRuleTester("no-unknown-parameters");

tester.run("no-unknown-parameters-regression", noUnknownParametersRule, {
	valid: [
		"function parse(cause: unknown) { return cause; }",
		'import { Schema } from "effect"; function parseDomainValue(value: unknown) { return Schema.decodeUnknownSync(Schema.String)(value); }',
		'import { Schema } from "effect"; function parseDomainValue(value: unknown) { return Schema.decodeUnknownEffect(Schema.String)(value); }',
		'import { Schema } from "effect"; function parseDomainValue(value: unknown) { return Schema.decodeUnknownExit(Schema.String)(value); }',
		'import { Schema } from "effect"; function parseDomainValue(value: unknown) { return Schema.decodeUnknownOption(Schema.String)(value); }',
		'import { Schema } from "effect"; function parseDomainValue(value: unknown) { return Schema.decodeUnknownPromise(Schema.String)(value); }',
		'import { Schema } from "effect"; function parseDomainValue(value: unknown) { return Schema.decodeUnknownResult(Schema.String)(value); }',
		'import { Schema as S } from "effect"; function parseDomainValue(value: unknown) { return S.decodeUnknownSync(S.String)(value); }',
		'import * as Fx from "effect"; function parseDomainValue(value: unknown) { return Fx.Schema.decodeUnknownSync(Fx.Schema.String)(value); }',
	],
	invalid: [
		{ code: "function parse(value: unknown) { return value; }", errors: [{ messageId: "unknownParameter" }] },
		{ code: "const Schema = { decodeUnknownSync: (value) => value }; function parse(value: unknown) { return Schema.decodeUnknownSync(value); }", errors: [{ messageId: "unknownParameter" }] },
		{ code: 'import { Schema } from "effect"; function parse(value: unknown) { return Schema.decode(Schema.String)(value); }', errors: [{ messageId: "unknownParameter" }] },
		{ code: "type Parser = (payload: unknown) => string;", errors: [{ messageId: "unknownParameter" }] },
		{ code: "interface Parser { parse(payload: unknown): string; }", errors: [{ messageId: "unknownParameter" }] },
	],
});
