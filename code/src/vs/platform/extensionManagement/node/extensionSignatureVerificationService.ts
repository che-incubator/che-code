/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getErrorMessage } from 'vs/base/common/errors';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export const IExtensionSignatureVerificationService = createDecorator<IExtensionSignatureVerificationService>('IExtensionSignatureVerificationService');

/**
 * A service for verifying signed extensions.
 */
export interface IExtensionSignatureVerificationService {
	readonly _serviceBrand: undefined;

	/**
	 * Verifies an extension file (.vsix) against a signature archive file.
	 * @param { string } vsixFilePath The extension file path.
	 * @param { string } signatureArchiveFilePath The signature archive file path.
	 * @param { boolean } verbose A flag indicating whether or not to capture verbose detail in the event of an error.
	 * @returns { Promise<boolean> } A promise with `true` if the extension is validly signed and trusted;
	 * otherwise, `false` because verification is not enabled (e.g.:  in the OSS version of VS Code).
	 * @throws { ExtensionSignatureVerificationError } An error with a code indicating the validity, integrity, or trust issue
	 * found during verification or a more fundamental issue (e.g.:  a required dependency was not found).
	 */
	verify(vsixFilePath: string, signatureArchiveFilePath: string, verbose: boolean): Promise<boolean>;
}

declare module vsceSign {
	export function verify(vsixFilePath: string, signatureArchiveFilePath: string, verbose: boolean): Promise<boolean>;
}

/**
 * An error raised during extension signature verification.
 */
export interface ExtensionSignatureVerificationError extends Error {
	readonly code: string;
	readonly didExecute: boolean;
	readonly output?: string;
}

export class ExtensionSignatureVerificationService implements IExtensionSignatureVerificationService {
	declare readonly _serviceBrand: undefined;

	private moduleLoadingPromise: Promise<typeof vsceSign> | undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) { }

	private vsceSign(): Promise<typeof vsceSign> {
		if (!this.moduleLoadingPromise) {
			this.moduleLoadingPromise = new Promise(
				(resolve, reject) => require(
					['@vscode/vsce-sign'],
					async (obj) => {
						const instance = <typeof vsceSign>obj;

						return resolve(instance);
					}, reject));
		}

		return this.moduleLoadingPromise;
	}

	public async verify(vsixFilePath: string, signatureArchiveFilePath: string, verbose: boolean): Promise<boolean> {
		let module: typeof vsceSign;

		try {
			module = await this.vsceSign();
		} catch (error) {
			this.logService.error('Could not load vsce-sign module', getErrorMessage(error));
			return false;
		}

		const startTime = new Date().getTime();
		let verified: boolean | undefined;
		let error: ExtensionSignatureVerificationError | undefined;

		try {
			verified = await module.verify(vsixFilePath, signatureArchiveFilePath, verbose);
			return verified;
		} catch (e) {
			error = e;
			throw e;
		} finally {
			const duration = new Date().getTime() - startTime;
			type ExtensionSignatureVerificationClassification = {
				owner: 'sandy081';
				comment: 'Extension signature verification event';
				duration: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; 'isMeasurement': true; comment: 'amount of time taken to verify the signature' };
				verified?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'verified status when succeeded' };
				error?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'error code when failed' };
			};
			type ExtensionSignatureVerificationEvent = {
				duration: number;
				verified?: boolean;
				error?: string;
			};
			this.telemetryService.publicLog2<ExtensionSignatureVerificationEvent, ExtensionSignatureVerificationClassification>('extensionsignature:verification', {
				duration,
				verified,
				error: error ? (error.code ?? 'unknown') : undefined,
			});
		}
	}
}
