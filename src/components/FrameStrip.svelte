<script lang="ts">
	import type { FeedAuthor } from '$lib/feed/engine';

	interface Props {
		authors: FeedAuthor[];
		onSelect: (index: number) => void;
	}

	let { authors, onSelect }: Props = $props();
</script>

<div class="flex gap-3 overflow-x-auto px-4 py-3 scrollbar-hide">
	{#each authors as author, i}
		<button
			type="button"
			onclick={() => onSelect(i)}
			class="flex flex-col items-center gap-1 flex-shrink-0"
		>
			<div
				class="w-16 h-16 rounded-full p-0.5 {author.hasUnseen
					? 'bg-gradient-to-tr from-blue-500 to-purple-500'
					: 'bg-gray-700'}"
			>
				<div class="w-full h-full rounded-full overflow-hidden bg-gray-800">
					{#if author.avatar}
						<img
							src={author.avatar}
							alt={author.handle}
							class="w-full h-full object-cover"
						/>
					{:else}
						<div
							class="w-full h-full flex items-center justify-center text-gray-400 text-xl font-semibold"
						>
							{author.handle[0]?.toUpperCase() ?? '?'}
						</div>
					{/if}
				</div>
			</div>
			<span class="text-xs text-gray-400 max-w-16 truncate">
				{author.displayName ?? author.handle}
			</span>
		</button>
	{/each}

	{#if authors.length === 0}
		<div class="text-gray-500 text-sm px-4 py-8">
			No frames yet. Follow some accounts to see their frames.
		</div>
	{/if}
</div>

<style>
	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}
</style>
