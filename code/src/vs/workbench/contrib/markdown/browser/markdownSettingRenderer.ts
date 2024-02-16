/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IPreferencesService, ISetting, ISettingsGroup } from 'vs/workbench/services/preferences/common/preferences';
import { settingKeyToDisplayFormat } from 'vs/workbench/contrib/preferences/browser/settingsTreeModels';
import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { DefaultSettings } from 'vs/workbench/services/preferences/common/preferencesModels';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ActionViewItem } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { IAction } from 'vs/base/common/actions';

const codeSettingRegex = /^<span (codesetting|codefeature)="([^\s"\:]+)(?::([^\s"]+))?">/;

export class SimpleSettingRenderer {
	private _defaultSettings: DefaultSettings;
	private _updatedSettings = new Map<string, any>(); // setting ID to user's original setting value
	private _encounteredSettings = new Map<string, ISetting>(); // setting ID to setting
	private _featuredSettings = new Map<string, any>(); // setting ID to feature value

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IPreferencesService private readonly _preferencesService: IPreferencesService
	) {
		this._defaultSettings = new DefaultSettings([], ConfigurationTarget.USER);
	}

	get featuredSettingStates(): Map<string, boolean> {
		const result = new Map<string, boolean>();
		for (const [settingId, value] of this._featuredSettings) {
			result.set(settingId, this._configurationService.getValue(settingId) === value);
		}
		return result;
	}

	getHtmlRenderer(): (html: string) => string {
		return (html): string => {
			const match = codeSettingRegex.exec(html);
			if (match && match.length === 4) {
				const settingId = match[2];
				const rendered = this.render(settingId, match[3], match[1] === 'codefeature');
				if (rendered) {
					html = html.replace(codeSettingRegex, rendered);
				}
			}
			return html;
		};
	}

	settingToUriString(settingId: string, value?: any): string {
		return `${Schemas.codeSetting}://${settingId}${value ? `/${value}` : ''}`;
	}

	featureToUriString(settingId: string, value?: any): string {
		return `${Schemas.codeFeature}://${settingId}${value ? `/${value}` : ''}`;
	}

	private settingsGroups: ISettingsGroup[] | undefined = undefined;
	private getSetting(settingId: string): ISetting | undefined {
		if (!this.settingsGroups) {
			this.settingsGroups = this._defaultSettings.getSettingsGroups();
		}
		if (this._encounteredSettings.has(settingId)) {
			return this._encounteredSettings.get(settingId);
		}
		for (const group of this.settingsGroups) {
			for (const section of group.sections) {
				for (const setting of section.settings) {
					if (setting.key === settingId) {
						this._encounteredSettings.set(settingId, setting);
						return setting;
					}
				}
			}
		}
		return undefined;
	}

	parseValue(settingId: string, value: string): any {
		if (value === 'undefined' || value === '') {
			return undefined;
		}
		const setting = this.getSetting(settingId);
		if (!setting) {
			return value;
		}

		switch (setting.type) {
			case 'boolean':
				return value === 'true';
			case 'number':
				return parseInt(value, 10);
			case 'string':
			default:
				return value;
		}
	}

	private render(settingId: string, newValue: string, asFeature: boolean): string | undefined {
		const setting = this.getSetting(settingId);
		if (!setting) {
			return '';
		}
		if (asFeature) {
			return this.renderFeature(setting, newValue);
		} else {
			return this.renderSetting(setting, newValue);
		}
	}

	private viewInSettingsMessage(settingId: string, alreadyDisplayed: boolean) {
		if (alreadyDisplayed) {
			return nls.localize('viewInSettings', "View in Settings");
		} else {
			const displayName = settingKeyToDisplayFormat(settingId);
			return nls.localize('viewInSettingsDetailed', "View \"{0}: {1}\" in Settings", displayName.category, displayName.label);
		}
	}

	private restorePreviousSettingMessage(settingId: string): string {
		const displayName = settingKeyToDisplayFormat(settingId);
		return nls.localize('restorePreviousValue', "Restore value of \"{0}: {1}\"", displayName.category, displayName.label);
	}

	private booleanSettingMessage(setting: ISetting, booleanValue: boolean): string | undefined {
		const currentValue = this._configurationService.getValue<boolean>(setting.key);
		if (currentValue === booleanValue || (currentValue === undefined && setting.value === booleanValue)) {
			return undefined;
		}

		const displayName = settingKeyToDisplayFormat(setting.key);
		if (booleanValue) {
			return nls.localize('trueMessage', "Enable \"{0}: {1}\"", displayName.category, displayName.label);
		} else {
			return nls.localize('falseMessage', "Disable \"{0}: {1}\"", displayName.category, displayName.label);
		}
	}

	private stringSettingMessage(setting: ISetting, stringValue: string): string | undefined {
		const currentValue = this._configurationService.getValue<string>(setting.key);
		if (currentValue === stringValue || (currentValue === undefined && setting.value === stringValue)) {
			return undefined;
		}

		const displayName = settingKeyToDisplayFormat(setting.key);
		return nls.localize('stringValue', "Set \"{0}: {1}\" to \"{2}\"", displayName.category, displayName.label, stringValue);
	}

	private numberSettingMessage(setting: ISetting, numberValue: number): string | undefined {
		const currentValue = this._configurationService.getValue<number>(setting.key);
		if (currentValue === numberValue || (currentValue === undefined && setting.value === numberValue)) {
			return undefined;
		}

		const displayName = settingKeyToDisplayFormat(setting.key);
		return nls.localize('numberValue', "Set \"{0}: {1}\" to {2}", displayName.category, displayName.label, numberValue);

	}

	private renderSetting(setting: ISetting, newValue: string | undefined): string | undefined {
		const href = this.settingToUriString(setting.key, newValue);
		const title = nls.localize('changeSettingTitle', "Try feature");
		return `<span><a href="${href}" class="codesetting" title="${title}" aria-role="button"><svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M9.1 4.4L8.6 2H7.4l-.5 2.4-.7.3-2-1.3-.9.8 1.3 2-.2.7-2.4.5v1.2l2.4.5.3.8-1.3 2 .8.8 2-1.3.8.3.4 2.3h1.2l.5-2.4.8-.3 2 1.3.8-.8-1.3-2 .3-.8 2.3-.4V7.4l-2.4-.5-.3-.8 1.3-2-.8-.8-2 1.3-.7-.2zM9.4 1l.5 2.4L12 2.1l2 2-1.4 2.1 2.4.4v2.8l-2.4.5L14 12l-2 2-2.1-1.4-.5 2.4H6.6l-.5-2.4L4 13.9l-2-2 1.4-2.1L1 9.4V6.6l2.4-.5L2.1 4l2-2 2.1 1.4.4-2.4h2.8zm.6 7c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zM8 9c.6 0 1-.4 1-1s-.4-1-1-1-1 .4-1 1 .4 1 1 1z"/></svg></a>`;
	}

	private renderFeature(setting: ISetting, newValue: string): string | undefined {
		const href = this.featureToUriString(setting.key, newValue);
		const parsedValue = this.parseValue(setting.key, newValue);
		const isChecked = this._configurationService.getValue(setting.key) === parsedValue;
		this._featuredSettings.set(setting.key, parsedValue);
		const title = nls.localize('changeFeatureTitle', "Toggle feature with setting {0}", setting.key);
		return `<span><div class="codefeature-container"><input id="${setting.key}" class="hiddenCheck" type="checkbox" ${isChecked ? 'checked' : ''}><span class="codefeature"><a href="${href}" class="toggle" title="${title}" role="checkbox" aria-checked="${isChecked ? 'true' : 'false'}"></a></span><span class="title"></span></div>`;
	}

	private getSettingMessage(setting: ISetting, newValue: boolean | string | number): string | undefined {
		if (setting.type === 'boolean') {
			return this.booleanSettingMessage(setting, newValue as boolean);
		} else if (setting.type === 'string') {
			return this.stringSettingMessage(setting, newValue as string);
		} else if (setting.type === 'number') {
			return this.numberSettingMessage(setting, newValue as number);
		}
		return undefined;
	}

	async restoreSetting(settingId: string): Promise<void> {
		const userOriginalSettingValue = this._updatedSettings.get(settingId);
		this._updatedSettings.delete(settingId);
		return this._configurationService.updateValue(settingId, userOriginalSettingValue, ConfigurationTarget.USER);
	}

	async setSetting(settingId: string, currentSettingValue: any, newSettingValue: any): Promise<void> {
		this._updatedSettings.set(settingId, currentSettingValue);
		return this._configurationService.updateValue(settingId, newSettingValue, ConfigurationTarget.USER);
	}

	getActions(uri: URI) {
		if (uri.scheme !== Schemas.codeSetting) {
			return;
		}

		const actions: IAction[] = [];

		const settingId = uri.authority;
		const newSettingValue = this.parseValue(uri.authority, uri.path.substring(1));
		const currentSettingValue = this._configurationService.inspect(settingId).userValue;

		if ((newSettingValue !== undefined) && newSettingValue === currentSettingValue && this._updatedSettings.has(settingId)) {
			const restoreMessage = this.restorePreviousSettingMessage(settingId);
			actions.push({
				class: undefined,
				id: 'restoreSetting',
				enabled: true,
				tooltip: restoreMessage,
				label: restoreMessage,
				run: () => {
					return this.restoreSetting(settingId);
				}
			});
		} else if (newSettingValue !== undefined) {
			const setting = this.getSetting(settingId);
			const trySettingMessage = setting ? this.getSettingMessage(setting, newSettingValue) : undefined;

			if (setting && trySettingMessage) {
				actions.push({
					class: undefined,
					id: 'trySetting',
					enabled: currentSettingValue !== newSettingValue,
					tooltip: trySettingMessage,
					label: trySettingMessage,
					run: () => {
						this.setSetting(settingId, currentSettingValue, newSettingValue);
					}
				});
			}
		}

		const viewInSettingsMessage = this.viewInSettingsMessage(settingId, actions.length > 0);
		actions.push({
			class: undefined,
			enabled: true,
			id: 'viewInSettings',
			tooltip: viewInSettingsMessage,
			label: viewInSettingsMessage,
			run: () => {
				return this._preferencesService.openApplicationSettings({ query: `@id:${settingId}` });
			}
		});

		return actions;
	}

	private showContextMenu(uri: URI, x: number, y: number) {
		const actions = this.getActions(uri);
		if (!actions) {
			return;
		}

		this._contextMenuService.showContextMenu({
			getAnchor: () => ({ x, y }),
			getActions: () => actions,
			getActionViewItem: (action) => {
				return new ActionViewItem(action, action, { label: true });
			},
		});
	}

	private async setFeatureState(uri: URI) {
		const settingId = uri.authority;
		const newSettingValue = this.parseValue(uri.authority, uri.path.substring(1));
		let valueToSetSetting: any;
		if (this._updatedSettings.has(settingId)) {
			valueToSetSetting = this._updatedSettings.get(settingId);
			this._updatedSettings.delete(settingId);
		} else if (newSettingValue !== this._configurationService.getValue(settingId)) {
			valueToSetSetting = newSettingValue;
		} else {
			valueToSetSetting = undefined;
		}
		await this._configurationService.updateValue(settingId, valueToSetSetting, ConfigurationTarget.USER);
	}

	async updateSetting(uri: URI, x: number, y: number) {
		if (uri.scheme === Schemas.codeSetting) {
			return this.showContextMenu(uri, x, y);
		} else if (uri.scheme === Schemas.codeFeature) {
			return this.setFeatureState(uri);
		}
	}
}
