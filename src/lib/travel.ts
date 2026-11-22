import type { LngLatBoundsLike } from 'maplibre-gl';
import { getFullPath, getTravelIndexUrl } from './pathUtils';
import type { Itinerary, Photo, Travel } from './types/travel-dataset';
import type { TravelIndex } from './types/travel-index';

/** One color per itinerary, shared by the map routes and the journal. */
export const chapterColors = [
	'#ef476f',
	'#118ab2',
	'#f4a261',
	'#8338ec',
	'#06a77d',
	'#e76f51',
	'#3a86ff',
	'#c9184a'
];

export interface PhotoRef {
	photo: Photo;
	/** Position in the chronological list of every photo of the travel. */
	index: number;
	chapter: number;
	day: Day;
}

export interface Day {
	/** Position in `Story.days`. */
	index: number;
	/** `YYYY-MM-DD` of the photos' wall-clock date. */
	key: string;
	chapter: number;
	photos: PhotoRef[];
	bounds: LngLatBoundsLike;
}

export interface Chapter {
	index: number;
	itinerary: Itinerary;
	color: string;
	days: Day[];
	photoCount: number;
}

export interface Story {
	travel: Travel;
	chapters: Chapter[];
	days: Day[];
	photos: PhotoRef[];
	bounds: LngLatBoundsLike;
}

type LngLat = [number, number];

export async function loadTravel(id: string): Promise<Travel> {
	const indexResponse = await fetch(getTravelIndexUrl());
	if (!indexResponse.ok) {
		throw new Error(`Failed to load travel index: ${indexResponse.statusText}`);
	}
	const index: TravelIndex = await indexResponse.json();
	const entry = index.travels.find((t) => t.id === id);
	if (!entry) throw new Error(`Travel with ID "${id}" not found`);

	const travelResponse = await fetch(getFullPath(entry.file));
	if (!travelResponse.ok) {
		throw new Error(`Failed to load travel data: ${travelResponse.statusText}`);
	}
	const travel = await travelResponse.json();

	// Split format: `itineraries` lists ids stored next to the travel file as `<id>/<id>.json`.
	if (typeof travel.itineraries?.[0] === 'string') {
		const baseDir = entry.file.substring(0, entry.file.lastIndexOf('/') + 1);
		const itineraries = await Promise.all(
			travel.itineraries.map(async (itineraryId: string) => {
				const response = await fetch(getFullPath(`${baseDir}${itineraryId}/${itineraryId}.json`));
				if (!response.ok) {
					console.warn(`Could not load itinerary: ${itineraryId}`);
					return null;
				}
				return response.json();
			})
		);
		travel.itineraries = itineraries.filter(Boolean);
	}

	return travel;
}

export function routeCoordinates(itinerary: Itinerary): LngLat[] {
	const { route } = itinerary;
	if (route?.path?.length) return route.path.map((p) => [p.longitude, p.latitude]);
	if (route?.start && route?.end) {
		return [
			[route.start.longitude, route.start.latitude],
			[route.end.longitude, route.end.latitude]
		];
	}
	return [];
}

function boundsOf(points: LngLat[]): LngLatBoundsLike {
	let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
	for (const [lng, lat] of points) {
		w = Math.min(w, lng);
		e = Math.max(e, lng);
		s = Math.min(s, lat);
		n = Math.max(n, lat);
	}
	return [
		[w, s],
		[e, n]
	];
}

const lngLat = (photo: Photo): LngLat => [photo.position.longitude, photo.position.latitude];

/** Flattens a travel into chapters (itineraries) → days → photos, in chronological order. */
export function buildStory(travel: Travel): Story {
	const photos: PhotoRef[] = [];
	const days: Day[] = [];
	const allPoints: LngLat[] = [];

	const chapters = travel.itineraries.map((itinerary, chapter): Chapter => {
		const list = [
			...(itinerary.photoClusters ?? []).flatMap((cluster) => cluster.photos),
			...(itinerary.independentPhotos ?? [])
		]
			.filter((photo) => photo.position)
			.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

		const chapterDays: Day[] = [];
		for (const photo of list) {
			const key = photo.date.slice(0, 10);
			let day = chapterDays.at(-1);
			if (day?.key !== key) {
				day = { index: days.length, key, chapter, photos: [], bounds: [0, 0, 0, 0] };
				chapterDays.push(day);
				days.push(day);
			}
			const ref: PhotoRef = { photo, index: photos.length, chapter, day };
			day.photos.push(ref);
			photos.push(ref);
		}
		for (const day of chapterDays) {
			day.bounds = boundsOf(day.photos.map((ref) => lngLat(ref.photo)));
		}

		allPoints.push(...routeCoordinates(itinerary), ...list.map(lngLat));
		return {
			index: chapter,
			itinerary,
			color: chapterColors[chapter % chapterColors.length],
			days: chapterDays,
			photoCount: list.length
		};
	});

	return { travel, chapters, days, photos, bounds: boundsOf(allPoints) };
}

// Photo timestamps are the camera's wall-clock time stored with a `Z` suffix, so they are
// formatted in UTC to show the time the picture was actually taken.
const asTaken = { timeZone: 'UTC' } as const;

export function formatDay(key: string): string {
	return new Date(`${key}T00:00:00Z`).toLocaleDateString(undefined, {
		...asTaken,
		weekday: 'short',
		day: 'numeric',
		month: 'short'
	});
}

export function formatTime(iso: string): string {
	return new Date(iso).toLocaleTimeString(undefined, {
		...asTaken,
		hour: '2-digit',
		minute: '2-digit'
	});
}

export function formatRange(startIso: string, endIso?: string): string {
	const start = new Date(startIso);
	const end = endIso ? new Date(endIso) : start;
	const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
	const startLabel = start.toLocaleDateString(undefined, {
		...asTaken,
		day: 'numeric',
		month: 'short',
		year: sameYear ? undefined : 'numeric'
	});
	const endLabel = end.toLocaleDateString(undefined, {
		...asTaken,
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	});
	return startLabel === endLabel ? endLabel : `${startLabel} – ${endLabel}`;
}
