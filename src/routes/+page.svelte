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
			<img src="/9x16.svg" alt="9:16" class="w-4 h-auto" />
			<div class="flex items-center gap-2">
				{#if user.isLoggedIn}
					<a
						href="/post"
						class="p-2 hover:bg-gray-800 rounded-full transition-colors"
						aria-label="New frame"
					>
						<svg class="w-6 h-6 text-gray-400 hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
						</svg>
					</a>
					<a
						href="/search"
						class="p-2 hover:bg-gray-800 rounded-full transition-colors"
						aria-label="Search"
					>
						<svg class="w-6 h-6 text-gray-400 hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
						</svg>
					</a>
					<a
						href="/profile/{user.did}"
						class="w-8 h-8 rounded-full overflow-hidden bg-gray-800"
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
						class="px-4 py-2 border border-blue-500 text-blue-500 rounded-full text-sm font-medium hover:bg-blue-500 hover:text-white transition-colors"
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
				<h2 class="text-4xl font-thin text-white mb-4">9:16</h2>
				<p class="text-gray-400 mb-8 max-w-[var(--container-xs)]">
					Share and view images on <span class="text-blue-500 font-medium">9-16.lol</span> with your Bluesky account.
				</p>
				<a
					href="/login"
					class="px-6 py-2 border border-blue-500 text-blue-500 rounded-full font-medium hover:bg-blue-500 hover:text-white transition-colors"
				>
					Sign in
				</a>
			</div>
		{:else if feedStore?.isLoading}
			<div class="flex justify-center py-20">
				<div class="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
			</div>
		{:else if feedStore?.error}
			<div class="text-center py-20">
				<p class="text-red-500 mb-4">{feedStore.error}</p>
				<button
					type="button"
					onclick={() => feedStore?.refresh()}
					class="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
				>
					Retry
				</button>
			</div>
		{:else if feedStore && feedStore.authors.length === 0}
			<div class="text-center py-20">
				<p class="text-gray-400 mb-4">No frames from people you follow yet.</p>
				<a
					href="/search"
					class="px-4 py-2 border border-blue-500 text-blue-500 rounded-lg hover:bg-blue-500 hover:text-white transition-colors"
				>
					Find accounts
				</a>
			</div>
		{:else if feedStore}
			<div class="text-center py-20 text-gray-500">
				<p>Tap on a profile above to view their frames</p>
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
