/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from 'vscode';
import { ILaunchParams } from './extension';
import { Session } from './session';
import { BrowserSpawner } from './spawn';
import { AttachTarget } from './target';

export class SessionManager implements Disposable {
  private readonly sessions = new Map<number, Session>();

  constructor(private readonly spawn: BrowserSpawner) {}

  /**
   * Creates a session with the set of launch parameters.
   */
  public async create(params: ILaunchParams) {
    const session = new Session();
    this.sessions.set(params.launchId, session);
    session.onClose(() => this.sessions.delete(params.launchId));
    session.onError(err => {
      vscode.window.showErrorMessage(`Error running browser: ${err.message || err.stack}`);
      this.sessions.delete(params.launchId);
    });

    await Promise.all([
      this.addChildSocket(session, params),
      params.attach
        ? this.addChildAttach(session, params.attach)
        : this.addChildBrowser(session, params),
    ]);
  }

  /**
   * Destroys a session with the given launch ID.
   */
  public destroy(launchId: number) {
    const session = this.sessions.get(launchId);
    session?.dispose();
    this.sessions.delete(launchId);
  }

  /**
   * @inheritdoc
   */
  public dispose() {
    for (const session of this.sessions.values()) {
      session.dispose();
    }

    this.sessions.clear();
  }

  private async addChildSocket(session: Session, params: ILaunchParams) {
    const [host, port] = params.proxyUri.split(':');
    session.attachSocket(host, Number(port), params.path, params.wslInfo);
  }

  private async addChildBrowser(session: Session, params: ILaunchParams) {
    const browser = await this.spawn.launch(params);
    session.attachChild(browser);
  }

  private async addChildAttach(session: Session, params: { host: string; port: number }) {
    const target = await AttachTarget.create(params.host, params.port);
    session.attachChild(target);
  }
}
