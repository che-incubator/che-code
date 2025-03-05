/**********************************************************************
 * Copyright (c) 2025 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

export function merge_first_with_second(first: any, second: any) {
  if (Array.isArray(first)) {
    if (!Array.isArray(second)) {
      // incompatiblity of types :: skip and do nothing
      return;
    }

    for (const element of first) {
      if (second.includes(element)) {
        continue;
      }

      second.push(element);
    }

    return;
  }

  for (const key of Object.keys(first)) {
    if (second[key] === undefined) {
      // if second object does not contain the property, copy it
      second[key] = first[key];
    } else {
      // if second object contains the same property, check for options
      if ('string' === typeof first[key] && 'string' === typeof second[key]) {
        // if the property is string, update the value
        second[key] = first[key];
      } else if ('number' === typeof first[key] && 'number' === typeof second[key]) {
        // if the property is number, update the value
        second[key] = first[key];
      } else if ('object' === typeof first[key] && 'object' === typeof second[key]) {
        // if the property is object, merge values
        merge_first_with_second(first[key], second[key]);
      }

      // in case of incompatibility of types, do nothing
    }
  }
}

export function parseJSON(content: string, options?: { errorMessage: string }) {
  try {
    return JSON.parse(content);
  } catch (error) {
    if (error.message && options && options.errorMessage) {
      error.message = `${options.errorMessage} ${error.message}`;
    }

    throw error;
  }
}
