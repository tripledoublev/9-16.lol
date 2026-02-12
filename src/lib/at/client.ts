import { Client, simpleFetchHandler } from '@atcute/client';
import type { Did } from '@atcute/lexicons';
import { getPDS } from './did';
import { RELAY_URL } from './settings';

const clientCache = new Map<string, Client>();

export async function getClientForDid(did: Did): Promise<Client> {
	if (clientCache.has(did)) {
		return clientCache.get(did)!;
	}

	const pds = await getPDS(did);
	const client = new Client({
		handler: simpleFetchHandler({ service: pds })
	});

	clientCache.set(did, client);
	return client;
}

export function getPublicClient(): Client {
	const key = 'public';
	if (clientCache.has(key)) {
		return clientCache.get(key)!;
	}

	const client = new Client({
		handler: simpleFetchHandler({ service: 'https://public.api.bsky.app' })
	});

	clientCache.set(key, client);
	return client;
}

export function getRelayClient(): Client {
	const key = 'relay';
	if (clientCache.has(key)) {
		return clientCache.get(key)!;
	}

	const client = new Client({
		handler: simpleFetchHandler({ service: RELAY_URL })
	});

	clientCache.set(key, client);
	return client;
}
