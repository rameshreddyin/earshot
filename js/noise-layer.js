// Draws every street and rail line in its noise colour, so the base map stays sharp.
import { RAMP, rgb } from './noise-model.js';

const SOURCE = 'noise-streets';
const LAYER = 'noise-streets';

export class NoiseLayer {
  constructor(map, tiles) {
    this.map = map;
    this.tiles = tiles;
    this.period = 'day';
    this.visible = true;
    this.ready = false;
    tiles.addEventListener('tile', () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.refresh(), 60);
    });
  }

  colour() {
    const stops = RAMP.flatMap(([db, c]) => [db, rgb(c)]);
    return ['interpolate', ['linear'], ['get', this.period], ...stops];
  }

  data() {
    return { type: 'FeatureCollection', features: this.tiles.index.lineFeatures() };
  }

  // labels stay on top of the coloured streets
  beforeLayer() {
    return this.map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
  }

  install() {
    this.ready = true;
    if (this.map.getSource(SOURCE)) return;
    this.map.addSource(SOURCE, { type: 'geojson', data: this.data() });
    this.map.addLayer({
      id: LAYER,
      type: 'line',
      source: SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round', visibility: this.visible ? 'visible' : 'none' },
      paint: {
        'line-color': this.colour(),
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          12, ['*', ['get', 'rank'], 0.45],
          15, ['+', 0.7, ['*', ['get', 'rank'], ['get', 'rank'], 0.45]],
          18, ['+', 2, ['*', ['get', 'rank'], ['get', 'rank'], 1.1]],
        ],
        'line-opacity': 0.92,
      },
    }, this.beforeLayer());
  }

  refresh() {
    if (!this.ready) return;
    this.map.getSource(SOURCE)?.setData(this.data());
  }

  setPeriod(period) {
    this.period = period;
    if (this.map.getLayer(LAYER)) this.map.setPaintProperty(LAYER, 'line-color', this.colour());
  }

  setVisible(v) {
    this.visible = v;
    if (this.map.getLayer(LAYER)) this.map.setLayoutProperty(LAYER, 'visibility', v ? 'visible' : 'none');
  }
}
