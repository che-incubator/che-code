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

import * as jsYaml from 'js-yaml';
import { K8SUnits } from '../../src/k8s/k8s-units';
import { Container } from 'inversify';

describe('Test K8S Unit', () => {
  let container: Container;

  const originalConsoleError = console.error;
  const mockedConsoleError = jest.fn();

  let k8SUnits: K8SUnits;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
    container = new Container();
    container.bind(K8SUnits).toSelf().inSingletonScope();
    k8SUnits = container.get(K8SUnits);
    console.error = mockedConsoleError;
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  test('test ki', async () => {
    const result = k8SUnits.unitToNumber('1ki');
    expect(result).toBe(1024);
  });

  test('test Mi', async () => {
    const result = k8SUnits.unitToNumber('1Mi');
    expect(result).toBe(1024 * 1024);
  });

  test('test Gi', async () => {
    const result = k8SUnits.unitToNumber('1Gi');
    expect(result).toBe(1024 * 1024 * 1024);
  });

  test('test Ti', async () => {
    const result = k8SUnits.unitToNumber('1Ti');
    expect(result).toBe(1024 * 1024 * 1024 * 1024);
  });
  test('test Pi', async () => {
    const result = k8SUnits.unitToNumber('1Pi');
    expect(result).toBe(1024 * 1024 * 1024 * 1024 * 1024);
  });
  test('test Ei', async () => {
    const result = k8SUnits.unitToNumber('1Ei');
    expect(result).toBe(1024 * 1024 * 1024 * 1024 * 1024 * 1024);
  });

  test('test k', async () => {
    const result = k8SUnits.unitToNumber('1k');
    expect(result).toBe(1000);
  });

  test('test M', async () => {
    const result = k8SUnits.unitToNumber('1M');
    expect(result).toBe(1000 * 1000);
  });

  test('test G', async () => {
    const result = k8SUnits.unitToNumber('1G');
    expect(result).toBe(1000 * 1000 * 1000);
  });

  test('test T', async () => {
    const result = k8SUnits.unitToNumber('1T');
    expect(result).toBe(1000 * 1000 * 1000 * 1000);
  });
  test('test P', async () => {
    const result = k8SUnits.unitToNumber('1P');
    expect(result).toBe(1000 * 1000 * 1000 * 1000 * 1000);
  });
  test('test E', async () => {
    const result = k8SUnits.unitToNumber('1E');
    expect(result).toBe(1000 * 1000 * 1000 * 1000 * 1000 * 1000);
  });

  test('test decimal K', async () => {
    const result = k8SUnits.unitToNumber('1.2K');
    expect(result).toBe(1200);
  });

  test('test cpu sum', async () => {
    const result = k8SUnits.sumUnits('0m', '0k', 'cpu');
    expect(result).toBe('0');
  });

  test('test cpu sum m', async () => {
    const result = k8SUnits.sumUnits('500m', '3500m', 'cpu');
    expect(result).toBe('4000m');
  });

  test('test cpu sum k', async () => {
    const result = k8SUnits.sumUnits('400k', '200k', 'cpu');
    expect(result).toBe('600k');
  });

  test('test cpu with negative decimals', async () => {
    const result = k8SUnits.formatCpu(1200, -2);
    expect(result).toBe('1k');
  });

  test('test memory sum e', async () => {
    const result = k8SUnits.sumUnits('1e', '2E', 'memory');
    expect(result).toBe('3E');
  });

  test('test memory sum I', async () => {
    const result = k8SUnits.sumUnits('1Gi', '2Gi', 'memory');
    expect(result).toBe('3Gi');
  });

  test('test memory sum 0', async () => {
    const result = k8SUnits.sumUnits('0E', '0K', 'memory');
    expect(result).toBe('0');
  });

  test('test memory sum G with decimals', async () => {
    const result = k8SUnits.sumUnits('1.2G', '2.1G', 'memory');
    expect(result).toBe('3.3G');
  });

  test('test format G with negative decimals', async () => {
    const result = k8SUnits.formatMemory(1200, -2);
    expect(result).toBe('1K');
  });
});
