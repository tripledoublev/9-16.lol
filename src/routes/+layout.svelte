<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';
	import { initClient, user } from '$lib/at';

	let { children } = $props();

	onMount(() => {
		initClient();
	});
</script>

<svelte:head>
	<title>9:16.lol</title>
	<meta name="description" content="9:16 frames on ATProto" />
	<link rel="icon" href="/favicon.svg" />
</svelte:head>

{#if user.isInitializing}
	<div class="min-h-screen bg-black flex items-center justify-center">
		<div class="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
	</div>
{:else}
	{@render children()}
{/if}
