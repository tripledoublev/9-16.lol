import type { Did } from '@atcute/lexicons';
import { COLLECTION } from './settings';
import { getClientForDid, getRelayClient } from './client';
import {
	addDidToRelayReposCache,
	getRelayReposCache,
	getRepoActivityCache,
	setRelayReposCache,
	setRepoActivityCache,
	trimRepoActivityCache
} from '$lib/cache/db';

const RELAY_PAGE_LIMIT = 2000;
const ACTIVITY_BATCH_SIZE = 20;

export interface RecentActivity {
	did: Did;
	createdAt: string;
	blobCid: string;
	text?: string;
	alt?: string;
}

interface RelayRepo {
	did: Did;
}

interface ListReposByCollectionOutput {
	cursor?: string;
	repos: RelayRepo[];
}

interface RepoRecord {
	value?: {
		createdAt?: string;
		text?: string;
		alt?: string;
		image?: {
			ref?: { $link?: string };
		};
	};
}

interface ListRecordsOutput {
	records?: RepoRecord[];
}

export async function listReposByCollection(collection: string = COLLECTION): Promise<Did[]> {
	const cached = await getRelayReposCache(collection);
	if (cached) {
		return cached;
	}

	const relay = getRelayClient();
	const dids: Did[] = [];
	let cursor: string | undefined = undefined;

	do {
		// @ts-expect-error - available on relay but not typed in current client setup
		const response = await relay.get('com.atproto.sync.listReposByCollection', {
			params: {
				collection,
				limit: RELAY_PAGE_LIMIT,
				cursor
			}
		});

		if (!response.ok || !response.data) {
			break;
		}

		const data = response.data as ListReposByCollectionOutput;
		for (const repo of data.repos ?? []) {
			dids.push(repo.did);
		}

		cursor = data.cursor;
	} while (cursor);

	const unique = [...new Set(dids)];
	await setRelayReposCache(collection, unique);
	return unique;
}

async function fetchLatestForDid(
	did: Did,
	collection: string = COLLECTION
): Promise<RecentActivity | null> {
	try {
		const client = await getClientForDid(did);
		// @ts-expect-error - com.atproto.repo.listRecords is valid but not typed in current client setup
		const response = await client.get('com.atproto.repo.listRecords', {
			params: {
				repo: did,
				collection,
				limit: 1,
				reverse: true
			}
		});

		if (!response.ok || !response.data) {
			await setRepoActivityCache(collection, did, {});
			return null;
		}

		const data = response.data as ListRecordsOutput;
		const record = data.records?.[0];
		const createdAt = record?.value?.createdAt;
		const blobCid = record?.value?.image?.ref?.$link;

		if (!blobCid || !createdAt) {
			await setRepoActivityCache(collection, did, {});
			return null;
		}

		const activity: RecentActivity = {
			did,
			blobCid,
			createdAt,
			text: record.value?.text,
			alt: record.value?.alt
		};

			await setRepoActivityCache(collection, did, {
				latestCreatedAt: activity.createdAt,
				latestCid: activity.blobCid,
				latestText: activity.text,
				latestAlt: activity.alt
			});

		return activity;
	} catch {
		await setRepoActivityCache(collection, did, {});
		return null;
	}
}

async function runBatches<T, R>(
	items: T[],
	size: number,
	run: (item: T) => Promise<R>
): Promise<R[]> {
	const output: R[] = [];

	for (let i = 0; i < items.length; i += size) {
		const chunk = items.slice(i, i + size);
		const results = await Promise.all(chunk.map(run));
		output.push(...results);
	}

	return output;
}

export async function getRecentActiveRepos(options: {
	collection?: string;
	limit?: number;
	batchSize?: number;
} = {}): Promise<RecentActivity[]> {
	const collection = options.collection ?? COLLECTION;
	const limit = options.limit ?? 100;
	const batchSize = options.batchSize ?? ACTIVITY_BATCH_SIZE;
	const dids = await listReposByCollection(collection);

	const activities: RecentActivity[] = [];
	const staleDids: Did[] = [];

	for (const did of dids) {
		const cached = await getRepoActivityCache(collection, did);
		if (cached && cached.latestCreatedAt && cached.latestCid) {
			activities.push({
				did: cached.did,
				createdAt: cached.latestCreatedAt,
				blobCid: cached.latestCid,
				text: cached.latestText,
				alt: cached.latestAlt
			});
		} else {
			staleDids.push(did);
		}
	}

	if (staleDids.length > 0) {
		const refreshed = await runBatches(staleDids, batchSize, (did) =>
			fetchLatestForDid(did, collection)
		);

		for (const item of refreshed) {
			if (item) {
				activities.push(item);
			}
		}
	}

	await trimRepoActivityCache(500);

	return activities
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
		.slice(0, limit);
}

export async function updateRecentActivityFromJetstream(
	did: Did,
	blobCid: string,
	createdAt: string,
	text?: string,
	alt?: string,
	collection = COLLECTION
) {
	await addDidToRelayReposCache(collection, did);
	await setRepoActivityCache(collection, did, {
		latestCreatedAt: createdAt,
		latestCid: blobCid,
		latestText: text,
		latestAlt: alt
	});
	await trimRepoActivityCache(500);
}
