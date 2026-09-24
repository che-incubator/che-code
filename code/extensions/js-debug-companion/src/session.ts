/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { spawn } from 'child_process';
import duplexer3 from 'duplexer3';
import { Agent } from 'http';
import { Socket } from 'net';
import { Duplex } from 'stream';
import { URL } from 'url';
import { Disposable, EventEmitter } from 'vscode';
import WebSocket from 'ws';
import { IWslInfo } from './extension';
import { ITarget } from './target';

class MessageQueue<T> {
  private qOrFn: T[] | ((value: T) => void) = [];

  public push(value: T) {
    if (typeof this.qOrFn === 'function') {
      this.qOrFn(value);
    } else {
      this.qOrFn.push(value);
    }
  }

  public connect(fn: (value: T) => void) {
    if (typeof this.qOrFn === 'function') {
      throw new Error('Already connected');
    }

    const prev = this.qOrFn;
    this.qOrFn = fn;
    for (const queued of prev) {
      fn(queued);
    }
  }
}

/**
 * The Session manages the lifecycle for a single top-level browser debug sesssion.
 */
export class Session implements Disposable {
  private readonly errorEmitter = new EventEmitter<Error>();
  public readonly onError = this.errorEmitter.event;

  private readonly closeEmitter = new EventEmitter<void>();
  public readonly onClose = this.closeEmitter.event;

  private disposed = false;
  private browserProcess?: ITarget;
  private socket?: WebSocket;

  private fromSocketQueue = new MessageQueue<WebSocket.RawData>();
  private fromBrowserQueue = new MessageQueue<WebSocket.RawData>();

  constructor() {
    this.onClose(() => this.dispose());
    this.onError(() => this.dispose());
  }

  /**
   * Attaches the socket looping back up to js-debug.
   */
  public attachSocket(host: string, port: number, path: string, wslInfo?: IWslInfo) {
    const url = new URL(`ws://${host}:${port}${path}`);
    const deadline = Date.now() + 5000;
    if (wslInfo) {
      this.attachSocketWsl(url, wslInfo, deadline);
    } else {
      this.attachSocketLoop(url, deadline);
    }
  }

  /**
   * Attaches the browser child process.
   */
  public attachChild(target: ITarget) {
    if (this.disposed) {
      target.dispose();
      return;
    }

    this.browserProcess = target;
    target.onClose(() => this.closeEmitter.fire());
    target.onError(err => this.errorEmitter.fire(err));
    target.onMessage(msg => this.fromBrowserQueue.push(msg));
    this.fromSocketQueue.connect(data => target.send(data));
  }

  /**
   * @inheritdoc
   */
  public dispose() {
    if (!this.disposed) {
      this.browserProcess?.dispose();
      this.socket?.close();
      this.disposed = true;
    }
  }

  private attachSocketWsl(url: URL, wslInfo: IWslInfo, deadline: number) {
    const agent = new Agent();

    // Make a fake connection that attaches to stdin/out, as in my original
    // unrelated https://github.com/websockets/ws/issues/1944
    //
    // The maintainer suggested using setSocket there, but that happens after
    // the socket is upgraded, and we want the actual HTTP request and upgrade
    // to happen on these pipes.
    //
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (agent as any).createConnection = (
      _options: unknown,
      callback: (err?: Error | null, stream?: Socket) => void,
    ) => {
      const process = spawn('wsl.exe', [
        '-d',
        wslInfo.distro,
        '-u',
        wslInfo.user,
        '--',
        wslInfo.execPath,
        '-e',
        `'s=net.connect(${url.port});s.pipe(process.stdout);process.stdin.pipe(s)'`,
      ]);

      process.on('error', callback);

      process.on('spawn', () => {
        callback(null, makeNetSocketFromDuplexStream(duplexer3(process.stdin, process.stdout)));
      });
    };

    // intentionally don't perMessageDeflate here, since we're local in wsl
    const ws = new WebSocket(url, { agent });
    this.setupSocket(ws, url, deadline);
  }

  private attachSocketLoop(url: URL, deadline: number) {
    if (this.disposed) {
      return;
    }

    const socket = new WebSocket(url, { perMessageDeflate: true });
    this.setupSocket(socket, url, deadline);
  }

  private setupSocket(socket: WebSocket, url: URL, deadline: number) {
    socket.on('open', () => {
      if (this.disposed) {
        socket.close();
        return;
      }

      this.socket = socket;
      this.socket.on('close', () => this.closeEmitter.fire());
      this.socket.on('message', data => this.fromSocketQueue.push(data));
      this.fromBrowserQueue.connect(data => socket.send(data));
    });

    socket.on('error', err => {
      if (this.socket === socket || Date.now() > deadline) {
        this.errorEmitter.fire(err);
      } else {
        setTimeout(() => this.attachSocketLoop(url, deadline), 100);
      }
    });
  }
}

const makeNetSocketFromDuplexStream = (stream: Duplex): Socket => {
  const cast = stream as Socket;
  const patched: { [K in keyof Omit<Socket, keyof Duplex>]: Socket[K] } = {
    bufferSize: 0,
    bytesRead: 0,
    bytesWritten: 0,
    connecting: false,
    localAddress: '127.0.0.1',
    localPort: 1,
    remoteAddress: '127.0.0.1',
    remoteFamily: 'tcp',
    remotePort: 1,
    address: () => ({ address: '127.0.0.1', family: 'tcp', port: 1 }),
    unref: () => cast,
    ref: () => cast,
    connect: (_port: unknown, _host?: unknown, connectionListener?: () => void) => {
      if (connectionListener) {
        setImmediate(connectionListener);
      }
      return cast;
    },
    setKeepAlive: () => cast,
    setNoDelay: () => cast,
    setTimeout: (_timeout: number, callback?: () => void) => {
      callback?.();
      return cast;
    },
  };

  return Object.assign(stream, patched) as Socket;
};
