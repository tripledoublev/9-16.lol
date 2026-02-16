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

const FRAMES_PER_DID = 10;

async function fetchFramesForDid(
	did: Did,
	collection: string = COLLECTION
): Promise<RecentActivity[]> {
	try {
		const client = await getClientForDid(did);
		// @ts-expect-error - com.atproto.repo.listRecords is valid but not typed in current client setup
		const response = await client.get('com.atproto.repo.listRecords', {
			params: { repo: did, collection, limit: FRAMES_PER_DID, reverse: true }
		});

		if (!response.ok || !response.data) {
			await setRepoActivityCache(collection, did, {});
			return [];
		}

		const data = response.data as ListRecordsOutput;
		const activities: RecentActivity[] = [];

		for (const record of data.records ?? []) {
			const createdAt = record.value?.createdAt;
			const blobCid = record.value?.image?.ref?.$link;
			if (blobCid && createdAt) {
				activities.push({ did, blobCid, createdAt, text: record.value?.text, alt: record.value?.alt });
			}
		}

		if (activities.length > 0) {
			const latest = activities[0];
			await setRepoActivityCache(collection, did, {
				latestCreatedAt: latest.createdAt,
				latestCid: latest.blobCid,
				latestText: latest.text,
				latestAlt: latest.alt
			});
		} else {
			await setRepoActivityCache(collection, did, {});
		}

		return activities;
	} catch {
		await setRepoActivityCache(collection, did, {});
		return [];
	}
}

export async function refreshRecentActivityForDid(
	did: Did,
	collection: string = COLLECTION
): Promise<RecentActivity | null> {
	const frames = await fetchFramesForDid(did, collection);
	return frames[0] ?? null;
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
	const didsToFetch: Did[] = [];

	for (const did of dids) {
		const cached = await getRepoActivityCache(collection, did);
		if (cached && !cached.latestCid) {
			// Known to have no frames, skip
			continue;
		}
		didsToFetch.push(did);
	}

	const fetched = await runBatches(didsToFetch, batchSize, (did) =>
		fetchFramesForDid(did, collection)
	);

	for (const batch of fetched) {
		activities.push(...batch);
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
