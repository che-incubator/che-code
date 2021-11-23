/**********************************************************************
 * Copyright (c) 2021 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/
/* eslint-disable @typescript-eslint/no-explicit-any */
import 'reflect-metadata';

import fs from 'fs-extra';
import * as jsYaml from 'js-yaml';

import { Container } from 'inversify';
import { Generate } from '../src/generate';
import { CheCodeDevfileResolver } from '../src/api/che-code-devfile-resolver';

describe('Test Generate', () => {
  let container: Container;

  let generate: Generate;

  const cheCodeDevfileResolverUpdateMethod = jest.fn();
  const cheCodeDevfileResolver = {
    update: cheCodeDevfileResolverUpdateMethod,
  } as any as CheCodeDevfileResolver;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
    container = new Container();
    container.bind(Generate).toSelf().inSingletonScope();
    container.bind(CheCodeDevfileResolver).toConstantValue(cheCodeDevfileResolver);
    generate = container.get(Generate);
  });

  test('basics', async () => {
    const devfileContent = `
schemaVersion: 2.1.0
metadata:
  name: my-dummy-project
`;
    const fakeoutputDir = '/fake-output';
    const editorContent = `
schemaVersion: 2.1.0
metadata:
  name: che-code
`;

    const fsWriteFileSpy = jest.spyOn(fs, 'writeFile');
    fsWriteFileSpy.mockReturnValue({});

    await generate.generate(devfileContent, editorContent, fakeoutputDir);
    // expect to write the file
    expect(fsWriteFileSpy).toBeCalled();
    expect(cheCodeDevfileResolverUpdateMethod).toBeCalled();
    const call = cheCodeDevfileResolverUpdateMethod.mock.calls[0];
    expect(JSON.stringify(call[0].devfile)).toStrictEqual(
      '{"schemaVersion":"2.1.0","metadata":{"name":"my-dummy-project"}}'
    );
    const expectedDevWorkspace = {
      apiVersion: 'workspace.devfile.io/v1alpha2',
      kind: 'DevWorkspace',
      metadata: { name: 'my-dummy-project' },
      spec: { started: true, template: {} },
    };
    expect(JSON.stringify(call[0].devWorkspace)).toStrictEqual(JSON.stringify(expectedDevWorkspace));
    const expectedDevWorkspaceTemplates = [
      {
        apiVersion: 'workspace.devfile.io/v1alpha2',
        kind: 'DevWorkspaceTemplate',
        metadata: { name: 'che-code-my-dummy-project' },
        spec: {},
      },
    ];
    expect(JSON.stringify(call[0].devWorkspaceTemplates)).toStrictEqual(JSON.stringify(expectedDevWorkspaceTemplates));
    expect(call[0].suffix).toStrictEqual('my-dummy-project');
  });

  test('basics no name', async () => {
    const devfileContent = `
schemaVersion: 2.1.0
metadata:
 foo: bar
`;
    const fakeoutputDir = '/fake-output';
    const editorContent = `
schemaVersion: 2.1.0
metadata:
  name: che-code
`;

    const fsWriteFileSpy = jest.spyOn(fs, 'writeFile');
    fsWriteFileSpy.mockReturnValue({});

    await generate.generate(devfileContent, editorContent, fakeoutputDir);
    // expect to write the file
    expect(fsWriteFileSpy).toBeCalled();
    expect(cheCodeDevfileResolverUpdateMethod).toBeCalled();
    const call = cheCodeDevfileResolverUpdateMethod.mock.calls[0];
    expect(call[0].suffix).toStrictEqual('');
  });
});
