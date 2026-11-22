<script lang="ts">
	import { fade } from 'svelte/transition';
	import { getPhotoSrcSet, getPhotoUrl } from './imageUtils';
	import { formatDay, formatTime, type Story } from './travel';

	interface Props {
		story: Story;
		index: number;
		onNavigate: (index: number) => void;
		onClose: () => void;
	}

	let { story, index, onNavigate, onClose }: Props = $props();

	const ref = $derived(story.photos[index]);
	const chapter = $derived(story.chapters[ref.chapter]);

	let loadedIndex = $state(-1);
	let closeButton: HTMLButtonElement;
	let filmstrip: HTMLDivElement;
	let swipe: { x: number; y: number } | null = null;

	function go(delta: number) {
		const next = index + delta;
		if (next >= 0 && next < story.photos.length) onNavigate(next);
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowRight') go(1);
		else if (event.key === 'ArrowLeft') go(-1);
		else if (event.key === 'Escape') onClose();
		else return;
		event.preventDefault();
	}

	function onPointerUp(event: PointerEvent) {
		if (!swipe) return;
		const dx = event.clientX - swipe.x;
		const dy = event.clientY - swipe.y;
		swipe = null;
		if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
		else if (Math.abs(dx) < 6 && Math.abs(dy) < 6 && event.target === event.currentTarget)
			onClose();
	}

	$effect(() => closeButton.focus());

	// Warm the cache for the neighbours so stepping through feels instant.
	$effect(() => {
		for (const delta of [1, -1, 2]) {
			const neighbour = story.photos[index + delta];
			if (!neighbour) continue;
			const img = new Image();
			img.sizes = '100vw';
			img.srcset = getPhotoSrcSet(neighbour.photo);
		}
	});

	$effect(() => {
		filmstrip
			.querySelector(`[data-photo="${index}"]`)
			?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
	});
</script>

<svelte:window onkeydown={onKeydown} />

<div
	class="fixed inset-0 z-50 flex flex-col bg-[#0b0b0d] text-zinc-100"
	role="dialog"
	aria-modal="true"
	aria-label="Photo viewer"
	transition:fade={{ duration: 160 }}
>
	<header class="flex items-center gap-3 px-4 py-3 sm:px-6">
		<span class="h-2.5 w-2.5 shrink-0 rounded-full" style:background={chapter.color}></span>
		<div class="min-w-0 flex-1 truncate text-sm">
			<span class="font-medium">{chapter.itinerary.name || chapter.itinerary.id}</span>
			<span class="text-zinc-400">· {formatDay(ref.day.key)} · {formatTime(ref.photo.date)}</span>
		</div>
		<span class="text-xs text-zinc-500 tabular-nums">{index + 1} / {story.photos.length}</span>
		<button
			bind:this={closeButton}
			type="button"
			class="rounded-full p-2 text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
			aria-label="Close"
			onclick={onClose}
		>
			<svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
				<path stroke-linecap="round" d="M6 18 18 6M6 6l12 12" />
			</svg>
		</button>
	</header>

	<div
		class="relative min-h-0 flex-1 touch-pan-y select-none"
		role="presentation"
		onpointerdown={(e) => (swipe = { x: e.clientX, y: e.clientY })}
		onpointerup={onPointerUp}
	>
		{#key index}
			{@const shown = index}
			<div
				class="pointer-events-none absolute inset-0 flex items-center justify-center p-2 sm:px-20 sm:py-4"
				in:fade={{ duration: 200 }}
			>
				<img
					srcset={getPhotoSrcSet(ref.photo)}
					sizes="100vw"
					src={getPhotoUrl(ref.photo, 'large')}
					alt={ref.photo.description || ''}
					class="max-h-full max-w-full rounded-sm object-contain shadow-2xl transition-opacity duration-300 {loadedIndex ===
					shown
						? 'opacity-100'
						: 'opacity-0'}"
					onload={() => (loadedIndex = shown)}
				/>
			</div>
		{/key}

		{#if loadedIndex !== index}
			<div
				class="pointer-events-none absolute top-1/2 left-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 animate-spin rounded-full border-2 border-white/15 border-t-white/70"
			></div>
		{/if}

		{#if index > 0}
			<button
				type="button"
				class="absolute top-1/2 left-3 hidden -translate-y-1/2 rounded-full bg-white/8 p-3 text-white transition-colors hover:bg-white/20 sm:block"
				aria-label="Previous photo"
				onclick={() => go(-1)}
			>
				<svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
				</svg>
			</button>
		{/if}
		{#if index < story.photos.length - 1}
			<button
				type="button"
				class="absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-full bg-white/8 p-3 text-white transition-colors hover:bg-white/20 sm:block"
				aria-label="Next photo"
				onclick={() => go(1)}
			>
				<svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
				</svg>
			</button>
		{/if}
	</div>

	{#if ref.photo.description}
		<p class="mx-auto max-w-2xl px-6 pt-3 text-center text-sm text-zinc-300">
			{ref.photo.description}
		</p>
	{/if}

	<div
		bind:this={filmstrip}
		class="flex justify-center-safe gap-1.5 overflow-x-auto px-4 py-3 [scrollbar-width:none]"
	>
		{#each ref.day.photos.length > 1 ? ref.day.photos : [] as dayPhoto (dayPhoto.index)}
			<button
				type="button"
				data-photo={dayPhoto.index}
				class="h-14 w-14 shrink-0 overflow-hidden rounded-md transition {dayPhoto.index === index
					? 'opacity-100 ring-2 ring-white'
					: 'opacity-45 hover:opacity-80'}"
				aria-label="Photo {dayPhoto.index + 1}"
				onclick={() => onNavigate(dayPhoto.index)}
			>
				<img
					src={getPhotoUrl(dayPhoto.photo, 'thumbnail')}
					alt=""
					class="h-full w-full object-cover"
				/>
			</button>
		{/each}
	</div>
</div>
