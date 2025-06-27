/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'vitest';
import { AdoRepoId, getAdoRepoIdFromFetchUrl, getGithubRepoIdFromFetchUrl, GithubRepoId, normalizeFetchUrl, parseRemoteUrl } from '../../common/gitService';

function assertGitIdEquals(a: GithubRepoId | undefined, b: { org: string; repo: string } | undefined, message?: string) {
	assert.strictEqual(a?.org, b?.org, message);
	assert.strictEqual(a?.repo, b?.repo, message);
}

suite('parseRemoteUrl', () => {
	test('Should handle basic https', () => {
		assert.deepStrictEqual(
			parseRemoteUrl('https://example.com/owner/repo.git'),
			{ host: 'example.com', path: '/owner/repo.git' });
	});

	test('Should find full subdomain with https', () => {
		assert.deepStrictEqual(
			parseRemoteUrl('https://sub1.sub2.example.com/owner/repo.git'),
			{ host: 'sub1.sub2.example.com', path: '/owner/repo.git' });
	});

	test('Should handle basic Azure dev ops url', () => {
		assert.deepStrictEqual(
			parseRemoteUrl('https://test@dev.azure.com/test/project/_git/vscode-stuff'),
			{ host: 'dev.azure.com', path: '/test/project/_git/vscode-stuff' });
	});

	test('Should handle basic visual studio url', () => {
		assert.deepStrictEqual(
			parseRemoteUrl('https://test.visualstudio.com/project/one/_git/two'),
			{ host: 'test.visualstudio.com', path: '/project/one/_git/two' });
	});

	test('Should strip out ports', () => {
		assert.deepStrictEqual(
			parseRemoteUrl('https://example.com:8080/owner/repo.git'),
			{ host: 'example.com', path: '/owner/repo.git' });
	});

	test('Should handle ssh syntax', () => {
		assert.deepStrictEqual(
			parseRemoteUrl('ssh://git@github.com/owner/repo.git'),
			{ host: 'github.com', path: '/owner/repo.git' });
	});

	test('Should strip user ids', () => {
		assert.deepStrictEqual(
			parseRemoteUrl('https://myname@github.com/owner/repo.git'),
			{ host: 'github.com', path: '/owner/repo.git' },
			'https, name only');

		assert.deepStrictEqual(
			// [SuppressMessage("Microsoft.Security", "CS002:SecretInNextLine", Justification="test credentials")]
			parseRemoteUrl('https://myname:ghp_1234556@github.com/owner/repo.git'),
			{ host: 'github.com', path: '/owner/repo.git' },
			'https, with name and PAT');

		assert.deepStrictEqual(
			parseRemoteUrl('https://ghp_1234556@github.com/owner/repo.git'),
			{ host: 'github.com', path: '/owner/repo.git' },
			'https, PAT only');

		assert.deepStrictEqual(
			parseRemoteUrl('ssh://name@github.com/owner/repo.git'),
			{ host: 'github.com', path: '/owner/repo.git' },
			'ssh, name only');
	});
});

suite('getGithubRepoIdFromFetchUrl', () => {
	test('should return undefined for non-GitHub URLs', () => {
		const url = 'https://example.com/owner/repo.git';
		const result = getGithubRepoIdFromFetchUrl(url);
		assert.strictEqual(result, undefined);
	});

	test('should return the repo name for git shorthand URLs', () => {
		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('git@github.com:owner/repo.git'),
			{ org: 'owner', repo: 'repo' });

		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('git@xyz.ghe.com:owner/repo.git'),
			{ org: 'owner', repo: 'repo' },
			'ghe url');

		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('org-123@github.com:owner/repo.git'),
			{ org: 'owner', repo: 'repo' },
			`non 'git' user name`);

		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('org-1234@xyz.github.com:owner-xyz/some-repo.git'),
			{ org: 'owner-xyz', repo: 'some-repo' },
			`non 'git' user name with subdomain alias`);
	});

	test('should return the repo name for HTTPS URLs', () => {
		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('https://github.com/owner/repo.git'),
			{ org: 'owner', repo: 'repo' });

		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('https://xyz.ghe.com/owner/repo.git'),
			{ org: 'owner', repo: 'repo' },
			'ghe url');
	});

	test('should return the repos with trailing slash', () => {
		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('https://github.com/owner/repo/'),
			{ org: 'owner', repo: 'repo' });

		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('https://github.com/owner/repo.git/'),
			{ org: 'owner', repo: 'repo' });
	});

	test('should return the repo name for URLs without .git extension', () => {
		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('https://github.com/owner/repo'),
			{ org: 'owner', repo: 'repo' });

		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('https://github.com/owner/repo/'),
			{ org: 'owner', repo: 'repo' },
			'With trailing slash');
	});

	test('should return the repo name for ssh:// URLs', () => {
		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('ssh://git@github.com/owner/repo.git'),
			{ org: 'owner', repo: 'repo' });

		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('ssh://git@github.com/owner/repo'),
			{ org: 'owner', repo: 'repo' });

		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('ssh://git@ssh.github.com/owner/repo.git'),
			{ org: 'owner', repo: 'repo' },
			'On ssh.github.com subdomain');

		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('ssh://git@myco.ghe.com/owner/repo.git'),
			{ org: 'owner', repo: 'repo' },
			'ghe.com subdomain');

		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('ssh://git@github.com:443/owner/repo.git'),
			{ org: 'owner', repo: 'repo' },
			'With port');
	});

	test('should return undefined for invalid GitHub URLs', () => {
		{
			const url = 'https://github.com/owner';
			const result = getGithubRepoIdFromFetchUrl(url);
			assert.deepStrictEqual(result, undefined);
		}
		{
			const url = 'https://github.com/';
			const result = getGithubRepoIdFromFetchUrl(url);
			assert.deepStrictEqual(result, undefined);
		}
	});

	test('should return undefined for invalid URLs', () => {
		const url = 'invalid-url';
		const result = getGithubRepoIdFromFetchUrl(url);
		assert.deepStrictEqual(result, undefined);
	});

	test('should return undefined for unsupported scheme', () => {
		const url = 'gopher://github.com/owner/repo.git';
		const result = getGithubRepoIdFromFetchUrl(url);
		assert.deepStrictEqual(result, undefined);
	});

	test('should support github url that uses www subdomain', () => {
		// Likely a mistake but we can parse it easily
		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('https://www.github.com/owner/repo.git'),
			{ org: 'owner', repo: 'repo' });
	});

	test('should support github url using http', () => {
		// This is a mistake but we can parse it easily
		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('http://github.com/owner/repo.git'),
			{ org: 'owner', repo: 'repo' });
	});

	test('should support urls with custom user names and PAT in urls', () => {
		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('https://myname@github.com/owner/repo.git'),
			{ org: 'owner', repo: 'repo' },
			'https, name only');

		assertGitIdEquals(
			// [SuppressMessage("Microsoft.Security", "CS002:SecretInNextLine", Justification="test credentials")]
			getGithubRepoIdFromFetchUrl('https://myname:ghp_1234556@github.com/owner/repo.git'),
			{ org: 'owner', repo: 'repo' },
			'https, with name and PAT');

		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('https://ghp_1234556@github.com/owner/repo.git'),
			{ org: 'owner', repo: 'repo' },
			'https, PAT only');

		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('ssh://name@github.com/owner/repo.git'),
			{ org: 'owner', repo: 'repo' },
			'ssh, name only');
	});

	test('should support github urls that are likely ssh aliases', () => {
		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('git@my-user-name-github.com:owner/repo.git'),
			{ org: 'owner', repo: 'repo' },
			'Custom name before github.com');

		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('git@github.com-my-user-name:owner/repo.git'),
			{ org: 'owner', repo: 'repo' },
			'Custom name after github.com');
	});
});

suite('Sanitize Remote Repo Urls', () => {
	test('Https url is unchanged', () => {
		const url = 'https://github.com/owner/repo.git';
		const result = normalizeFetchUrl(url);
		assert.strictEqual(result, url);
	});

	test('Http url is converted to https', () => {
		const url = 'http://github.com/owner/repo.git';
		const result = normalizeFetchUrl(url);
		assert.strictEqual(result, 'https://github.com/owner/repo.git');
	});

	test('Query parameters are removed', () => {
		const url = 'https://github.com/owner/repo.git';
		const urlWithQuery = `${url}?query=param`;
		const result = normalizeFetchUrl(urlWithQuery);
		assert.strictEqual(result, url);
	});

	test('SSH is converted to HTTPS', () => {
		const url = 'git@github.com:owner/repo.git';
		const result = normalizeFetchUrl(url);
		assert.strictEqual(result, 'https://github.com/owner/repo.git');
	});

	test('Credentials are removed from HTTPs url', () => {
		const url = 'https://user:password@server.com/org/repo';
		const result = normalizeFetchUrl(url);
		assert.strictEqual(result, 'https://server.com/org/repo');
	});

	test('SSH ports are normalized and removed', () => {
		const url = 'ssh://git@bitbucket.company.pl:7999/project/repo.git';
		const result = normalizeFetchUrl(url);
		assert.strictEqual(result, 'https://bitbucket.company.pl/project/repo.git');
	});

	test('Bitbucket https urls are properly normalized', () => {
		const url = 'https://bitbucket.company.pl/scm/project/repo.git';
		const result = normalizeFetchUrl(url);
		assert.strictEqual(result, 'https://bitbucket.company.pl/project/repo.git');
	});

	test('Repos named scm by org foo are not improperly truncated', () => {
		const url = 'https://github.com/foo/scm.git';
		const result = normalizeFetchUrl(url);
		assert.strictEqual(result, 'https://github.com/foo/scm.git');
	});

	test('Repos named scm by user scm are not improperly truncated', () => {
		const url = 'https://github.com/scm/scm.git';
		const result = normalizeFetchUrl(url);
		assert.strictEqual(result, 'https://github.com/scm/scm.git');
	});
});

suite('getAdoRepoIdFromFetchUrl', () => {
	test('should return undefined for non-ADO URLs', () => {
		assert.strictEqual(
			getAdoRepoIdFromFetchUrl('https://example.com/owner/repo.git'),
			undefined);
		assert.strictEqual(
			getAdoRepoIdFromFetchUrl('https://github.com/scm/scm.git'),
			undefined);
	});

	test('should parse https format', () => {
		assert.deepStrictEqual(
			getAdoRepoIdFromFetchUrl('https://dev.azure.com/organization/project/_git/repository'),
			new AdoRepoId('organization', 'project', 'repository'));
	});

	test('should parse https format with _optimized', () => {
		assert.deepStrictEqual(
			getAdoRepoIdFromFetchUrl('https://dev.azure.com/organization/project/_git/_optimized/repository'),
			new AdoRepoId('organization', 'project', 'repository'));
	});

	test('should parse https format with _full', () => {
		assert.deepStrictEqual(
			getAdoRepoIdFromFetchUrl('https://dev.azure.com/organization/project/_git/_full/repository'),
			new AdoRepoId('organization', 'project', 'repository'));
	});

	test('should parse legacy https format', () => {
		assert.deepStrictEqual(
			getAdoRepoIdFromFetchUrl('https://organization.visualstudio.com/project/_git/repository'),
			new AdoRepoId('organization', 'project', 'repository'));
	});

	test('should parse legacy https format with _optimized', () => {
		assert.deepStrictEqual(
			getAdoRepoIdFromFetchUrl('https://organization.visualstudio.com/project/_git/_optimized/repository'),
			new AdoRepoId('organization', 'project', 'repository'));
	});

	test('should parse legacy https format with _full', () => {
		assert.deepStrictEqual(
			getAdoRepoIdFromFetchUrl('https://organization.visualstudio.com/project/_git/_full/repository'),
			new AdoRepoId('organization', 'project', 'repository'));
	});

	test('should parse ssh format', () => {
		assert.deepStrictEqual(
			getAdoRepoIdFromFetchUrl('git@ssh.dev.azure.com:v3/organization/project/repository'),
			new AdoRepoId('organization', 'project', 'repository'));
	});

	test('should parse ssh format with _optimized', () => {
		assert.deepStrictEqual(
			getAdoRepoIdFromFetchUrl('git@ssh.dev.azure.com:v3/organization/project/_optimized/repository'),
			new AdoRepoId('organization', 'project', 'repository'));
	});

	test('should parse ssh format with _full', () => {
		assert.deepStrictEqual(
			getAdoRepoIdFromFetchUrl('git@ssh.dev.azure.com:v3/organization/project/_full/repository'),
			new AdoRepoId('organization', 'project', 'repository'));
	});

	test('should parse legacy ssh format', () => {
		assert.deepStrictEqual(
			getAdoRepoIdFromFetchUrl('git@organization.visualstudio.com:v3/organization/project/repository'),
			new AdoRepoId('organization', 'project', 'repository'));
	});

	test('should parse legacy ssh format with _optimized', () => {
		assert.deepStrictEqual(
			getAdoRepoIdFromFetchUrl('git@organization.visualstudio.com:v3/organization/project/_optimized/repository'),
			new AdoRepoId('organization', 'project', 'repository'));
	});

	test('should parse legacy ssh format with _full', () => {
		assert.deepStrictEqual(
			getAdoRepoIdFromFetchUrl('git@organization.visualstudio.com:v3/organization/project/_full/repository'),
			new AdoRepoId('organization', 'project', 'repository'));
	});
});
