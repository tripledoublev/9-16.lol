<script lang="ts">
	import { cropAndCompress, calculate916Crop, loadImage, type CropRegion } from '$lib/media/image';
	import { createFrame } from '$lib/at/repo';
	import { goto } from '$app/navigation';

	let fileInput: HTMLInputElement;
	let selectedFile = $state<File | null>(null);
	let previewUrl = $state<string | null>(null);
	let cropRegion = $state<CropRegion | null>(null);
	let text = $state('');
	let altText = $state('');
	let isUploading = $state(false);
	let error = $state<string | null>(null);

	async function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		if (!file.type.startsWith('image/')) {
			error = 'Please select an image file';
			return;
		}

		selectedFile = file;
		error = null;

		// Generate preview
		const img = await loadImage(file);
		cropRegion = calculate916Crop(img.width, img.height);

		// Create preview with crop applied
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d')!;
		const scale = Math.min(400 / cropRegion.width, 711 / cropRegion.height);
		canvas.width = cropRegion.width * scale;
		canvas.height = cropRegion.height * scale;

		ctx.drawImage(
			img,
			cropRegion.x,
			cropRegion.y,
			cropRegion.width,
			cropRegion.height,
			0,
			0,
			canvas.width,
			canvas.height
		);

		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = canvas.toDataURL('image/jpeg', 0.9);
		URL.revokeObjectURL(img.src);
	}

	async function handleSubmit() {
		if (!selectedFile) {
			error = 'Please select an image';
			return;
		}

		isUploading = true;
		error = null;

		try {
			const blob = await cropAndCompress(selectedFile, cropRegion ?? undefined);

			await createFrame({
				image: blob,
				text: text.trim() || undefined,
				alt: altText.trim(),
				aspect: '9:16'
			});

			// Clear form and navigate
			reset();
			goto('/');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to post frame';
		} finally {
			isUploading = false;
		}
	}

	function reset() {
		selectedFile = null;
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = null;
		cropRegion = null;
		text = '';
		altText = '';
		error = null;
	}
</script>

<div class="flex flex-col gap-4 p-4 max-w-lg mx-auto">


	<!-- Image selector -->
	<div class="relative">
		<input
			bind:this={fileInput}
			type="file"
			accept="image/*"
			onchange={handleFileSelect}
			class="hidden"
		/>

		{#if previewUrl}
			<div class="relative w-full aspect-[36/49] bg-black rounded-lg overflow-hidden">
				<img src={previewUrl} alt="Preview" class="w-full h-full object-cover" />
				<button
					type="button"
					onclick={() => fileInput.click()}
					class="absolute bottom-2 right-2 bg-black/50 text-white px-3 py-1 rounded-full text-sm hover:bg-black/70"
				>
					Change
				</button>
			</div>
		{:else}
			<button
				type="button"
				onclick={() => fileInput.click()}
				class="w-full aspect-[36/49] bg-black rounded-lg border-2 border-dashed border-white flex flex-col items-center justify-center gap-2 hover:border-gray-600 transition-colors"
			>
				<svg class="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
					/>
				</svg>
				<span class="text-gray-200">Tap to select image</span>
				<span class="text-gray-500 text-sm">9:16 aspect ratio</span>
			</button>
		{/if}
	</div>

	<!-- Text input -->
	<div>
		<label for="text" class="sr-only block text-sm text-white mb-1">Caption (optional)</label>
		<textarea
			id="text"
			bind:value={text}
			maxlength={240}
			rows={2}
			placeholder="Add a caption (optional)"
			class="w-full bg-black border border-white rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-white resize-none"
		></textarea>
		<div class="flex justify-end">
			<span class="text-xs text-gray-400">{text.length}/240</span>
		</div>
	</div>

	<!-- Alt text -->
	<div>
		<label for="alt" class="sr-only block text-sm text-white mb-1">Alt text (optional)</label>
		<input
			id="alt"
			type="text"
			bind:value={altText}
			maxlength={300}
			placeholder="Describe the image (optional)"
			class="w-full bg-black border border-white rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-white"
		/>
	</div>

	{#if error}
		<p class="text-white text-sm">{error}</p>
	{/if}

	<!-- Submit button -->
	<button
		type="button"
		onclick={handleSubmit}
		disabled={!selectedFile || isUploading}
		class="w-full py-3 bg-white text-black rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 transition-colors"
	>
		{#if isUploading}
			Posting...
		{:else}
			Post
		{/if}
	</button>

	<a href="/" class="text-center text-white hover:text-gray-200">Cancel</a>
</div>
