/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { promises } from 'fs';

/**
 * Returns whether the given path exists.
 */
export async function exists(path: string) {
  try {
    await promises.access(path);
    return true;
  } catch (e) {
    return false;
  }
}
