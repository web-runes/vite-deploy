import type { ExportedHandler } from "@vite-deploy/netlify";
import * as Test from './Test.astro'

console.log(Test.default())

export default {
	fetch(request, context) {
		console.log(context.ip);
		const url = new URL(request.url);
		if (
			(import.meta.env.DEV || import.meta.env.PRERENDER) &&
			url.pathname === "/"
		) {
			return new Response("<div>foo</div>", {
				status: 200,
				headers: {
					"Content-Type": "text/html",
				},
			});
		}
		return new Response(`Running ${url.pathname} in ${navigator.userAgent}!`);
	},
} satisfies ExportedHandler;
