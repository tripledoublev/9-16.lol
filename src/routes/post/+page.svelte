<script lang="ts">
	import { user } from '$lib/at';
	import { goto } from '$app/navigation';
	import { FrameComposer } from '$components';

	$effect(() => {
		if (!user.isLoggedIn) {
			goto('/login');
		}
	});
</script>

<div class="min-h-screen bg-black">
	<header class="sticky top-0 z-40 bg-black/90 backdrop-blur-sm border-b border-gray-800">
		<div class="flex items-center justify-between px-4 py-3">
			<a href="/" class="text-gray-400 hover:text-white" aria-label="Back">
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
				</svg>
			</a>
			<h1 class="text-lg font-semibold text-white">New Frame</h1>
			<div class="w-6"></div>
		</div>
	</header>

	{#if user.isLoggedIn}
		<FrameComposer />
	{/if}
</div>
