<script lang="ts">
	import { getPublicClient } from '$lib/at/client';
	import type { AppBskyActorDefs } from '@atcute/bluesky';

	interface Props {
		onSelect?: (actor: AppBskyActorDefs.ProfileViewBasic) => void;
	}

	let { onSelect }: Props = $props();

	let query = $state('');
	let results = $state<AppBskyActorDefs.ProfileViewBasic[]>([]);
	let isSearching = $state(false);
	let searchTimeout: ReturnType<typeof setTimeout>;

	function handleInput() {
		clearTimeout(searchTimeout);

		if (!query.trim()) {
			results = [];
			return;
		}

		searchTimeout = setTimeout(async () => {
			isSearching = true;
			try {
				const client = getPublicClient();
				const response = await client.get('app.bsky.actor.searchActorsTypeahead', {
					params: {
						q: query,
						limit: 10
					}
				});

				if (response.ok) {
					results = response.data.actors;
				}
			} catch (e) {
				console.error('Search failed:', e);
			} finally {
				isSearching = false;
			}
		}, 300);
	}

	function handleSelect(actor: AppBskyActorDefs.ProfileViewBasic) {
		onSelect?.(actor);
		query = '';
		results = [];
	}
</script>

<div class="relative">
	<div class="relative">
		<input
			type="text"
			bind:value={query}
			oninput={handleInput}
			placeholder="Search users..."
			class="w-full bg-black border border-white rounded-lg pl-10 pr-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-white"
		/>
		<svg
			class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
			/>
		</svg>
		{#if isSearching}
			<div class="absolute right-3 top-1/2 -translate-y-1/2">
				<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
			</div>
		{/if}
	</div>

	{#if results.length > 0}
		<div class="absolute top-full left-0 right-0 mt-1 bg-black border border-white rounded-lg overflow-hidden z-20 max-h-80 overflow-y-auto">
			{#each results as actor}
				<button
					type="button"
					onclick={() => handleSelect(actor)}
					class="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-700 transition-colors"
				>
					<div class="w-10 h-10 rounded-full overflow-hidden bg-gray-900 flex-shrink-0">
						{#if actor.avatar}
							<img src={actor.avatar} alt={actor.handle} class="w-full h-full object-cover" />
						{:else}
							<div class="w-full h-full flex items-center justify-center text-gray-200">
								{actor.handle[0]?.toUpperCase() ?? '?'}
							</div>
						{/if}
					</div>
					<div class="flex-1 min-w-0 text-left">
						<p class="text-white font-medium truncate">
							{actor.displayName ?? actor.handle}
						</p>
						<p class="text-gray-400 text-sm truncate">@{actor.handle}</p>
					</div>
				</button>
			{/each}
		</div>
	{/if}
</div>
