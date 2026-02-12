<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { JetstreamSubscription } from '@atcute/jetstream';
	import type { CommitOperation } from '@atcute/jetstream';
	import { COLLECTION } from '$lib/at/settings';
	import { getFrameImageUrl } from '$lib/at/repo';
	import type { Did } from '@atcute/lexicons';
	import {
		getRecentActiveRepos,
		updateRecentActivityFromJetstream,
		type RecentActivity
	} from '$lib/at/recent';

	interface StreamedFrame {
		did: Did;
		blobCid: string;
		createdAt: number;
		text?: string;
		alt?: string;
	}

	let frames = $state<StreamedFrame[]>([]);
	let currentFrameIndex = $state(0);
	let status = $state('Loading recent activity...');
	let subscription: JetstreamSubscription | null = null;
	let progressKey = $state(0);
	let abortController: AbortController | null = null;
	const FRAME_DURATION_MS = 5000;

	function activityToFrame(activity: RecentActivity): StreamedFrame {
		return {
			did: activity.did,
			blobCid: activity.blobCid,
			createdAt: new Date(activity.createdAt).getTime(),
			text: activity.text,
			alt: activity.alt
		};
	}

	function upsertFrame(frame: StreamedFrame) {
		const existingIndex = frames.findIndex((f) => f.did === frame.did);
		if (existingIndex !== -1) {
			frames.splice(existingIndex, 1);
		}

		frames = [frame, ...frames]
			.sort((a, b) => b.createdAt - a.createdAt)
			.slice(0, 100);

		currentFrameIndex = 0;
		progressKey++;
	}

	function handleImageError(frame: StreamedFrame) {
		const idx = frames.findIndex((f) => f.did === frame.did && f.blobCid === frame.blobCid);
		if (idx === -1) return;

		frames.splice(idx, 1);
		frames = [...frames];
		if (frames.length === 0) {
			currentFrameIndex = 0;
			return;
		}

		if (currentFrameIndex >= frames.length) {
			currentFrameIndex = 0;
		}
		progressKey++;
	}

	async function loadInitial() {
		try {
			const activities = await getRecentActiveRepos({ limit: 100 });
			frames = activities.map(activityToFrame);
			status = 'Connected';
		} catch (error) {
			console.error('Failed to load recent activity:', error);
			status = 'Error';
		}
	}

	onMount(async () => {
		abortController = new AbortController();
		const { signal } = abortController;

		try {
			await loadInitial();
			subscription = new JetstreamSubscription({
				url: 'wss://jetstream2.us-east.bsky.network',
				wantedCollections: [COLLECTION]
			});

			for await (const event of subscription) {
				if (signal.aborted) {
					break;
				}
				if (event.kind === 'commit') {
						const commit = event.commit as CommitOperation & {
							collection?: string;
							operation?: string;
							record?: {
								createdAt?: string;
								text?: string;
								alt?: string;
								image?: { ref?: { $link?: string } };
							};
						};
						const blobCid = commit.record?.image?.ref?.$link;

						if (
							commit.collection === COLLECTION &&
							commit.operation === 'create' &&
							blobCid &&
							commit.record?.createdAt
						) {
							const frame: StreamedFrame = {
								did: event.did,
								blobCid,
								createdAt: new Date(commit.record.createdAt).getTime(),
								text: commit.record.text,
								alt: commit.record.alt
							};

						upsertFrame(frame);
							updateRecentActivityFromJetstream(
								event.did,
								blobCid,
								commit.record.createdAt,
								commit.record.text,
								commit.record.alt
							).catch((e) => console.error('Failed to refresh recent cache:', e));
					}
				}
			}
		} catch (error) {
			if (!signal.aborted) {
				console.error('Failed to connect to Jetstream or error during subscription:', error);
				status = 'Error';
			}
		}
	});

	onDestroy(() => {
		abortController?.abort();
	});

	let currentFrame = $derived(frames[currentFrameIndex]);

	$effect(() => {
		if (currentFrame) {
			const timer = setTimeout(() => {
				if (frames.length > 1) {
					currentFrameIndex = (currentFrameIndex + 1) % frames.length;
					progressKey++;
				}
			}, FRAME_DURATION_MS);

			return () => clearTimeout(timer);
		}
	});
</script>

<div class="min-h-screen bg-black">
	<header class="sticky top-0 z-40 bg-black/90 backdrop-blur-sm border-b border-gray-800">
		<div class="flex items-center justify-between px-4 py-3">
			<a href="/" class="text-white hover:text-gray-200" aria-label="Back">
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
				</svg>
			</a>
			<h1 class="text-lg font-semibold text-white">Recent</h1>
			<div class="w-6"></div>
		</div>
	</header>

	<main class="relative h-[calc(100vh-57px)] overflow-hidden">
		{#if currentFrame}
			<!-- Progress bar -->
			<div class="absolute top-0 left-0 right-0 z-10 flex gap-1 p-2">
				<div class="flex-1 h-px rounded-full overflow-hidden bg-white/30">
					{#key progressKey}
					<div
						class="h-full bg-white animate-progress"
						style="--duration: {FRAME_DURATION_MS}ms"
					></div>
					{/key}
				</div>
			</div>

			<!-- Frame image -->
			<img
				src={getFrameImageUrl(currentFrame.did, currentFrame.blobCid)}
				alt={currentFrame.alt ?? 'Frame'}
				class="w-full h-full object-contain"
				onerror={() => handleImageError(currentFrame)}
			/>

			<!-- Text overlay -->
			{#if currentFrame.text}
				<div class="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
					<p class="text-white text-sm">{currentFrame.text}</p>
				</div>
			{/if}
		{:else}
			<div class="flex items-center justify-center h-full">
				<div class="text-center text-white">
					<p>{status}</p>
					{#if status === 'Connected'}
						<p>Waiting for frames...</p>
					{/if}
				</div>
			</div>
		{/if}
	</main>
</div>

<style>
	@keyframes progress {
		from { width: 0%; }
		to { width: 100%; }
	}
	.animate-progress {
		animation: progress linear var(--duration);
	}
</style>
