<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { JetstreamSubscription } from '@atcute/jetstream';
	import type { CommitOperation } from '@atcute/jetstream';
	import { COLLECTION } from '$lib/at/settings';
	import { getFrameImageUrl } from '$lib/at/repo';
	import { fetchProfile } from '$lib/feed/engine';
	import type { Did } from '@atcute/lexicons';
	import {
		getRecentActiveRepos,
		refreshRecentActivityForDid,
		updateRecentActivityFromJetstream,
		type RecentActivity
	} from '$lib/at/recent';

	interface StreamedFrame {
		did: Did;
		blobCid: string;
		createdAt: number;
		text?: string;
		alt?: string;
		handle?: string;
		displayName?: string;
		avatar?: string;
	}

	let frames = $state<StreamedFrame[]>([]);
	let currentFrameIndex = $state(0);
	let status = $state('Loading recent activity...');
	let subscription: JetstreamSubscription | null = null;
	let progressKey = $state(0);
	let abortController: AbortController | null = null;
	const FRAME_DURATION_MS = 5000;

	// Historical replay batching
	let historicalDone = false;
	let batch: StreamedFrame[] = [];
	let batchTimeout: ReturnType<typeof setTimeout> | null = null;

	// Visibility refresh
	let lastLoadTime = 0;

	function activityToFrame(a: RecentActivity): StreamedFrame {
		return { did: a.did, blobCid: a.blobCid, createdAt: new Date(a.createdAt).getTime(), text: a.text, alt: a.alt };
	}

	function upsertFrame(frame: StreamedFrame) {
		frames = [frame, ...frames].sort((a, b) => b.createdAt - a.createdAt).slice(0, 100);
		currentFrameIndex = 0;
		progressKey++;
	}

	function flushBatch() {
		if (batchTimeout) clearTimeout(batchTimeout);
		if (batch.length) {
			console.log('Processing batched events:', batch.length);
			frames = [...batch, ...frames].sort((a, b) => b.createdAt - a.createdAt).slice(0, 100);
			currentFrameIndex = 0;
			progressKey++;
			batch = [];
		}
		historicalDone = true;
	}

	async function enrichProfile(frame: StreamedFrame) {
		const p = await fetchProfile(frame.did);
		if (p) Object.assign(frame, p);
	}

	function handleImageError(frame: StreamedFrame) {
		const idx = frames.findIndex((f) => f.did === frame.did && f.blobCid === frame.blobCid);
		if (idx === -1) return;
		frames.splice(idx, 1);
		frames = [...frames];
		if (currentFrameIndex >= frames.length) currentFrameIndex = 0;
		progressKey++;

		refreshRecentActivityForDid(frame.did)
			.then((a) => a && upsertFrame(activityToFrame(a)))
			.catch((e) => console.error('Failed to refresh frame after 404:', e));
	}

	async function loadInitial() {
		try {
			const mapped = (await getRecentActiveRepos({ limit: 100 })).map(activityToFrame);
			await Promise.all([...new Set(mapped.map((f) => f.did))].map(async (did) => {
				const p = await fetchProfile(did);
				if (p) mapped.filter((f) => f.did === did).forEach((f) => Object.assign(f, p));
			}));
			frames = mapped;
			lastLoadTime = Date.now();
			status = 'Connected';
		} catch (error) {
			console.error('Failed to load recent activity:', error);
			status = 'Error';
		}
	}

	function onVisibilityChange() {
		if (document.visibilityState === 'visible' && Date.now() - lastLoadTime > 5 * 60 * 1000) {
			loadInitial();
		}
	}

	onMount(async () => {
		abortController = new AbortController();
		const { signal } = abortController;
		document.addEventListener('visibilitychange', onVisibilityChange);

		try {
			await loadInitial();
			subscription = new JetstreamSubscription({
				url: 'wss://jetstream2.us-east.bsky.network',
				wantedCollections: [COLLECTION]
			});

			for await (const event of subscription) {
				if (signal.aborted) break;
				if (event.kind !== 'commit') continue;

				const commit = event.commit as CommitOperation & {
					collection?: string;
					operation?: string;
					record?: { createdAt?: string; text?: string; alt?: string; image?: { ref?: { $link?: string } } };
				};
				const blobCid = commit.record?.image?.ref?.$link;
				if (commit.collection !== COLLECTION || commit.operation !== 'create' || !blobCid || !commit.record?.createdAt) continue;

				const frame: StreamedFrame = {
					did: event.did, blobCid,
					createdAt: new Date(commit.record.createdAt).getTime(),
					text: commit.record.text, alt: commit.record.alt
				};

				// Enrich with profile then insert (batched or immediate)
				enrichProfile(frame).finally(() => {
					const age = Date.now() - frame.createdAt;
					if (!historicalDone && age > 60_000) {
						batch.push(frame);
						if (batchTimeout) clearTimeout(batchTimeout);
						batchTimeout = setTimeout(flushBatch, 2000);
					} else {
						if (!historicalDone) flushBatch();
						upsertFrame(frame);
					}
				});

				updateRecentActivityFromJetstream(event.did, blobCid, commit.record.createdAt, commit.record.text, commit.record.alt)
					.catch((e) => console.error('Failed to refresh recent cache:', e));
			}
		} catch (error) {
			if (!signal.aborted) {
				console.error('Jetstream error:', error);
				status = 'Error';
			}
		}
	});

	onDestroy(() => {
		abortController?.abort();
		document.removeEventListener('visibilitychange', onVisibilityChange);
		if (batchTimeout) clearTimeout(batchTimeout);
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
					<div class="h-full bg-white animate-progress" style="--duration: {FRAME_DURATION_MS}ms"></div>
					{/key}
				</div>
			</div>

			<!-- Author info overlay -->
			<div class="absolute top-8 left-0 right-0 z-10 px-4 py-2 flex items-center gap-3">
				<a href="/profile/{currentFrame.did}" class="flex items-center gap-3 flex-1 min-w-0">
					<div class="w-8 h-8 rounded-full overflow-hidden bg-gray-800 flex-shrink-0">
						{#if currentFrame.avatar}
							<img src={currentFrame.avatar} alt={currentFrame.handle ?? ''} class="w-full h-full object-cover" />
						{:else}
							<div class="w-full h-full flex items-center justify-center text-gray-400 text-sm">
								{(currentFrame.handle ?? currentFrame.did)[0]?.toUpperCase() ?? '?'}
							</div>
						{/if}
					</div>
					<div class="flex-1 min-w-0">
						<p class="text-white text-sm font-medium truncate drop-shadow-md">
							{currentFrame.displayName ?? currentFrame.handle ?? currentFrame.did}
						</p>
						<p class="text-gray-300 text-xs drop-shadow-md">
							{new Date(currentFrame.createdAt).toLocaleDateString()}
						</p>
					</div>
				</a>
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
