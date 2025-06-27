/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type Result<T, K> = ResultOk<T> | ResultError<K>;

export namespace Result {

	export function ok<T>(value: T): ResultOk<T> {
		return new ResultOk(value);
	}

	export function error<K>(value: K): ResultError<K> {
		return new ResultError(value);
	}

	export function fromString(errorMessage: string): ResultError<Error> {
		return Result.error(new Error(errorMessage));
	}
}

/**
 * To instantiate a ResultOk, use `Result.ok(value)`.
 * To instantiate a ResultError, use `Result.error(value)`.
 */
class ResultOk<T> {
	constructor(readonly val: T) { }

	map<K>(f: (result: T) => K) {
		return new ResultOk(f(this.val));
	}

	flatMap<K>(f: (result: T) => Result<K, never>) {
		return f(this.val);
	}

	isOk(): this is ResultOk<T> {
		return true;
	}

	isError(): this is ResultError<never> {
		return false;
	}
}

/**
 * To instantiate a ResultOk, use `Result.ok(value)`.
 * To instantiate a ResultError, use `Result.error(value)`.
 */
class ResultError<K> {
	constructor(
		public readonly err: K,
	) { }

	map(f: unknown) {
		return this;
	}

	flatMap(f: unknown) {
		return this;
	}

	isOk(): this is ResultOk<never> {
		return false;
	}

	isError(): this is ResultError<K> {
		return true;
	}
}
