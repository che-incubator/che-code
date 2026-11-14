/**********************************************************************
 * Copyright (c) 2026 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

/**
 * Mock of the vscode module
 */
export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = [];

  readonly event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
  };

  fire(data: T): void {
    this.listeners.forEach(listener => listener(data));
  }

  dispose(): void {
    this.listeners = [];
  }
}

export const window = {
  createOutputChannel: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
  }),
};

export class Uri {
  constructor(
    readonly scheme: string,
    readonly authority: string,
    readonly path: string,
    readonly query: string,
    readonly fragment: string,
  ) { }

  static parse(value: string): Uri {
    const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?(?:#(.*))?/.exec(value);
    if (!match) {
      throw new Error(`[UriError]: cannot parse: ${value}`);
    }
    return new Uri(match[1].toLowerCase(), match[2], match[3], match[4] ?? '', match[5] ?? '');
  }

  static from(components: { scheme: string; authority?: string; path?: string; query?: string; fragment?: string }): Uri {
    return new Uri(
      components.scheme,
      components.authority ?? '',
      components.path ?? '',
      components.query ?? '',
      components.fragment ?? '',
    );
  }

  toString(): string {
    return `${this.scheme}://${this.authority}${this.path}${this.query ? `?${this.query}` : ''}${this.fragment ? `#${this.fragment}` : ''}`;
  }

  toJSON(): { $mid: number; scheme: string; authority: string; path: string; query: string; fragment: string } {
    return { $mid: 1, scheme: this.scheme, authority: this.authority, path: this.path, query: this.query, fragment: this.fragment };
  }
}

export const commands = {
  registerCommand: jest.fn(() => ({ dispose: () => undefined })),
  executeCommand: jest.fn(),
};

export const authentication = {
  registerAuthenticationProvider: jest.fn(),
};

export const extensions = {
  getExtension: jest.fn(),
};
