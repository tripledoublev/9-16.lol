import type { Did } from '@atcute/lexicons';
import type { FeedAuthor } from '$lib/feed/engine';
import { createFeedGenerator, loadMoreFrames } from '$lib/feed/engine';
import { getSeenState, setSeenState } from '$lib/cache/db';

export function createFeedStore(viewerDid: Did) {
	let authors = $state<FeedAuthor[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedAuthorIndex = $state<number | null>(null);
	let selectedFrameIndex = $state(0);

	async function load() {
		isLoading = true;
		error = null;

		try {
			// Load seen states
			const seenStates = new Map<Did, string>();
			// Note: We'd need to load these from the db, but for now start fresh

			const generator = createFeedGenerator(viewerDid, seenStates);
			const result = await generator.next();

			if (!result.done && result.value) {
				authors = result.value;
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load feed';
		} finally {
			isLoading = false;
		}
	}

	async function refresh() {
		await load();
	}

	function selectAuthor(index: number) {
		selectedAuthorIndex = index;
		selectedFrameIndex = 0;
	}

	function closeViewer() {
		// Mark current author's frames as seen
		if (selectedAuthorIndex !== null && authors[selectedAuthorIndex]) {
			const author = authors[selectedAuthorIndex];
			if (author.frames.length > 0) {
				const latestCreatedAt = author.frames[0].value.createdAt;
				setSeenState(viewerDid, author.did, latestCreatedAt);
				author.hasUnseen = false;
			}
		}

		selectedAuthorIndex = null;
		selectedFrameIndex = 0;
	}

	function nextFrame() {
		if (selectedAuthorIndex === null) return;
		const author = authors[selectedAuthorIndex];
		if (selectedFrameIndex < author.frames.length - 1) {
			selectedFrameIndex++;
		} else {
			// Move to next author
			nextAuthor();
		}
	}

	function prevFrame() {
		if (selectedAuthorIndex === null) return;
		if (selectedFrameIndex > 0) {
			selectedFrameIndex--;
		} else {
			// Move to previous author
			prevAuthor();
		}
	}

	function nextAuthor() {
		if (selectedAuthorIndex === null) return;
		// Mark current as seen
		const currentAuthor = authors[selectedAuthorIndex];
		if (currentAuthor.frames.length > 0) {
			setSeenState(viewerDid, currentAuthor.did, currentAuthor.frames[0].value.createdAt);
			currentAuthor.hasUnseen = false;
		}

		if (selectedAuthorIndex < authors.length - 1) {
			selectedAuthorIndex++;
			selectedFrameIndex = 0;
		} else {
			closeViewer();
		}
	}

	function prevAuthor() {
		if (selectedAuthorIndex === null) return;
		if (selectedAuthorIndex > 0) {
			selectedAuthorIndex--;
			selectedFrameIndex = 0;
		}
	}

	async function loadMoreForAuthor(authorDid: Did) {
		const authorIndex = authors.findIndex((a) => a.did === authorDid);
		if (authorIndex === -1) return;

		const author = authors[authorIndex];
		// Would need cursor tracking - simplified for now
	}

	return {
		get authors() {
			return authors;
		},
		get isLoading() {
			return isLoading;
		},
		get error() {
			return error;
		},
		get selectedAuthorIndex() {
			return selectedAuthorIndex;
		},
		get selectedFrameIndex() {
			return selectedFrameIndex;
		},
		get selectedAuthor() {
			return selectedAuthorIndex !== null ? authors[selectedAuthorIndex] : null;
		},
		get selectedFrame() {
			if (selectedAuthorIndex === null) return null;
			return authors[selectedAuthorIndex]?.frames[selectedFrameIndex] ?? null;
		},
		get isViewerOpen() {
			return selectedAuthorIndex !== null;
		},
		load,
		refresh,
		selectAuthor,
		closeViewer,
		nextFrame,
		prevFrame,
		nextAuthor,
		prevAuthor,
		loadMoreForAuthor
	};
}

export type FeedStore = ReturnType<typeof createFeedStore>;
