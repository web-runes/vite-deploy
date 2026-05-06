// Source: https://github.com/withastro/astro/blob/6f7527b50296237cb6f6c9eacf1e998319e0b22c/packages/integrations/vercel/src/index.ts

const DEFAULT_NODE_VERSION = 24;

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
	[DEFAULT_NODE_VERSION]: {
		status: "default",
	},
};

export function getRuntime({
	nodeVersion,
	warn,
}: {
	nodeVersion: string;
	warn: (msg: string) => void;
}): `nodejs${string}.x` {
	const version = nodeVersion.slice(1); // 'v18.19.0' --> '18.19.0'
	const major = version.split(".")[0]; // '18.19.0' --> '18'
	const support = SUPPORTED_NODE_VERSIONS[major];
	if (support === undefined) {
		warn(
			`\n` +
				`\tThe local Node.js version (${major}) is not supported by Vercel Serverless Functions.\n` +
				`\tYour project will use Node.js ${DEFAULT_NODE_VERSION} as the runtime instead.\n` +
				`\tConsider switching your local version to ${DEFAULT_NODE_VERSION}.\n`,
		);
		return `nodejs${DEFAULT_NODE_VERSION}.x`;
	}
	if (support.status === "default" || support.status === "available") {
		return `nodejs${major}.x`;
	}
	if (support.status === "retiring") {
		if (support.warnDate && new Date() >= support.warnDate) {
			warn(
				`Your project is being built for Node.js ${major} as the runtime, which is retiring by ${support.removal}.`,
			);
		}
		return `nodejs${major}.x`;
	}
	if (support.status === "beta") {
		warn(
			`Your project is being built for Node.js ${major} as the runtime, which is currently in beta for Vercel Serverless Functions.`,
		);
		return `nodejs${major}.x`;
	}
	if (support.status === "deprecated") {
		warn(
			`\n` +
				`\tYour project is being built for Node.js ${major} as the runtime.\n` +
				`\tThis version is deprecated by Vercel Serverless Functions.\n` +
				`\tConsider upgrading your local version to ${DEFAULT_NODE_VERSION}.\n`,
		);
		return `nodejs${major}.x`;
	}
	return `nodejs${DEFAULT_NODE_VERSION}.x`;
}
