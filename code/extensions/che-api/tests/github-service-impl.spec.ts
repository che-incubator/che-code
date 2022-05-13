/* eslint-disable header/header */
/**********************************************************************
 * Copyright (c) 2022 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import 'reflect-metadata';

import * as fs from 'fs-extra';
import * as path from 'path';

import { Container } from 'inversify';
import { GithubServiceImpl } from '../src/impl/github-service-impl';
import * as os from 'os';
import { GithubUser } from '../src/api/github-service';

describe('Test GithubServiceImpl', () => {
  let container: Container;

  let githubServiceImpl: GithubServiceImpl;

  const axiosGetMock = jest.fn();
  const axiosMock = {
    get: axiosGetMock,
  } as any;

  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
    container = new Container();
    container.bind(GithubServiceImpl).toSelf().inSingletonScope();
    container.bind(Symbol.for('AxiosInstance')).toConstantValue(axiosMock);

    jest.spyOn(os, 'homedir').mockReturnValue(path.resolve(__dirname, '_data'));
    githubServiceImpl = container.get(GithubServiceImpl);
  });

  test('get token', async () => {
    const token = await githubServiceImpl.getToken();

    expect(token).toEqual('token');
  });

  test('get user', async () => {
    const data: GithubUser = { id: 1, name: 'name', login: 'login', email: 'email' };
    axiosGetMock.mockResolvedValue({ data });

    const user = await githubServiceImpl.getUser();

    expect(axiosGetMock).toBeCalledWith('https://api.github.com/user', {
      headers: { Authorization: 'Bearer token' },
    });
    expect(user).toEqual(data);
  });

  test('throw error when token is not setup', async () => {
    container.rebind(GithubServiceImpl).toSelf().inSingletonScope();
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    githubServiceImpl = container.get(GithubServiceImpl);

    await expect(githubServiceImpl.getToken()).rejects.toThrow('GitHub authentication token is not setup');
  });

});
