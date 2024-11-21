
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

async function doRestoreDatabase(data: string): Promise<void> {
    console.log('>> doRestoreDatabase...');
    // (async function importData() {
    //     const input = document.createElement("input");
    //     input.type = "file";
    //     input.click();
    //     await new Promise((r) => (input.onchange = r));
    //     const reader = new FileReader();
    //     reader.readAsText(input.files[0]);
    //     await new Promise((r) => (reader.onload = r));
    //     const encoder = new TextEncoder();
    //     for (const [dbName, dbData] of Object.entries(JSON.parse(reader.result))) {
    //       const req = indexedDB.open(dbName);
    //       req.onupgradeneeded = ({ target: { result: db } }) =>
    //         Object.keys(dbData).forEach((name) => db.createObjectStore(name));
    //       await new Promise((r) => (req.onsuccess = r));
    //       for (const [storeName, storeData] of Object.entries(dbData)) {
    //         const transaction = req.result.transaction(storeName, "readwrite");
    //         const store = transaction.objectStore(storeName);
    //         store.clear(); // Avoid config conflict
    //         for (const [key, { type, value }] of Object.entries(storeData)) {
    //           const str = decodeURIComponent(value);
    //           store.put(type === "String" ? str : encoder.encode(str), key);
    //         }
    //         await new Promise((r) => (transaction.oncomplete = r));
    //       }
    //     }
    //     location.reload();
    //   })();
}

/**
 * Loads from the files system and restores databases
 *      vscode-web-state-db-global
 *      vscode-web-state-db-empty-window
 *      vscode-web-state-db--${workspace-short-id}
 */
export async function restoreIndexedDB(): Promise<void> {
    console.log('> restore inexed DB');

    // cleanup existing databases
    try {
        const databases = await indexedDB.databases();
        for (const database of databases) {
            console.log(`> removing database [${database.name}]`);
            if (database.name) {
                await indexedDB.deleteDatabase(database.name);
            }
        }
    
    } catch (error) {
        console.log('>> ERROR cleaning up existing databases');
    }

    // load backed up database from file system
	const href = `./oss-dev/static/vscode-web.json`;
    console.log(`> URI to take the database state: ${href}`);

	try {
		var xmlhttp = new XMLHttpRequest();
		xmlhttp.open("GET", href, false);
		xmlhttp.send();

		if (xmlhttp.status == 200 && xmlhttp.readyState == 4) {
            // restore the database
			doRestoreDatabase(xmlhttp.responseText);
		}

		console.log(`Request failed with status: ${xmlhttp.status}, readyState: ${xmlhttp.readyState}`);
	} catch (err) {
		console.error(err);
	}

    // do nothing, just start with clear DB
}
