import type { Did } from '@atcute/lexicons';
import * as TID from '@atcute/tid';
import { user } from './oauth.svelte';
import { getClientForDid } from './client';
import { COLLECTION } from './settings';

export interface FrameRecord {
	uri: string;
	cid: string;
	value: {
		createdAt: string;
		text?: string;
		alt?: string;
		aspect?: '9:16' | 'original' | 'other';
		image: {
			$type: 'blob';
			ref: { $link: string };
			mimeType: string;
			size: number;
		};
		expiresAt?: string;
	};
}

export async function createFrame(data: {
	image: Blob;
	text?: string;
	alt?: string;
	aspect?: '9:16' | 'original' | 'other';
	expiresAt?: Date;
}): Promise<{ uri: string; cid: string }> {
	if (!user.client || !user.did) {
		throw new Error('Not logged in');
	}

	// @ts-expect-error - com.atproto.repo.uploadBlob is valid but not typed in bluesky package
	const blobResponse = await user.client.post('com.atproto.repo.uploadBlob', {
		input: data.image
	});

	if (!blobResponse.ok || !blobResponse.data) {
		throw new Error('Failed to upload blob');
	}

	const rkey = TID.now();
	const record: FrameRecord['value'] = {
		createdAt: new Date().toISOString(),
		// @ts-expect-error - blob property exists on response
		image: blobResponse.data.blob as FrameRecord['value']['image'],
		aspect: data.aspect ?? '9:16'
	};

	if (data.text) record.text = data.text;
	if (data.alt) record.alt = data.alt;
	if (data.expiresAt) record.expiresAt = data.expiresAt.toISOString();

	// @ts-expect-error - com.atproto.repo.createRecord is valid but not typed in bluesky package
	const response = await user.client.post('com.atproto.repo.createRecord', {
		input: {
			repo: user.did,
			collection: COLLECTION,
			rkey,
			record
		}
	});

	if (!response.ok || !response.data) {
		throw new Error('Failed to create frame record');
	}

	return {
		// @ts-expect-error - uri/cid exist on response
		uri: response.data.uri,
		// @ts-expect-error - uri/cid exist on response
		cid: response.data.cid
	};
}

export async function listFrames(
	did: Did,
	options: { limit?: number; cursor?: string } = {}
): Promise<{ frames: FrameRecord[]; cursor?: string }> {
	const client = await getClientForDid(did);
	const limit = options.limit ?? 50;

	// @ts-expect-error - com.atproto.repo.listRecords is valid but not typed in bluesky package
	const response = await client.get('com.atproto.repo.listRecords', {
		params: {
			repo: did,
			collection: COLLECTION,
			limit,
			cursor: options.cursor,
			reverse: true // Newest first
		}
	});

	if (!response.ok || !response.data) {
		return { frames: [] };
	}

	// @ts-expect-error - records exists on response
	const records = response.data.records as Array<{
		uri: string;
		cid: string;
		value: unknown;
	}>;

	const frames = records.map((r) => ({
		uri: r.uri,
		cid: r.cid,
		value: r.value as FrameRecord['value']
	}));

	return {
		frames,
		// @ts-expect-error - cursor exists on response
		cursor: response.data.cursor
	};
}

export async function getFrame(uri: string): Promise<FrameRecord | null> {
	const parts = uri.replace('at://', '').split('/');
	if (parts.length < 3) return null;

	const did = parts[0] as Did;
	const collection = parts[1];
	const rkey = parts[2];

	if (collection !== COLLECTION) return null;

	const client = await getClientForDid(did);

	// @ts-expect-error - com.atproto.repo.getRecord is valid but not typed in bluesky package
	const response = await client.get('com.atproto.repo.getRecord', {
		params: {
			repo: did,
			collection: COLLECTION,
			rkey
		}
	});

	if (!response.ok || !response.data) return null;

	return {
		// @ts-expect-error - uri/cid/value exist on response
		uri: response.data.uri,
		// @ts-expect-error - uri/cid/value exist on response
		cid: response.data.cid,
		// @ts-expect-error - uri/cid/value exist on response
		value: response.data.value as FrameRecord['value']
	};
}

export async function deleteFrame(rkey: string): Promise<boolean> {
	if (!user.client || !user.did) {
		throw new Error('Not logged in');
	}

	// @ts-expect-error - com.atproto.repo.deleteRecord is valid but not typed in bluesky package
	const response = await user.client.post('com.atproto.repo.deleteRecord', {
		input: {
			repo: user.did,
			collection: COLLECTION,
			rkey
		}
	});

	return response.ok;
}

export function getFrameImageUrl(did: Did, cid: string): string {
	return `https://cdn.bsky.app/img/feed_fullsize/plain/${did}/${cid}@jpeg`;
}

export function getFrameThumbnailUrl(did: Did, cid: string): string {
	return `https://cdn.bsky.app/img/feed_thumbnail/plain/${did}/${cid}@jpeg`;
}
