import type { Did } from '@atcute/lexicons';
import type { FrameRecord } from '$lib/at/repo';
import { listFrames } from '$lib/at/repo';
import { getPDS } from '$lib/at/did';
import { getPublicClient } from '$lib/at/client';
import { db, TTL, getFollows, setFollows, getCachedProfile, setCachedProfile } from '$lib/cache/db';

// Constants
const FOLLOW_CAP = 150;
const CONCURRENCY = 8;
const PER_AUTHOR_PAGE = 5;
const PDS_TIMEOUT = 3000;

export interface AuthorState {
	did: Did;
	pds: string;
	cursor?: string;
	buffer: FrameRecord[];
	exhausted: boolean;
	lastFetchedAt: number;
	profile?: {
		handle: string;
		displayName?: string;
		avatar?: string;
	};
}

export interface FeedAuthor {
	did: Did;
	handle: string;
	displayName?: string;
	avatar?: string;
	latestFrameAt?: string;
	hasUnseen: boolean;
	frames: FrameRecord[];
}

class MaxHeap<T> {
	private heap: T[] = [];
	constructor(private compare: (a: T, b: T) => number) {}

	push(item: T) {
		this.heap.push(item);
		this.bubbleUp(this.heap.length - 1);
	}

	pop(): T | undefined {
		if (this.heap.length === 0) return undefined;
		const top = this.heap[0];
		const last = this.heap.pop();
		if (this.heap.length > 0 && last) {
			this.heap[0] = last;
			this.bubbleDown(0);
		}
		return top;
	}

	peek(): T | undefined {
		return this.heap[0];
	}

	get size(): number {
		return this.heap.length;
	}

	private bubbleUp(i: number) {
		while (i > 0) {
			const parent = Math.floor((i - 1) / 2);
			if (this.compare(this.heap[i], this.heap[parent]) <= 0) break;
			[this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
			i = parent;
		}
	}

	private bubbleDown(i: number) {
		while (true) {
			const left = 2 * i + 1;
			const right = 2 * i + 2;
			let largest = i;

			if (left < this.heap.length && this.compare(this.heap[left], this.heap[largest]) > 0) {
				largest = left;
			}
			if (right < this.heap.length && this.compare(this.heap[right], this.heap[largest]) > 0) {
				largest = right;
			}
			if (largest === i) break;

			[this.heap[i], this.heap[largest]] = [this.heap[largest], this.heap[i]];
			i = largest;
		}
	}
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	const timeout = new Promise<never>((_, reject) =>
		setTimeout(() => reject(new Error('Timeout')), ms)
	);
	return Promise.race([promise, timeout]);
}

async function fetchFollows(did: Did): Promise<Did[]> {
	const cached = await getFollows(did);
	if (cached) return cached;

	const client = getPublicClient();
	const follows: Did[] = [];
	let cursor: string | undefined;

	while (follows.length < FOLLOW_CAP) {
		const response = await client.get('app.bsky.graph.getFollows', {
			params: {
				actor: did,
				limit: 100,
				cursor
			}
		});

		if (!response.ok) break;

		for (const follow of response.data.follows) {
			follows.push(follow.did as Did);
			if (follows.length >= FOLLOW_CAP) break;
		}

		cursor = response.data.cursor;
		if (!cursor) break;
	}

	await setFollows(did, follows);
	return follows;
}

async function fetchProfile(did: Did): Promise<AuthorState['profile'] | undefined> {
	const cached = await getCachedProfile(did);
	if (cached) {
		return {
			handle: cached.handle,
			displayName: cached.displayName,
			avatar: cached.avatar
		};
	}

	try {
		const client = getPublicClient();
		const response = await client.get('app.bsky.actor.getProfile', {
			params: { actor: did }
		});

		if (response.ok) {
			const profile = {
				handle: response.data.handle,
				displayName: response.data.displayName,
				avatar: response.data.avatar
			};

			await setCachedProfile({
				did,
				handle: profile.handle,
				displayName: profile.displayName,
				avatar: profile.avatar
			});

			return profile;
		}
	} catch {
		// Ignore errors
	}

	return undefined;
}

async function initAuthor(did: Did): Promise<AuthorState | null> {
	try {
		const pds = await withTimeout(getPDS(did), PDS_TIMEOUT);
		const { frames, cursor } = await withTimeout(
			listFrames(did, { limit: PER_AUTHOR_PAGE }),
			PDS_TIMEOUT
		);

		const profile = await fetchProfile(did);

		return {
			did,
			pds,
			cursor,
			buffer: frames,
			exhausted: frames.length < PER_AUTHOR_PAGE || !cursor,
			lastFetchedAt: Date.now(),
			profile
		};
	} catch (e) {
		console.warn(`Failed to init author ${did}:`, e);
		return null;
	}
}

export async function* createFeedGenerator(
	viewerDid: Did,
	seenStates: Map<Did, string>
): AsyncGenerator<FeedAuthor[], void, unknown> {
	const follows = await fetchFollows(viewerDid);
	const authorStates = new Map<Did, AuthorState>();

	// Initialize authors with concurrency limit
	const queue = [...follows];
	const initializing: Promise<void>[] = [];

	while (queue.length > 0 || initializing.length > 0) {
		while (initializing.length < CONCURRENCY && queue.length > 0) {
			const did = queue.shift()!;
			const p = initAuthor(did)
				.then((state) => {
					if (state && state.buffer.length > 0) {
						authorStates.set(did, state);
					}
				})
				.finally(() => {
					const idx = initializing.indexOf(p);
					if (idx !== -1) initializing.splice(idx, 1);
				});
			initializing.push(p);
		}

		if (initializing.length > 0) {
			await Promise.race(initializing);
		}
	}

	// Build heap from authors
	const heap = new MaxHeap<AuthorState>((a, b) => {
		const aTime = a.buffer[0]?.value.createdAt ?? '';
		const bTime = b.buffer[0]?.value.createdAt ?? '';
		return aTime.localeCompare(bTime);
	});

	for (const state of authorStates.values()) {
		if (state.buffer.length > 0) {
			heap.push(state);
		}
	}

	// Build initial feed authors list
	const feedAuthors: FeedAuthor[] = [];

	while (heap.size > 0) {
		const state = heap.pop()!;
		const lastSeenAt = seenStates.get(state.did);
		const latestFrameAt = state.buffer[0]?.value.createdAt;

		feedAuthors.push({
			did: state.did,
			handle: state.profile?.handle ?? state.did,
			displayName: state.profile?.displayName,
			avatar: state.profile?.avatar,
			latestFrameAt,
			hasUnseen: !lastSeenAt || (latestFrameAt ? latestFrameAt > lastSeenAt : false),
			frames: state.buffer
		});
	}

	// Sort by latest frame timestamp (newest first)
	feedAuthors.sort((a, b) => {
		const aTime = a.latestFrameAt ?? '';
		const bTime = b.latestFrameAt ?? '';
		return bTime.localeCompare(aTime);
	});

	yield feedAuthors;
}

export async function loadMoreFrames(
	did: Did,
	cursor?: string
): Promise<{ frames: FrameRecord[]; cursor?: string; exhausted: boolean }> {
	try {
		const { frames, cursor: nextCursor } = await listFrames(did, {
			limit: PER_AUTHOR_PAGE,
			cursor
		});

		return {
			frames,
			cursor: nextCursor,
			exhausted: frames.length < PER_AUTHOR_PAGE || !nextCursor
		};
	} catch (e) {
		console.error(`Failed to load more frames for ${did}:`, e);
		return { frames: [], exhausted: true };
	}
}
