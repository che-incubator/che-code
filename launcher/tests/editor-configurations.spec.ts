/**********************************************************************
 * Copyright (c) 2024 Red Hat, Inc.
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
import { EditorConfigurations, parseJsonFrom } from '../src/editor-configurations';

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
const SETTINGS_JSON = parseJsonFrom(SETTINGS_CONTENT);
const SETTINGS_TO_FILE = JSON.stringify(SETTINGS_JSON, null, '\t');
const CONFIGMAP_SETTINGS_DATA = {
  'settings.json': SETTINGS_CONTENT,
};

const EXTENSIONS_CONTENT =
  '{\n' +
  '  "recommendations": [\n' +
  '      "dbaeumer.vscode-eslint",\n' +
  '      "github.vscode-pull-request-github"\n' +
  '  ]\n' +
  '}\n';
const EXTENSIONS_JSON = parseJsonFrom(EXTENSIONS_CONTENT);
const WORKSPACE_CONFIG_JSON = parseJsonFrom(WORKSPACE_FILE_CONTENT);
WORKSPACE_CONFIG_JSON['extensions'] = EXTENSIONS_JSON;
const WORKSPACE_CONFIG_WITH_EXTENSIONS_TO_FILE = JSON.stringify(WORKSPACE_CONFIG_JSON, null, '\t');
const CONFIGMAP_EXTENSIOSN_DATA = {
  'extensions.json': EXTENSIONS_CONTENT,
};

const CONFIGMAP_INCORRECT_DATA = {
  'extensions.json': '//some incorrect data',
  'settings.json': '//some incorrect data',
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

  it('should skip applying editor congis if there is no DEVWORKSPACE_NAMESPACE', async () => {
    const editorConfigs = new EditorConfigurations();
    await editorConfigs.configure();

    expect(mockMakeApiClient).toHaveBeenCalledWith(CoreV1Api);
    expect(mockCoreV1Api.readNamespacedConfigMap).toBeCalledTimes(0);
    expect(fs.writeFile).toBeCalledTimes(0);
  });

  it('should skip applying configs when request for a configmap is failed', async () => {
    env.DEVWORKSPACE_NAMESPACE = DEVWORKSPACE_NAMESPACE;
    const mockError = new Error('Request failed');
    mockCoreV1Api.readNamespacedConfigMap.mockRejectedValue(mockError);

    const editorConfigs = new EditorConfigurations(WORKSPACE_FILE_PATH);
    await editorConfigs.configure();

    expect(mockMakeApiClient).toHaveBeenCalledWith(CoreV1Api);
    expect(mockCoreV1Api.readNamespacedConfigMap).toHaveBeenCalledWith(
      'vscode-editor-configurations',
      DEVWORKSPACE_NAMESPACE
    );

    expect(fileExistsMock).toBeCalledTimes(0); // no sense to read files if we have no configmap content
    expect(fs.writeFile).toBeCalledTimes(0);
  });

  it('should skip applying configs when incorrect data in a configmap', async () => {
    env.DEVWORKSPACE_NAMESPACE = DEVWORKSPACE_NAMESPACE;
    const mockResponse = {
      response: {} as IncomingMessage,
      body: { data: CONFIGMAP_INCORRECT_DATA } as V1ConfigMap,
    };
    mockCoreV1Api.readNamespacedConfigMap.mockResolvedValue(mockResponse);
    fileExistsMock.mockResolvedValue(false);

    const editorConfigs = new EditorConfigurations(WORKSPACE_FILE_PATH);
    await editorConfigs.configure();

    expect(mockMakeApiClient).toHaveBeenCalledWith(CoreV1Api);
    expect(mockCoreV1Api.readNamespacedConfigMap).toHaveBeenCalledWith(
      'vscode-editor-configurations',
      DEVWORKSPACE_NAMESPACE
    );
    expect(fs.writeFile).toBeCalledTimes(0);
  });

  it('should apply settings from a configmap', async () => {
    env.DEVWORKSPACE_NAMESPACE = DEVWORKSPACE_NAMESPACE;
    const mockResponse = {
      response: {} as IncomingMessage,
      body: { data: CONFIGMAP_SETTINGS_DATA } as V1ConfigMap,
    };
    mockCoreV1Api.readNamespacedConfigMap.mockResolvedValue(mockResponse);
    fileExistsMock.mockResolvedValue(false);

    const editorConfigs = new EditorConfigurations();
    await editorConfigs.configure();

    expect(mockMakeApiClient).toHaveBeenCalledWith(CoreV1Api);
    expect(mockCoreV1Api.readNamespacedConfigMap).toHaveBeenCalledWith(
      'vscode-editor-configurations',
      DEVWORKSPACE_NAMESPACE
    );
    expect(fs.writeFile).toBeCalledTimes(1); // only settings were applied
    expect(fs.writeFile).toBeCalledWith(REMOTE_SETTINGS_PATH, SETTINGS_TO_FILE);
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
    const existingSettingsJson = parseJsonFrom(REMOTE_SETTINGS_FILE_CONTENT);
    const mergedSettings = { ...existingSettingsJson, ...SETTINGS_JSON };
    const mergedSettingsToFile = JSON.stringify(mergedSettings, null, '\t');

    const editorConfigs = new EditorConfigurations();
    await editorConfigs.configure();

    expect(mockMakeApiClient).toHaveBeenCalledWith(CoreV1Api);
    expect(mockCoreV1Api.readNamespacedConfigMap).toHaveBeenCalledWith(
      'vscode-editor-configurations',
      DEVWORKSPACE_NAMESPACE
    );
    expect(fs.writeFile).toBeCalledTimes(1);
    expect(fs.writeFile).toBeCalledWith(REMOTE_SETTINGS_PATH, mergedSettingsToFile);
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

    const editorConfigs = new EditorConfigurations(WORKSPACE_FILE_PATH);
    await editorConfigs.configure();

    expect(mockMakeApiClient).toHaveBeenCalledWith(CoreV1Api);
    expect(mockCoreV1Api.readNamespacedConfigMap).toHaveBeenCalledWith(
      'vscode-editor-configurations',
      DEVWORKSPACE_NAMESPACE
    );
    expect(fs.writeFile).toBeCalledTimes(0);
  });

  it('should skip applying extensions when the workspace file is not found', async () => {
    env.DEVWORKSPACE_NAMESPACE = DEVWORKSPACE_NAMESPACE;
    const mockResponse = {
      response: {} as IncomingMessage,
      body: { data: CONFIGMAP_EXTENSIOSN_DATA } as V1ConfigMap,
    };
    mockCoreV1Api.readNamespacedConfigMap.mockResolvedValue(mockResponse);
    fileExistsMock.mockResolvedValue(true);

    const editorConfigs = new EditorConfigurations();
    await editorConfigs.configure();

    expect(mockMakeApiClient).toHaveBeenCalledWith(CoreV1Api);
    expect(mockCoreV1Api.readNamespacedConfigMap).toHaveBeenCalledWith(
      'vscode-editor-configurations',
      DEVWORKSPACE_NAMESPACE
    );
    expect(fs.writeFile).toBeCalledTimes(0);
  });

  it('should apply extensions from a configmap', async () => {
    env.DEVWORKSPACE_NAMESPACE = DEVWORKSPACE_NAMESPACE;
    const mockResponse = {
      response: {} as IncomingMessage,
      body: { data: CONFIGMAP_EXTENSIOSN_DATA } as V1ConfigMap,
    };
    mockCoreV1Api.readNamespacedConfigMap.mockResolvedValue(mockResponse);
    fileExistsMock.mockResolvedValue(true);
    readFileMock.mockResolvedValue(WORKSPACE_FILE_CONTENT);

    const editorConfigs = new EditorConfigurations(WORKSPACE_FILE_PATH);
    await editorConfigs.configure();

    expect(mockMakeApiClient).toHaveBeenCalledWith(CoreV1Api);
    expect(mockCoreV1Api.readNamespacedConfigMap).toHaveBeenCalledWith(
      'vscode-editor-configurations',
      DEVWORKSPACE_NAMESPACE
    );
    expect(fs.writeFile).toBeCalledTimes(1); // only extensions were applied
    expect(fs.writeFile).toBeCalledWith(WORKSPACE_FILE_PATH, WORKSPACE_CONFIG_WITH_EXTENSIONS_TO_FILE);
  });
});
