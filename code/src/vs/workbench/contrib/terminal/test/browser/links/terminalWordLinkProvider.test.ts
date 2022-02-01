/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Terminal } from 'xterm';
import { TerminalWordLinkProvider } from 'vs/workbench/contrib/terminal/browser/links/terminalWordLinkProvider';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEditorOptions, ITextResourceEditorInput } from 'vs/platform/editor/common/editor';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { TerminalConfigHelper } from 'vs/workbench/contrib/terminal/browser/terminalConfigHelper';
import { ITerminalCommand, ITerminalConfigHelper, ITerminalConfiguration, IXtermMarker } from 'vs/workbench/contrib/terminal/common/terminal';
import { TestContextService, TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';
import { TerminalCapabilityStore } from 'vs/workbench/contrib/terminal/common/capabilities/terminalCapabilityStore';
import { XtermTerminal } from 'vs/workbench/contrib/terminal/browser/xterm/xtermTerminal';
import { TerminalLocation } from 'vs/platform/terminal/common/terminal';
import { TestViewDescriptorService } from 'vs/workbench/contrib/terminal/test/browser/xterm/xtermTerminal.test';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { XtermLinkMatcherHandler } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkManager';
import { FileService } from 'vs/platform/files/common/fileService';
import { IResolveMetadataFileOptions, IFileStatWithMetadata, IResolveFileOptions, IFileStat, IFileService } from 'vs/platform/files/common/files';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { TerminalLinkQuickPickEvent } from 'vs/workbench/contrib/terminal/browser/terminal';
import { EventType } from 'vs/base/browser/dom';
import { URI } from 'vs/base/common/uri';
import { TerminalLink } from 'vs/workbench/contrib/terminal/browser/links/terminalLink';
import { isWindows } from 'vs/base/common/platform';
import { TerminalCapability } from 'vs/workbench/contrib/terminal/common/capabilities/capabilities';
import { CommandDetectionCapability } from 'vs/workbench/contrib/terminal/browser/capabilities/commandDetectionCapability';

const defaultTerminalConfig: Partial<ITerminalConfiguration> = {
	fontFamily: 'monospace',
	fontWeight: 'normal',
	fontWeightBold: 'normal',
	gpuAcceleration: 'off',
	scrollback: 1000,
	fastScrollSensitivity: 2,
	mouseWheelScrollSensitivity: 1,
	unicodeVersion: '11',
	wordSeparators: ' ()[]{}\',"`─‘’'
};

export interface ITerminalLinkActivationResult {
	source: 'editor' | 'search',
	link: string
}

class TestFileService extends FileService {
	private _files: string[] | '*' = '*';
	override async resolve(resource: URI, options: IResolveMetadataFileOptions): Promise<IFileStatWithMetadata>;
	override async resolve(resource: URI, options?: IResolveFileOptions): Promise<IFileStat>;
	override async resolve(resource: URI, options?: IResolveFileOptions): Promise<IFileStat> {
		if (this._files === '*' || this._files.includes(resource.fsPath)) {
			return { isFile: true, isDirectory: false, isSymbolicLink: false } as IFileStat;
		} else {
			return { isFile: false, isDirectory: false, isSymbolicLink: false } as IFileStat;
		}
	}
	setFiles(files: string[]): void {
		this._files = files;
	}
}

class TestCommandDetectionCapability extends CommandDetectionCapability {
	setCommands(commands: ITerminalCommand[]) {
		this._commands = commands;
	}
}

suite('Workbench - TerminalWordLinkProvider', () => {
	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let themeService: TestThemeService;
	let fileService: TestFileService;
	let viewDescriptorService: TestViewDescriptorService;
	let xterm: XtermTerminal;
	let configHelper: ITerminalConfigHelper;
	let capabilities: TerminalCapabilityStore;
	let activationResult: ITerminalLinkActivationResult | undefined;
	let commandDetection: TestCommandDetectionCapability;

	setup(() => {
		instantiationService = new TestInstantiationService();
		fileService = new TestFileService(new NullLogService());
		configurationService = new TestConfigurationService();
		instantiationService.stub(IConfigurationService, configurationService);
		configurationService = new TestConfigurationService({
			editor: {
				fastScrollSensitivity: 2,
				mouseWheelScrollSensitivity: 1
			} as Partial<IEditorOptions>,
			terminal: {
				integrated: defaultTerminalConfig
			}
		});

		themeService = new TestThemeService();
		viewDescriptorService = new TestViewDescriptorService();
		instantiationService = new TestInstantiationService();
		instantiationService.stub(IWorkbenchEnvironmentService, {
			remoteAuthority: undefined
		} as Partial<IWorkbenchEnvironmentService>);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IStorageService, new TestStorageService());
		instantiationService.stub(IThemeService, themeService);
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IViewDescriptorService, viewDescriptorService);
		instantiationService.stub(IWorkspaceContextService, new TestContextService());

		// Allow intercepting link activations
		activationResult = undefined;
		instantiationService.stub(IQuickInputService, {
			quickAccess: {
				show(link: string) {
					activationResult = { link, source: 'search' };
				}
			}
		} as Partial<IQuickInputService>);
		instantiationService.stub(IEditorService, {
			async openEditor(editor: ITextResourceEditorInput): Promise<any> {
				activationResult = {
					source: 'editor',
					link: editor.resource?.toString()
				};
			}
		} as Partial<IEditorService>);

		configHelper = instantiationService.createInstance(TerminalConfigHelper);
		capabilities = new TerminalCapabilityStore();
		xterm = instantiationService.createInstance(XtermTerminal, Terminal, configHelper, 80, 30, TerminalLocation.Panel, capabilities);
		commandDetection = new TestCommandDetectionCapability(xterm.raw, new NullLogService());
		capabilities.add(TerminalCapability.CommandDetection, commandDetection);
	});

	async function assertLink(text: string, expected: { text: string, range: [number, number][], linkActivationResult?: ITerminalLinkActivationResult }[], assertActicationResult?: boolean) {
		xterm.dispose();
		xterm = instantiationService.createInstance(XtermTerminal, Terminal, configHelper, 80, 30, TerminalLocation.Panel, capabilities);
		// We don't want to cancel the event or anything from the tests so just pass in a wrapped
		// link handler that does nothing.

		const testWrappedLinkHandler = (handler: (event: MouseEvent | undefined, link: string) => void): XtermLinkMatcherHandler => {
			return async (event: MouseEvent | undefined, link: string) => {
				await handler(event, link);
			};
		};
		const provider: TerminalWordLinkProvider = instantiationService.createInstance(TerminalWordLinkProvider,
			xterm,
			capabilities,
			testWrappedLinkHandler,
			() => { }
		);

		// Write the text and wait for the parser to finish
		await new Promise<void>(r => xterm.raw.write(text, r));

		// Ensure all links are provided
		const links = (await new Promise<TerminalLink[] | undefined>(r => provider.provideLinks(1, r)))!;
		const actualLinks = await Promise.all(links.map(async e => {
			if (capabilities.has(TerminalCapability.CommandDetection)) {
				e.activate(new TerminalLinkQuickPickEvent(EventType.CLICK), e.text);
				await e.asyncActivate;
			}
			return {
				text: e.text,
				range: e.range,
				activationResult
			};
		}));

		const expectedVerbose = expected.map(e => ({
			text: e.text,
			range: {
				start: { x: e.range[0][0], y: e.range[0][1] },
				end: { x: e.range[1][0], y: e.range[1][1] },
			},
			activationResult: e.linkActivationResult
		}));
		assert.deepStrictEqual(
			actualLinks.map(e => ({ text: e.text, range: e.range })),
			expectedVerbose.map(e => ({ text: e.text, range: e.range }))
		);
		if (assertActicationResult) {
			assert.deepStrictEqual(
				actualLinks.map(e => e.activationResult),
				expected.map(e => e.linkActivationResult)
			);
		}
		assert.strictEqual(links.length, expected.length);
	}

	test('should link words as defined by wordSeparators', async () => {
		await configurationService.setUserConfiguration('terminal', { integrated: { wordSeparators: ' ()[]' } });
		await assertLink('foo', [{ range: [[1, 1], [3, 1]], text: 'foo' }]);
		await assertLink('foo', [{ range: [[1, 1], [3, 1]], text: 'foo' }]);
		await assertLink(' foo ', [{ range: [[2, 1], [4, 1]], text: 'foo' }]);
		await assertLink('(foo)', [{ range: [[2, 1], [4, 1]], text: 'foo' }]);
		await assertLink('[foo]', [{ range: [[2, 1], [4, 1]], text: 'foo' }]);
		await assertLink('{foo}', [{ range: [[1, 1], [5, 1]], text: '{foo}' }]);

		await configurationService.setUserConfiguration('terminal', { integrated: { wordSeparators: ' ' } });
		await assertLink('foo', [{ range: [[1, 1], [3, 1]], text: 'foo' }]);
		await assertLink(' foo ', [{ range: [[2, 1], [4, 1]], text: 'foo' }]);
		await assertLink('(foo)', [{ range: [[1, 1], [5, 1]], text: '(foo)' }]);
		await assertLink('[foo]', [{ range: [[1, 1], [5, 1]], text: '[foo]' }]);
		await assertLink('{foo}', [{ range: [[1, 1], [5, 1]], text: '{foo}' }]);

		await configurationService.setUserConfiguration('terminal', { integrated: { wordSeparators: ' []' } });
		await assertLink('aabbccdd.txt ', [{ range: [[1, 1], [12, 1]], text: 'aabbccdd.txt' }]);
		await assertLink(' aabbccdd.txt ', [{ range: [[2, 1], [13, 1]], text: 'aabbccdd.txt' }]);
		await assertLink(' [aabbccdd.txt] ', [{ range: [[3, 1], [14, 1]], text: 'aabbccdd.txt' }]);
	});

	// These are failing - the link's start x is 1 px too far to the right bc it starts
	// with a wide character, which the terminalLinkHelper currently doesn't account for
	test.skip('should support wide characters', async () => {
		await configurationService.setUserConfiguration('terminal', { integrated: { wordSeparators: ' []' } });
		await assertLink('我是学生.txt ', [{ range: [[1, 1], [12, 1]], text: '我是学生.txt' }]);
		await assertLink(' 我是学生.txt ', [{ range: [[2, 1], [13, 1]], text: '我是学生.txt' }]);
		await assertLink(' [我是学生.txt] ', [{ range: [[3, 1], [14, 1]], text: '我是学生.txt' }]);
	});

	test('should support multiple link results', async () => {
		await configurationService.setUserConfiguration('terminal', { integrated: { wordSeparators: ' ' } });
		await assertLink('foo bar', [
			{ range: [[1, 1], [3, 1]], text: 'foo' },
			{ range: [[5, 1], [7, 1]], text: 'bar' }
		]);
	});

	test('should remove trailing colon in the link results', async () => {
		await configurationService.setUserConfiguration('terminal', { integrated: { wordSeparators: ' ' } });
		await assertLink('foo:5:6: bar:0:32:', [
			{ range: [[1, 1], [7, 1]], text: 'foo:5:6' },
			{ range: [[10, 1], [17, 1]], text: 'bar:0:32' }
		]);
	});

	test('should support wrapping', async () => {
		await configurationService.setUserConfiguration('terminal', { integrated: { wordSeparators: ' ' } });
		await assertLink('fsdjfsdkfjslkdfjskdfjsldkfjsdlkfjslkdjfskldjflskdfjskldjflskdfjsdklfjsdklfjsldkfjsdlkfjsdlkfjsdlkfjsldkfjslkdfjsdlkfjsldkfjsdlkfjskdfjsldkfjsdlkfjslkdfjsdlkfjsldkfjsldkfjsldkfjslkdfjsdlkfjslkdfjsdklfsd', [
			{ range: [[1, 1], [41, 3]], text: 'fsdjfsdkfjslkdfjskdfjsldkfjsdlkfjslkdjfskldjflskdfjskldjflskdfjsdklfjsdklfjsldkfjsdlkfjsdlkfjsdlkfjsldkfjslkdfjsdlkfjsldkfjsdlkfjskdfjsldkfjsdlkfjslkdfjsdlkfjsldkfjsldkfjsldkfjslkdfjsdlkfjslkdfjsdklfsd' },
		]);
	});
	test('should support wrapping with multiple links', async () => {
		await configurationService.setUserConfiguration('terminal', { integrated: { wordSeparators: ' ' } });
		await assertLink('fsdjfsdkfjslkdfjskdfjsldkfj sdlkfjslkdjfskldjflskdfjskldjflskdfj sdklfjsdklfjsldkfjsdlkfjsdlkfjsdlkfjsldkfjslkdfjsdlkfjsldkfjsdlkfjskdfjsldkfjsdlkfjslkdfjsdlkfjsldkfjsldkfjsldkfjslkdfjsdlkfjslkdfjsdklfsd', [
			{ range: [[1, 1], [27, 1]], text: 'fsdjfsdkfjslkdfjskdfjsldkfj' },
			{ range: [[29, 1], [64, 1]], text: 'sdlkfjslkdjfskldjflskdfjskldjflskdfj' },
			{ range: [[66, 1], [43, 3]], text: 'sdklfjsdklfjsldkfjsdlkfjsdlkfjsdlkfjsldkfjslkdfjsdlkfjsldkfjsdlkfjskdfjsldkfjsdlkfjslkdfjsdlkfjsldkfjsldkfjsldkfjslkdfjsdlkfjslkdfjsdklfsd' }
		]);
	});
	test('does not return any links for empty text', async () => {
		await configurationService.setUserConfiguration('terminal', { integrated: { wordSeparators: ' ' } });
		await assertLink('', []);
	});
	test('should support file scheme links', async () => {
		await configurationService.setUserConfiguration('terminal', { integrated: { wordSeparators: ' ' } });
		await assertLink('file:///C:/users/test/file.txt ', [{ range: [[1, 1], [30, 1]], text: 'file:///C:/users/test/file.txt' }]);
		await assertLink('file:///C:/users/test/file.txt:1:10 ', [{ range: [[1, 1], [35, 1]], text: 'file:///C:/users/test/file.txt:1:10' }]);
	});
	test('should apply the cwd to the link only when the file exists and cwdDetection is enabled', async () => {
		const cwd = (isWindows
			? 'c:\\Users\\home\\folder'
			: '/Users/home/folder'
		);
		const absoluteFile = (isWindows
			? 'c:\\Users\\home\\folder\\file.txt'
			: '/Users/home/folder/file.txt'
		);
		fileService.setFiles([absoluteFile]);

		// Set a fake detected command starting as line 0 to establish the cwd
		commandDetection.setCommands([{
			command: '',
			cwd,
			timestamp: 0,
			getOutput() { return undefined; },
			marker: {
				line: 0
			} as Partial<IXtermMarker> as any
		}]);
		await assertLink('file.txt', [{
			range: [[1, 1], [8, 1]],
			text: 'file.txt',
			linkActivationResult: {
				link: (isWindows
					? 'file:///c%3A%5CUsers%5Chome%5Cfolder%5Cfile.txt'
					: 'file:///Users/home/folder/file.txt'
				),
				source: 'editor'
			}
		}]);

		// Clear deteceted commands and ensure the same request results in a search
		commandDetection.setCommands([]);
		await assertLink('file.txt', [{
			range: [[1, 1], [8, 1]],
			text: 'file.txt',
			linkActivationResult: { link: 'file.txt', source: 'search' }
		}]);
	});
});
