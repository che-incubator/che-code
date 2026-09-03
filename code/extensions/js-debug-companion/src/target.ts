/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { ChildProcess } from 'child_process';
import split from 'split2';
import { CancellationTokenSource, Event, EventEmitter } from 'vscode';
import WebSocket from 'ws';
import { retryGetWSEndpoint } from './getWsEndpoint';

export interface ITarget {
  readonly onMessage: Event<WebSocket.RawData>;
  readonly onError: Event<Error>;
  readonly onClose: Event<void>;

  send(message: WebSocket.RawData): void;
  dispose(): Promise<void>;
}

const waitForExit = async (process: ChildProcess) => {
  if (process.exitCode) {
    return;
  }

  await Promise.race([
    new Promise(r => process.on('exit', r)),
    new Promise(r => setTimeout(r, 1000)),
  ]);
};

/**
 * A debug target that sends data through the target's stdio streams.
 */
export class PipedTarget implements ITarget {
  private errorEmitter = new EventEmitter<Error>();
  private closeEmitter = new EventEmitter<void>();
  private messageEmitter = new EventEmitter<WebSocket.RawData>();

  public readonly onError = this.errorEmitter.event;
  public readonly onClose = this.closeEmitter.event;
  public readonly onMessage = this.messageEmitter.event;

  constructor(private readonly process: ChildProcess) {
    if (this.process.stdio.length < 5) {
      throw new Error('Insufficient fd number on child process');
    }

    process.on('error', e => this.errorEmitter.fire(e));
    process.on('exit', () => this.closeEmitter.fire());

    (process.stdio[4] as NodeJS.ReadableStream)
      .pipe(split('\0'))
      .on('data', data => this.messageEmitter.fire(data))
      .resume();
  }

  public send(message: WebSocket.RawData): void {
    const w = this.process.stdio[3] as NodeJS.WritableStream;
    if (message instanceof Uint8Array) {
      w.write(message);
    } else if (message instanceof ArrayBuffer) {
      w.write(new Uint8Array(message));
    } else {
      for (const chunk of message) {
        w.write(chunk);
      }
    }

    w.write('\0');
  }

  public async dispose() {
    await waitForExit(this.process);
    this.process.kill();
  }
}

/**
 * Attaches to a debug target on the given host and port.
 */
export class AttachTarget implements ITarget {
  private errorEmitter = new EventEmitter<Error>();
  private closeEmitter = new EventEmitter<void>();
  private messageEmitter = new EventEmitter<WebSocket.RawData>();

  public readonly onError = this.errorEmitter.event;
  public readonly onClose = this.closeEmitter.event;
  public readonly onMessage = this.messageEmitter.event;

  public static async create(host: string, port: number) {
    const cts = new CancellationTokenSource();
    setTimeout(() => cts.cancel(), 10 * 1000);

    const endpoint = await retryGetWSEndpoint(`http://${host}:${port}`, cts.token);
    const ws = new WebSocket(endpoint, [], {
      headers: { host: 'localhost' },
      perMessageDeflate: false,
      maxPayload: 256 * 1024 * 1024,
      followRedirects: true,
    });

    return await new Promise<ITarget>((resolve, reject) => {
      ws.addEventListener('open', () => resolve(new AttachTarget(ws)));
      ws.addEventListener('error', errorEvent => reject(errorEvent.error));
    });
  }

  protected constructor(private readonly ws: WebSocket) {
    ws.on('error', evt => this.errorEmitter.fire(evt));
    ws.on('close', () => this.closeEmitter.fire());
    ws.on('message', m => this.messageEmitter.fire(m));
  }

  public send(message: WebSocket.RawData): void {
    this.ws.send(message.toString());
  }

  public async dispose() {
    await new Promise(r => {
      this.ws.on('close', r);
      this.ws.close();
    });
  }
}

/**
 * Target that attaches to the process as a server.
 * Dispose will also kill the process.
 */
export class ServerTarget implements ITarget {
  private errorEmitter = new EventEmitter<Error>();
  private closeEmitter = new EventEmitter<void>();
  private messageEmitter = new EventEmitter<WebSocket.RawData>();

  public readonly onError = this.errorEmitter.event;
  public readonly onClose = this.closeEmitter.event;
  public readonly onMessage = this.messageEmitter.event;

  public static async create(child: ChildProcess, port: number) {
    const cts = new CancellationTokenSource();
    setTimeout(() => cts.cancel(), 10 * 1000);
    try {
      const target = await AttachTarget.create('localhost', port);
      return new ServerTarget(child, target);
    } catch (e) {
      child.kill();
      throw e;
    }
  }

  protected constructor(private readonly process: ChildProcess, private readonly attach: ITarget) {
    process.on('error', e => this.errorEmitter.fire(e));
    process.on('close', () => this.closeEmitter.fire());
    attach.onError(err => this.errorEmitter.fire(err));
    attach.onClose(() => this.closeEmitter.fire());
    attach.onMessage(evt => this.messageEmitter.fire(evt));
  }

  public send(message: WebSocket.RawData): void {
    this.attach.send(message);
  }

  public async dispose() {
    this.attach.dispose();
    await waitForExit(this.process);
    this.process.kill();
  }
}
