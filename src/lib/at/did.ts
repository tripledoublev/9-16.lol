import {
	CompositeDidDocumentResolver,
	CompositeHandleResolver,
	DohJsonHandleResolver,
	PlcDidDocumentResolver,
	WebDidDocumentResolver,
	WellKnownHandleResolver
} from '@atcute/identity-resolver';
import type { Did, Handle } from '@atcute/lexicons';
import { db } from '$lib/cache/db';

const DOH_RESOLVER = 'https://mozilla.cloudflare-dns.com/dns-query';

const handleResolver = new CompositeHandleResolver({
	methods: {
		dns: new DohJsonHandleResolver({ dohUrl: DOH_RESOLVER }),
		http: new WellKnownHandleResolver()
	}
});

const didResolver = new CompositeDidDocumentResolver({
	methods: {
		plc: new PlcDidDocumentResolver(),
		web: new WebDidDocumentResolver()
	}
});

export async function resolveHandle(handle: Handle): Promise<Did> {
	const cached = await db.didDoc.get(handle);
	if (cached && cached.expiresAt > Date.now()) {
		return cached.did;
	}

	const did = await handleResolver.resolve(handle);
	await db.didDoc.put({
		key: handle,
		did,
		expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24h TTL
	});

	return did;
}

export async function getPDS(did: Did): Promise<string> {
	const cached = await db.pdsEndpoint.get(did);
	if (cached && cached.expiresAt > Date.now()) {
		return cached.pds;
	}

	const doc = await didResolver.resolve(did as Did<'plc'> | Did<'web'>);
	if (!doc.service) throw new Error('No PDS found');

	for (const service of doc.service) {
		if (service.id === '#atproto_pds') {
			const pds = service.serviceEndpoint.toString();
			await db.pdsEndpoint.put({
				did,
				pds,
				expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24h TTL
			});
			return pds;
		}
	}

	throw new Error('No PDS service found');
}

export async function getHandleFromDid(did: Did): Promise<string | null> {
	try {
		const doc = await didResolver.resolve(did as Did<'plc'> | Did<'web'>);
		const aka = doc.alsoKnownAs?.find((a) => a.startsWith('at://'));
		if (aka) {
			return aka.replace('at://', '');
		}
	} catch {
		// Ignore errors
	}
	return null;
}
