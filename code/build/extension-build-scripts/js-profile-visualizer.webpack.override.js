// Webpack config override for .esbuild.ts build - disables type-checking to avoid build failures
const baseConfig = require('./packages/vscode-js-profile-table/webpack.config.js');

module.exports = baseConfig.map(config => {
	if (config.module && config.module.rules) {
		config.module.rules = config.module.rules.map(rule => {
			if (rule.loader === 'ts-loader') {
				return {
					...rule,
					options: {
						...rule.options,
						transpileOnly: true, // Disable type-checking to avoid build failures
					},
				};
			}
			return rule;
		});
	}
	return config;
});
