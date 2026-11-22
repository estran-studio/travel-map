<script lang="ts">
	import { onMount } from 'svelte';
	import maplibregl, { type GeoJSONSource, type LngLatBoundsLike } from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { getPhotoUrl } from './imageUtils';
	import { routeCoordinates, type Story } from './travel';

	interface Props {
		story: Story;
		/** Area to show; the map animates to it whenever a new value is passed. */
		focus: LngLatBoundsLike;
		/** Chapter whose route is emphasized; `null` shows every route equally. */
		activeChapter: number | null;
		/** Photo whose location is pinpointed. */
		highlight: number | null;
		onOpenPhoto: (index: number) => void;
	}

	let { story, focus, activeChapter, highlight, onOpenPhoto }: Props = $props();

	const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';
	const CLUSTER_MAX_ZOOM = 16;

	let container: HTMLDivElement;
	let map = $state.raw<maplibregl.Map | null>(null);
	let appliedFocus: LngLatBoundsLike | null = null;
	let markers = new Map<string, maplibregl.Marker>();
	let pin: maplibregl.Marker | null = null;

	const fitPadding = () =>
		Math.round(Math.min(80, container.clientWidth * 0.1, container.clientHeight * 0.15));

	function routeOpacity(chapter: number | null): maplibregl.ExpressionSpecification | number {
		return chapter === null ? 0.9 : ['case', ['==', ['get', 'chapter'], chapter], 1, 0.2];
	}

	function addLayers(m: maplibregl.Map) {
		m.addSource('routes', {
			type: 'geojson',
			data: {
				type: 'FeatureCollection',
				features: story.chapters.map((chapter) => ({
					type: 'Feature',
					properties: { chapter: chapter.index, color: chapter.color },
					geometry: { type: 'LineString', coordinates: routeCoordinates(chapter.itinerary) }
				}))
			}
		});
		const layout = { 'line-join': 'round', 'line-cap': 'round' } as const;
		m.addLayer({
			id: 'route-casing',
			type: 'line',
			source: 'routes',
			layout,
			paint: {
				'line-color': '#ffffff',
				'line-width': ['interpolate', ['linear'], ['zoom'], 3, 4, 12, 9],
				'line-opacity': routeOpacity(null)
			}
		});
		m.addLayer({
			id: 'route-line',
			type: 'line',
			source: 'routes',
			layout,
			paint: {
				'line-color': ['get', 'color'],
				'line-width': ['interpolate', ['linear'], ['zoom'], 3, 2, 12, 5],
				'line-opacity': routeOpacity(null)
			}
		});

		m.addSource('photos', {
			type: 'geojson',
			cluster: true,
			clusterRadius: 64,
			clusterMaxZoom: CLUSTER_MAX_ZOOM,
			// Earliest photo of a cluster becomes its cover.
			clusterProperties: { cover: ['min', ['get', 'i']] },
			data: {
				type: 'FeatureCollection',
				features: story.photos.map((ref) => ({
					type: 'Feature',
					properties: { i: ref.index },
					geometry: {
						type: 'Point',
						coordinates: [ref.photo.position.longitude, ref.photo.position.latitude]
					}
				}))
			}
		});
		// Invisible layer: makes the source load so its clusters can be queried for HTML markers.
		m.addLayer({
			id: 'photos-anchor',
			type: 'circle',
			source: 'photos',
			paint: { 'circle-radius': 0, 'circle-opacity': 0 }
		});
	}

	async function openCluster(m: maplibregl.Map, clusterId: number, center: [number, number]) {
		const source = m.getSource('photos') as GeoJSONSource;
		const zoom = await source.getClusterExpansionZoom(clusterId);
		if (zoom <= CLUSTER_MAX_ZOOM) {
			m.easeTo({ center, zoom, duration: 700 });
			return;
		}
		// Photos taken at the same spot never split apart: open them instead.
		const leaves = await source.getClusterLeaves(clusterId, Infinity, 0);
		onOpenPhoto(Math.min(...leaves.map((leaf) => leaf.properties!.i as number)));
	}

	function createMarker(
		m: maplibregl.Map,
		coordinates: [number, number],
		props: {
			cluster?: boolean;
			cluster_id?: number;
			point_count?: number;
			cover?: number;
			i?: number;
		}
	) {
		const cover = story.photos[props.cluster ? props.cover! : props.i!];
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'photo-pin';
		button.style.setProperty('--pin-color', story.chapters[cover.chapter].color);
		button.setAttribute(
			'aria-label',
			props.cluster ? `${props.point_count} photos` : `Photo ${cover.photo.id}`
		);

		const img = document.createElement('img');
		img.src = getPhotoUrl(cover.photo, 'thumbnail');
		img.alt = '';
		img.decoding = 'async';
		img.onload = () => button.classList.add('is-loaded');
		button.append(img);

		if (props.cluster) {
			button.classList.add('is-stack');
			const count = document.createElement('span');
			count.className = 'photo-pin-count';
			count.textContent = String(props.point_count);
			button.append(count);
		}

		button.addEventListener('click', (event) => {
			event.stopPropagation();
			if (props.cluster) openCluster(m, props.cluster_id!, coordinates);
			else onOpenPhoto(props.i!);
		});

		// MapLibre positions the marker element with its own transform, so the styled pin lives inside it.
		const element = document.createElement('div');
		element.className = 'photo-pin-anchor';
		element.append(button);
		return new maplibregl.Marker({ element, anchor: 'center' }).setLngLat(coordinates).addTo(m);
	}

	/** Keeps one HTML marker per visible cluster or photo, reusing existing ones. */
	function syncMarkers(m: maplibregl.Map) {
		if (!m.isSourceLoaded('photos')) return;
		const next = new Map<string, maplibregl.Marker>();
		for (const feature of m.querySourceFeatures('photos')) {
			const props = feature.properties;
			const key = props.cluster ? `c${props.cluster_id}` : `p${props.i}`;
			if (next.has(key)) continue;
			const coordinates = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
			next.set(key, markers.get(key) ?? createMarker(m, coordinates, props));
		}
		for (const [key, marker] of markers) if (!next.has(key)) marker.remove();
		markers = next;
	}

	onMount(() => {
		const m = new maplibregl.Map({
			container,
			style: MAP_STYLE,
			bounds: focus,
			fitBoundsOptions: { padding: fitPadding() },
			attributionControl: { compact: true },
			dragRotate: false,
			pitchWithRotate: false
		});
		m.touchZoomRotate.disableRotation();
		m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
		m.on('load', () => {
			// The compact attribution starts expanded; keep it folded behind its (i) button.
			container
				.querySelector('.maplibregl-compact-show')
				?.classList.remove('maplibregl-compact-show');
			addLayers(m);
			m.on('render', () => syncMarkers(m));
			appliedFocus = focus;
			map = m;
		});
		return () => m.remove();
	});

	$effect(() => {
		const target = focus;
		if (!map || target === appliedFocus) return;
		appliedFocus = target;
		map.fitBounds(target, { padding: fitPadding(), maxZoom: 10, duration: 1100 });
	});

	$effect(() => {
		const opacity = routeOpacity(activeChapter);
		if (!map) return;
		map.setPaintProperty('route-line', 'line-opacity', opacity);
		map.setPaintProperty('route-casing', 'line-opacity', opacity);
	});

	$effect(() => {
		const ref = highlight === null ? null : story.photos[highlight];
		if (!map) return;
		if (!ref) {
			pin?.remove();
			return;
		}
		if (!pin) {
			const element = document.createElement('div');
			element.className = 'photo-locator';
			pin = new maplibregl.Marker({ element, anchor: 'center' });
		}
		pin.getElement().style.setProperty('--pin-color', story.chapters[ref.chapter].color);
		pin.setLngLat([ref.photo.position.longitude, ref.photo.position.latitude]).addTo(map);
	});
</script>

<div bind:this={container} class="h-full w-full"></div>

<style>
	:global(.photo-pin) {
		position: relative;
		width: 48px;
		height: 48px;
		padding: 0;
		border: 3px solid #fff;
		border-radius: 12px;
		background: #d4d4d8;
		box-shadow:
			0 0 0 2px var(--pin-color),
			0 6px 16px rgb(0 0 0 / 0.3);
		cursor: pointer;
		transition: transform 0.15s ease;
	}

	:global(.photo-pin-anchor:hover),
	:global(.photo-pin-anchor:focus-within) {
		z-index: 2;
	}

	:global(.photo-pin:hover),
	:global(.photo-pin:focus-visible) {
		transform: scale(1.12);
		outline: none;
	}

	:global(.photo-pin img) {
		width: 100%;
		height: 100%;
		border-radius: 9px;
		object-fit: cover;
		opacity: 0;
		transition: opacity 0.25s ease;
	}

	:global(.photo-pin.is-loaded img) {
		opacity: 1;
	}

	/* A second card peeking behind the cover marks a group of photos. */
	:global(.photo-pin.is-stack::before) {
		content: '';
		position: absolute;
		inset: -3px;
		border: 3px solid #fff;
		border-radius: 12px;
		background: #e4e4e7;
		box-shadow: 0 0 0 2px var(--pin-color);
		transform: translate(5px, -5px) rotate(6deg);
		z-index: -1;
	}

	:global(.photo-pin-count) {
		position: absolute;
		right: -10px;
		bottom: -10px;
		min-width: 22px;
		height: 22px;
		padding: 0 6px;
		border: 2px solid #fff;
		border-radius: 11px;
		background: var(--pin-color);
		color: #fff;
		font:
			600 11px/18px system-ui,
			sans-serif;
		text-align: center;
	}

	:global(.photo-locator) {
		width: 18px;
		height: 18px;
		border: 3px solid #fff;
		border-radius: 50%;
		background: var(--pin-color);
		box-shadow: 0 0 0 0 var(--pin-color);
		animation: locator-pulse 1.4s ease-out infinite;
		pointer-events: none;
		z-index: 3;
	}

	@keyframes locator-pulse {
		to {
			box-shadow: 0 0 0 18px transparent;
		}
	}
</style>
