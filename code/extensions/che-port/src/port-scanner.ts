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

import { IpConverter } from './ip-converter';
import { ListeningPort } from './listening-port';
import * as fs from 'fs-extra';

/**
 * Injectable internal scanner used with PortScanner.
 */
export abstract class AbstractInternalScanner {
  abstract getListeningPortV4(): Promise<string>;
  abstract getListeningPortV6(): Promise<string>;
}

/**
 * Default internal scanner used with PortScanner.
 */
class DefaultInternalScanner extends AbstractInternalScanner {
  public static readonly PORTS_IPV4 = '/proc/net/tcp';
  public static readonly PORTS_IPV6 = '/proc/net/tcp6';

  async getListeningPortV4(): Promise<string> {
    return fs.readFile(DefaultInternalScanner.PORTS_IPV4, 'utf-8');
  }

  async getListeningPortV6(): Promise<string> {
    return fs.readFile(DefaultInternalScanner.PORTS_IPV6, 'utf-8');
  }
}

/**
 * Allow to grab ports being opened and on which network interface
 */
export class PortScanner {
  private scanner: AbstractInternalScanner;

  /* `scanner` will be injected on tests. */
  constructor(scanner: AbstractInternalScanner = new DefaultInternalScanner()) {
    this.scanner = scanner;
  }

  /**
   * Get opened ports.
   */
  public async getListeningPorts(): Promise<ListeningPort[]> {
    const ipConverter = new IpConverter();
    const outIPV6 = this.scanner.getListeningPortV6();
    const outIPV4 = this.scanner.getListeningPortV4();
    const output = (await Promise.all([outIPV4, outIPV6])).join();

    // parse
    const regex = /:\s(.*):(.*)\s[0-9].*\s0A\s/gm;
    const ports = [];
    let matcher;
    while ((matcher = regex.exec(output)) !== null) {
      const ipRaw = matcher[1];
      const portRaw = matcher[2];
      const interfaceListen = ipConverter.convert(ipRaw);
      // convert port which is in HEX to int
      const portNumber = parseInt(portRaw, 16);
      const port: ListeningPort = { portNumber, interfaceListen };
      ports.push(port);
    }
    return ports;
  }
}
