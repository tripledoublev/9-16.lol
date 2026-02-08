import Dexie, { type EntityTable } from 'dexie';
import type { Did } from '@atcute/lexicons';
import type { FrameRecord } from '$lib/at/repo';

interface DidDoc {
	key: string; // handle or did
	did: Did;
	expiresAt: number;
}

interface PdsEndpoint {
	did: Did;
	pds: string;
	expiresAt: number;
}

interface AuthorFrames {
	key: string; // `${did}:${cursor || 'first'}`
	did: Did;
	frames: FrameRecord[];
	cursor?: string;
	nextCursor?: string;
	expiresAt: number;
}

interface SeenState {
	authorDid: Did;
	viewerDid: Did;
	lastSeenCreatedAt: string;
	updatedAt: number;
}

interface Follows {
	viewerDid: Did;
	follows: Did[];
	expiresAt: number;
}

interface ProfileCache {
	did: Did;
	handle: string;
	displayName?: string;
	avatar?: string;
	expiresAt: number;
}

class FrameDatabase extends Dexie {
	didDoc!: EntityTable<DidDoc, 'key'>;
	pdsEndpoint!: EntityTable<PdsEndpoint, 'did'>;
	authorFrames!: EntityTable<AuthorFrames, 'key'>;
	seenState!: EntityTable<SeenState, 'authorDid'>;
	follows!: EntityTable<Follows, 'viewerDid'>;
	profileCache!: EntityTable<ProfileCache, 'did'>;

	constructor() {
		super('916lol');
		this.version(1).stores({
			didDoc: 'key, expiresAt',
			pdsEndpoint: 'did, expiresAt',
			authorFrames: 'key, did, expiresAt',
			seenState: '[authorDid+viewerDid], updatedAt',
			follows: 'viewerDid, expiresAt',
			profileCache: 'did, expiresAt'
		});
	}
}

export const db = new FrameDatabase();

// TTL constants (in ms)
export const TTL = {
	DID_DOC: 24 * 60 * 60 * 1000, // 24 hours
	PDS: 24 * 60 * 60 * 1000, // 24 hours
	FOLLOWS: 30 * 60 * 1000, // 30 minutes
	FIRST_PAGE_FRAMES: 5 * 60 * 1000, // 5 minutes
	DEEP_PAGE_FRAMES: 2 * 60 * 60 * 1000, // 2 hours
	PROFILE: 60 * 60 * 1000 // 1 hour
};

export async function cleanExpiredCache() {
	const now = Date.now();

	await Promise.all([
		db.didDoc.where('expiresAt').below(now).delete(),
		db.pdsEndpoint.where('expiresAt').below(now).delete(),
		db.authorFrames.where('expiresAt').below(now).delete(),
		db.follows.where('expiresAt').below(now).delete(),
		db.profileCache.where('expiresAt').below(now).delete()
	]);
}

export async function getFollows(viewerDid: Did): Promise<Did[] | null> {
	const cached = await db.follows.get(viewerDid);
	if (cached && cached.expiresAt > Date.now()) {
		return cached.follows;
	}
	return null;
}

export async function setFollows(viewerDid: Did, follows: Did[]) {
	await db.follows.put({
		viewerDid,
		follows,
		expiresAt: Date.now() + TTL.FOLLOWS
	});
}

export async function getSeenState(
	viewerDid: Did,
	authorDid: Did
): Promise<string | null> {
	const record = await db.seenState
		.where('[authorDid+viewerDid]')
		.equals([authorDid, viewerDid])
		.first();
	return record?.lastSeenCreatedAt ?? null;
}

export async function setSeenState(
	viewerDid: Did,
	authorDid: Did,
	lastSeenCreatedAt: string
) {
	await db.seenState.put({
		authorDid,
		viewerDid,
		lastSeenCreatedAt,
		updatedAt: Date.now()
	});
}

export async function getCachedProfile(did: Did): Promise<ProfileCache | null> {
	const cached = await db.profileCache.get(did);
	if (cached && cached.expiresAt > Date.now()) {
		return cached;
	}
	return null;
}

export async function setCachedProfile(profile: Omit<ProfileCache, 'expiresAt'>) {
	await db.profileCache.put({
		...profile,
		expiresAt: Date.now() + TTL.PROFILE
	});
}

export type { DidDoc, PdsEndpoint, AuthorFrames, SeenState, Follows, ProfileCache };
