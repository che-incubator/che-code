/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { tmpdir } from 'os';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IFileService } from 'vs/platform/files/common/files';
import { TextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textFileEditorModelManager';
import { FileAccess, Schemas } from 'vs/base/common/network';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { Promises } from 'vs/base/node/pfs';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { FileService } from 'vs/platform/files/common/fileService';
import { NullLogService } from 'vs/platform/log/common/log';
import { flakySuite, getRandomTestPath } from 'vs/base/test/node/testUtils';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { detectEncodingByBOM } from 'vs/workbench/services/textfile/test/node/encoding/encoding.test';
import { workbenchInstantiationService } from 'vs/workbench/test/electron-browser/workbenchTestServices';
import createSuite from 'vs/workbench/services/textfile/test/common/textFileService.io.test';
import { IWorkingCopyFileService, WorkingCopyFileService } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';
import { WorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';
import { TestNativeTextFileServiceWithEncodingOverrides } from 'vs/workbench/test/electron-sandbox/workbenchTestServices';

flakySuite('Files - NativeTextFileService i/o', function () {
	const disposables = new DisposableStore();

	let service: ITextFileService;
	let testDir: string;

	function readFile(path: string): Promise<Buffer>;
	function readFile(path: string, encoding: BufferEncoding): Promise<string>;
	function readFile(path: string, encoding?: BufferEncoding): Promise<Buffer | string> {
		return Promises.readFile(path, encoding);
	}

	createSuite({
		setup: async () => {
			const instantiationService = workbenchInstantiationService(disposables);

			const logService = new NullLogService();
			const fileService = new FileService(logService);

			const fileProvider = new DiskFileSystemProvider(logService);
			disposables.add(fileService.registerProvider(Schemas.file, fileProvider));
			disposables.add(fileProvider);

			const collection = new ServiceCollection();
			collection.set(IFileService, fileService);

			collection.set(IWorkingCopyFileService, new WorkingCopyFileService(fileService, new WorkingCopyService(), instantiationService, new UriIdentityService(fileService)));

			service = instantiationService.createChild(collection).createInstance(TestNativeTextFileServiceWithEncodingOverrides);

			testDir = getRandomTestPath(tmpdir(), 'vsctests', 'textfileservice');
			const sourceDir = FileAccess.asFileUri('vs/workbench/services/textfile/test/electron-browser/fixtures').fsPath;

			await Promises.copy(sourceDir, testDir, { preserveSymlinks: false });

			return { service, testDir };
		},

		teardown: () => {
			(<TextFileEditorModelManager>service.files).dispose();

			disposables.clear();

			return Promises.rm(testDir);
		},

		exists: Promises.exists,
		stat: Promises.stat,
		readFile,
		detectEncodingByBOM
	});
});
