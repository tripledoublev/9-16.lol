<script lang="ts">
	import { page } from '$app/state';
	import { user, listFrames, getFrameImageUrl, logout, deleteFrame, type FrameRecord } from '$lib/at';
	import { getPublicClient } from '$lib/at/client';
	import type { Did } from '@atcute/lexicons';
	import type { AppBskyActorDefs } from '@atcute/bluesky';
	import { onMount } from 'svelte';

	let profile = $state<AppBskyActorDefs.ProfileViewDetailed | null>(null);
	let frames = $state<FrameRecord[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedFrame = $state<FrameRecord | null>(null);
	let isDeleting = $state(false);

	const did = $derived(page.params.id as Did);
	const isOwnProfile = $derived(user.did === did);

	onMount(async () => {
		await loadProfile();
		await loadFrames();
	});

	async function loadProfile() {
		try {
			const client = getPublicClient();
			const response = await client.get('app.bsky.actor.getProfile', {
				params: { actor: did }
			});

			if (response.ok) {
				profile = response.data;
			}
		} catch (e) {
			console.error('Failed to load profile:', e);
		}
	}

	async function loadFrames() {
		isLoading = true;
		error = null;

		try {
			const result = await listFrames(did, { limit: 50 });
			frames = result.frames;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load frames';
		} finally {
			isLoading = false;
		}
	}

	function handleFrameClick(frame: FrameRecord) {
		selectedFrame = frame;
	}

	function closeViewer() {
		selectedFrame = null;
	}

	async function handleDelete() {
		if (!selectedFrame || isDeleting) return;
		if (!confirm('Delete this frame?')) return;

		isDeleting = true;
		try {
			const rkey = selectedFrame.uri.split('/').pop()!;
			await deleteFrame(rkey);
			frames = frames.filter((f) => f.uri !== selectedFrame!.uri);
			closeViewer();
		} catch (e) {
			alert('Failed to delete frame');
			console.error('Delete failed:', e);
		} finally {
			isDeleting = false;
		}
	}

	async function handleLogout() {
		await logout();
		window.location.href = '/';
	}
</script>

<div class="min-h-screen bg-black">
	<header class="sticky top-0 z-40 bg-black/90 backdrop-blur-sm border-b border-gray-800">
		<div class="flex items-center justify-between px-4 py-3">
			<a href="/" class="text-gray-400 hover:text-white" aria-label="Back">
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
				</svg>
			</a>
			<h1 class="text-lg font-semibold text-white">Profile</h1>
			{#if isOwnProfile}
				<button
					type="button"
					onclick={handleLogout}
					class="text-red-500 text-sm hover:text-red-400"
				>
					Sign out
				</button>
			{:else}
				<div class="w-16"></div>
			{/if}
		</div>
	</header>

	<main class="p-4">
		<!-- Profile header -->
		<div class="flex items-center gap-4 mb-6">
			<div class="w-20 h-20 rounded-full overflow-hidden bg-gray-800 flex-shrink-0">
				{#if profile?.avatar}
					<img src={profile.avatar} alt={profile.handle} class="w-full h-full object-cover" />
				{:else}
					<div class="w-full h-full flex items-center justify-center text-gray-400 text-2xl">
						{profile?.handle?.[0]?.toUpperCase() ?? '?'}
					</div>
				{/if}
			</div>
			<div class="flex-1 min-w-0">
				<h2 class="text-xl font-bold text-white truncate">
					{profile?.displayName ?? profile?.handle ?? did}
				</h2>
				<p class="text-gray-400 truncate">@{profile?.handle ?? did}</p>
				{#if profile?.description}
					<p class="text-gray-300 text-sm mt-1 line-clamp-2">{profile.description}</p>
				{/if}
			</div>
		</div>

		<!-- Frames count -->
		<div class="border-b border-gray-800 pb-4 mb-4">
			<span class="text-white font-medium">{frames.length}</span>
			<span class="text-gray-400"> {frames.length === 1 ? 'frame' : 'frames'}</span>
		</div>

		<!-- Frames grid -->
		{#if isLoading}
			<div class="flex justify-center py-20">
				<div class="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
			</div>
		{:else if error}
			<div class="text-center py-20">
				<p class="text-red-500 mb-4">{error}</p>
				<button
					type="button"
					onclick={loadFrames}
					class="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
				>
					Retry
				</button>
			</div>
		{:else if frames.length === 0}
			<div class="text-center py-20 text-gray-500">
				<p>No frames yet</p>
				{#if isOwnProfile}
					<a
						href="/post"
						class="inline-block mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
					>
						Create your first frame
					</a>
				{/if}
			</div>
		{:else}
			<div class="grid grid-cols-3 gap-1">
				{#each frames as frame}
					<button
						type="button"
						onclick={() => handleFrameClick(frame)}
						class="aspect-[9/16] bg-gray-900 rounded overflow-hidden hover:opacity-80 transition-opacity"
					>
						<img
							src={getFrameImageUrl(did, frame.value.image.ref.$link)}
							alt={frame.value.alt ?? 'Frame'}
							class="w-full h-full object-cover"
							loading="lazy"
						/>
					</button>
				{/each}
			</div>
		{/if}
	</main>

	<!-- Simple frame viewer -->
	{#if selectedFrame}
		<div
			class="fixed inset-0 bg-black z-50 flex items-center justify-center p-4"
			role="dialog"
			aria-modal="true"
		>
			{#if isOwnProfile}
				<button
					type="button"
					onclick={handleDelete}
					disabled={isDeleting}
					class="absolute top-4 left-4 text-white p-2 hover:bg-white/10 rounded-full z-10 disabled:opacity-50"
					aria-label="Delete frame"
				>
					{#if isDeleting}
						<div class="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
					{:else}
						<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
						</svg>
					{/if}
				</button>
			{/if}

			<button
				type="button"
				onclick={closeViewer}
				class="absolute top-4 right-4 text-white p-2 hover:bg-white/10 rounded-full z-10"
				aria-label="Close"
			>
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>

			<img
				src={getFrameImageUrl(did, selectedFrame.value.image.ref.$link)}
				alt={selectedFrame.value.alt ?? 'Frame'}
				class="max-h-full max-w-full object-contain rounded-lg"
			/>

			{#if selectedFrame.value.text}
				<div class="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
					<p class="text-white text-sm">{selectedFrame.value.text}</p>
				</div>
			{/if}
		</div>
	{/if}
</div>
