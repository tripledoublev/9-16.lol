<script lang="ts">
	import { login, user } from '$lib/at';
	import { goto } from '$app/navigation';
	import type { ActorIdentifier } from '@atcute/lexicons';

	let handle = $state('');
	let error = $state<string | null>(null);
	let isLoading = $state(false);

	$effect(() => {
		if (user.isLoggedIn) {
			goto('/');
		}
	});

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!handle.trim()) {
			error = 'Please enter your handle';
			return;
		}

		isLoading = true;
		error = null;

		try {
			await login(handle.trim() as ActorIdentifier);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Login failed';
			isLoading = false;
		}
	}
</script>

<div class="min-h-screen bg-black flex flex-col items-center justify-between p-4 relative">
	<div class="flex flex-col items-center flex-grow justify-center w-full max-w-sm">
		<h1 class="text-5xl sm:text-6xl md:text-7xl font-thin text-white text-center mb-4">9:16</h1>


		<form onsubmit={handleSubmit} class="space-y-4">
			<div>
				<label for="handle" class="block text-sm text-gray-400 mb-1">Handle or DID</label>
				<input
					id="handle"
					type="text"
					bind:value={handle}
					placeholder="alice.bsky.social"
					disabled={isLoading}
					class="w-full bg-black border border-white rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-white disabled:opacity-50"
				/>
			</div>

			<p class="text-white text-sm text-center mt-2">
				Use your Bluesky or ATProto handle to sign in, publish images.
			</p>

			{#if error}
				<p class="text-white text-sm">{error}</p>
			{/if}

			<button
				type="submit"
				disabled={isLoading}
				class="w-full py-3 bg-white text-black rounded-lg font-medium disabled:opacity-50 hover:bg-gray-200 transition-colors"
			>
				{#if isLoading}
					<span class="flex items-center justify-center gap-2">
						<span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
						Signing in...
					</span>
				{:else}
					Sign in
				{/if}
			</button>
		</form>

		<p class="text-gray-500 text-sm text-center mt-6">
			Don't have an account?
			<a href="https://bsky.app" target="_blank" rel="noopener" class="text-white hover:text-gray-200">
				Create one on Bluesky
			</a>
		</p>
    </div>

	<a href="/" class="block text-center text-white hover:text-gray-200 absolute bottom-4 left-0 right-0">
		Back to home
	</a>
</div>
