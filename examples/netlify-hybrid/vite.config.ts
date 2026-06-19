import netlify from "@vite-deploy/netlify";
import { defineConfig } from "vite";
import astro from "vite-plugin-astro";

export default defineConfig({
	plugins: [
		netlify({
			output: "hybrid",
			prerender: {
				entrypoint: "./src/prerender.ts",
			},
			handlerEntrypoint: "./src/handler.ts",
		}),
		astro({
			transformOptions: {
				internalURL: "virtual:temp",
			},
		}),
		{
			name: "temp",
			resolveId: {
				filter: { id: new RegExp(`^${"virtual:temp"}$`) },
				handler() {
					return "\0virtual:temp";
				},
			},
			load: {
				filter: {
					id: new RegExp(`^${"\0virtual:temp"}$`),
				},
				handler() {
					return `
						export function render() {}
						export function createComponent(cb) {
							return cb
						}
						export function maybeRenderHead() {}
					`;
				},
			},
			transform: {
				filter: {
					id: /\.astro$/,
				},
				handler(code) {
					console.log({ code });
					return code;
				},
			},
		},
	],
});
