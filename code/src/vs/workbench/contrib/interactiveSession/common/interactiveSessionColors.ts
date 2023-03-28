/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color, RGBA } from 'vs/base/common/color';
import { localize } from 'vs/nls';
import { registerColor } from 'vs/platform/theme/common/colorRegistry';


export const interactiveRequestBackground = registerColor(
	'interactive.requestBackground',
	{ dark: new Color(new RGBA(255, 255, 255, 0.03)), light: new Color(new RGBA(0, 0, 0, 0.03)), hcDark: null, hcLight: null, },
	localize('interactive.requestBackground', 'The background color of an interactive request.')
);

export const interactiveRequestBorder = registerColor(
	'interactive.requestBorder',
	{ dark: new Color(new RGBA(255, 255, 255, 0.10)), light: new Color(new RGBA(0, 0, 0, 0.10)), hcDark: null, hcLight: null, },
	localize('interactive.requestBorder', 'The border color of an interactive request.')
);
