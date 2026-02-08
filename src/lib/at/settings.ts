import { dev } from '$app/environment';

export const SITE = 'https://9-16.lol';
export const COLLECTION = 'lol.916.frame.image' as const;
export const REDIRECT_PATH = '/';
export const DOH_RESOLVER = 'https://mozilla.cloudflare-dns.com/dns-query';

type Permissions = {
	collections: readonly string[];
	rpc: Record<string, string | string[]>;
	blobs: readonly string[];
};

export const permissions = {
	collections: [COLLECTION],
	rpc: {},
	blobs: ['image/*']
} as const satisfies Permissions;

type ExtractCollectionBase<T extends string> = T extends `${infer Base}?${string}` ? Base : T;
export type AllowedCollection = ExtractCollectionBase<(typeof permissions.collections)[number]>;

export const signUpPDS = dev ? 'https://pds.rip/' : 'https://bsky.social/';
