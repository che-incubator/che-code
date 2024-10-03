/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import { env } from 'process';
import * as fs from '../src/fs-extra';
import * as path from 'path';
import { OpenVSIXRegistry } from '../src/openvsix-registry';

const ORIGINAL_PRODUCT_JSON = `{
	"extensionsGallery": {
		"serviceUrl": "https://open-vsx.org/vscode/gallery",
		"itemUrl": "https://open-vsx.org/vscode/item"
	}
}`;

const TEST_APPLY_OPENVSIX_REISTRY = `{
	"extensionsGallery": {
		"serviceUrl": "https://test-openvsx.org/vscode/gallery",
		"itemUrl": "https://test-openvsx.org/vscode/item"
	}
}`;

const TEST_APPLY_CHE_PLUGIN_REISTRY = `{
	"extensionsGallery": {
		"serviceUrl": "https://che-dogfooding.apps.che-dev.x6e0.p1.openshiftapps.com/plugin-registry/openvsx/vscode/gallery",
		"itemUrl": "https://che-dogfooding.apps.che-dev.x6e0.p1.openshiftapps.com/plugin-registry/openvsx/vscode/item"
	}
}`;

const originalReadFile = fs.readFile;
const originalWriteFile = fs.writeFile;

describe('Test Configuring of OpenVSIX registry:', () => {
  beforeEach(() => {
    delete env.OPENVSX_REGISTRY_URL;
    delete env.CHE_PLUGIN_REGISTRY_URL;

    Object.assign(fs, {
      readFile: originalReadFile,
      writeFile: originalWriteFile,
    });
  });

  test('should skip if OPENVSX_REGISTRY_URL is not set', async () => {
    const readFileMock = jest.fn();
    Object.assign(fs, {
      readFile: readFileMock,
      writeFile: jest.fn(),
    });

    const openVSIXRegistry = new OpenVSIXRegistry();
    await openVSIXRegistry.configure();

    expect(readFileMock).toBeCalledTimes(0);
  });

  test('should proceed with OPENVSX_REGISTRY_URL', async () => {
    // adding tailing slash here
    // it must be cut when forming a registry URL
    env.OPENVSX_REGISTRY_URL = 'https://test-openvsx.org/';

    const fileWorkbench = await fs.readFile(path.resolve(__dirname, '_data', 'workbench.js'));

    const fileWorkbenchExpected = await fs.readFile(
      path.resolve(__dirname, '_data', 'workbench.test-openvsix-registry.js')
    );

    let savedProductJson;
    let savedWorkbench;

    Object.assign(fs, {
      readFile: async (file: string) => {
        if ('product.json' === file) {
          return ORIGINAL_PRODUCT_JSON;
        } else if ('out/vs/code/browser/workbench/workbench.js' === file) {
          return fileWorkbench;
        }
      },

      writeFile: async (file: string, data: string) => {
        if ('product.json' === file) {
          savedProductJson = data;
        } else if ('out/vs/code/browser/workbench/workbench.js' === file) {
          savedWorkbench = data;
        }
      },
    });

    // test
    const openVSIXRegistry = new OpenVSIXRegistry();
    await openVSIXRegistry.configure();

    expect(savedProductJson).toBe(TEST_APPLY_OPENVSIX_REISTRY);
    expect(savedWorkbench).toBe(fileWorkbenchExpected);
  });

  test('should proceed with CHE_PLUGIN_REGISTRY_URL if OPENVSX_REGISTRY_URL is empty', async () => {
    env.OPENVSX_REGISTRY_URL = '';
    // adding tailing slash here
    // it must be cut when forming a registry URL
    env.CHE_PLUGIN_REGISTRY_URL = 'https://che-dogfooding.apps.che-dev.x6e0.p1.openshiftapps.com/plugin-registry/v3/';

    const fileWorkbench = await fs.readFile(path.resolve(__dirname, '_data', 'workbench.js'));

    const fileWorkbenchExpected = await fs.readFile(
      path.resolve(__dirname, '_data', 'workbench.test-che-plugin-registry.js')
    );

    let savedProductJson;
    let savedWorkbench;

    Object.assign(fs, {
      readFile: async (file: string) => {
        if ('product.json' === file) {
          return ORIGINAL_PRODUCT_JSON;
        } else if ('out/vs/code/browser/workbench/workbench.js' === file) {
          return fileWorkbench;
        }
      },

      writeFile: async (file: string, data: string) => {
        if ('product.json' === file) {
          savedProductJson = data;
        } else if ('out/vs/code/browser/workbench/workbench.js' === file) {
          savedWorkbench = data;
        }
      },
    });

    // test
    const openVSIXRegistry = new OpenVSIXRegistry();
    await openVSIXRegistry.configure();

    expect(savedProductJson).toBe(TEST_APPLY_CHE_PLUGIN_REISTRY);
    expect(savedWorkbench).toBe(fileWorkbenchExpected);
  });

  test('should skip if OPENVSX_REGISTRY_URL is empty but CHE_PLUGIN_REGISTRY_URL is not set', async () => {
    env.OPENVSX_REGISTRY_URL = '';

    const readFileMock = jest.fn();
    Object.assign(fs, {
      readFile: readFileMock,
      writeFile: jest.fn(),
    });

    // test
    const openVSIXRegistry = new OpenVSIXRegistry();
    await openVSIXRegistry.configure();

    expect(readFileMock).toBeCalledTimes(0);
  });
});
