<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import type { LngLatBoundsLike } from 'maplibre-gl';
	import TravelMap from '$lib/TravelMap.svelte';
	import Journal from '$lib/Journal.svelte';
	import PhotoLightbox from '$lib/PhotoLightbox.svelte';
	import { buildStory, loadTravel, travelYears, type Day } from '$lib/travel';
	import type { Travel } from '$lib/types/travel-dataset';

	let travel = $state.raw<Travel | null>(null);
	let year = $state<number | null>(null);
	let error = $state<string | null>(null);

	const story = $derived(travel ? buildStory(travel, year) : null);
	const years = $derived(travel ? travelYears(travel) : []);

	let activeDay = $state.raw<Day | null>(null);
	let focus = $state.raw<LngLatBoundsLike>([0, 0, 0, 0]);
	let lightbox = $state<number | null>(null);
	let hovered = $state<number | null>(null);
	let journal = $state<Journal>();
	let focusTimer: ReturnType<typeof setTimeout>;

	const activeChapter = $derived(
		lightbox !== null ? story!.photos[lightbox].chapter : (activeDay?.chapter ?? null)
	);

	function onActiveDay(day: Day | null) {
		activeDay = day;
		// Let fast scrolling settle before moving the map.
		clearTimeout(focusTimer);
		focusTimer = setTimeout(() => (focus = day?.bounds ?? story!.bounds), 250);
	}

	function closeLightbox() {
		const last = lightbox!;
		lightbox = null;
		journal?.reveal(last);
	}

	function onYear(next: number | null) {
		year = next;
		activeDay = null;
		hovered = null;
		clearTimeout(focusTimer);
		focus = story!.bounds;
	}

	onMount(async () => {
		try {
			travel = await loadTravel(page.params.travelId!);
			focus = story!.bounds;
		} catch (err) {
			console.error('Error loading travel data:', err);
			error = err instanceof Error ? err.message : 'Failed to load travel data';
		}
	});
</script>

<svelte:head>
	{#if story?.travel.name}<title>{story.travel.name} · {__APP_CONFIG__.title}</title>{/if}
</svelte:head>

<div class="flex h-dvh w-full flex-col overflow-hidden bg-[#101114] text-zinc-200 lg:flex-row">
	{#if error}
		<p class="m-auto px-6 text-center text-sm text-red-300">{error}</p>
	{:else if !story}
		<div
			class="m-auto h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-white/60"
			aria-label="Loading"
		></div>
	{:else}
		<div class="relative h-[42dvh] shrink-0 lg:order-2 lg:h-auto lg:flex-1">
			<TravelMap
				{story}
				{focus}
				{activeChapter}
				highlight={lightbox ?? hovered}
				onOpenPhoto={(i) => (lightbox = i)}
			/>
		</div>
		<aside
			class="min-h-0 flex-1 border-white/5 lg:order-1 lg:w-[440px] lg:flex-none lg:border-r xl:w-[500px]"
		>
			{#key story}
				<Journal
					bind:this={journal}
					{story}
					{years}
					{year}
					{onYear}
					{activeDay}
					{onActiveDay}
					onOpenPhoto={(i) => (lightbox = i)}
					onHoverPhoto={(i) => (hovered = i)}
				/>
			{/key}
		</aside>
	{/if}
</div>

{#if story && lightbox !== null}
	<PhotoLightbox
		{story}
		index={lightbox}
		onNavigate={(i) => (lightbox = i)}
		onClose={closeLightbox}
	/>
{/if}
