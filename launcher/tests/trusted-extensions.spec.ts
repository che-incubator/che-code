/**********************************************************************
 * Copyright (c) 2024 Red Hat, Inc.
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
			"redhat.openshift"
		]
	}
}`;
const PRODUCT_JSON_TWO_EXTENSIONS_UPPERCASE = `{
	"version": "1.0.0",
	"trustedExtensionAuthAccess": [
		"RedHat.Yaml",
		"RedHat.OpenShift"
	]
}`;

describe('Test Configuring of Trusted Extensions Auth Access:', () => {
  const originalReadFile = fs.readFile;
  const originalWriteFile = fs.writeFile;
  const originalConsoleLog = console.log;

  beforeEach(() => {
    delete env.VSCODE_TRUSTED_EXTENSIONS;

    Object.assign(fs, {
      readFile: originalReadFile,
      writeFile: originalWriteFile,
    });

    Object.assign(console, {
      log: originalConsoleLog,
    });
  });

  test('should skip if VSCODE_TRUSTED_EXTENSIONS is not set', async () => {
    const readFileMock = jest.fn();
    Object.assign(fs, {
      readFile: readFileMock,
      writeFile: jest.fn(),
    });

    const trust = new TrustedExtensions();
    await trust.configure();

    expect(readFileMock).not.toHaveBeenCalled();
  });

  test('should skip if VSCODE_TRUSTED_EXTENSIONS is empty', async () => {
    env.VSCODE_TRUSTED_EXTENSIONS = '';

    const readFileMock = jest.fn();
    Object.assign(fs, {
      readFile: readFileMock,
      writeFile: jest.fn(),
    });

    const trust = new TrustedExtensions();
    await trust.configure();

    expect(readFileMock).not.toHaveBeenCalled();
  });

  test('should skip if VSCODE_TRUSTED_EXTENSIONS has wrong value', async () => {
    env.VSCODE_TRUSTED_EXTENSIONS = ',,,';

    const readFileMock = jest.fn();
    Object.assign(fs, {
      readFile: readFileMock,
      writeFile: jest.fn(),
    });

    const spy = jest.spyOn(console, 'log');

    const trust = new TrustedExtensions();
    await trust.configure();

    expect(readFileMock).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith('# Configuring Trusted Extensions...');
    expect(spy).toHaveBeenCalledWith('  > env.VSCODE_TRUSTED_EXTENSIONS is set to [,,,]');
    expect(spy).toHaveBeenCalledWith(
      '  > ERROR: The variable provided most likely has wrong format. It should specify one or more extensions separated by comma.'
    );
  });

  test('should add new trustedExtensionAuthAccess section', async () => {
    env.VSCODE_TRUSTED_EXTENSIONS = ',,redhat.yaml,redhat.openshift';

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

  test('should add extensions to existing trustedExtensionAuthAccess section', async () => {
    env.VSCODE_TRUSTED_EXTENSIONS = 'devfile.vscode-devfile,,';

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

  test('should NOT add extensions to trustedExtensionAuthAccess section if extensions is already in the list', async () => {
    env.VSCODE_TRUSTED_EXTENSIONS = 'redhat.openshift';

    const writeFileMock = jest.fn();
    Object.assign(fs, {
      readFile: async (file: string) => {
        if ('product.json' === file) {
          return PRODUCT_JSON_TWO_EXTENSIONS;
        }
      },

      writeFile: writeFileMock,
    });

    // test
    const trust = new TrustedExtensions();
    await trust.configure();

    expect(writeFileMock).not.toHaveBeenCalled();
  });

  test('should do nothing if trustedExtensionAuthAccess is object', async () => {
    env.VSCODE_TRUSTED_EXTENSIONS = 'devfile.vscode-devfile,redhat.vscode-xml';

    const writeFileMock = jest.fn();
    Object.assign(fs, {
      readFile: async (file: string) => {
        if ('product.json' === file) {
          return PRODUCT_JSON_WITH_EXTENSIONS_ALTERNATIVE;
        }
      },

      writeFile: writeFileMock,
    });

    // test
    const trust = new TrustedExtensions();
    await trust.configure();

    expect(writeFileMock).not.toHaveBeenCalled();
  });

  test('should add only two extenions matching the regexp', async () => {
    env.VSCODE_TRUSTED_EXTENSIONS = 'redhat.yaml,redhat.openshift,red hat.java';

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

  test('should add only two extenions matching the regexp without case-sensitivity', async () => {
    env.VSCODE_TRUSTED_EXTENSIONS = 'RedHat.Yaml,RedHat.OpenShift,red hat.java';

    let savedProductJson;

    Object.assign(fs, {
      readFile: async (file: string) => {
        if ('product.json' === file) {
          return PRODUCT_JSON_TWO_EXTENSIONS_UPPERCASE;
        }
      },

      writeFile: async (file: string, data: string) => {
        if ('product.json' === file) {
          savedProductJson = data;
        }
      },
    });

    const spy = jest.spyOn(console, 'log');

    // test
    const trust = new TrustedExtensions();
    await trust.configure();

    expect(savedProductJson).toBe(PRODUCT_JSON_TWO_EXTENSIONS);

    expect(spy).toHaveBeenCalledWith('# Configuring Trusted Extensions...');
    expect(spy).toHaveBeenCalledWith(
      '  > env.VSCODE_TRUSTED_EXTENSIONS is set to [redhat.yaml,redhat.openshift,red hat.java]'
    );
    expect(spy).toHaveBeenCalledWith('  > add redhat.yaml');
    expect(spy).toHaveBeenCalledWith('  > add redhat.openshift');
    expect(spy).toHaveBeenCalledWith('  > failure to add [red hat.java] because of wrong identifier');
  });
});
