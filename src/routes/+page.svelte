<script lang="ts">
	import { user } from '$lib/at';
	import { createFeedStore } from '$lib/stores/feed.svelte';
	import { FrameStrip, FrameViewer } from '$components';
	import { onMount } from 'svelte';

	let feedStore = $state<ReturnType<typeof createFeedStore> | null>(null);

	onMount(() => {
		if (user.isLoggedIn && user.did) {
			feedStore = createFeedStore(user.did);
			feedStore.load();
		}
	});

	$effect(() => {
		if (user.isLoggedIn && user.did && !feedStore) {
			feedStore = createFeedStore(user.did);
			feedStore.load();
		}
	});
</script>

<div class="min-h-screen bg-black">
	<!-- Header -->
	<header class="sticky top-0 z-40 bg-black">
		<div class="flex items-center justify-between px-4 py-3">
			<a href="/recent">
				<img src="/9x16.svg" alt="9:16" class="w-4 h-auto" />
			</a>
			<div class="flex items-center gap-2">
				{#if user.isLoggedIn}
					<a
						href="/post"
						class="p-2 hover:bg-gray-800 rounded-full transition-colors"
						aria-label="New frame"
					>
						<svg class="w-7 h-7 text-white hover:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
						</svg>
					</a>
					<a
						href="/search"
						class="p-2 hover:bg-gray-800 rounded-full transition-colors"
						aria-label="Search"
					>
						<svg class="w-7 h-7 text-white hover:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
						</svg>
					</a>
					<a
						href="/profile/{user.did}"
						class="w-10 h-10 rounded-full overflow-hidden bg-gray-800"
					>
						{#if user.profile?.avatar}
							<img src={user.profile.avatar} alt="Profile" class="w-full h-full object-cover" />
						{:else}
							<div class="w-full h-full flex items-center justify-center text-gray-400 text-sm">
								{user.profile?.handle?.[0]?.toUpperCase() ?? '?'}
							</div>
						{/if}
					</a>
				{:else}
					<a
						href="/login"
						class="px-4 py-2 border border-white text-white rounded-full text-base sm:text-lg font-medium hover:bg-white hover:text-black transition-colors"
					>
						Sign in
					</a>
				{/if}
			</div>
		</div>

		<!-- Frame strip -->
		{#if user.isLoggedIn && feedStore}
			<FrameStrip
				authors={feedStore.authors}
				onSelect={(i) => feedStore?.selectAuthor(i)}
			/>
		{/if}
	</header>

	<!-- Main content -->
	<main class="p-4">
		{#if !user.isLoggedIn}
			<div class="flex flex-col items-center justify-center py-20 text-center">
				<h2 class="text-5xl sm:text-6xl md:text-7xl font-thin text-white mb-4">9:16</h2>
				<p class="text-lg sm:text-xl md:text-2xl text-white mb-8 max-w-[var(--container-xs)]">
					Share and view images on <span class="text-white font-medium">9-16.lol</span> with your Bluesky account.
				</p>
				<a
					href="/login"
					class="px-6 py-2 border border-white text-white rounded-full text-lg sm:text-xl font-medium hover:bg-white hover:text-black transition-colors"
				>
					Sign in
				</a>
			</div>
		{:else if feedStore?.isLoading}
			<div class="flex justify-center py-20">
				<div class="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
			</div>
		{:else if feedStore?.error}
			<div class="text-center py-20">
				<p class="text-lg sm:text-xl text-white mb-4">{feedStore.error}</p>
				<button
					type="button"
					onclick={() => feedStore?.refresh()}
					class="px-4 py-2 bg-white text-black text-base sm:text-lg rounded-lg hover:bg-gray-200"
				>
					Retry
				</button>
			</div>
		{:else if feedStore && feedStore.authors.length === 0}
			<div class="text-center py-20">
				<p class="text-lg sm:text-xl text-white mb-4">No frames from people you follow yet.</p>
				<a
					href="/search"
					class="px-4 py-2 border border-white text-white text-lg sm:text-xl rounded-lg hover:bg-white hover:text-black transition-colors"
				>
					Find accounts
				</a>
			</div>
		{:else if feedStore}
			<div class="text-center py-20 text-white">
				<p class="text-lg sm:text-xl">Tap on a profile above to view their frames</p>
			</div>
		{/if}
	</main>

	<!-- Frame viewer modal -->
	{#if feedStore?.isViewerOpen && feedStore.selectedAuthor}
		<FrameViewer
			author={feedStore.selectedAuthor}
			frameIndex={feedStore.selectedFrameIndex}
			authorIndex={feedStore.selectedAuthorIndex ?? 0}
			totalAuthors={feedStore.authors.length}
			onNext={() => feedStore?.nextFrame()}
			onPrev={() => feedStore?.prevFrame()}
			onClose={() => feedStore?.closeViewer()}
		/>
	{/if}
</div>
