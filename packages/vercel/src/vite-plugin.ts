import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRequest, sendResponse } from "@remix-run/node-fetch-server";
import {
	createBuildPlugin,
	createHandlerPlugin,
	createPrerenderPlugin,
	VITE_ENVIRONMENT_NAMES,
} from "@vite-deploy/internal-helpers";
import type { Plugin } from "vite";
import packageJson from "../package.json" with { type: "json" };
import type { ExportedHandler, Options } from "./types.js";

const PACKAGE_NAME = packageJson.name;
const MAIN_INPUT = "index";
const ENTRYPOINT_VIRTUAL_MODULE = `virtual:${PACKAGE_NAME}/entrypoint`;

function validateMod(mod: Record<string, any>) {
	if (!("default" in mod && "fetch" in mod.default)) {
		throw new Error("Handler entrypoint returns an invalid shape");
	}
	return mod as {
		default: ExportedHandler;
	};
}

function configPlugin(
	options: Pick<Options, "handlerEntrypoint" | "output">,
): Plugin {
	return {
		name: `${PACKAGE_NAME}:config`,
		sharedDuringBuild: true,
		applyToEnvironment(environment) {
			return environment.name === VITE_ENVIRONMENT_NAMES.server;
		},
		config() {
			return {
				environments: {
					[VITE_ENVIRONMENT_NAMES.server]: {},
				},
			};
		},
		configEnvironment(name) {
			if (name === VITE_ENVIRONMENT_NAMES.client) {
				return {
					build: {
						outDir:
							options.output === "static" ? "dist" : ".vercel/output/static",
					},
				};
			}
			if (name === VITE_ENVIRONMENT_NAMES.server) {
				return {
					build: {
						outDir: ".vercel/output/functions/__server.func",
						rolldownOptions: {
							input: {
								[MAIN_INPUT]: ENTRYPOINT_VIRTUAL_MODULE,
							},
						},
						manifest: true,
						copyPublicDir: false,
					},
				};
			}
		},
		resolveId: {
			filter: {
				id: new RegExp(`^(${ENTRYPOINT_VIRTUAL_MODULE})$`),
			},
			handler() {
				return this.resolve(options.handlerEntrypoint.toString());
			},
		},
	};
}

export function vercel({
	handlerEntrypoint,
	requestLoggingLevel,
	...userOptions
}: Options): Array<Plugin> {
	return [
		configPlugin({ handlerEntrypoint, output: userOptions.output }),
		createBuildPlugin(),
		createHandlerPlugin({
			requestLoggingLevel,
			getDevMod: ({ serverEnvironment }) =>
				serverEnvironment.runner.import(ENTRYPOINT_VIRTUAL_MODULE),
			getPreviewMod: ({ outputDir }) =>
				import(join(outputDir, `${MAIN_INPUT}.mjs`)),
			onRequest: async ({ req, res, mod: unsafeMod }) => {
				const mod = validateMod(unsafeMod);

				let request: Request | undefined;

				try {
					// TODO: https://vercel.com/docs/headers/request-headers?framework=other
					request = createRequest(req, res);
					const response = await mod.default.fetch(request);
					await sendResponse(res, response);
					return { type: "success" };
				} catch (error) {
					return request?.signal.aborted
						? { type: "error", aborted: true }
						: { type: "error", aborted: false, error };
				}
			},
		}),
		createPrerenderPlugin({
			userOptions,
			onBuildDone: async ({ output, serverEnvironment }) => {
				const serverOutDir = join(
					serverEnvironment.config.root,
					serverEnvironment.config.build.outDir,
				);

				if (output === "static") {
					// Clear server bundle
					await rm(serverOutDir, {
						force: true,
						recursive: true,
					});
					return;
				}

				await writeFile(
					join(serverOutDir, "../../config.json"),
					JSON.stringify({
						version: 3,
						framework: {
							version: `${PACKAGE_NAME}@${packageJson.version}`,
						},
						routes: [
							{
								handle: "filesystem",
							},
							{
								src: "/.*",
								dest: "__server",
							},
						],
					}),
					"utf-8",
				);

				// https://vercel.com/docs/concepts/functions/serverless-functions/runtimes/node-js#node.js-version
				const SUPPORTED_NODE_VERSIONS: Record<
					string,
					| {
							status: "default";
					  }
					| {
							status: "available";
					  }
					| {
							status: "beta";
					  }
					| {
							status: "retiring";
							removal: Date | string;
							warnDate: Date;
					  }
					| {
							status: "deprecated";
					  }
				> = {
					18: {
						status: "deprecated",
					},
					20: {
						status: "available",
					},
					22: {
						status: "available",
					},
					24: {
						status: "default",
					},
				};
				function getRuntime(
					process: NodeJS.Process,
					logger: typeof console,
				): `nodejs${string}.x` {
					const version = process.version.slice(1); // 'v18.19.0' --> '18.19.0'
					const major = version.split(".")[0]; // '18.19.0' --> '18'
					const support = SUPPORTED_NODE_VERSIONS[major];
					if (support === undefined) {
						logger.warn(
							`\n` +
								`\tThe local Node.js version (${major}) is not supported by Vercel Serverless Functions.\n` +
								`\tYour project will use Node.js 24 as the runtime instead.\n` +
								`\tConsider switching your local version to 24.\n`,
						);
						return "nodejs24.x";
					}
					if (support.status === "default" || support.status === "available") {
						return `nodejs${major}.x`;
					}
					if (support.status === "retiring") {
						if (support.warnDate && new Date() >= support.warnDate) {
							logger.warn(
								`Your project is being built for Node.js ${major} as the runtime, which is retiring by ${support.removal}.`,
							);
						}
						return `nodejs${major}.x`;
					}
					if (support.status === "beta") {
						logger.warn(
							`Your project is being built for Node.js ${major} as the runtime, which is currently in beta for Vercel Serverless Functions.`,
						);
						return `nodejs${major}.x`;
					}
					if (support.status === "deprecated") {
						logger.warn(
							`\n` +
								`\tYour project is being built for Node.js ${major} as the runtime.\n` +
								`\tThis version is deprecated by Vercel Serverless Functions.\n` +
								`\tConsider upgrading your local version to 24.\n`,
						);
						return `nodejs${major}.x`;
					}
					return "nodejs24.x";
				}
				await writeFile(
					join(serverOutDir, ".vc-config.json"),
					JSON.stringify({
						runtime: getRuntime(process, console),
						handler: `${MAIN_INPUT}.mjs`,
						launcherType: "Nodejs",
						supportsResponseStreaming: true,
					}),
					"utf-8",
				);
			},
		}),
	];
}
