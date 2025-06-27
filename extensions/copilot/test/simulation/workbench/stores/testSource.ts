/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SimulationStorageValue } from './simulationStorage';

export const enum TestSource {
	Local = 1,
	External = 2
}

export type TestSourceValue = SimulationStorageValue<TestSource>;
