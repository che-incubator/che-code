/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as l10n from '@vscode/l10n';
import { BasePromptElementProps, PromptElement, PromptElementProps, PromptSizing, TextChunk } from '@vscode/prompt-tsx';
import type { CancellationToken, LanguageModelToolInvocationOptions, LanguageModelToolInvocationPrepareOptions, PreparedToolInvocation } from 'vscode';
import { IFetcherService } from '../../../../platform/networking/common/fetcherService';
import { CancellationError } from '../../../../util/vs/base/common/errors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelPromptTsxPart, LanguageModelToolResult } from '../../../../vscodeTypes';
import { renderPromptElementJSON } from '../../../prompts/node/base/promptRenderer';
import { ToolName } from '../../common/toolNames';
import { ICopilotTool, ToolRegistry } from '../../common/toolsRegistry';

interface Argument {
	argName: string;
	description: string;
	default?: string;
}

interface ExecutionCommand {
	command: string;
	arguments?: Argument[];
}

type SupportedLanguage = "python" | "typescript" | "javascript";

interface ProjectSetupInfo {
	projectType: string;
	language: SupportedLanguage[];
	description: string;
	executionCommands?: ExecutionCommand[];
	requiredExtensions?: string[];
	rules?: string[];
}

const setupInfo: ProjectSetupInfo[] = [
	{
		projectType: 'vscode-extension',
		language: ['typescript', 'javascript'],
		description: 'A template for creating a VS Code extension using Yeoman and Generator-Code.',
		executionCommands: [{
			command: 'npx --package yo --package generator-code -- yo code . --skipOpen',
			arguments: [
				// { argName: '-i, --insiders', description: 'Show the insiders options for the generator' },
				{ argName: '-t, --extensionType', description: 'Specify extension type: ts, js, command-ts, command-js, colortheme, language, snippets, keymap, extensionpack, localization, commandweb, notebook', default: 'ts' },
				{ argName: '-n, --extensionDisplayName', description: 'Set the display name of the extension.' },
				{ argName: '--extensionId', description: 'Set the unique ID of the extension. Do not select this option if the user has not requested a unique ID.' },
				{ argName: '--extensionDescription', description: 'Provide a description for the extension' },
				{ argName: '--pkgManager', description: 'Specify package manager: npm, yarn, or pnpm', default: 'npm' },
				{ argName: '--bundler', description: 'Bundle the extension using webpack or esbuild' },
				{ argName: '--gitInit', description: 'Initialize a Git repository for the extension' },
				{ argName: '--snippetFolder', description: 'Specify the location of the snippet folder' },
				{ argName: '--snippetLanguage', description: 'Set the language for snippets' }
			]
		},
		],
		rules: [
			'Follow these rules strictly and do not deviate from them.',
			'1. Do not remove any arguments from the command. You can only add arguments if the user requests them.',
			`2. Call the tool ${ToolName.VSCodeAPI} with the users query to get the relevant references. `,
			`3. After the tool ${ToolName.VSCodeAPI} has completed, only then begin to modify the project.`,
		]
	},
	{
		projectType: 'next-js',
		language: ['typescript', 'javascript'],
		description: 'A React based framework for building server-rendered web applications.',
		executionCommands: [{
			command: 'npx create-next-app@latest .',
			arguments: [
				{ argName: '--ts, --typescript', description: 'Initialize as a TypeScript project. This is the default.' },
				{ argName: '--js, --javascript', description: 'Initialize as a JavaScript project.' },
				{ argName: '--tailwind', description: 'Initialize with Tailwind CSS config. This is the default.' },
				{ argName: '--eslint', description: 'Initialize with ESLint config.' },
				{ argName: '--app', description: 'Initialize as an App Router project.' },
				{ argName: '--src-dir', description: "Initialize inside a 'src/' directory." },
				{ argName: '--turbopack', description: 'Enable Turbopack by default for development.' },
				{ argName: '--import-alias <prefix/*>', description: 'Specify import alias to use.(default is "@/*")' },
				{ argName: '--api', description: 'Initialize a headless API using the App Router.' },
				{ argName: '--empty', description: 'Initialize an empty project.' },
				{ argName: '--use-npm', description: 'Explicitly tell the CLI to bootstrap the application using npm.' },
				{ argName: '--use-pnpm', description: 'Explicitly tell the CLI to bootstrap the application using pnpm.' },
				{ argName: '--use-yarn', description: 'Explicitly tell the CLI to bootstrap the application using Yarn.' },
				{ argName: '--use-bun', description: 'Explicitly tell the CLI to bootstrap the application using Bun.' }
			]
		}]
	},
	{
		projectType: 'vite',
		language: ['typescript', 'javascript'],
		description: 'A front end build tool for web applications that focuses on speed and performance. Can be used with React, Vue, Preact, Lit, Svelte, Solid, and Qwik.',
		executionCommands: [{
			command: 'npx create-vite@latest .',
			arguments: [
				{ argName: '-t, --template NAME', description: 'Use a specific template. Available templates: vanilla-ts, vanilla, vue-ts, vue, react-ts, react, react-swc-ts, react-swc, preact-ts, preact, lit-ts, lit, svelte-ts, svelte, solid-ts, solid, qwik-ts, qwik' }
			]
		}]
	},
	{
		projectType: 'mcp-server',
		language: ['typescript'],
		description: 'A Model Context Protocol (MCP) server project in Typescript. This project is based on the MCP server template.',
		executionCommands: [
			{ command: 'npm init -y' },
			{ command: 'npm install typescript --save-dev' },
			{ command: 'npx tsc --init' },
			{ command: 'npm install @modelcontextprotocol/sdk zod' }
		],
		rules: [
			'Follow these rules strictly and do not deviate from them.',
			'1. Set up a TypeScript project environment using the commands provided.',
			'2. Apply the modifications to the project to implement the MCP server using the documentation and examples provided.',
			'3. Always install the latest version of the packages and ensure that the installed versions are not changed or downgraded.',
			'4. Update the `copilot-instructions.md` to include a reference to the SDK link: https://github.com/modelcontextprotocol/create-python-server.',
			'5. Update the `README.md` file with the latest state of the project.',
			'6. Create an `mcp.json` file in the `.vscode` folder in the project root with the following content: `{ "servers": { "mcp-server-name": { "type": "stdio", "command": "command-to-run", "args": [list-of-args] } } }`.',
			'- mcp-server-name: The name of the MCP server. Create a unique name that reflects what this MCP server does.',
			'- command-to-run: The command to run to start the MCP server. This is the command you would use to run the project you just created.',
			'- list-of-args: The arguments to pass to the command. This is the list of arguments you would use to run the project you just created.',
			'7. Inform the user that they can now debug this MCP server using VS Code.',
		]
	},
	{
		projectType: 'mcp-server',
		language: ['python'],
		description: 'A Model Context Protocol (MCP) server project in Python. This project is based on the MCP server template.',
		requiredExtensions: ['ms-python.python', 'ms-python.vscode-python-envs'],
		executionCommands: [
			{
				command: 'pip install create-mcp-server && create-mcp-server --path . --no-claudeapp',
				arguments: [
					{ argName: '--name', description: 'Project name' },
					{ argName: '--version', description: 'Server version' },
					{ argName: '--description', description: 'Project description' }
				]
			},
			{
				command: 'uvx create-mcp-server --path .',
				arguments: [
					{ argName: '--name', description: 'Project name' },
					{ argName: '--version', description: 'Server version' },
					{ argName: '--description', description: 'Project description' }
				]
			},
		],
		rules: [
			'Follow these rules strictly and do not deviate from them.',
			'Use the exact command provided above. Do not modify the command.',
			'1. Ensure that Python is installed and available in your PATH.',
			'2. Run the execution commands to create the MCP server project using the templating tool.',
			'3. Activate the virtual environment.',
			'4. Install any other dependencies requested by the user or required by the project, and then modify the project to implement the MCP server.',
			'5. Update the `copilot-instructions.md` to include a reference to the SDK link: https://github.com/modelcontextprotocol/create-python-server.',
			'6. Update the `README.md` file with the latest state of the project.',
			'7. Create an `mcp.json` file in the `.vscode` folder in the project root with the following content: `{ "servers": { "mcp-server-name": { "type": "stdio", "command": "command-to-run", "args": [list-of-args] } } }`.',
			'- mcp-server-name: The name of the MCP server. Create a unique name that reflects what this MCP server does.',
			'- command-to-run: The command to run to start the MCP server. This is the command you would use to run the project you just created.',
			'- list-of-args: The arguments to pass to the command. This is the list of arguments you would use to run the project you just created.',
			'8. Inform the user that they can now debug this MCP server using VS Code.',
		]
	}, {
		projectType: 'python-script',
		language: ['python'],
		description: 'A simple Python script project which should be chosen when just a single script wants to be created.',
		requiredExtensions: ['ms-python.python', 'ms-python.vscode-python-envs'],
		rules: [
			'Follow these rules strictly and do not deviate from them.',
			`1. Call the tool ${ToolName.RunVscodeCmd} to correctly create a new Python script project in VS Code. Call the command with the following arguments.`,
			`Note that "python-script" and "true" are constants while  "New Project Name" and "/path/to/new/project" are placeholders for the project name and path respectively.`,
			`{ `,
			`"name": "python-envs.createNewProjectFromTemplate",`,
			`"commandId": "python-envs.createNewProjectFromTemplate",`,
			`"args": [ "python-script", "true" , "New Project Name", "/path/to/new/project"]`,
			`}`,
		]
	},
	{
		projectType: 'python-package',
		language: ['python'],
		description: 'A Python package project which can be used to create a distributable package.',
		requiredExtensions: ['ms-python.python', 'ms-python.vscode-python-envs'],
		rules: [
			'Follow these rules strictly and do not deviate from them.',
			`1. Call the tool ${ToolName.RunVscodeCmd} to correctly create a new Python package project in VS Code. Call the command with the following arguments:`,
			`Note that "python-package" and "true" are constants while  "New Package Name" and "/path/to/new/project" are placeholders for the package name and path respectively.`,
			`{ `,
			`"name": "python-envs.createNewProjectFromTemplate",`,
			`"commandId": "python-envs.createNewProjectFromTemplate",`,
			`"args": [ "python-package", "true" , "New Package Name", "/path/to/new/project"]`,
			`}`,
		]
	}
];

// Utility function to extract content under a specific header in markdown
function extractContentUnderHeader(markdown: string, header: string): string {
	const headerRegex = new RegExp(`^#\\s*${header}\\s*$`, 'm');
	const startMatch = markdown.match(headerRegex);
	if (!startMatch) {
		return '';
	}

	const startIndex = startMatch.index! + startMatch[0].length;
	const remainingContent = markdown.slice(startIndex);

	// Search for the next header that starts with #
	const nextHeaderIndex = remainingContent.search(/^#\s+/m);
	return nextHeaderIndex === -1
		? remainingContent.trim()
		: remainingContent.slice(0, nextHeaderIndex).trim();
}

export interface IWorkspaceSetupInfoToolParams {
	projectType: string;
	language?: SupportedLanguage;
}

export class GetWorkspaceSetupInfoTool implements ICopilotTool<IWorkspaceSetupInfoToolParams> {
	public static readonly toolName = ToolName.GetProjectSetupInfo;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	async prepareInvocation?(options: LanguageModelToolInvocationPrepareOptions<IWorkspaceSetupInfoToolParams>, token: CancellationToken): Promise<PreparedToolInvocation> {
		return {
			invocationMessage: l10n.t`Getting setup information`,
		};
	}

	async invoke(options: LanguageModelToolInvocationOptions<IWorkspaceSetupInfoToolParams>, token: CancellationToken): Promise<LanguageModelToolResult> {

		const { projectType, language } = options.input;
		const resolvedLanguage = language ?? "typescript";
		const selectedSetupInfo = setupInfo.find((info) => info.projectType === projectType && info.language.includes(resolvedLanguage));

		const json = await renderPromptElementJSON(this.instantiationService, WorkspaceSetupResult, { projectSetupInfo: selectedSetupInfo },);

		if (token.isCancellationRequested) {
			throw new CancellationError();
		}

		return new LanguageModelToolResult([
			new LanguageModelPromptTsxPart(json),
		]);
	}
}

ToolRegistry.registerTool(GetWorkspaceSetupInfoTool);

export class WorkspaceSetupResult extends PromptElement<WorkspaceSetupProps> {
	constructor(
		props: PromptElementProps<WorkspaceSetupProps>,
		@IFetcherService private readonly fetcherService: IFetcherService,
	) {
		super(props);
	}

	override async render(state: void, sizing: PromptSizing) {

		const { projectSetupInfo } = this.props;
		if (!projectSetupInfo) {
			return <> <TextChunk>
				No project setup information found.<br />
			</TextChunk></>;
		}


		const setupInfo = JSON.stringify(projectSetupInfo, null, 2);

		if (projectSetupInfo.projectType === 'mcp-server') {
			const exampleContent = await this.fetcherService.fetch('https://modelcontextprotocol.io/llms-full.txt', { method: 'GET' });
			const examples = exampleContent ? await exampleContent.text() : '';
			// python setup info is outdated. use our custom instructions instead
			const referenceContent = projectSetupInfo.language[0] === 'python' ? '' : extractContentUnderHeader(examples, 'For Server Developers');
			return <>
				<TextChunk>
					Use the Project Setup Information:<br />
					${setupInfo}<br />
					<br />
					Use the following documentation to set up the MCP server:<br />
					${referenceContent}<br />
					<br />
					Don't forget to call the tool {ToolName.CreateNewWorkspace} to create the project in a VS Code workspace.<br />
				</TextChunk>
			</>;
		}
		else {
			return <>
				<TextChunk>
					Use the Project Setup Information:<br />
					${setupInfo}<br />
					Don't forget to call the tool {ToolName.CreateNewWorkspace} to create the project in a VS Code workspace.<br />
				</TextChunk>
			</>;
		}
	}
}

interface WorkspaceSetupProps extends BasePromptElementProps {
	projectSetupInfo?: ProjectSetupInfo;
}