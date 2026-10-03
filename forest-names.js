/* Mapped forest names for patch details and report cards. */
(function () {
    'use strict';

    const landscape = FOREST_PATCH_LAYER_ID.toLowerCase().includes('kuantan')
        ? 'kuantan'
        : 'klang-valley';
    let pending;
    let selection = 0;

    function load() {
        if (!pending) {
            pending = fetch('data/forest-names/' + landscape + '.json?v=20261003')
                .then((response) => {
                    if (!response.ok) throw new Error('Forest names unavailable');
                    return response.json();
                })
                .then((data) => {
                    if (!data.patches || data.source !== 'OpenStreetMap contributors') {
                        throw new Error('Forest names unavailable');
                    }
                    return data;
                })
                .catch(() => {
                    pending = null;
                    return null;
                });
        }
        return pending;
    }

    async function lookup(properties) {
        const data = await load();
        if (!data) return null;
        const id = properties && properties[PATCH_ID_ATTRIBUTE];
        const matches = data.patches[String(id)];
        return Array.isArray(matches) ? matches : [];
    }

    function reportLabel(matches) {
        if (!matches || !matches.length) return null;
        const prefix = matches.length > 1 || matches[0].coverage < 50 ? 'Overlaps: ' : '';
        return prefix + matches.map((match) => match.name).join(' / ');
    }

    function paragraph(parent, text, className) {
        const element = document.createElement('p');
        element.textContent = text;
        if (className) element.className = className;
        parent.append(element);
        return element;
    }

    document.addEventListener('forestconnect:patch-selected', async (event) => {
        const token = ++selection;
        const panel = document.getElementById('patch-forest-name');
        if (!panel) return;
        panel.replaceChildren();
        paragraph(panel, 'Loading mapped forest name...', 'forest-name-status');
        const matches = await lookup(event.detail);
        if (token !== selection || !panel.isConnected) return;
        panel.replaceChildren();

        if (matches === null) {
            paragraph(panel, 'Forest names unavailable', 'forest-name-heading');
            paragraph(panel, 'Name data could not be loaded. Select the patch again to retry.');
        } else if (!matches.length) {
            paragraph(panel, 'No mapped forest name', 'forest-name-heading');
            paragraph(panel, 'No matching named boundary was found. Some forests are not yet named or mapped.');
        } else {
            paragraph(panel, matches.length === 1 ? 'Mapped forest name' : 'Named forests overlapping this patch', 'forest-name-heading');
            const list = document.createElement('ul');
            list.className = 'forest-name-list';
            for (const match of matches) {
                const item = document.createElement('li');
                const name = document.createElement('strong');
                name.textContent = match.name;
                item.append(name);
                paragraph(item, 'Mapped boundary covers ' + match.coverage + '% of this patch.');
                const sources = document.createElement('span');
                for (const [index, source] of match.sources.entries()) {
                    if (!/^(way|relation)\/\d+$/.test(source)) continue;
                    if (index) sources.append(' · ');
                    const link = document.createElement('a');
                    link.href = 'https://www.openstreetmap.org/' + source;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.textContent = match.sources.length > 1 ? 'View boundary ' + (index + 1) : 'View mapped boundary';
                    sources.append(link);
                }
                item.append(sources);
                list.append(item);
            }
            panel.append(list);
            paragraph(panel, 'Names describe mapped overlaps, not confirmed legal boundaries.', 'forest-name-note');
        }

        if (matches !== null) {
            const source = paragraph(panel, 'Name source: ', 'forest-name-note');
            const link = document.createElement('a');
            link.href = 'https://www.openstreetmap.org/copyright';
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = '© OpenStreetMap contributors, ODbL';
            source.append(link, '. Data dated 2 October 2026.');
        }
    });

    window._forestNames = { lookup, reportLabel };
    load();
})();
