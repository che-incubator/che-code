/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

export function arrayEquals<T>(first: ReadonlyArray<T> | undefined, second: ReadonlyArray<T> | undefined, itemEquals: (a: T, b: T) => boolean = (a, b) => a === b): boolean {
  if (first === second) {
    return true;
  }
  if (!first || !second) {
    return false;
  }
  if (first.length !== second.length) {
    return false;
  }
  for (let i = 0, len = first.length; i < len; i++) {
    if (!itemEquals(first[i], second[i])) {
      return false;
    }
  }
  return true;
}

export function base64Encode(toEncode: string): string {
  return Buffer.from(toEncode, 'binary').toString('base64');
}

export function base64Decode(toDecode: string): string {
  return Buffer.from(toDecode, 'base64').toString('binary');
}

export function randomString(length: number): string {
  let result = '';
  while (result.length < length) {
    result += 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[
      (Math.random() * 60) | 0
    ];
  }
  return result;
}

export function createLabelsSelector(labels: { [key: string]: string; }): string {
  return Object.entries(labels)
    .map(([key, value]) => `${key}=${value}`)
    .join(',');
}
