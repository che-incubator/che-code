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

import { TrustedExtensions } from '../src/trusted-extensions';

const PRODUCT_JSON_SIMPLE = `{
  "version": "1.0.0"
}`;

const PRODUCT_JSON_TWO_EXTENSIONS = `{
	"version": "1.0.0",
	"trustedExtensionAuthAccess": [
		"redhat.yaml",
		"redhat.openshift"
	]
}`;

const PRODUCT_JSON_THREE_EXTENSIONS = `{
	"version": "1.0.0",
	"trustedExtensionAuthAccess": [
		"redhat.yaml",
		"redhat.openshift",
		"devfile.vscode-devfile"
	]
}`;

const PRODUCT_JSON_WITH_EXTENSIONS_ALTERNATIVE = `{
	"version": "1.0.0",
	"trustedExtensionAuthAccess": {
		"github": [
			"redhat.yaml"
		],
		"gitlab": [
			"redhat.yaml",
			"redhat.openshift",
			"devfile.vscode-devfile"
		]
	}
}`;

const PRODUCT_JSON_WITH_FOUR_EXTENSIONS = `{
	"version": "1.0.0",
	"trustedExtensionAuthAccess": [
		"redhat.yaml",
		"redhat.openshift",
		"devfile.vscode-devfile",
		"redhat.vscode-xml"
	]
}`;

describe('Test Configuring of Trusted Extensions Auth Access:', () => {
  const originalReadFile = fs.readFile;
  const originalWriteFile = fs.writeFile;

  beforeEach(() => {
    delete env.TRUSTED_EXTENSIONS_AUTH_ACCESS;

    Object.assign(fs, {
      readFile: originalReadFile,
      writeFile: originalWriteFile,
    });
  });

  test('should skip if TRUSTED_EXTENSIONS is not set', async () => {
    const readFileMock = jest.fn();
    Object.assign(fs, {
      readFile: readFileMock,
      writeFile: jest.fn(),
    });

    const trust = new TrustedExtensions();
    await trust.configure();

    expect(readFileMock).toBeCalledTimes(0);
  });

  test('should add new trustedExtensionAuthAccess:array section', async () => {
    env.TRUSTED_EXTENSIONS = 'redhat.yaml,redhat.openshift';

    let savedProductJson;

    Object.assign(fs, {
      readFile: async (file: string) => {
        if ('product.json' === file) {
          return PRODUCT_JSON_SIMPLE;
        }
      },

      writeFile: async (file: string, data: string) => {
        if ('product.json' === file) {
          savedProductJson = data;
        }
      },
    });

    // test
    const trust = new TrustedExtensions();
    await trust.configure();

    expect(savedProductJson).toBe(PRODUCT_JSON_TWO_EXTENSIONS);
  });

  test('should add extensions to existing trustedExtensionAuthAccess:array section', async () => {
    env.TRUSTED_EXTENSIONS = 'devfile.vscode-devfile';

    let savedProductJson;

    Object.assign(fs, {
      readFile: async (file: string) => {
        if ('product.json' === file) {
          return PRODUCT_JSON_TWO_EXTENSIONS;
        }
      },

      writeFile: async (file: string, data: string) => {
        if ('product.json' === file) {
          savedProductJson = data;
        }
      },
    });

    // test
    const trust = new TrustedExtensions();
    await trust.configure();

    expect(savedProductJson).toBe(PRODUCT_JSON_THREE_EXTENSIONS);
  });

  test('should NOT add extensions to trustedExtensionAuthAccess:array section if extensions is already in the list', async () => {
    env.TRUSTED_EXTENSIONS = 'redhat.openshift';

    const writeFileMock = jest.fn();
    Object.assign(fs, {
      readFile: async (file: string) => {
        if ('product.json' === file) {
          return PRODUCT_JSON_TWO_EXTENSIONS;
        }
      },

      writeFile: writeFileMock
    });

    // test
    const trust = new TrustedExtensions();
    await trust.configure();

    expect(writeFileMock).not.toHaveBeenCalled();
  });

  test('should replace trustedExtensionAuthAccess object on array and add extensions', async () => {
    env.TRUSTED_EXTENSIONS = 'devfile.vscode-devfile,redhat.vscode-xml';

    let savedProductJson;

    Object.assign(fs, {
      readFile: async (file: string) => {
        if ('product.json' === file) {
          return PRODUCT_JSON_WITH_EXTENSIONS_ALTERNATIVE;
        }
      },

      writeFile: async (file: string, data: string) => {
        if ('product.json' === file) {
          savedProductJson = data;
        }
      },
    });

    // test
    const trust = new TrustedExtensions();
    await trust.configure();

    expect(savedProductJson).toBe(PRODUCT_JSON_WITH_FOUR_EXTENSIONS);
  });

});
