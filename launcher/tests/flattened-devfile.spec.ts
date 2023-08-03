/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import { env } from "process";
import * as path from "path";

import { FlattenedDevfile } from "../src/flattened-devfile";

describe("Test operating wih DevWorkspace Flattened Devfile:", () => {
  test("should not return che-code endpoint if env.DEVWORKSPACE_FLATTENED_DEVFILE is not set", async () => {
    const devfile = new FlattenedDevfile();

    try {
      await devfile.getCheCodeEndpoint();
      fail();
    } catch (error) {
      expect(error.message).toBe(
        "  > Unable to find flattened devworkspace file, env.DEVWORKSPACE_FLATTENED_DEVFILE is not set"
      );
    }
  });

  test("should return che-code endpoint", async () => {
    env.DEVWORKSPACE_FLATTENED_DEVFILE = path.join(
      __dirname,
      "_data",
      "flattened.devworkspace.yaml"
    );

    const devfile = new FlattenedDevfile();
    const result = await devfile.getCheCodeEndpoint();

    expect(result).toBe(
      "https://che-dogfooding.apps.che-dev.x6e0.p1.openshiftapps.com/vgulyy/che-code-multiroot/3100/"
    );
  });

  test("should return three projects", async () => {
    env.DEVWORKSPACE_FLATTENED_DEVFILE = path.join(
      __dirname,
      "_data",
      "flattened.devworkspace.yaml"
    );

    const devfile = new FlattenedDevfile();
    const projects = await devfile.getProjects();

    expect(projects).toBeDefined();
    expect(projects.map((project) => project.name)).toStrictEqual([
      "che-code",
      "che-devfile-registry",
      "web-nodejs-sample",
    ]);
  });
});
