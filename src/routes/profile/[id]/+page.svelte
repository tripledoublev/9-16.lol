<script lang="ts">
	import { page } from '$app/state';
	import { user, listFrames, getFrameImageUrl, logout, deleteFrame, getAppProfile, putAppProfile, type FrameRecord, type AppProfileRecord } from '$lib/at';
	import { getPublicClient } from '$lib/at/client';
	import { resolveHandle } from '$lib/at/did';
	import type { Did, Handle } from '@atcute/lexicons';
	import type { AppBskyActorDefs } from '@atcute/bluesky';

	let profile = $state<AppBskyActorDefs.ProfileViewDetailed | null>(null);
	let appProfile = $state<AppProfileRecord | null>(null);
	let frames = $state<FrameRecord[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedFrame = $state<FrameRecord | null>(null);
	let isDeleting = $state(false);
	let confirmingDelete = $state(false);
	let resolvedDid = $state<Did | null>(null);
	let isFollowing = $state(false);
	let isFollowingLoading = $state(false);
	let followUri = $state<string | null>(null);

	// Edit profile state
	let showEditSheet = $state(false);
	let editDisplayName = $state('');
	let editBio = $state('');
	let editAvatarFile = $state<File | null>(null);
	let editAvatarPreview = $state('');
	let isSaving = $state(false);
	let editError = $state('');
	let fileInput: HTMLInputElement;

	const paramId = $derived(page.params.id);
	const did = $derived(resolvedDid);
	const isOwnProfile = $derived(did != null && user.did === did);

	// Derived display values: app profile overrides bsky profile
	const displayName = $derived(appProfile?.displayName || profile?.displayName || profile?.handle || paramId);
	const displayBio = $derived(appProfile?.bio ?? profile?.description ?? '');
	const displayAvatar = $derived(
		appProfile?.avatar && did
			? `https://cdn.bsky.app/img/avatar/plain/${did}/${appProfile.avatar.ref.$link}@jpeg`
			: profile?.avatar ?? ''
	);

	$effect(() => {
		const id = paramId;
		if (!id) return;
		if (id.startsWith('did:')) {
			resolvedDid = id as Did;
		} else {
			resolvedDid = null;
			resolveHandle(id as Handle).then((d) => {
				resolvedDid = d;
			}).catch((e) => {
				console.error('Failed to resolve handle:', e);
				error = 'Could not resolve handle';
			});
		}
	});

	$effect(() => {
		if (!did) return;
		loadProfile();
		loadFrames();
		checkFollowStatus(); // Check follow status when profile loads
	});

	async function checkFollowStatus() {
		if (!user.isLoggedIn || !user.did || !user.client) {
			isFollowing = false;
			return;
		}
		isFollowingLoading = true;
		isFollowing = false; // Reset before checking
		followUri = null; // Reset before checking
		let cursor: string | undefined = undefined;
		let foundFollow = false;

		try {
			do {
				// @ts-expect-error - com.atproto.repo.listRecords is valid but not typed in bluesky package
				const response = await user.client.get('com.atproto.repo.listRecords', {
					params: {
						repo: user.did,
						collection: 'app.bsky.graph.follow',
						cursor: cursor,
						limit: 100 // Fetch up to 100 records per page
					}
				});

				if (response.ok && response.data && response.data.records) {
					const records = response.data.records;
					const followRecord = records.find((rec: any) => rec.value.subject === did);
					if (followRecord) {
						isFollowing = true;
						followUri = followRecord.uri;
						foundFollow = true;
						break; // Found the follow, no need to fetch more pages
					}
					cursor = (response.data as { cursor?: string }).cursor;
				} else {
					break; // Exit loop on error or no data
				}
			} while (cursor && !foundFollow);
		} catch (e) {
			console.error('checkFollowStatus: Failed to check follow status:', e);
		} finally {
			isFollowingLoading = false;
		}
	}

	async function toggleFollow() {
		if (!user.isLoggedIn || !user.did || !user.client || isFollowingLoading) return;

		isFollowingLoading = true;
		try {
			if (isFollowing) {
				// Unfollow
				if (!followUri) throw new Error('Follow URI not found for unfollow');
				const rkey = followUri.split('/').pop()!;
				// @ts-expect-error - com.atproto.repo.deleteRecord is valid but not typed in bluesky package
				await user.client.post('com.atproto.repo.deleteRecord', {
					input: {
						repo: user.did,
						collection: 'app.bsky.graph.follow',
						rkey
					}
				});
				isFollowing = false;
				followUri = null;
			} else {
				// Follow
				const rkey = `tid${Date.now()}`; // Generate a unique rkey
				// @ts-expect-error - com.atproto.repo.createRecord is valid but not typed in bluesky package
				const response = await user.client.post('com.atproto.repo.createRecord', {
					input: {
						repo: user.did,
						collection: 'app.bsky.graph.follow',
						rkey,
						record: {
							subject: did,
							createdAt: new Date().toISOString()
						}
					}
				});
				if (response.ok && response.data) {
					const data = response.data as { uri?: string };
					isFollowing = true;
					followUri = data.uri ?? null;
				} else {
					throw new Error('Failed to create follow record');
				}
			}
		} catch (e) {
			console.error('Failed to toggle follow status:', e);
			alert('Failed to update follow status');
		} finally {
			isFollowingLoading = false;
		}
	}

	async function loadProfile() {
		try {
			const client = getPublicClient();
			const [profileResponse, appProfileData] = await Promise.all([
				client.get('app.bsky.actor.getProfile', { params: { actor: did! } }),
				getAppProfile(did!).catch(() => null)
			]);

			if (profileResponse.ok) {
				profile = profileResponse.data;
			}
			appProfile = appProfileData;
		} catch (e) {
			console.error('Failed to load profile:', e);
		}
	}

	async function loadFrames() {
		isLoading = true;
		error = null;

		try {
			const result = await listFrames(did!, { limit: 50 });
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
		confirmingDelete = false;
	}

	$effect(() => {
		if (!selectedFrame) return;
		document.body.style.overflow = 'hidden';
		const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeViewer(); };
		window.addEventListener('keydown', onKey);
		return () => {
			document.body.style.overflow = '';
			window.removeEventListener('keydown', onKey);
		};
	});

	async function handleDelete() {
		if (!selectedFrame || isDeleting) return;

		isDeleting = true;
		confirmingDelete = false;
		try {
			const rkey = selectedFrame.uri.split('/').pop()!;
			await deleteFrame(rkey);
			frames = frames.filter((f) => f.uri !== selectedFrame!.uri);
			closeViewer();
		} catch (e) {
			console.error('Delete failed:', e);
		} finally {
			isDeleting = false;
		}
	}

	function openEditSheet() {
		editDisplayName = appProfile?.displayName ?? profile?.displayName ?? '';
		editBio = appProfile?.bio ?? profile?.description ?? '';
		editAvatarFile = null;
		editAvatarPreview = '';
		editError = '';
		showEditSheet = true;
	}

	function closeEditSheet() {
		showEditSheet = false;
	}

	function handleAvatarSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		if (file.size > 1_000_000) {
			editError = 'Avatar must be under 1MB';
			return;
		}
		editAvatarFile = file;
		editAvatarPreview = URL.createObjectURL(file);
	}

	async function handleSaveProfile() {
		if (isSaving) return;
		isSaving = true;
		editError = '';

		try {
			await putAppProfile({
				displayName: editDisplayName || undefined,
				bio: editBio || undefined,
				avatar: editAvatarFile ?? undefined,
				existingAvatar: !editAvatarFile ? appProfile?.avatar : undefined
			});
			closeEditSheet();
			await loadProfile();
		} catch (e: any) {
			if (e?.message?.includes('auth') || e?.status === 403) {
				editError = 'Please sign in again to save profile changes.';
			} else {
				editError = e?.message ?? 'Failed to save profile';
			}
			console.error('Save profile failed:', e);
		} finally {
			isSaving = false;
		}
	}

	$effect(() => {
		if (!showEditSheet) return;
		document.body.style.overflow = 'hidden';
		const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeEditSheet(); };
		window.addEventListener('keydown', onKey);
		return () => {
			document.body.style.overflow = '';
			window.removeEventListener('keydown', onKey);
		};
	});

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
			{:else if user.isLoggedIn}
				<button
					type="button"
					onclick={toggleFollow}
					disabled={isFollowingLoading}
					class="px-4 py-2 bg-white text-black rounded-full text-sm font-medium disabled:opacity-50 hover:bg-gray-200 transition-colors"
				>
					{#if isFollowingLoading}
						...
					{:else}
						{isFollowing ? 'Unfollow' : 'Follow'}
					{/if}
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
				{#if displayAvatar}
					<img src={displayAvatar} alt={profile?.handle} class="w-full h-full object-cover" />
				{:else}
					<div class="w-full h-full flex items-center justify-center text-gray-400 text-2xl">
						{profile?.handle?.[0]?.toUpperCase() ?? '?'}
					</div>
				{/if}
			</div>
			<div class="flex-1 min-w-0">
				<div class="flex items-center gap-2">
					<h2 class="text-xl font-bold text-white truncate">
						{displayName}
					</h2>
					{#if isOwnProfile}
						<button
							type="button"
							onclick={openEditSheet}
							class="text-gray-400 hover:text-white text-xs px-2 py-0.5 border border-gray-700 rounded-full hover:border-gray-500 transition-colors flex-shrink-0"
						>
							Edit
						</button>
					{/if}
				</div>
				<p class="text-gray-400 truncate">@{profile?.handle ?? paramId}</p>
				{#if displayBio}
					<p class="text-gray-300 text-sm mt-1 line-clamp-2">{displayBio}</p>
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
			<div class="grid grid-cols-3 lg:grid-cols-6 gap-1">
				{#each frames as frame}
					<button
						type="button"
						onclick={() => handleFrameClick(frame)}
						class="aspect-[9/16] bg-gray-900 rounded overflow-hidden hover:opacity-80 transition-opacity"
					>
						<img
							src={getFrameImageUrl(did!, frame.value.embed.images[0].image.ref.$link)}
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
			onclick={closeViewer}
			onkeydown={(e) => {
				if (e.key === 'Escape') closeViewer();
			}}
			tabindex="-1"
		>
			{#if isOwnProfile}
				<div class="absolute top-4 left-4 z-10 flex items-center gap-2">
					{#if confirmingDelete}
						<button
							type="button"
							onclick={(e) => { e.stopPropagation(); confirmingDelete = false; }}
							class="text-white/70 text-sm px-3 py-1 rounded-full border border-white/20 hover:bg-white/10 transition-colors"
						>
							Cancel
						</button>
						<button
							type="button"
							onclick={(e) => { e.stopPropagation(); handleDelete(); }}
							disabled={isDeleting}
							class="text-white text-sm px-3 py-1 rounded-full bg-red-500/80 hover:bg-red-500 transition-colors disabled:opacity-50"
						>
							{#if isDeleting}
								<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block"></div>
							{:else}
								Delete
							{/if}
						</button>
					{:else}
						<button
							type="button"
							onclick={(e) => { e.stopPropagation(); confirmingDelete = true; }}
							disabled={isDeleting}
							class="text-white p-2 hover:bg-white/10 rounded-full transition-colors disabled:opacity-50"
							aria-label="Delete frame"
						>
							<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
							</svg>
						</button>
					{/if}
				</div>
			{/if}

			<button
				type="button"
				onclick={(e) => { e.stopPropagation(); closeViewer(); }}
				class="absolute top-4 right-4 text-white p-2 hover:bg-white/10 rounded-full z-10"
				aria-label="Close"
			>
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>

			<img
				src={getFrameImageUrl(did!, selectedFrame.value.embed.images[0].image.ref.$link)}
				alt={selectedFrame.value.alt ?? 'Frame'}
				class="max-h-full max-w-full object-contain rounded-lg"
			/>

			{#if selectedFrame.value.text}
				<div
					class="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent"
				>
					<p class="text-white text-sm">{selectedFrame.value.text}</p>
				</div>
			{/if}
		</div>

	{/if}

	<!-- Edit profile sheet -->
	{#if showEditSheet}
		<div class="fixed inset-0 bg-black z-50 flex flex-col animate-slideUp">
			<!-- Top bar -->
			<div class="flex items-center justify-between px-4 py-3 border-b border-gray-800">
				<button
					type="button"
					onclick={closeEditSheet}
					class="text-gray-400 hover:text-white text-sm"
				>
					Cancel
				</button>
				<h2 class="text-white font-semibold">Edit Profile</h2>
				<button
					type="button"
					onclick={handleSaveProfile}
					disabled={isSaving}
					class="text-blue-500 font-bold text-sm hover:text-blue-400 disabled:opacity-50"
				>
					{#if isSaving}
						<div class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin inline-block"></div>
					{:else}
						Save
					{/if}
				</button>
			</div>

			<div class="flex-1 overflow-y-auto px-4 pt-8 pb-8">
				<!-- Avatar -->
				<div class="flex justify-center mb-8">
					<button
						type="button"
						onclick={() => fileInput.click()}
						class="relative w-24 h-24 rounded-full overflow-hidden bg-gray-800 group"
					>
						{#if editAvatarPreview}
							<img src={editAvatarPreview} alt="New avatar" class="w-full h-full object-cover" />
						{:else if displayAvatar}
							<img src={displayAvatar} alt="Current avatar" class="w-full h-full object-cover" />
						{:else}
							<div class="w-full h-full flex items-center justify-center text-gray-400 text-3xl">
								{profile?.handle?.[0]?.toUpperCase() ?? '?'}
							</div>
						{/if}
						<div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
							<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
							</svg>
						</div>
					</button>
					<input
						bind:this={fileInput}
						type="file"
						accept="image/jpeg,image/png,image/webp"
						class="hidden"
						onchange={handleAvatarSelect}
					/>
				</div>

				<!-- Display name -->
				<div class="mb-4">
					<label for="edit-name" class="text-gray-400 text-xs uppercase tracking-wide mb-1 block">Name</label>
					<input
						id="edit-name"
						type="text"
						bind:value={editDisplayName}
						maxlength="64"
						placeholder="Display name"
						class="w-full bg-gray-900 text-white rounded-lg px-4 py-3 text-base outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-600"
					/>
				</div>

				<!-- Bio -->
				<div class="mb-4">
					<label for="edit-bio" class="text-gray-400 text-xs uppercase tracking-wide mb-1 block">Bio</label>
					<textarea
						id="edit-bio"
						bind:value={editBio}
						maxlength="256"
						placeholder="Tell people about yourself"
						rows="3"
						class="w-full bg-gray-900 text-white rounded-lg px-4 py-3 text-base outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-600 resize-none"
					></textarea>
				</div>

				{#if editError}
					<p class="text-red-500 text-sm mt-2">{editError}</p>
				{/if}

				<p class="text-gray-600 text-xs mt-4">Changes are saved to your 9-16.lol profile only and won't affect your Bluesky profile.</p>
			</div>
		</div>
	{/if}
</div>
