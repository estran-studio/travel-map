<script lang="ts">
	import { getHomeUrl } from './pathUtils';
	import { getPhotoUrl, type ImageSize } from './imageUtils';
	import { formatDay, formatRange, type Day, type Story } from './travel';

	interface Props {
		story: Story;
		activeDay: Day | null;
		/** Called with the day crossing the reading line, or `null` while the intro is in view. */
		onActiveDay: (day: Day | null) => void;
		onOpenPhoto: (index: number) => void;
		onHoverPhoto: (index: number | null) => void;
	}

	let { story, activeDay, onActiveDay, onOpenPhoto, onHoverPhoto }: Props = $props();

	let scroller: HTMLDivElement;
	const { travel, chapters, photos } = story;

	/** Scrolls the photo into view, e.g. after browsing to it in the lightbox. */
	export function reveal(index: number) {
		scroller
			.querySelector(`[data-photo="${index}"]`)
			?.scrollIntoView({ block: 'center', behavior: 'smooth' });
	}

	function jumpTo(chapter: number) {
		scroller.querySelector(`#chapter-${chapter}`)?.scrollIntoView({ behavior: 'smooth' });
	}

	/**
	 * Mosaic for a day on a 6-column grid: one photo fills the row, two share it, three or
	 * more open with a large lead photo; a short last row stretches to stay full width.
	 */
	function tile(count: number, k: number): { cls: string; size: ImageSize } {
		if (count === 1) return { cls: 'col-span-6 aspect-[16/10]', size: 'medium' };
		if (count === 2) return { cls: 'col-span-3 aspect-square', size: 'medium' };
		if (k === 0) return { cls: 'col-span-4 row-span-2', size: 'medium' };
		const rest = count - 3;
		const inLastRow = k >= 3 && Math.floor((k - 3) / 3) === Math.floor((rest - 1) / 3);
		if (inLastRow && rest % 3 === 1) return { cls: 'col-span-6 aspect-[2/1]', size: 'medium' };
		if (inLastRow && rest % 3 === 2) return { cls: 'col-span-3 aspect-[4/3]', size: 'medium' };
		return { cls: 'col-span-2 aspect-square', size: 'thumbnail' };
	}

	$effect(() => {
		// A thin reading line near the top of the panel decides which day is "current".
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					const section = (entry.target as HTMLElement).dataset.section!;
					onActiveDay(section === 'intro' ? null : story.days[Number(section)]);
				}
			},
			{ root: scroller, rootMargin: '-30% 0px -69% 0px' }
		);
		for (const el of scroller.querySelectorAll('[data-section]')) observer.observe(el);
		return () => observer.disconnect();
	});
</script>

<div bind:this={scroller} class="journal h-full overflow-y-auto overscroll-contain">
	<header data-section="intro" class="px-6 pt-8 pb-8 lg:pt-10">
		<a
			href={getHomeUrl()}
			class="text-[11px] font-medium tracking-[0.18em] text-zinc-500 uppercase transition-colors hover:text-zinc-200"
		>
			← All trips
		</a>
		<h1 class="mt-4 text-3xl font-semibold tracking-tight text-zinc-50 lg:text-4xl">
			{travel.name || 'Travel'}
		</h1>
		<p class="mt-2 text-sm text-zinc-400">
			{formatRange(travel.startDate, travel.endDate)}
		</p>
		<p class="mt-1 text-sm text-zinc-500">
			{chapters.length} chapters · {story.days.length} days · {photos.length} photos
		</p>
		{#if travel.description}
			<p class="mt-4 text-[15px] leading-relaxed text-zinc-300">{travel.description}</p>
		{/if}
	</header>

	<nav
		class="sticky top-0 z-10 flex gap-2 overflow-x-auto border-y border-white/5 bg-[#101114]/90 px-4 py-2.5 backdrop-blur [scrollbar-width:none]"
		aria-label="Chapters"
	>
		{#each chapters as chapter (chapter.index)}
			<button
				type="button"
				class="flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors {activeDay?.chapter ===
				chapter.index
					? 'bg-white/12 text-zinc-50'
					: 'text-zinc-400 hover:bg-white/6 hover:text-zinc-200'}"
				onclick={() => jumpTo(chapter.index)}
			>
				<span class="h-2 w-2 rounded-full" style:background={chapter.color}></span>
				{chapter.itinerary.name || chapter.itinerary.id}
			</button>
		{/each}
	</nav>

	{#each chapters as chapter (chapter.index)}
		<section id="chapter-{chapter.index}" class="scroll-mt-12">
			<div class="px-6 pt-12 pb-5">
				<div class="h-1 w-10 rounded-full" style:background={chapter.color}></div>
				<h2 class="mt-4 text-2xl font-semibold tracking-tight text-zinc-50">
					{chapter.itinerary.name || chapter.itinerary.id}
				</h2>
				<p class="mt-1 text-sm text-zinc-400">
					{formatRange(chapter.itinerary.startDate, chapter.itinerary.endDate)}
					<span class="text-zinc-600">·</span>
					{chapter.photoCount} photos
				</p>
				{#if chapter.itinerary.description}
					<p class="mt-3 text-[15px] leading-relaxed text-zinc-300">
						{chapter.itinerary.description}
					</p>
				{/if}
			</div>

			{#each chapter.days as day (day.index)}
				<div data-section={day.index} class="px-4 pb-7">
					<div class="flex items-baseline justify-between px-2 pb-2.5">
						<h3
							class="text-sm font-medium transition-colors first-letter:uppercase {activeDay === day
								? 'text-zinc-50'
								: 'text-zinc-400'}"
						>
							{formatDay(day.key)}
						</h3>
						<span class="text-xs text-zinc-600">{day.photos.length}</span>
					</div>
					<div class="grid grid-flow-dense grid-cols-6 gap-1">
						{#each day.photos as ref, k (ref.index)}
							{@const { cls, size } = tile(day.photos.length, k)}
							<button
								type="button"
								data-photo={ref.index}
								class="group relative overflow-hidden rounded-md bg-zinc-800 {cls}"
								onclick={() => onOpenPhoto(ref.index)}
								onpointerenter={(e) => e.pointerType === 'mouse' && onHoverPhoto(ref.index)}
								onpointerleave={() => onHoverPhoto(null)}
							>
								<img
									src={getPhotoUrl(ref.photo, size)}
									alt={ref.photo.description || ''}
									loading="lazy"
									decoding="async"
									class="h-full w-full object-cover opacity-0 transition duration-500 group-hover:scale-[1.03]"
									onload={(e) => e.currentTarget.classList.remove('opacity-0')}
								/>
							</button>
						{/each}
					</div>
				</div>
			{/each}
		</section>
	{/each}

	<footer class="px-6 pt-6 pb-16 text-center text-xs text-zinc-600">The end.</footer>
</div>
