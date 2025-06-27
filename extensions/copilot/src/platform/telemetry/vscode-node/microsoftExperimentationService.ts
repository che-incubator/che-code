/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getExperimentationService, IExperimentationService, TargetPopulation } from 'vscode-tas-client';
import { BrandedService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { IEnvService } from '../../env/common/envService';
import { IVSCodeExtensionContext } from '../../extContext/common/extensionContext';
import { ITelemetryService } from '../common/telemetry';

function getTargetPopulation(isPreRelease: boolean): TargetPopulation {

	if (isPreRelease) {
		return TargetPopulation.Insiders;
	}

	return TargetPopulation.Public;
}


export function createExperimentationService(
	context: vscode.ExtensionContext,
	experimentationTelemetry: ITelemetryService,
	isPreRelease: boolean,
): IExperimentationService & BrandedService {
	const id = context.extension.id;
	const version = context.extension.packageJSON['version'];
	const targetPopulation = getTargetPopulation(isPreRelease);


	return getExperimentationService(
		id,
		version,
		targetPopulation,
		experimentationTelemetry,
		context.globalState,
	) as unknown as IExperimentationService & BrandedService;
}

export class MicrosoftExperimentationService implements IExperimentationService, BrandedService {

	declare _serviceBrand: undefined;
	private readonly _delegate: IExperimentationService;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IVSCodeExtensionContext context: IVSCodeExtensionContext,
		@IEnvService envService: IEnvService,
	) {
		const id = context.extension.id;
		const version = context.extension.packageJSON['version'];
		const targetPopulation = getTargetPopulation(envService.isPreRelease());

		this._delegate = getExperimentationService(
			id,
			version,
			targetPopulation,
			telemetryService,
			context.globalState,
		);
	}

	get initializePromise(): Promise<void> {
		return this._delegate.initializePromise;
	}

	get initialFetch(): Promise<void> {
		return this._delegate.initialFetch;
	}

	isFlightEnabled(flight: string): boolean {
		return this._delegate.isFlightEnabled(flight);
	}
	isCachedFlightEnabled(flight: string): Promise<boolean> {
		return this._delegate.isCachedFlightEnabled(flight);
	}
	isFlightEnabledAsync(flight: string): Promise<boolean> {
		return this._delegate.isFlightEnabledAsync(flight);
	}
	getTreatmentVariable<T extends boolean | number | string>(configId: string, name: string): T | undefined {
		return this._delegate.getTreatmentVariable(configId, name);
	}
	getTreatmentVariableAsync<T extends boolean | number | string>(configId: string, name: string, checkCache?: boolean): Promise<T | undefined> {
		return this._delegate.getTreatmentVariableAsync(configId, name, checkCache);
	}

}
