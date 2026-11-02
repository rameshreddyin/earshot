// App configuration. Everything works with zero keys.
// To share community reports between everyone (not just this browser),
// create a free Supabase project, run supabase.sql, and paste the values below.
export const CONFIG = {
  appName: 'Earshot',
  supabaseUrl: '',
  supabaseAnonKey: '',

  // Bengaluru, Indiranagar: dense and well mapped in OpenStreetMap
  defaultView: { center: [77.6408, 12.9719], zoom: 15 },

  mapStyles: {
    day: 'https://tiles.openfreemap.org/styles/positron',
    night: 'https://tiles.openfreemap.org/styles/dark',
  },

  overpassEndpoints: [
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ],

  geocoder: 'https://photon.komoot.io',

  // Noise layer only loads at street level to keep the free APIs happy
  minLayerZoom: 13.5,
  maxTilesPerView: 9,
};
