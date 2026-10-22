/**********************************************************************
 * Copyright (c) 2024-2025 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import * as fs from '../src/fs-extra';
import { EditorConfigurations } from '../src/editor-configurations';

const REMOTE_SETTINGS_PATH = '/checode/remote/data/Machine/settings.json';
const WORKSPACE_FILE_PATH = '/projects/.code-workspace';
const WORKSPACE_FILE_CONTENT =
  '{\n' +
  '  "folders": [\n' +
  '    {\n' +
  '      "name": "code",\n' +
  '      "path": "/code"\n' +
  '    }\n' +
  '  ]\n' +
  '}\n';
const WORKSPACE_FILE_INCORRECT_CONTENT = '{//not valid JSON here}';
const SETTINGS_CONTENT =
  '{\n' +
  '  "window.header": "SOME MESSAGE",\n' +
  '  "workbench.colorCustomizations": {\n' +
  '    "titleBar.activeBackground": "#CCA700",\n' +
  '    "titleBar.activeForeground": "#151515"\n' +
  '  }\n' +
  '}\n';
const REMOTE_SETTINGS_FILE_CONTENT = '{\n' + '"window.commandCenter": false\n' + '}\n';
const SETTINGS_JSON = JSON.parse(SETTINGS_CONTENT);
const SETTINGS_TO_FILE = JSON.stringify(SETTINGS_JSON, null, '\t');
const CONFIGMAP_SETTINGS_DATA: Record<string, string> = {
  'settings.json': SETTINGS_CONTENT,
};

const WORKSPACE_FILE_EXTENSIONS_CONTENT =
  '{\n' +
  '  "recommendations": [\n' +
  '      "dbaeumer.vscode-eslint",\n' +
  '      "github.vscode-pull-request-github"\n' +
  '  ]\n' +
  '}\n';

// prettier-ignore
const CONFIGMAP_EXTENSIONS_CONTENT =
  '{\n' +
  '  "recommendations": [\n' +
  '      "redhat.vscode-yaml",\n' +
  '      "redhat.java"\n' +
  '  ]\n' +
  '}\n';

const MERGED_EXTENSIONS_CONTENT =
  '{\n' +
  '  "recommendations": [\n' +
  '      "redhat.vscode-yaml",\n' +
  '      "redhat.java",\n' +
  '      "dbaeumer.vscode-eslint",\n' +
  '      "github.vscode-pull-request-github"\n' +
  '  ]\n' +
  '}\n';
const WORKSPACE_EXTENSIONS_JSON = JSON.parse(WORKSPACE_FILE_EXTENSIONS_CONTENT);
const WORKSPACE_CONFIG_WITHOUT_EXTENSIONS_JSON = JSON.parse(WORKSPACE_FILE_CONTENT);
const CONFIGMAP_EXTENSIONS_JSON = JSON.parse(CONFIGMAP_EXTENSIONS_CONTENT);
const MERGED_EXTENSIONS_JSON = JSON.parse(MERGED_EXTENSIONS_CONTENT);
const CONFIGMAP_EXTENSIONS_DATA: Record<string, string> = {
  'extensions.json': CONFIGMAP_EXTENSIONS_CONTENT,
};

const CONFIGMAP_INCORRECT_DATA: Record<string, string> = {
  'extensions.json': '//some incorrect data',
  'settings.json': '//some incorrect data',
};

const EMPTY_RECOMMENDATIONS_CONTENT = '{\n' + '  "recommendations": []\n' + '}\n';
const EMPTY_RECOMMENDATIONS_DATA: Record<string, string> = {
  'extensions.json': EMPTY_RECOMMENDATIONS_CONTENT,
};

describe('Test applying editor configurations:', () => {
  const fileExistsMock = jest.fn();
  const writeFileMock = jest.fn();
  const readFileMock = jest.fn();

  Object.assign(fs, {
    fileExists: fileExistsMock,
    writeFile: writeFileMock,
    readFile: readFileMock,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should skip applying editor configs if there is no configmap data', async () => {
    await new EditorConfigurations().configure();

    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('should skip applying configs when incorrect data in configmap', async () => {
    fileExistsMock.mockResolvedValue(false);

    await new EditorConfigurations(WORKSPACE_FILE_PATH, CONFIGMAP_INCORRECT_DATA).configure();

    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('should apply settings from configmap data', async () => {
    fileExistsMock.mockResolvedValue(false);

    await new EditorConfigurations(undefined, CONFIGMAP_SETTINGS_DATA).configure();

    expect(writeFileMock).toBeCalledTimes(1);
    expect(writeFileMock).toBeCalledWith(REMOTE_SETTINGS_PATH, SETTINGS_TO_FILE);
  });

  it('should merge settings from configmap data with existing one', async () => {
    fileExistsMock.mockResolvedValue(true);
    readFileMock.mockResolvedValue(REMOTE_SETTINGS_FILE_CONTENT);
    const existingSettingsJson = JSON.parse(REMOTE_SETTINGS_FILE_CONTENT);
    const mergedSettings = { ...existingSettingsJson, ...SETTINGS_JSON };
    const mergedSettingsToFile = JSON.stringify(mergedSettings, null, '\t');

    await new EditorConfigurations(undefined, CONFIGMAP_SETTINGS_DATA).configure();

    expect(writeFileMock).toBeCalledTimes(1);
    expect(writeFileMock).toBeCalledWith(REMOTE_SETTINGS_PATH, mergedSettingsToFile);
  });

  it('should skip applying extensions when incorrect data in the workspace file', async () => {
    fileExistsMock.mockResolvedValue(true);
    readFileMock.mockResolvedValue(WORKSPACE_FILE_INCORRECT_CONTENT);

    await new EditorConfigurations(WORKSPACE_FILE_PATH, CONFIGMAP_EXTENSIONS_DATA).configure();

    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('should skip applying extensions when empty list of extensions in configmap data', async () => {
    fileExistsMock.mockResolvedValue(false);

    await new EditorConfigurations(WORKSPACE_FILE_PATH, EMPTY_RECOMMENDATIONS_DATA).configure();

    expect(fileExistsMock).not.toHaveBeenCalled();
    expect(readFileMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('should skip applying extensions when the workspace file is not found', async () => {
    fileExistsMock.mockResolvedValue(true);

    await new EditorConfigurations(undefined, CONFIGMAP_EXTENSIONS_DATA).configure();

    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('should apply extensions from configmap data when workspace file does not contain extensions', async () => {
    const workspaceConfigWithConfigMapExtensionsJson = {
      ...WORKSPACE_CONFIG_WITHOUT_EXTENSIONS_JSON,
      extensions: CONFIGMAP_EXTENSIONS_JSON,
    };
    const workspaceConfigWithExtensionsToFile = JSON.stringify(workspaceConfigWithConfigMapExtensionsJson, null, '\t');
    fileExistsMock.mockResolvedValue(true);
    readFileMock.mockResolvedValue(WORKSPACE_FILE_CONTENT);

    await new EditorConfigurations(WORKSPACE_FILE_PATH, CONFIGMAP_EXTENSIONS_DATA).configure();

    expect(writeFileMock).toBeCalledTimes(1);
    expect(writeFileMock).toBeCalledWith(WORKSPACE_FILE_PATH, workspaceConfigWithExtensionsToFile);
  });

  it('should merge extensions from configmap data and workspace file extensions', async () => {
    const workspaceConfigWithExtensionsJson = {
      ...WORKSPACE_CONFIG_WITHOUT_EXTENSIONS_JSON,
      extensions: WORKSPACE_EXTENSIONS_JSON,
    };
    const workspaceConfigWithMergedExtensionsJson = {
      ...WORKSPACE_CONFIG_WITHOUT_EXTENSIONS_JSON,
      extensions: MERGED_EXTENSIONS_JSON,
    };
    const workspaceConfigWithExtensionsToFile = JSON.stringify(workspaceConfigWithExtensionsJson, null, '\t');
    const workspaceConfigWithMergedExtensionsToFile = JSON.stringify(
      workspaceConfigWithMergedExtensionsJson,
      null,
      '\t'
    );
    fileExistsMock.mockResolvedValue(true);
    readFileMock.mockResolvedValue(workspaceConfigWithExtensionsToFile);

    await new EditorConfigurations(WORKSPACE_FILE_PATH, CONFIGMAP_EXTENSIONS_DATA).configure();

    expect(writeFileMock).toBeCalledTimes(1);
    expect(writeFileMock).toBeCalledWith(WORKSPACE_FILE_PATH, workspaceConfigWithMergedExtensionsToFile);
  });

  it('should merge product.json with provided configmap data', async () => {
    const existingProductJSON = `{
      "nameShort": "CheCode",
      "extensionEnabledApiProposals": {
        "vgulyy.console-writer": [
          "terminalDataWriteEvent",
          "terminalExecuteCommandEvent"
        ]
      },
      "extensionsGallery": {
        "serviceUrl": "https://openvsix.org/extensions/gallery",
        "itemUrl": "https://openvsix.org/extensions/items"
      },
      "apiVersion": 1
    }`;

    const configmapData: Record<string, string> = {
      'product.json': `{
        "extensionEnabledApiProposals": {
          "ms-python.python": [
            "contribEditorContentMenu",
            "quickPickSortByLabel"
          ],
          "vgulyy.console-writer": [
            "terminalCoolors",
            "terminalCharacters"
          ]
        },
        "extensionsGallery": {
          "serviceUrl": "https://marketplace/gallery",
          "itemUrl": "https://marketplace/items"
        },
        "trustedExtensionAuthAccess": [
          "thepublisher.say-hello"
        ],
        "apiVersion": 2
      }`,
    };

    const mergedProductJSON = `{
      "nameShort": "CheCode",
      "extensionEnabledApiProposals": {
        "vgulyy.console-writer": [
          "terminalDataWriteEvent",
          "terminalExecuteCommandEvent",
          "terminalCoolors",
          "terminalCharacters"
        ],
        "ms-python.python": [
          "contribEditorContentMenu",
          "quickPickSortByLabel"
        ]
      },
      "extensionsGallery": {
        "serviceUrl": "https://marketplace/gallery",
        "itemUrl": "https://marketplace/items"
      },
      "apiVersion": 2,
      "trustedExtensionAuthAccess": [
        "thepublisher.say-hello"
      ]
    }`;

    readFileMock.mockImplementation(async (path) => {
      if ('product.json' === path) {
        return existingProductJSON;
      }
    });

    await new EditorConfigurations(WORKSPACE_FILE_PATH, configmapData).configure();

    expect(writeFileMock).toBeCalledTimes(1);
    expect(writeFileMock).toHaveBeenCalledWith(
      'product.json',
      JSON.stringify(JSON.parse(mergedProductJSON), null, '\t')
    );
  });
});
