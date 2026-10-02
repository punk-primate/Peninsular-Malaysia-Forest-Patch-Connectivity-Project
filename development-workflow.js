/* One guided interface around the existing forest and route calculations. */
(function () {
    'use strict';
    document.addEventListener('DOMContentLoaded', function () {
        const development = window._developmentScenario, connections = window._connectivityExplorer;
        if (!development || !connections) return;
        const get = id => document.getElementById(id);
        let active = false, step = 'draw', hadResult = false;
        const button = document.createElement('button');
        button.id = 'development-workflow-toggle'; button.textContent = 'Test a development';
        button.setAttribute('aria-controls', 'development-workflow'); button.setAttribute('aria-expanded', 'false');
        get('map-top-bar').insertBefore(button, get('home-btn'));
        const panel = document.createElement('section');
        panel.id = 'development-workflow'; panel.className = 'sidebar-section'; panel.hidden = true;
        panel.innerHTML = '<h3>Test a development</h3>' +
            '<nav aria-label="Development assessment steps"><ol class="workflow-steps">' +
            '<li><button data-workflow-step="draw">1. Draw and calculate</button></li>' +
            '<li><button data-workflow-step="forest" disabled>2. Forest changes</button></li>' +
            '<li><button data-workflow-step="routes" disabled>3. Potential routes <span>optional</span></button></li></ol></nav>' +
            '<p id="workflow-guidance" role="status" aria-live="polite"></p>' +
            '<div id="workflow-map-view" role="group" aria-label="Compare landscape views" hidden>' +
            '<button data-guide-view="before">Before development</button><button data-guide-view="scenario">With development</button></div>' +
            '<div id="workflow-content"></div>' +
            '<div class="workflow-actions"><button id="workflow-reset">Start again</button><button id="workflow-exit">Return to patch explorer</button></div>';
        get('sidebar').insertBefore(panel, get('development-panel'));
        get('workflow-content').append(get('development-panel'), get('connectivity-panel'));
        get('connection-close').textContent = 'Back to forest changes';
        get('connection-development').textContent = 'Edit footprint';
        window._developmentWorkflow = { get active() { return active; }, get step() { return step; }, open, close, show };

        function sync() {
            const calculated = !!development.footprint;
            panel.dataset.step = step;
            panel.querySelectorAll('[data-workflow-step]').forEach(el => {
                const name = el.dataset.workflowStep;
                el.disabled = name !== 'draw' && !calculated;
                el.setAttribute('aria-current', name === step ? 'step' : 'false');
            });
            get('development-editor').hidden = step !== 'draw';
            get('development-results').hidden = step !== 'forest' || !calculated;
            get('development-panel').hidden = !active || step === 'routes';
            get('connectivity-panel').hidden = !active || step !== 'routes';
            get('workflow-map-view').hidden = !calculated || step === 'draw';
            panel.querySelectorAll('[data-guide-view]').forEach(el => {
                const selected = el.dataset.guideView === development.view;
                el.classList.toggle('selected', selected); el.setAttribute('aria-pressed', String(selected));
            });
            get('workflow-guidance').textContent = step === 'draw' ?
                'Test where a proposed development could clear or split forest and obstruct a potential connection. Zoom to your proposed location, then choose a shape below. A line is a development path, such as a road; the wildlife routes are assessed later.' : step === 'forest' ?
                'Review forest cleared and remaining. Switch map views to compare. You can stop here, edit your footprint, or continue to optional route comparison.' :
                'Place A and B on either side of the connection you want to assess. Routes calculate automatically for the same development footprint.';
            if (window._forestMapInteraction) window._forestMapInteraction.refresh();
        }
        async function open() {
            if (active) { close(); return; }
            active = true; panel.hidden = false; button.textContent = 'Return to patch explorer'; button.classList.add('active'); button.setAttribute('aria-expanded', 'true');
            step = 'draw'; hadResult = !!development.footprint; sync();
            await development.open();
            if (!development.active) { close(); return; }
            sync();
            panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        function close() {
            active = false; panel.hidden = true; button.textContent = 'Test a development'; button.classList.remove('active'); button.setAttribute('aria-expanded', 'false');
            connections.close(); development.close(); hadResult = false; step = 'draw'; sync();
        }
        async function show(next, scroll = true) {
            if (!active || !['draw','forest','routes'].includes(next)) return;
            if (next !== 'draw' && !development.footprint) return;
            step = next;
            if (step !== 'routes') connections.close();
            sync();
            if (step === 'routes') { await connections.open(); if (!active || step !== 'routes') { connections.close(); sync(); return; } }
            panel.querySelector('[data-workflow-step="' + step + '"]').focus({ preventScroll: true });
            if (scroll) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        button.addEventListener('click', open);
        get('workflow-exit').addEventListener('click', close);
        get('workflow-reset').addEventListener('click', () => {
            connections.close(); get('connection-reset').click(); get('development-reset').click(); show('draw');
        });
        panel.querySelectorAll('[data-workflow-step]').forEach(el => el.addEventListener('click', () => show(el.dataset.workflowStep)));
        panel.querySelectorAll('[data-guide-view]').forEach(el => el.addEventListener('click', () => {
            const original = get('development-results').querySelector('[data-view="' + el.dataset.guideView + '"]');
            if (original) original.click();
        }));
        document.addEventListener('forestconnect:development', () => {
            if (!active) return;
            const calculated = !!development.footprint;
            if (calculated && !hadResult) { hadResult = true; show('forest'); }
            else if (!calculated && hadResult) { hadResult = false; show('draw'); }
            else sync();
        });
        sync();
    });
})();
