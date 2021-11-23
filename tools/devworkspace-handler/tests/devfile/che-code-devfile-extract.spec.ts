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

import { Container } from 'inversify';
import { CheCodeDevfileExtract } from '../../src/devfile/che-code-devfile-extract';
import { devfileModule } from '../../src/devfile/devfile-module';
import { k8sModule } from '../../src/k8s/k8s-module';
import { Generate } from '../../src/generate';
import fs from 'fs-extra';
import path from 'path';

describe('Test CheCodeDevfileExtract', () => {
  let container: Container;

  let cheCodeDevfileExtract: CheCodeDevfileExtract;
  let generate: Generate;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
    container = new Container();
    container.bind(Generate).toSelf().inSingletonScope();
    container.load(devfileModule);
    container.load(k8sModule);
    container.bind('boolean').toConstantValue(false).whenTargetNamed('INSERT_DEV_WORKSPACE_TEMPLATE_AS_PLUGIN');
    cheCodeDevfileExtract = container.get(CheCodeDevfileExtract);
    generate = container.get(Generate);
  });

  test('basics', async () => {
    const devfileContent = await fs.readFile(path.join(__dirname, '..', '_data', 'devfile.yaml'), 'utf8');
    const editorContent = await fs.readFile(path.join(__dirname, '..', '_data', 'editor.yaml'), 'utf8');

    const generate = container.get(Generate);
    const context = await generate.generateContent(devfileContent, editorContent);
    const originalDevfile = await cheCodeDevfileExtract.extract(context.devfile, context.devWorkspace);

    // compare, they should be the same
    expect(devfileContent).toStrictEqual(originalDevfile);
  });

  test('error missing spec object', async () => {
    const devfileContent = await fs.readFile(path.join(__dirname, '..', '_data', 'devfile.yaml'), 'utf8');
    const editorContent = await fs.readFile(path.join(__dirname, '..', '_data', 'editor.yaml'), 'utf8');

    const generate = container.get(Generate);
    const context = await generate.generateContent(devfileContent, editorContent);

    // remove spec object from devWorkspace
    delete context.devWorkspace.spec;

    await expect(cheCodeDevfileExtract.extract(context.devfile, context.devWorkspace)).rejects.toThrow(
      'Requires a template in devWorkspace object'
    );
  });

  test('error invalid', async () => {
    const devfileContent = await fs.readFile(path.join(__dirname, '..', '_data', 'devfile.yaml'), 'utf8');
    const editorContent = await fs.readFile(path.join(__dirname, '..', '_data', 'editor.yaml'), 'utf8');

    const generate = container.get(Generate);
    const context = await generate.generateContent(devfileContent, editorContent);

    // remove components object from devWorkspace
    delete context.devWorkspace.spec.template.components;

    await expect(cheCodeDevfileExtract.extract(context.devfile, context.devWorkspace)).rejects.toThrow(
      'Unable to find contribution container'
    );
  });

  test('error missing component attributes', async () => {
    const devfileContent = await fs.readFile(path.join(__dirname, '..', '_data', 'devfile.yaml'), 'utf8');
    const editorContent = await fs.readFile(path.join(__dirname, '..', '_data', 'editor.yaml'), 'utf8');

    const generate = container.get(Generate);
    const context = await generate.generateContent(devfileContent, editorContent);

    // remove spec object from devWorkspace
    context.devWorkspace.spec.template.components.forEach(component => delete component.attributes);

    await expect(cheCodeDevfileExtract.extract(context.devfile, context.devWorkspace)).rejects.toThrow(
      'Unable to find contribution container'
    );
  });

  test('cleanup array', async () => {
    const myObject = {
      field: [null, 'hello', null, 'world', null],
    };
    cheCodeDevfileExtract.cleanupArray(myObject, 'field', myObject.field);
    expect(myObject).toStrictEqual({
      field: ['hello', 'world'],
    });
  });
});
