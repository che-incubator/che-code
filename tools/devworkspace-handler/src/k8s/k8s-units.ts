/**********************************************************************
 * Copyright (c) 2021 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import { injectable } from 'inversify';

/**
 * Handle kubernetes units
 */
@injectable()
export class K8SUnits {
  //  You can express storage as a plain integer or as a fixed-point number using one of these suffixes: E, P, T, G, M, K.
  // You can also use the power-of-two equivalents: Ei, Pi, Ti, Gi, Mi, Ki.
  private static readonly Ki = 1024;
  private static readonly Mi = 1024 * K8SUnits.Ki;
  private static readonly Gi = 1024 * K8SUnits.Mi;
  private static readonly Ti = 1024 * K8SUnits.Gi;
  private static readonly Pi = 1024 * K8SUnits.Ti;
  private static readonly Ei = 1024 * K8SUnits.Pi;

  private static readonly K = 1000;
  private static readonly M = 1000 * K8SUnits.K;
  private static readonly G = 1000 * K8SUnits.M;
  private static readonly T = 1000 * K8SUnits.G;
  private static readonly P = 1000 * K8SUnits.T;
  private static readonly E = 1000 * K8SUnits.P;

  unitToNumber(unit: string): number {
    // base two
    if (unit.endsWith('Ki') || unit.endsWith('ki')) {
      return parseFloat(unit.substring(0, unit.length - 2)) * K8SUnits.Ki;
    } else if (unit.endsWith('Mi') || unit.endsWith('mi')) {
      return parseFloat(unit.substring(0, unit.length - 2)) * K8SUnits.Mi;
    } else if (unit.endsWith('Gi') || unit.endsWith('gi')) {
      return parseFloat(unit.substring(0, unit.length - 2)) * K8SUnits.Gi;
    } else if (unit.endsWith('Ti') || unit.endsWith('ti')) {
      return parseFloat(unit.substring(0, unit.length - 2)) * K8SUnits.Ti;
    } else if (unit.endsWith('Pi') || unit.endsWith('pi')) {
      return parseFloat(unit.substring(0, unit.length - 2)) * K8SUnits.Pi;
    } else if (unit.endsWith('Ei') || unit.endsWith('ei')) {
      return parseFloat(unit.substring(0, unit.length - 2)) * K8SUnits.Ei;
    } else if (unit.endsWith('K') || unit.endsWith('k')) {
      return parseFloat(unit.substring(0, unit.length - 1)) * K8SUnits.K;
    } else if (unit.endsWith('M') || unit.endsWith('m')) {
      return parseFloat(unit.substring(0, unit.length - 1)) * K8SUnits.M;
    } else if (unit.endsWith('G') || unit.endsWith('g')) {
      return parseFloat(unit.substring(0, unit.length - 1)) * K8SUnits.G;
    } else if (unit.endsWith('T') || unit.endsWith('t')) {
      return parseFloat(unit.substring(0, unit.length - 1)) * K8SUnits.T;
    } else if (unit.endsWith('P') || unit.endsWith('p')) {
      return parseFloat(unit.substring(0, unit.length - 1)) * K8SUnits.P;
    } else if (unit.endsWith('E') || unit.endsWith('e')) {
      return parseFloat(unit.substring(0, unit.length - 1)) * K8SUnits.E;
    }
  }

  sumUnits(unit1: string, unit2: string): string {
    // convert unit to simple unit
    const sum = this.unitToNumber(unit1) + this.unitToNumber(unit2);
    return this.format(sum);
  }

  format(value: number, decimals = 2) {
    if (value === 0) {
      return '0';
    }

    let k: number;
    let sizes: string[];
    if (this.isBinaryUnit(value)) {
      sizes = ['', 'Ki', 'Mi', 'Gi', 'Ti', 'Pi', 'Ei'];
      k = 1024;
    } else {
      sizes = ['', 'K', 'M', 'G', 'T', 'P', 'E'];
      k = 1000;
    }
    const dm = decimals < 0 ? 0 : decimals;
    const i = Math.floor(Math.log(value) / Math.log(k));
    return `${parseFloat((value / Math.pow(k, i)).toFixed(dm))}${sizes[i]}`;
  }

  isBinaryUnit(value: number) {
    const i = Math.floor(Math.log(value) / Math.log(1024));
    const val = value / Math.pow(1024, i);
    return Number.isInteger(val);
  }
}
