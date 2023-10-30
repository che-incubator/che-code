/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { BrowserAuxiliaryWindowService, IAuxiliaryWindowService, AuxiliaryWindow as BaseAuxiliaryWindow } from 'vs/workbench/services/auxiliaryWindow/browser/auxiliaryWindowService';
import { getGlobals } from 'vs/base/parts/sandbox/electron-sandbox/globals';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWindowsConfiguration } from 'vs/platform/window/common/window';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { INativeHostService } from 'vs/platform/native/common/native';
import { DeferredPromise } from 'vs/base/common/async';

type AuxiliaryWindow = BaseAuxiliaryWindow & {
	moveTop: () => void;
};

export function isAuxiliaryWindow(obj: unknown): obj is AuxiliaryWindow {
	const candidate = obj as AuxiliaryWindow | undefined;

	return typeof candidate?.moveTop === 'function';
}

export class NativeAuxiliaryWindowService extends BrowserAuxiliaryWindowService {

	constructor(
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INativeHostService private readonly nativeHostService: INativeHostService
	) {
		super(layoutService);
	}

	protected override create(auxiliaryWindow: AuxiliaryWindow, disposables: DisposableStore) {

		// Zoom level
		const windowConfig = this.configurationService.getValue<IWindowsConfiguration>();
		const windowZoomLevel = typeof windowConfig.window?.zoomLevel === 'number' ? windowConfig.window.zoomLevel : 0;
		getGlobals(auxiliaryWindow)?.webFrame?.setZoomLevel(windowZoomLevel);

		return super.create(auxiliaryWindow, disposables);
	}

	protected override patchMethods(auxiliaryWindow: AuxiliaryWindow): void {
		super.patchMethods(auxiliaryWindow);

		// Obtain window identifier
		const windowId = new DeferredPromise<number>();
		(async () => {
			windowId.complete(await getGlobals(auxiliaryWindow)?.ipcRenderer.invoke('vscode:getWindowId'));
		})();

		// Enable `window.focus()` to work in Electron by
		// asking the main process to focus the window.
		const that = this;
		const originalWindowFocus = auxiliaryWindow.focus.bind(auxiliaryWindow);
		auxiliaryWindow.focus = async function () {
			originalWindowFocus();

			await that.nativeHostService.focusWindow({ targetWindowId: await windowId.p });
		};

		// Add a method to move window to the top
		Object.defineProperty(auxiliaryWindow, 'moveTop', {
			value: async () => {
				await that.nativeHostService.moveWindowTop({ targetWindowId: await windowId.p });
			},
			writable: false,
			enumerable: false,
			configurable: false
		});
	}
}

registerSingleton(IAuxiliaryWindowService, NativeAuxiliaryWindowService, InstantiationType.Delayed);
