import { user } from '$lib/at/oauth.svelte';
import type { Did } from '@atcute/lexicons';

export function getSession() {
	return {
		get isLoggedIn() {
			return user.isLoggedIn;
		},
		get isInitializing() {
			return user.isInitializing;
		},
		get did() {
			return user.did;
		},
		get profile() {
			return user.profile;
		},
		get handle() {
			return user.profile?.handle ?? user.did;
		},
		get displayName() {
			return user.profile?.displayName ?? user.profile?.handle ?? user.did;
		},
		get avatar() {
			return user.profile?.avatar;
		}
	};
}

export type Session = ReturnType<typeof getSession>;
