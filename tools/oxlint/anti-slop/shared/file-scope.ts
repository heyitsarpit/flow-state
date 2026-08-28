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

export function isEffectHostBoundaryFile(filename: string): boolean {
	const normalized = normalizedFilename(filename);
	return (
		isTestSupportFile(filename) ||
		normalized.includes("/src/runtime/") ||
		normalized.includes("/src/core/runtime/") ||
		normalized.includes("/src/cli/") ||
		normalized.includes("/src/react/") ||
		normalized.includes("/src/server/") ||
		normalized.includes("/src/testing/") ||
		/\/src\/(?:bin|inspect|react-entry|server|testing)\.ts$/u.test(normalized)
	);
}
