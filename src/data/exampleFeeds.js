// Curated, ready-to-use example feeds for the Live data binding section.
//
// Every URL here was confirmed CORS-open and flat-mappable on 2026-06-11. The
// live-data mapper (OGrafTemplate.mapFeedToData) reads JSON by TOP-LEVEL KEY
// ONLY and RSS by item field name, so every field listed below is a flat,
// top-level field. Do not add feeds that require nested paths (a.b); they will
// not map.
//
// Entry shape:
//   {
//     id: string,            // stable identifier, used as the <option> value
//     label: string,         // human-facing name in the picker
//     type: 'json'|'rss',    // data source type fed to updateDataSource
//     url: string,           // public, CORS-open feed URL
//     fields: [{ name, label?, kind? }],  // flat fields the feed exposes
//     primaryField: string   // the field auto-mapped to the first text input
//   }
export const EXAMPLE_FEEDS = [
    {
        id: 'catfact',
        label: 'Cat Facts',
        type: 'json',
        url: 'https://catfact.ninja/fact',
        fields: [
            { name: 'fact', label: 'Fact', kind: 'text' },
            { name: 'length', label: 'Length', kind: 'number' }
        ],
        primaryField: 'fact'
    },
    {
        id: 'joke',
        label: 'Random Joke',
        type: 'json',
        url: 'https://official-joke-api.appspot.com/random_joke',
        fields: [
            { name: 'setup', label: 'Setup', kind: 'text' },
            { name: 'punchline', label: 'Punchline', kind: 'text' }
        ],
        primaryField: 'setup'
    },
    {
        id: 'uselessfacts',
        label: 'Useless Facts',
        type: 'json',
        url: 'https://uselessfacts.jsph.pl/api/v2/facts/random',
        fields: [
            { name: 'text', label: 'Text', kind: 'text' },
            { name: 'source', label: 'Source', kind: 'text' }
        ],
        primaryField: 'text'
    },
    {
        id: 'nasa',
        label: 'NASA Breaking News',
        type: 'rss',
        url: 'https://www.nasa.gov/feed/',
        fields: [
            { name: 'title', label: 'Title', kind: 'text' },
            { name: 'description', label: 'Description', kind: 'text' },
            { name: 'link', label: 'Link', kind: 'text' },
            { name: 'pubDate', label: 'Published', kind: 'text' }
        ],
        primaryField: 'title'
    }
];

// Look up a catalog entry by its id. Returns undefined for unknown ids.
export function getExampleFeed(id) {
    return EXAMPLE_FEEDS.find(feed => feed.id === id);
}
