import { realpathSync } from "node:fs";

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

function pathIdentity(path: string): string {
	return /^\/[A-Za-z]:\//u.test(path) ? path.toLowerCase() : path;
}

/** Resolve configured paths against the lint host's cwd, never by substring. */
export function configuredPath(value: string, cwd: string): string {
	const path = normalizeModulePath(/^(?:[A-Za-z]:[\\/]|[\\/])/u.test(value) ? value : `${cwd}/${value}`);
	// Oxlint may use a logical filename with a physical cwd (e.g. /var vs /private/var).
	// Resolve the longest existing prefix so extensionless imports and virtual files still work.
	if (/^\/[A-Za-z]:\//u.test(path) && process.platform !== "win32") return pathIdentity(path);
	let prefix = path;
	let suffix = "";
	while (prefix !== "") {
		try {
			const native = /^\/[A-Za-z]:\//u.test(prefix) ? prefix.slice(1) : prefix;
			return pathIdentity(normalizeModulePath(`${realpathSync.native(native)}${suffix}`));
		} catch {
			const separator = prefix.lastIndexOf("/");
			if (separator < 0) break;
			suffix = `${prefix.slice(separator)}${suffix}`;
			prefix = prefix.slice(0, separator);
		}
	}
	return pathIdentity(path);
}

export function isPathWithin(path: string, root: string, cwd = "/"): boolean {
	const normalizedPath = configuredPath(path, cwd);
	const normalizedRoot = configuredPath(root, cwd).replace(/\/$/u, "");
	return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

export function hasPathSegment(path: string, segment: string): boolean {
	const normalized = normalizeModulePath(path).toLowerCase();
	return normalized.split("/").includes(segment.toLowerCase());
}
