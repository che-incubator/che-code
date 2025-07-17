/**********************************************************************
 * Copyright (c) 2024-2025 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import { CoreV1Api, KubeConfig, V1ConfigMap } from '@kubernetes/client-node';
import { IncomingMessage } from 'http';
import { env } from 'process';
import * as fs from '../src/fs-extra';
import { EditorConfigurations } from '../src/editor-configurations';

const DEVWORKSPACE_NAMESPACE = 'test-namespace';
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
const CONFIGMAP_SETTINGS_DATA = {
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
const CONFIGMAP_EXTENSIOSN_DATA = {
  'extensions.json': CONFIGMAP_EXTENSIONS_CONTENT,
};

const CONFIGMAP_INCORRECT_DATA = {
  'extensions.json': '//some incorrect data',
  'settings.json': '//some incorrect data',
};

const EMPTY_RECOMMENDATIONS_CONTENT = '{\n' + '  "recommendations": []\n' + '}\n';
const EMPTY_RECOMMENDATIONS_DATA = {
  'extensions.json': EMPTY_RECOMMENDATIONS_CONTENT,
};

jest.mock('@kubernetes/client-node', () => {
  const actual = jest.requireActual('@kubernetes/client-node');
  return {
    ...actual,
    KubeConfig: jest.fn().mockImplementation(() => {
      return {
        loadFromCluster: jest.fn(),
        makeApiClient: jest.fn(),
      };
    }),
    CoreV1Api: jest.fn(),
  };
});

describe('Test applying editor configurations:', () => {
  const fileExistsMock = jest.fn();
  const writeFileMock = jest.fn();
  const readFileMock = jest.fn();

  Object.assign(fs, {
    fileExists: fileExistsMock,
    writeFile: writeFileMock,
    readFile: readFileMock,
  });

  let mockCoreV1Api: jest.Mocked<CoreV1Api>;
  let mockMakeApiClient: jest.Mock;

  beforeEach(() => {
    delete env.DEVWORKSPACE_NAMESPACE;
    jest.clearAllMocks();

    mockCoreV1Api = {
      readNamespacedConfigMap: jest.fn(),
    } as unknown as jest.Mocked<CoreV1Api>;

    mockMakeApiClient = jest.fn().mockReturnValue(mockCoreV1Api);

    (KubeConfig as jest.Mock).mockImplementation(() => ({
      loadFromCluster: jest.fn(),
      makeApiClient: mockMakeApiClient,
    }));
  });

  it('should skip applying editor configs if there is no DEVWORKSPACE_NAMESPACE', async () => {
    await new EditorConfigurations().configure();

    expect(mockMakeApiClient).not.toHaveBeenCalled();
    expect(mockCoreV1Api.readNamespacedConfigMap).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('should skip applying configs when request for a configmap is failed', async () => {
    env.DEVWORKSPACE_NAMESPACE = DEVWORKSPACE_NAMESPACE;
    const mockError = new Error('Request failed');
    mockCoreV1Api.readNamespacedConfigMap.mockRejectedValue(mockError);

    await new EditorConfigurations(WORKSPACE_FILE_PATH).configure();

    expect(mockMakeApiClient).toHaveBeenCalledWith(CoreV1Api);
    expect(mockCoreV1Api.readNamespacedConfigMap).toHaveBeenCalledWith(
      'vscode-editor-configurations',
      DEVWORKSPACE_NAMESPACE
    );

    expect(fileExistsMock).not.toHaveBeenCalled(); // no sense to read files if we have no configmap content
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('should skip applying configs when incorrect data in a configmap', async () => {
    env.DEVWORKSPACE_NAMESPACE = DEVWORKSPACE_NAMESPACE;
    const mockResponse = {
      response: {} as IncomingMessage,
      body: { data: CONFIGMAP_INCORRECT_DATA } as V1ConfigMap,
    };
    mockCoreV1Api.readNamespacedConfigMap.mockResolvedValue(mockResponse);
    fileExistsMock.mockResolvedValue(false);

    await new EditorConfigurations(WORKSPACE_FILE_PATH).configure();

    expect(mockMakeApiClient).toHaveBeenCalledWith(CoreV1Api);
    expect(mockCoreV1Api.readNamespacedConfigMap).toHaveBeenCalledWith(
      'vscode-editor-configurations',
      DEVWORKSPACE_NAMESPACE
    );
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('should apply settings from a configmap', async () => {
    env.DEVWORKSPACE_NAMESPACE = DEVWORKSPACE_NAMESPACE;
    const mockResponse = {
      response: {} as IncomingMessage,
      body: { data: CONFIGMAP_SETTINGS_DATA } as V1ConfigMap,
    };
    mockCoreV1Api.readNamespacedConfigMap.mockResolvedValue(mockResponse);
    fileExistsMock.mockResolvedValue(false);

    await new EditorConfigurations().configure();

    expect(mockMakeApiClient).toHaveBeenCalledWith(CoreV1Api);
    expect(mockCoreV1Api.readNamespacedConfigMap).toHaveBeenCalledWith(
      'vscode-editor-configurations',
      DEVWORKSPACE_NAMESPACE
    );
    expect(writeFileMock).toBeCalledTimes(1); // only settings were applied
    expect(writeFileMock).toBeCalledWith(REMOTE_SETTINGS_PATH, SETTINGS_TO_FILE);
  });

  it('should merge settings from a configmap with existing one', async () => {
    env.DEVWORKSPACE_NAMESPACE = DEVWORKSPACE_NAMESPACE;
    const mockResponse = {
      response: {} as IncomingMessage,
      body: { data: CONFIGMAP_SETTINGS_DATA } as V1ConfigMap,
    };
    mockCoreV1Api.readNamespacedConfigMap.mockResolvedValue(mockResponse);
    fileExistsMock.mockResolvedValue(true);
    readFileMock.mockResolvedValue(REMOTE_SETTINGS_FILE_CONTENT);
    const existingSettingsJson = JSON.parse(REMOTE_SETTINGS_FILE_CONTENT);
    const mergedSettings = { ...existingSettingsJson, ...SETTINGS_JSON };
    const mergedSettingsToFile = JSON.stringify(mergedSettings, null, '\t');

    await new EditorConfigurations().configure();

    expect(mockMakeApiClient).toHaveBeenCalledWith(CoreV1Api);
    expect(mockCoreV1Api.readNamespacedConfigMap).toHaveBeenCalledWith(
      'vscode-editor-configurations',
      DEVWORKSPACE_NAMESPACE
    );
    expect(writeFileMock).toBeCalledTimes(1);
    expect(writeFileMock).toBeCalledWith(REMOTE_SETTINGS_PATH, mergedSettingsToFile);
  });

  it('should skip applying extensions when incorrect data in the workspace file', async () => {
    env.DEVWORKSPACE_NAMESPACE = DEVWORKSPACE_NAMESPACE;
    const mockResponse = {
      response: {} as IncomingMessage,
      body: { data: CONFIGMAP_EXTENSIOSN_DATA } as V1ConfigMap,
    };
    mockCoreV1Api.readNamespacedConfigMap.mockResolvedValue(mockResponse);
    fileExistsMock.mockResolvedValue(true);
    readFileMock.mockResolvedValue(WORKSPACE_FILE_INCORRECT_CONTENT);

    await new EditorConfigurations(WORKSPACE_FILE_PATH).configure();

    expect(mockMakeApiClient).toHaveBeenCalledWith(CoreV1Api);
    expect(mockCoreV1Api.readNamespacedConfigMap).toHaveBeenCalledWith(
      'vscode-editor-configurations',
      DEVWORKSPACE_NAMESPACE
    );
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('should skip applying extensions when empty list of extensions in a configmap', async () => {
    env.DEVWORKSPACE_NAMESPACE = DEVWORKSPACE_NAMESPACE;
    const mockResponse = {
      response: {} as IncomingMessage,
      body: { data: EMPTY_RECOMMENDATIONS_DATA } as V1ConfigMap,
    };
    mockCoreV1Api.readNamespacedConfigMap.mockResolvedValue(mockResponse);
    fileExistsMock.mockResolvedValue(false);

    await new EditorConfigurations(WORKSPACE_FILE_PATH).configure();

    expect(mockMakeApiClient).toHaveBeenCalledWith(CoreV1Api);
    expect(mockCoreV1Api.readNamespacedConfigMap).toHaveBeenCalledWith(
      'vscode-editor-configurations',
      DEVWORKSPACE_NAMESPACE
    );
    expect(fileExistsMock).not.toHaveBeenCalled();
    expect(readFileMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('should skip applying extensions when the workspace file is not found', async () => {
    env.DEVWORKSPACE_NAMESPACE = DEVWORKSPACE_NAMESPACE;
    const mockResponse = {
      response: {} as IncomingMessage,
      body: { data: CONFIGMAP_EXTENSIOSN_DATA } as V1ConfigMap,
    };
    mockCoreV1Api.readNamespacedConfigMap.mockResolvedValue(mockResponse);
    fileExistsMock.mockResolvedValue(true);

    await new EditorConfigurations().configure();

    expect(mockMakeApiClient).toHaveBeenCalledWith(CoreV1Api);
    expect(mockCoreV1Api.readNamespacedConfigMap).toHaveBeenCalledWith(
      'vscode-editor-configurations',
      DEVWORKSPACE_NAMESPACE
    );
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('should apply extensions from a configmap when workspace file does not contain extensions', async () => {
    env.DEVWORKSPACE_NAMESPACE = DEVWORKSPACE_NAMESPACE;
    const workspaceConfigWithConfigMapExtensionsJson = {
      ...WORKSPACE_CONFIG_WITHOUT_EXTENSIONS_JSON,
      extensions: CONFIGMAP_EXTENSIONS_JSON,
    };
    const workspaceConfigWithExtensionsToFile = JSON.stringify(workspaceConfigWithConfigMapExtensionsJson, null, '\t');
    const mockResponse = {
      response: {} as IncomingMessage,
      body: { data: CONFIGMAP_EXTENSIOSN_DATA } as V1ConfigMap,
    };
    mockCoreV1Api.readNamespacedConfigMap.mockResolvedValue(mockResponse);
    fileExistsMock.mockResolvedValue(true);
    readFileMock.mockResolvedValue(WORKSPACE_FILE_CONTENT);

    await new EditorConfigurations(WORKSPACE_FILE_PATH).configure();

    expect(mockMakeApiClient).toHaveBeenCalledWith(CoreV1Api);
    expect(mockCoreV1Api.readNamespacedConfigMap).toHaveBeenCalledWith(
      'vscode-editor-configurations',
      DEVWORKSPACE_NAMESPACE
    );
    expect(writeFileMock).toBeCalledTimes(1); // only extensions were applied
    expect(writeFileMock).toBeCalledWith(WORKSPACE_FILE_PATH, workspaceConfigWithExtensionsToFile);
  });

  it('should merge extensions from the configmap and workspace file extensions', async () => {
    env.DEVWORKSPACE_NAMESPACE = DEVWORKSPACE_NAMESPACE;
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
    const mockResponse = {
      response: {} as IncomingMessage,
      body: { data: CONFIGMAP_EXTENSIOSN_DATA } as V1ConfigMap,
    };
    mockCoreV1Api.readNamespacedConfigMap.mockResolvedValue(mockResponse);
    fileExistsMock.mockResolvedValue(true);
    readFileMock.mockResolvedValue(workspaceConfigWithExtensionsToFile);

    await new EditorConfigurations(WORKSPACE_FILE_PATH).configure();

    expect(mockMakeApiClient).toHaveBeenCalledWith(CoreV1Api);
    expect(mockCoreV1Api.readNamespacedConfigMap).toHaveBeenCalledWith(
      'vscode-editor-configurations',
      DEVWORKSPACE_NAMESPACE
    );
    expect(writeFileMock).toBeCalledTimes(1); // only extensions were applied
    expect(writeFileMock).toBeCalledWith(WORKSPACE_FILE_PATH, workspaceConfigWithMergedExtensionsToFile);
  });

  it('should merge product.json with a provided config map', async () => {
    env.DEVWORKSPACE_NAMESPACE = DEVWORKSPACE_NAMESPACE;

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

    const configmap = {
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

    mockCoreV1Api.readNamespacedConfigMap.mockResolvedValue({
      response: {} as IncomingMessage,
      body: { data: configmap } as V1ConfigMap,
    });

    readFileMock.mockImplementation(async (path) => {
      if ('product.json' === path) {
        return existingProductJSON;
      }
    });

    await new EditorConfigurations(WORKSPACE_FILE_PATH).configure();

    expect(writeFileMock).toBeCalledTimes(1);
    expect(writeFileMock).toHaveBeenCalledWith(
      'product.json',
      JSON.stringify(JSON.parse(mergedProductJSON), null, '\t')
    );
  });
});
