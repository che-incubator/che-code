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
import { Container } from 'inversify';
import { GithubServiceImpl } from '../src/impl/github-service-impl';
import { GithubUser } from '../src/api/github-service';

const CREDENTIALS = 'https://oauth2:token@github.com';

const MULTIHOST_CREDENTIALS = `
    https://oauth2:5761d0b375d627ca5a@gitlab.com
    https://oauth2:gho_dbi6YDyjyNrkO0ag354@github.com
  `;

describe('Test GithubServiceImpl', () => {
  let container: Container;

  const axiosGetMock = jest.fn();
  const axiosMock = {
    get: axiosGetMock,
  } as any;

  let readFileSyncMock = jest.fn();
  let existsSyncMock = jest.fn();

  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.resetAllMocks();

    Object.assign(fs, {
      readFileSync: readFileSyncMock,
      existsSync: existsSyncMock
    });

    container = new Container();
    container.bind(GithubServiceImpl).toSelf().inSingletonScope();
    container.bind(Symbol.for('AxiosInstance')).toConstantValue(axiosMock);
  });

  test('throw error when token is not setup', async () => {
    const service = container.get(GithubServiceImpl);
    await expect(service.getToken()).rejects.toThrow('GitHub authentication token is not setup');
  });

  test('get token', async () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(CREDENTIALS);

    const service = container.get(GithubServiceImpl);
    const token = await service.getToken();

    expect(token).toEqual('token');
  });

  test('get user', async () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(CREDENTIALS);

    const data: GithubUser = { id: 1, name: 'name', login: 'login', email: 'email' };
    axiosGetMock.mockResolvedValue({ data });

    const service = container.get(GithubServiceImpl);
    const user = await service.getUser();

    expect(axiosGetMock).toBeCalledWith('https://api.github.com/user', {
      headers: { Authorization: 'Bearer token' },
    });
    expect(user).toEqual(data);
  });

  test('should return token for github', async () => {
    existsSyncMock.mockReturnValue(true);

    readFileSyncMock.mockImplementation(path => {
      return '/.git-credentials/credentials' === path ? MULTIHOST_CREDENTIALS : '';
    });

    const service = container.get(GithubServiceImpl);
    const token = await service.getToken();
    expect(token).toEqual('gho_dbi6YDyjyNrkO0ag354');
  });

});
