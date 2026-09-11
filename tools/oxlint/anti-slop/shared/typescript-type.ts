import type { ESTree } from "@oxlint/plugins";

function isNode(value: unknown): value is ESTree.Node {
	return typeof value === "object" && value !== null && "type" in value;
}

/** Check whether a type syntax tree contains an explicit unknown token. */
export function containsUnknownType(type: ESTree.TSType): boolean {
	if (type.type === "TSUnknownKeyword") return true;
	for (const [key, value] of Object.entries(type)) {
		if (key === "parent" || key === "loc" || key === "range") continue;
		if (Array.isArray(value)) {
			if (value.some((child) => isNode(child) && child.type !== "Identifier" && containsUnknownType(child as ESTree.TSType))) return true;
		} else if (isNode(value) && value.type !== "Identifier" && containsUnknownType(value as ESTree.TSType)) {
			return true;
		}
	}
	return false;
}
