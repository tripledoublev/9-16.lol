<script lang="ts">
	import { user } from '$lib/at';
	import { goto } from '$app/navigation';
	import { ActorSearch } from '$components';
	import type { AppBskyActorDefs } from '@atcute/bluesky';

	$effect(() => {
		if (!user.isLoggedIn) {
			goto('/login');
		}
	});

	function handleSelect(actor: AppBskyActorDefs.ProfileViewBasic) {
		goto(`/profile/${actor.did}`);
	}
</script>

<div class="min-h-screen bg-black">
	<header class="sticky top-0 z-40 bg-black/90 backdrop-blur-sm border-b border-gray-800">
		<div class="flex items-center justify-between px-4 py-3">
			<a href="/" class="text-white hover:text-gray-200" aria-label="Back">
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
				</svg>
			</a>
			<h1 class="text-lg font-semibold text-white">Search</h1>
			<div class="w-6"></div>
		</div>
	</header>

	<main class="p-4">
		<ActorSearch onSelect={handleSelect} />

		<div class="mt-8 text-center text-white text-sm">
			<p>Search for users by their handle or display name</p>
		</div>
	</main>
</div>
