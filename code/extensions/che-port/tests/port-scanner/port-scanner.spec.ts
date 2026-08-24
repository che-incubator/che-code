/**********************************************************************
 * Copyright (c) 2022 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

import { AbstractInternalScanner, PortScanner } from '../../src/port-scanner';
import * as fs from 'fs-extra';

class DummyInternalScanner extends AbstractInternalScanner {
  async getListeningPortV4(): Promise<string> {
    return fs.readFile(__dirname + '/port-scanner-listen-ipv4.stdout', 'utf-8');
  }
  async getListeningPortV6(): Promise<string> {
    return fs.readFile(__dirname + '/port-scanner-listen-ipv6.stdout', 'utf-8');
  }
}

describe('Test Port Scanner with dummy data', () => {
  let portScanner: PortScanner;

  beforeEach(() => {
    portScanner = new PortScanner(new DummyInternalScanner());
  });

  test('test port opened', async () => {
    const ports = await portScanner.getListeningPorts();
    expect(ports).toBeDefined();
    expect(Array.isArray(ports)).toBe(true);
    expect(ports.length).toBe(5);
    expect(ports[0].interfaceListen).toBe('0.0.0.0');
    expect(ports[0].portNumber).toBe(25);
    expect(ports[1].interfaceListen).toBe('127.0.0.1');
    expect(ports[1].portNumber).toBe(26);
    expect(ports[2].interfaceListen).toBe('0.0.0.0');
    expect(ports[2].portNumber).toBe(5555);
    expect(ports[3].interfaceListen).toBe('::1');
    expect(ports[3].portNumber).toBe(1236);
    expect(ports[4].interfaceListen).toBe('::');
    expect(ports[4].portNumber).toBe(4444);
  });
});

describe('Test Port Scanner with real path', () => {
  let portScanner: PortScanner;

  beforeEach(() => {
    portScanner = new PortScanner();
  });

  test('test no unhandled exception is thrown', async () => {

    const spyReadfile = jest.spyOn(fs, 'readFile') as jest.Mock;
    // mock ipv4 and ipv6 file content
    spyReadfile.mockResolvedValue('');

    await portScanner.getListeningPorts();
    await portScanner.getListeningPorts();
  });

  test('should continue scanning IPv4 ports when IPv6 is unavailable', async () => {
    const spyReadfile = jest.spyOn(fs, 'readFile') as jest.Mock;

    spyReadfile
      .mockResolvedValueOnce('ipv4-content')
      .mockRejectedValueOnce(Object.assign(new Error('IPv6 is disabled'), { code: 'ENOENT' }));

    await expect(portScanner.getListeningPorts()).resolves.toBeDefined();
  });

  test('should continue scanning IPv6 ports when IPv4 is unavailable', async () => {
    const spyReadfile = jest.spyOn(fs, 'readFile') as jest.Mock;

    spyReadfile
      .mockRejectedValueOnce(Object.assign(new Error('IPv4 is disabled'), { code: 'ENOENT' }))
      .mockResolvedValueOnce('ipv6-content');

    await expect(portScanner.getListeningPorts()).resolves.toBeDefined();
  });

  test('should return empty ports when both IPv4 and IPv6 are unavailable', async () => {
    const spyReadfile = jest.spyOn(fs, 'readFile') as jest.Mock;

    spyReadfile
      .mockRejectedValueOnce(Object.assign(new Error('IPv4 is disabled'), { code: 'ENOENT' }))
      .mockRejectedValueOnce(Object.assign(new Error('IPv6 is disabled'), { code: 'ENOENT' }));

    const ports = await portScanner.getListeningPorts();

    expect(ports).toEqual([]);
  });

  test('should propagate errors other than ENOENT', async () => {
    const spyReadfile = jest.spyOn(fs, 'readFile') as jest.Mock;

    const error = Object.assign(new Error('Permission denied'), { code: 'EACCES' });

    spyReadfile
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce('');

    await expect(portScanner.getListeningPorts()).rejects.toThrow('Permission denied');
  });
  
});
