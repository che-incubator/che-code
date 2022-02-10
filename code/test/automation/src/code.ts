/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as os from 'os';
import * as cp from 'child_process';
import { IDriver, IDisposable, IElement, Thenable, ILocalizedStrings, ILocaleInfo } from './driver';
import { launch as launchElectron } from './electronDriver';
import { launch as launchPlaywright } from './playwrightDriver';
import { Logger, measureAndLog } from './logger';
import { copyExtension } from './extensions';
import * as treekill from 'tree-kill';

const repoPath = path.join(__dirname, '../../..');

export interface LaunchOptions {
	codePath?: string;
	workspacePath: string;
	userDataDir: string;
	extensionsPath: string;
	logger: Logger;
	verbose?: boolean;
	extraArgs?: string[];
	remote?: boolean;
	web?: boolean;
	headless?: boolean;
	browser?: 'chromium' | 'webkit' | 'firefox';
}

interface ICodeInstance {
	kill: () => Promise<void>;
}

const instances = new Set<ICodeInstance>();

function registerInstance(process: cp.ChildProcess, logger: Logger, type: string, kill: () => Promise<void>) {
	const instance = { kill };
	instances.add(instance);

	process.stdout?.on('data', data => logger.log(`[${type}] stdout: ${data}`));
	process.stderr?.on('data', error => logger.log(`[${type}] stderr: ${error}`));

	process.once('exit', (code, signal) => {
		logger.log(`[${type}] Process terminated (pid: ${process.pid}, code: ${code}, signal: ${signal})`);

		instances.delete(instance);
	});
}

async function teardown(signal?: number) {
	stopped = true;

	for (const instance of instances) {
		await instance.kill();
	}

	if (typeof signal === 'number') {
		process.exit(signal);
	}
}

let stopped = false;
process.on('exit', () => teardown());
process.on('SIGINT', () => teardown(128 + 2)); 	 // https://nodejs.org/docs/v14.16.0/api/process.html#process_signal_events
process.on('SIGTERM', () => teardown(128 + 15)); // same as above

export async function launch(options: LaunchOptions): Promise<Code> {
	if (stopped) {
		throw new Error('Smoke test process has terminated, refusing to spawn Code');
	}

	await measureAndLog(copyExtension(repoPath, options.extensionsPath, 'vscode-notebook-tests'), 'copyExtension(vscode-notebook-tests)', options.logger);

	// Browser smoke tests
	if (options.web) {
		const { serverProcess, client, driver, kill } = await measureAndLog(launchPlaywright(options), 'launch playwright', options.logger);
		registerInstance(serverProcess, options.logger, 'server', kill);

		return new Code(client, driver, options.logger, serverProcess);
	}

	// Electron smoke tests
	else {
		const { electronProcess, client, driver, kill } = await measureAndLog(launchElectron(options), 'launch electron', options.logger);
		registerInstance(electronProcess, options.logger, 'electron', kill);

		return new Code(client, driver, options.logger, electronProcess);
	}
}

async function poll<T>(
	fn: () => Thenable<T>,
	acceptFn: (result: T) => boolean,
	logger: Logger,
	timeoutMessage: string,
	retryCount = 200,
	retryInterval = 100 // millis
): Promise<T> {
	let trial = 1;
	let lastError: string = '';

	while (true) {
		if (trial > retryCount) {
			logger.log('Timeout!');
			logger.log(lastError);
			logger.log(`Timeout: ${timeoutMessage} after ${(retryCount * retryInterval) / 1000} seconds.`);
			throw new Error(`Timeout: ${timeoutMessage} after ${(retryCount * retryInterval) / 1000} seconds.`);
		}

		let result;
		try {
			result = await fn();
			if (acceptFn(result)) {
				return result;
			} else {
				lastError = 'Did not pass accept function';
			}
		} catch (e: any) {
			lastError = Array.isArray(e.stack) ? e.stack.join(os.EOL) : e.stack;
		}

		await new Promise(resolve => setTimeout(resolve, retryInterval));
		trial++;
	}
}

export class Code {

	private _activeWindowId: number | undefined = undefined;
	driver: IDriver;

	constructor(
		private client: IDisposable,
		driver: IDriver,
		readonly logger: Logger,
		private readonly mainProcess: cp.ChildProcess
	) {
		this.driver = new Proxy(driver, {
			get(target, prop) {
				if (typeof prop === 'symbol') {
					throw new Error('Invalid usage');
				}

				const targetProp = (target as any)[prop];
				if (typeof targetProp !== 'function') {
					return targetProp;
				}

				return function (this: any, ...args: any[]) {
					logger.log(`${prop}`, ...args.filter(a => typeof a === 'string'));
					return targetProp.apply(this, args);
				};
			}
		});
	}

	async capturePage(): Promise<string> {
		const windowId = await this.getActiveWindowId();
		return await this.driver.capturePage(windowId);
	}

	async startTracing(name: string): Promise<void> {
		const windowId = await this.getActiveWindowId();
		if (typeof this.driver.startTracing === 'function') { // added only in 1.64
			return await this.driver.startTracing(windowId, name);
		}
	}

	async stopTracing(name: string, persist: boolean): Promise<void> {
		const windowId = await this.getActiveWindowId();
		if (typeof this.driver.stopTracing === 'function') { // added only in 1.64
			return await this.driver.stopTracing(windowId, name, persist);
		}
	}

	async waitForWindowIds(accept: (windowIds: number[]) => boolean): Promise<void> {
		await poll(() => this.driver.getWindowIds(), accept, this.logger, `get window ids`);
	}

	async dispatchKeybinding(keybinding: string): Promise<void> {
		const windowId = await this.getActiveWindowId();
		await this.driver.dispatchKeybinding(windowId, keybinding);
	}

	async exit(): Promise<void> {
		return measureAndLog(new Promise<void>((resolve, reject) => {
			let done = false;

			// Start the exit flow via driver
			this.driver.exitApplication().then(veto => {
				if (veto) {
					done = true;
					reject(new Error('Smoke test exit call resulted in unexpected veto'));
				}
			});

			// Await the exit of the application
			(async () => {
				let retries = 0;
				while (!done) {
					retries++;

					if (retries === 20) {
						this.logger.log('Smoke test exit call did not terminate process after 10s, forcefully exiting the application...');

						// no need to await since we're polling for the process to die anyways
						treekill(this.mainProcess.pid, err => {
							this.logger.log('Failed to kill Electron process tree:', err?.message);
						});
					}

					if (retries === 40) {
						done = true;
						reject(new Error('Smoke test exit call did not terminate process after 20s, giving up'));
					}

					try {
						process.kill(this.mainProcess.pid, 0); // throws an exception if the process doesn't exist anymore.
						await new Promise(resolve => setTimeout(resolve, 500));
					} catch (error) {
						done = true;
						resolve();
					}
				}
			})();
		}).finally(() => {
			this.dispose();
		}), 'Code#exit()', this.logger);
	}

	async waitForTextContent(selector: string, textContent?: string, accept?: (result: string) => boolean, retryCount?: number): Promise<string> {
		const windowId = await this.getActiveWindowId();
		accept = accept || (result => textContent !== undefined ? textContent === result : !!result);

		return await poll(
			() => this.driver.getElements(windowId, selector).then(els => els.length > 0 ? Promise.resolve(els[0].textContent) : Promise.reject(new Error('Element not found for textContent'))),
			s => accept!(typeof s === 'string' ? s : ''),
			this.logger,
			`get text content '${selector}'`,
			retryCount
		);
	}

	async waitAndClick(selector: string, xoffset?: number, yoffset?: number, retryCount: number = 200): Promise<void> {
		const windowId = await this.getActiveWindowId();
		await poll(() => this.driver.click(windowId, selector, xoffset, yoffset), () => true, this.logger, `click '${selector}'`, retryCount);
	}

	async waitForSetValue(selector: string, value: string): Promise<void> {
		const windowId = await this.getActiveWindowId();
		await poll(() => this.driver.setValue(windowId, selector, value), () => true, this.logger, `set value '${selector}'`);
	}

	async waitForElements(selector: string, recursive: boolean, accept: (result: IElement[]) => boolean = result => result.length > 0): Promise<IElement[]> {
		const windowId = await this.getActiveWindowId();
		return await poll(() => this.driver.getElements(windowId, selector, recursive), accept, this.logger, `get elements '${selector}'`);
	}

	async waitForElement(selector: string, accept: (result: IElement | undefined) => boolean = result => !!result, retryCount: number = 200): Promise<IElement> {
		const windowId = await this.getActiveWindowId();
		return await poll<IElement>(() => this.driver.getElements(windowId, selector).then(els => els[0]), accept, this.logger, `get element '${selector}'`, retryCount);
	}

	async waitForActiveElement(selector: string, retryCount: number = 200): Promise<void> {
		const windowId = await this.getActiveWindowId();
		await poll(() => this.driver.isActiveElement(windowId, selector), r => r, this.logger, `is active element '${selector}'`, retryCount);
	}

	async waitForTitle(accept: (title: string) => boolean): Promise<void> {
		const windowId = await this.getActiveWindowId();
		await poll(() => this.driver.getTitle(windowId), accept, this.logger, `get title`);
	}

	async waitForTypeInEditor(selector: string, text: string): Promise<void> {
		const windowId = await this.getActiveWindowId();
		await poll(() => this.driver.typeInEditor(windowId, selector, text), () => true, this.logger, `type in editor '${selector}'`);
	}

	async waitForTerminalBuffer(selector: string, accept: (result: string[]) => boolean): Promise<void> {
		const windowId = await this.getActiveWindowId();
		await poll(() => this.driver.getTerminalBuffer(windowId, selector), accept, this.logger, `get terminal buffer '${selector}'`);
	}

	async writeInTerminal(selector: string, value: string): Promise<void> {
		const windowId = await this.getActiveWindowId();
		await poll(() => this.driver.writeInTerminal(windowId, selector, value), () => true, this.logger, `writeInTerminal '${selector}'`);
	}

	async getLocaleInfo(): Promise<ILocaleInfo> {
		const windowId = await this.getActiveWindowId();
		return this.driver.getLocaleInfo(windowId);
	}

	async getLocalizedStrings(): Promise<ILocalizedStrings> {
		const windowId = await this.getActiveWindowId();
		return this.driver.getLocalizedStrings(windowId);
	}

	private async getActiveWindowId(): Promise<number> {
		if (typeof this._activeWindowId !== 'number') {
			this.logger.log('getActiveWindowId(): begin');
			const windows = await this.driver.getWindowIds();
			this._activeWindowId = windows[0];
			this.logger.log(`getActiveWindowId(): end (windowId=${this._activeWindowId})`);
		}

		return this._activeWindowId;
	}

	dispose(): void {
		this.client.dispose();
	}
}

export function findElement(element: IElement, fn: (element: IElement) => boolean): IElement | null {
	const queue = [element];

	while (queue.length > 0) {
		const element = queue.shift()!;

		if (fn(element)) {
			return element;
		}

		queue.push(...element.children);
	}

	return null;
}

export function findElements(element: IElement, fn: (element: IElement) => boolean): IElement[] {
	const result: IElement[] = [];
	const queue = [element];

	while (queue.length > 0) {
		const element = queue.shift()!;

		if (fn(element)) {
			result.push(element);
		}

		queue.push(...element.children);
	}

	return result;
}
