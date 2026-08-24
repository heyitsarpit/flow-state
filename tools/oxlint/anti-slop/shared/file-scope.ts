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
