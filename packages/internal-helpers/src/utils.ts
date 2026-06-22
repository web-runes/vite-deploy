import type { Format, PrerenderEntrypoint } from "./types.js";

export function validatePrerenderMod(mod: Record<string, any>) {
	if (!("default" in mod && "getStaticPaths" in mod.default)) {
		throw new Error("Prerender entrypoint returns an invalid shape");
	}

	return mod as {
		default: PrerenderEntrypoint;
	};
}

function isGenerator(
	value: unknown,
): value is
	| Generator<Array<string>, void, undefined>
	| AsyncGenerator<Array<string>, void, undefined> {
	return (
		typeof value === "object" &&
		value !== null &&
		(Symbol.iterator in value || Symbol.asyncIterator in value) &&
		"next" in value &&
		typeof (value as { next: unknown }).next === "function"
	);
}

function validatePaths(paths: Array<string>) {
	if (!Array.isArray(paths) || !paths.every((e) => typeof e === "string")) {
		throw new Error(
			"Paths returned by getStaticPaths() are not an array of strings",
		);
	}
}

export async function* getStaticPaths(
	unsafeMod: Record<string, any>,
): AsyncGenerator<Array<string>, void, undefined> {
	const mod = validatePrerenderMod(unsafeMod).default;
	const result = await mod.getStaticPaths();
	if (isGenerator(result)) {
		for await (const paths of result) {
			validatePaths(paths);
			yield paths;
		}
		return;
	}
	validatePaths(result);
	yield result;
}

export async function forEachBatch(
	generator: ReturnType<typeof getStaticPaths>,
	cb: (batch: Array<string>) => Promise<void>,
): Promise<void> {
	const seen = new Set<string>();
	for await (const batch of generator) {
		const paths: Array<string> = [];
		for (let candidate of batch) {
			if (candidate[0] !== "/") {
				candidate = `/${candidate}`;
			}
			if (!seen.has(candidate)) {
				paths.push(candidate);
				seen.add(candidate);
			}
		}
		await cb(paths);
	}
}

export function getTimeStat(buildTime: number): string {
	return buildTime < 750
		? `${Math.round(buildTime)}ms`
		: `${(buildTime / 1000).toFixed(2)}s`;
}

export function isRedirectResponse(res: Response): boolean {
	return res.status >= 300 && res.status < 400 && res.headers.has("location");
}

export async function localFetch({
	path,
	baseUrl,
	options,
	maxRedirects = 5,
	warn,
	fetch,
}: {
	path: string;
	baseUrl: URL;
	options?: RequestInit;
	maxRedirects?: number;
	warn: (message: string) => void;
	fetch: (request: Request) => Promise<Response>;
}): Promise<Response> {
	const url = new URL(path, baseUrl);
	const request = new Request(url, options);
	const response = await fetch(request);

	if (isRedirectResponse(response) && maxRedirects > 0) {
		const location = response.headers.get("location") ?? "";
		if (location.startsWith("http://localhost") || location.startsWith("/")) {
			const newUrl = location.replace("http://localhost", "");
			return localFetch({
				path: newUrl,
				baseUrl,
				options,
				maxRedirects: maxRedirects - 1,
				warn,
				fetch,
			});
		} else {
			warn(`Skipping redirect to external location: ${location}`);
		}
	}

	return response;
}

export function getRouteFilename({
	path,
	htmlContentType,
	format,
}: {
	path: string;
	htmlContentType: boolean;
	format: Format;
}): string {
	// No magic for non-HTML files
	if (!htmlContentType && !path.endsWith(".html")) {
		return path;
	}

	if (path.endsWith("/")) {
		return `${path}index.html`;
	}

	if (format === "file") {
		if (path.endsWith(".html")) {
			return path;
		}
		return `${path}.html`;
	}

	if (path.endsWith("/index.html")) {
		return path;
	}
	if (path.endsWith(".html")) {
		return `${path.slice(0, -5)}/index.html`;
	}
	return `${path}/index.html`;
}
