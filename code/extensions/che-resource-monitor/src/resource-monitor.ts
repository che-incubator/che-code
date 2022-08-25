/**********************************************************************
 * Copyright (c) 2022 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

import * as vscode from 'vscode';

import { Container, MetricContainer, Metrics } from './objects';
import { SHOW_RESOURCES_INFORMATION_COMMAND, SHOW_WARNING_MESSAGE_COMMAND, Units } from './constants';
import { convertToBytes, convertToMilliCPU } from './units-converter';
import { inject, injectable } from 'inversify';

import { K8sHelper } from './k8s-helper';
import { V1Pod } from '@kubernetes/client-node';

@injectable()
export class ResourceMonitor {
  @inject(K8sHelper)
  private k8sHelper!: K8sHelper;

  private METRICS_SERVER_ENDPOINT = '/apis/metrics.k8s.io/v1beta1/';
  private METRICS_REQUEST_URL = `${this.METRICS_SERVER_ENDPOINT}namespaces/`;
  private WARNING_COLOR = '#FFCC00';
  private DEFAULT_COLOR = '#FFFFFF';
  private DEFAULT_TOOLTIP = 'Workspace resources usage. Click for details';
  private DISCONNECTED_TOOLTIP = 'Metrics server is not running';
  private MONITOR_BANNED = '$(ban) Resources';
  private MONITOR_WAIT_METRICS = 'Waiting metrics...';

  private warningMessage = '';

  private statusBarItem: vscode.StatusBarItem;
  private containers: Container[] = [];
  private namespace!: string;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    this.statusBarItem.color = this.DEFAULT_COLOR;
    this.statusBarItem.show();
    this.statusBarItem.command = SHOW_RESOURCES_INFORMATION_COMMAND;
    this.statusBarItem.tooltip = 'Resources Monitor';
  }

  async start(context: vscode.ExtensionContext, namespace: string): Promise<void> {
    context.subscriptions.push(
      vscode.commands.registerCommand(SHOW_RESOURCES_INFORMATION_COMMAND, () => this.showDetailedInfo()),
      vscode.commands.registerCommand(SHOW_WARNING_MESSAGE_COMMAND, () => this.showWarningMessage())
    );

    this.namespace = namespace;
    this.show();
  }

  async show(): Promise<void> {
    await this.getContainersInfo();
    await this.requestMetricsServer();
  }

  async getWorkspacePod(): Promise<V1Pod | undefined> {
    try {
      const { body } = await this.k8sHelper
        .getCoreApi()
        .listNamespacedPod(this.namespace, undefined, undefined, undefined, undefined, undefined);
      for (const item of body.items) {
        if (item.metadata?.name === process.env.HOSTNAME) {
          return item;
        }
      }
    } catch (e) {
      throw new Error('Cannot get workspace pod. ' + e);
    }
    return undefined;
  }

  async getContainersInfo(): Promise<Container[]> {
    const wsPod = await this.getWorkspacePod();

    wsPod?.spec?.containers.forEach(element => {
      this.containers.push({
        name: element.name,
        cpuLimit: convertToMilliCPU(element.resources?.limits?.cpu),
        cpuRequest: convertToMilliCPU(element.resources?.requests?.cpu),
        memoryLimit: convertToBytes(element.resources?.limits?.memory),
        memoryRequest: convertToBytes(element.resources?.requests?.memory),
      });
    });
    return this.containers;
  }

  async requestMetricsServer(): Promise<void> {
    const result = await this.k8sHelper.sendRawQuery(this.METRICS_SERVER_ENDPOINT, { url: this.METRICS_SERVER_ENDPOINT });
    if (result.statusCode !== 200) {
      this.statusBarItem.text = this.MONITOR_BANNED;
      this.warningMessage = "Resource monitor won't be displayed. Metrics Server is not enabled on the cluster.";
      this.statusBarItem.command = SHOW_WARNING_MESSAGE_COMMAND;
      throw new Error(`Cannot connect to Metrics Server. Status code: ${result.statusCode}. Error: ${result.data}`);
    }
    setInterval(() => this.getMetrics(), 5000);
  }

  async getMetrics(): Promise<Container[]> {
    const requestURL = `${this.METRICS_REQUEST_URL}${this.namespace}/pods/${process.env.HOSTNAME}`;
    const opts = { url: this.METRICS_SERVER_ENDPOINT };
    const response = await this.k8sHelper.sendRawQuery(requestURL, opts);

    if (response.statusCode !== 200) {
      // wait when workspace pod's metrics will be available
      if (response.statusCode === 404) {
        this.statusBarItem.text = this.MONITOR_WAIT_METRICS;
      } else {
        this.statusBarItem.text = this.MONITOR_BANNED;
        this.warningMessage = `Resource monitor won't be displayed. Cannot read metrics: ${response.data}.`;
        this.statusBarItem.command = SHOW_WARNING_MESSAGE_COMMAND;
      }
      this.statusBarItem.tooltip = this.DISCONNECTED_TOOLTIP;
      return this.containers;
    }
    this.statusBarItem.command = SHOW_RESOURCES_INFORMATION_COMMAND;
    const metrics: Metrics = JSON.parse(response.data);
    metrics.containers.forEach(element => {
      this.setUsedResources(element);
    });
    this.updateStatusBar();
    return this.containers;
  }

  setUsedResources(element: MetricContainer): void {
    this.containers.map(container => {
      if (container.name === element.name) {
        container.cpuUsed = convertToMilliCPU(element.usage.cpu);
        container.memoryUsed = convertToBytes(element.usage.memory);
        return;
      }
    });
  }

  updateStatusBar(): void {
    let name = '';
    let memTotal = 0;
    let memRequest = 0;
    let memUsed = 0;
    let cpuUsed = 0;
    let cpuRequest = 0;
    let cpuLimit = 0;
    let text = '';
    let color = this.DEFAULT_COLOR;
    let tooltip = this.DEFAULT_TOOLTIP;
    this.containers.forEach(element => {
      if (element.memoryLimit) {
        memTotal += element.memoryLimit;
      }
      if (element.memoryUsed) {
        memUsed += element.memoryUsed;
      }
      if (element.cpuUsed) {
        cpuUsed += element.cpuUsed;
      }
      if (element.cpuLimit) {
        cpuLimit += element.cpuLimit;
      }
      if (element.cpuRequest) {
        cpuRequest += element.cpuRequest;
      }
      if (element.memoryRequest) {
        memRequest += element.memoryRequest;
      }
      name = element.name;
      // if a container uses more than 90% of limited memory, show it in status bar with warning color
      if (element.memoryLimit && element.cpuLimit && element.memoryUsed && element.cpuUsed && element.memoryUsed / element.memoryLimit > 0.9) {
        color = this.WARNING_COLOR;
        tooltip = `${element.name} container`;
        text = this.buildStatusBarMessage(element);
      }
    });

    // show workspace resources in total
    if (color === this.DEFAULT_COLOR) {
      text = this.buildStatusBarMessage({ name, memoryRequest: memRequest, memoryUsed: memUsed, cpuRequest, cpuLimit, memoryLimit: memTotal, cpuUsed });
    }

    this.statusBarItem.text = text;
    this.statusBarItem.color = color;
    this.statusBarItem.tooltip = tooltip;
  }

  buildStatusBarMessage(container: Container): string {
    console.log('>>>>>>' + JSON.stringify(container));
    const unitId = container.memoryLimit! > Units.G ? 'GB' : 'MB';
    const unit = container.memoryLimit! > Units.G ? Units.G : Units.M;

    let used: number | string;
    let limited: number | string;
    const memPct = Math.floor((container.memoryUsed! / container.memoryLimit!) * 100);
    const cpuPct = Math.floor((container.cpuUsed! / container.cpuLimit!) * 100);
    if (unit === Units.G) {
      used = (container.memoryUsed! / unit).toFixed(2);
      limited = (container.memoryLimit! / unit).toFixed(2);
    } else {
      used = Math.floor(container.memoryUsed! / unit);
      limited = Math.floor(container.memoryLimit! / unit);
    }
    return `$(ellipsis) Mem: ${used}/${limited} ${unitId} ${memPct}% $(pulse) CPU: ${container.cpuUsed!}/${container.cpuLimit!} m ${cpuPct}%`;
  }

  showDetailedInfo(): void {
    const items: vscode.QuickPickItem[] = [];
    this.containers.forEach(element => {
      const memUsed = element.memoryUsed ? Math.floor(element.memoryUsed / Units.M) : '';
      const memRequest = element.memoryRequest ? Math.floor(element.memoryRequest / Units.M) : '';
      const memLimited = element.memoryLimit ? Math.floor(element.memoryLimit / Units.M) : '';
      const cpuUsed = element.cpuUsed;
      const cpuRequest = element.cpuRequest;
      const cpuLimited = element.cpuLimit ? `${element.cpuLimit}m` : 'not set';

      items.push(<vscode.QuickPickItem>{
        label: element.name,
        detail: `Mem (MB): ${memUsed} (Used) / ${memRequest} (Request) / ${memLimited} (Limited) | CPU : ${cpuUsed}m (Used) / ${cpuRequest}m (Request) / ${cpuLimited} (Limited)`,
      });
    });
    vscode.window.showQuickPick(items, {});
  }

  showWarningMessage(): void {
    vscode.window.showWarningMessage(this.warningMessage);
  }
}
