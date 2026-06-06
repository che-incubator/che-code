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

export function createLabelsSelector(labels: { [key: string]: string; }): string {
  return Object.entries(labels)
    .map(([key, value]) => `${key}=${value}`)
    .join(',');
}

export function hasAllScopes(existingScopes: string[], requestedScopes: string[]): boolean {
  return requestedScopes.every(scope => existingScopes.includes(scope));
}

export function sessionMatchesRequestedScopes(sessionScopes: readonly string[], requestedScopes: readonly string[]): boolean {
  return hasAllScopes([...sessionScopes], [...requestedScopes]);
}

/** Matches product.json defaultChatAgent.providerScopes[0] and Copilot GITHUB_SCOPE_ALIGNED. */
export const DEVICE_AUTH_SCOPES = ['read:user', 'user:email', 'repo', 'workflow'] as const;

/** Scope bundles used by Copilot / github / GHPRI / Agent Host — session keys match vanilla createSession. */
export const HYDRATION_SCOPE_BUNDLES: readonly string[][] = [
  ['read:user', 'user:email', 'repo', 'workflow', 'project', 'read:org'],
  ['read:user', 'user:email', 'repo', 'workflow'],
  ['read:user', 'user:email', 'repo'],
  ['read:user', 'user:email'],
  ['user:email'],
];

export function getMatchingHydrationScopeBundles(tokenScopes: string[]): string[][] {
  return HYDRATION_SCOPE_BUNDLES
    .filter(bundle => hasAllScopes(tokenScopes, bundle))
    .map(bundle => [...bundle]);
}

export function isUnauthorizedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  if ('httpStatus' in error && (error as { httpStatus: number }).httpStatus === 401) {
    return true;
  }
  if ('response' in error && (error as { response?: { status?: number } }).response?.status === 401) {
    return true;
  }
  return false;
}
