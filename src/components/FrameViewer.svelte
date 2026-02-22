<script lang="ts">
	import type { FeedAuthor } from '$lib/feed/engine';
	import type { FrameRecord } from '$lib/at/repo';
	import { getFrameImageUrl } from '$lib/at/repo';

	interface Props {
		author: FeedAuthor;
		frameIndex: number;
		totalAuthors: number;
		authorIndex: number;
		onNext: () => void;
		onPrev: () => void;
		onClose: () => void;
	}

	let { author, frameIndex, totalAuthors, authorIndex, onNext, onPrev, onClose }: Props = $props();

	let frame = $derived(author.frames[frameIndex]);
	let imageUrl = $derived(
		frame ? getFrameImageUrl(author.did, frame.value.embed.images[0].image.ref.$link) : ''
	);

	let touchStartX = $state(0);
	let touchStartY = $state(0);

	function handleTap(e: MouseEvent) {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const x = e.clientX - rect.left;
		const width = rect.width;

		if (x < width / 3) {
			onPrev();
		} else if (x > (width * 2) / 3) {
			onNext();
		}
	}

	function handleTouchStart(e: TouchEvent) {
		touchStartX = e.touches[0].clientX;
		touchStartY = e.touches[0].clientY;
	}

	function handleTouchEnd(e: TouchEvent) {
		const touchEndX = e.changedTouches[0].clientX;
		const touchEndY = e.changedTouches[0].clientY;
		const deltaX = touchEndX - touchStartX;
		const deltaY = touchEndY - touchStartY;

		// Swipe down to close
		if (deltaY > 100 && Math.abs(deltaX) < 50) {
			onClose();
			return;
		}

		// Horizontal swipe
		if (Math.abs(deltaX) > 50 && Math.abs(deltaY) < 50) {
			if (deltaX > 0) {
				onPrev();
			} else {
				onNext();
			}
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowRight' || e.key === ' ') {
			e.preventDefault();
			onNext();
		} else if (e.key === 'ArrowLeft') {
			e.preventDefault();
			onPrev();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			onClose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_interactive_supports_focus -->
<div
	class="fixed inset-0 bg-black z-50 flex flex-col"
	role="dialog"
	aria-modal="true"
	tabindex="-1"
	onclick={handleTap}
	ontouchstart={handleTouchStart}
	ontouchend={handleTouchEnd}
>
	<!-- Progress bars -->
	<div class="absolute top-0 left-0 right-0 z-10 flex gap-1 p-2">
		{#each author.frames as _, i}
			<div class="flex-1 h-px rounded-full overflow-hidden bg-white/30">
				<div
					class="h-full bg-white transition-all duration-200"
					style="width: {i < frameIndex ? '100%' : i === frameIndex ? '100%' : '0%'}"
				></div>
			</div>
		{/each}
	</div>

	<!-- Author info header -->
	<div class="absolute top-8 left-0 right-0 z-10 px-4 py-2 flex items-center gap-3">
		<a href="/profile/{author.did}" class="flex items-center gap-3 flex-1 min-w-0" onclick={(e) => e.stopPropagation()}>
			<div class="w-8 h-8 rounded-full overflow-hidden bg-gray-800 flex-shrink-0">
				{#if author.avatar}
					<img src={author.avatar} alt={author.handle} class="w-full h-full object-cover" />
				{:else}
					<div class="w-full h-full flex items-center justify-center text-gray-400 text-sm">
						{author.handle[0]?.toUpperCase() ?? '?'}
					</div>
				{/if}
			</div>
			<div class="flex-1 min-w-0">
				<p class="text-white text-sm font-medium truncate">
					{author.displayName ?? author.handle}
				</p>
				<p class="text-gray-400 text-xs">
					{#if frame}
						{new Date(frame.value.createdAt).toLocaleDateString()}
					{/if}
				</p>
			</div>
		</a>
		<button
			type="button"
			onclick={(e) => {
				e.stopPropagation();
				onClose();
			}}
			class="text-white p-2 hover:opacity-75 transition-opacity"
			aria-label="Close"
		>
			<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
			</svg>
		</button>
	</div>

	<!-- Frame image -->
	<div class="flex-1 flex items-center justify-center p-4 min-w-0 min-h-0">
		{#if frame}
			<img
				src={imageUrl}
				alt={frame.value.alt ?? 'Frame'}
				class="max-h-full max-w-full object-contain rounded-lg"
			/>
		{/if}
	</div>

	<!-- Text overlay at bottom -->
	{#if frame?.value.text}
		<div class="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
			<p class="text-white text-sm">{frame.value.text}</p>
		</div>
	{/if}
</div>
