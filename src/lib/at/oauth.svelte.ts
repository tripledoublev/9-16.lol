import {
	configureOAuth,
	createAuthorizationUrl,
	finalizeAuthorization,
	OAuthUserAgent,
	getSession,
	deleteStoredSession
} from '@atcute/oauth-browser-client';
import { AppBskyActorDefs } from '@atcute/bluesky';
import {
	CompositeDidDocumentResolver,
	CompositeHandleResolver,
	DohJsonHandleResolver,
	LocalActorResolver,
	PlcDidDocumentResolver,
	WebDidDocumentResolver,
	WellKnownHandleResolver
} from '@atcute/identity-resolver';
import { Client } from '@atcute/client';
import { dev } from '$app/environment';
import { replaceState } from '$app/navigation';
import { metadata } from './metadata';
import { DOH_RESOLVER, REDIRECT_PATH, signUpPDS } from './settings';
import { SvelteURLSearchParams } from 'svelte/reactivity';
import type { ActorIdentifier, Did } from '@atcute/lexicons';

export const user = $state({
	agent: null as OAuthUserAgent | null,
	client: null as Client | null,
	profile: null as AppBskyActorDefs.ProfileViewDetailed | null | undefined,
	isInitializing: true,
	isLoggedIn: false,
	did: undefined as Did | undefined
});

export async function initClient() {
	user.isInitializing = true;

	// SvelteKit's `dev` is false for `npm run preview`, even if you're testing on localhost.
	// AT Protocol OAuth supports a special "localhost" client_id form that avoids hosting/fetching a
	// client metadata document (and sidesteps PDS hostname restrictions during local testing).
	const isLoopbackHost = (hostname: string) =>
		hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '::1';

	const runtimeUrl = new URL(window.location.href);
	const isLocalRuntime = dev || isLoopbackHost(runtimeUrl.hostname);

	// Redirect URI must use 127.0.0.1 (not "localhost") per RFC 8252.
	const redirectOrigin =
		runtimeUrl.hostname === 'localhost'
			? `${runtimeUrl.protocol}//127.0.0.1${runtimeUrl.port ? `:${runtimeUrl.port}` : ''}`
			: runtimeUrl.origin;

	const clientId = isLocalRuntime
		? `http://localhost` +
			`?redirect_uri=${encodeURIComponent(redirectOrigin + REDIRECT_PATH)}` +
			`&scope=${encodeURIComponent(metadata.scope)}`
		: metadata.client_id;

	const handleResolver = new CompositeHandleResolver({
		methods: {
			dns: new DohJsonHandleResolver({ dohUrl: DOH_RESOLVER }),
			http: new WellKnownHandleResolver()
		}
	});

	configureOAuth({
		metadata: {
			client_id: clientId,
			redirect_uri: `${isLocalRuntime ? redirectOrigin + REDIRECT_PATH : metadata.redirect_uris[0]}`
		},
		identityResolver: new LocalActorResolver({
			handleResolver: handleResolver,
			didDocumentResolver: new CompositeDidDocumentResolver({
				methods: {
					plc: new PlcDidDocumentResolver(),
					web: new WebDidDocumentResolver()
				}
			})
		})
	});

	const params = new SvelteURLSearchParams(location.hash.slice(1));
	const did = (localStorage.getItem('current-login') as Did) ?? undefined;

	if (params.size > 0) {
		await finalizeLogin(params, did);
	} else if (did) {
		await resumeSession(did);
	}

	user.isInitializing = false;
}

export async function login(handle: ActorIdentifier) {
	if (handle.startsWith('did:')) {
		if (handle.length < 6) throw new Error('DID must be at least 6 characters');
		await startAuthorization(handle as ActorIdentifier);
	} else if (handle.includes('.') && handle.length > 3) {
		const processed = handle.startsWith('@') ? handle.slice(1) : handle;
		if (processed.length < 4) throw new Error('Handle must be at least 4 characters');
		await startAuthorization(processed as ActorIdentifier);
	} else if (handle.length > 3) {
		const processed = (handle.startsWith('@') ? handle.slice(1) : handle) + '.bsky.social';
		await startAuthorization(processed as ActorIdentifier);
	} else {
		throw new Error('Please provide a valid handle or DID.');
	}
}

export async function signup() {
	await startAuthorization();
}

async function startAuthorization(identity?: ActorIdentifier) {
	const authUrl = await createAuthorizationUrl({
		target: identity
			? { type: 'account', identifier: identity }
			: { type: 'pds', serviceUrl: signUpPDS },
		// @ts-expect-error - prompt is new
		prompt: identity ? undefined : 'create',
		scope: metadata.scope
	});

	await new Promise((resolve) => setTimeout(resolve, 200));
	window.location.assign(authUrl);

	await new Promise((_resolve, reject) => {
		const listener = () => {
			reject(new Error(`user aborted the login request`));
		};
		window.addEventListener('pageshow', listener, { once: true });
	});
}

export async function logout() {
	const currentAgent = user.agent;
	if (currentAgent) {
		const did = currentAgent.session.info.sub;

		localStorage.removeItem('current-login');
		localStorage.removeItem(`profile-${did}`);

		try {
			await currentAgent.signOut();
		} catch {
			deleteStoredSession(did);
		}

		user.agent = null;
		user.profile = null;
		user.isLoggedIn = false;
		user.did = undefined;
		user.client = null;
	}
}

async function finalizeLogin(params: SvelteURLSearchParams, did?: Did) {
	try {
		const { session } = await finalizeAuthorization(params);
		replaceState(location.pathname + location.search, {});

		user.agent = new OAuthUserAgent(session);
		user.did = session.info.sub;
		user.client = new Client({ handler: user.agent });

		localStorage.setItem('current-login', session.info.sub);
		await loadProfile(session.info.sub);
		user.isLoggedIn = true;

		try {
			if (!user.profile) return;
			const recentLogins = JSON.parse(localStorage.getItem('recent-logins') || '{}');
			recentLogins[session.info.sub] = user.profile;
			localStorage.setItem('recent-logins', JSON.stringify(recentLogins));
		} catch {
			// Ignore localStorage errors
		}
	} catch (error) {
		console.error('error finalizing login', error);
		if (did) {
			await resumeSession(did);
		}
	}
}

async function resumeSession(did: Did) {
	try {
		const session = await getSession(did, { allowStale: true });

		if (session.token.expires_at && session.token.expires_at < Date.now()) {
			throw Error('session expired, signing out!');
		}

		if (session.token.scope !== metadata.scope) {
			throw Error('scope changed, signing out!');
		}

		user.agent = new OAuthUserAgent(session);
		user.did = session.info.sub;
		user.client = new Client({ handler: user.agent });

		await loadProfile(session.info.sub);
		user.isLoggedIn = true;
	} catch (error) {
		console.error('error resuming session', error);
		deleteStoredSession(did);
		localStorage.removeItem('current-login');
	}
}

async function loadProfile(actor: Did) {
	const cached = localStorage.getItem(`profile-${actor}`);
	if (cached) {
		try {
			user.profile = JSON.parse(cached);
			return;
		} catch {
			// Ignore parse errors
		}
	}

	try {
		const { simpleFetchHandler, Client } = await import('@atcute/client');
		const publicClient = new Client({
			handler: simpleFetchHandler({ service: 'https://public.api.bsky.app' })
		});

		const response = await publicClient.get('app.bsky.actor.getProfile', {
			params: { actor }
		});

		if (response.ok && response.data.handle !== 'handle.invalid') {
			user.profile = response.data;
			localStorage.setItem(`profile-${actor}`, JSON.stringify(response.data));
		} else {
			user.profile = { did: actor, handle: 'handle.invalid' };
		}
	} catch {
		user.profile = { did: actor, handle: 'handle.invalid' };
	}
}
