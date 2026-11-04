import { configuredPath, isPathWithin } from "./module-path.ts";

export function normalizedFilename(filename: string): string {
	return filename.replaceAll("\\", "/");
}

export function isTestFile(filename: string): boolean {
	const normalized = normalizedFilename(filename);
	return (
		/(?:^|\/)__tests__\/.*\.[cm]?[jt]sx?$/u.test(normalized) ||
		/(?:^|\/)[^/]+\.(?:spec|test)\.[cm]?[jt]sx?$/u.test(normalized)
	);
}

export function isTestSupportFile(filename: string): boolean {
	const normalized = normalizedFilename(filename);
	return (
		isTestFile(filename) ||
		normalized.includes("/testing/") ||
		normalized.includes("/cli-test/") ||
		normalized.includes("/test/")
	);
}

export type BoundaryOptions = {
	allowedFiles?: readonly string[];
	allowedDirectories?: readonly string[];
	allowedPathFragments?: readonly string[];
};

export const boundaryOptionsSchema = [{
	type: "object",
	properties: {
		allowedFiles: { type: "array", items: { type: "string", minLength: 1 } },
		allowedDirectories: { type: "array", items: { type: "string", minLength: 1 } },
		allowedPathFragments: { type: "array", items: { type: "string", minLength: 1 } },
	},
	additionalProperties: false,
}];

/** Host ownership is configured explicitly; directory names never grant authority. */
export function isConfiguredBoundaryFile(filename: string, options: BoundaryOptions | undefined, cwd: string): boolean {
	return (options?.allowedFiles ?? []).some((file) => configuredPath(filename, cwd) === configuredPath(file, cwd)) ||
		(options?.allowedDirectories ?? []).some((directory) => isPathWithin(filename, directory, cwd)) ||
		(options?.allowedPathFragments ?? []).some((fragment) => normalizedFilename(filename).includes(normalizedFilename(fragment)));
}

export function isEffectHostBoundaryFile(filename: string, options: BoundaryOptions | undefined, cwd: string): boolean {
	return isTestSupportFile(filename) || isConfiguredBoundaryFile(filename, options, cwd);
}
