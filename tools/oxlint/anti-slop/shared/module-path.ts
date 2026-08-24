export function normalizeModulePath(value: string): string {
	const replaced = value.replaceAll("\\", "/").replace(/^[A-Z]:/iu, (drive) => `/${drive}`);
	const parts: string[] = [];
	for (const part of replaced.split("/")) {
		if (part === "" || part === ".") continue;
		if (part === "..") {
			parts.pop();
			continue;
		}
		parts.push(part);
	}
	return `/${parts.join("/")}`.replaceAll("//", "/");
}

export function stripModuleExtension(value: string): string {
	return value.replace(/\.[cm]?[jt]sx?$/iu, "");
}

export function resolveRelativeModule(filename: string, specifier: string): string | null {
	if (!specifier.startsWith(".")) return null;
	const normalizedFilename = normalizeModulePath(filename);
	const directory = normalizedFilename.slice(0, normalizedFilename.lastIndexOf("/") + 1);
	return normalizeModulePath(`${directory}${specifier}`);
}

export function isPathWithin(path: string, root: string): boolean {
	const pathParts = normalizeModulePath(path).toLowerCase().split("/").filter(Boolean);
	const rootParts = normalizeModulePath(root).toLowerCase().split("/").filter(Boolean);
	if (rootParts.length === 0 || rootParts.length > pathParts.length) return false;
	for (let start = 0; start <= pathParts.length - rootParts.length; start += 1) {
		if (rootParts.every((part, index) => pathParts[start + index] === part)) return true;
	}
	return false;
}

export function hasPathSegment(path: string, segment: string): boolean {
	const normalized = normalizeModulePath(path).toLowerCase();
	return normalized.split("/").includes(segment.toLowerCase());
}
