/* Guided development and route assessment. */
(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        const development = window._developmentScenario,
            connections = window._connectivityExplorer;

        if (!development || !connections) return;

        const get = (id) => document.getElementById(id);

        let active = false,
            step = 'draw',
            hadResult = false;

        const button = document.createElement('button');
        button.id = 'development-workflow-toggle';
        button.textContent = 'Test a development';
        button.setAttribute('aria-controls', 'development-workflow');
        button.setAttribute('aria-expanded', 'false');

        get('map-top-bar').insertBefore(button, get('home-btn'));

        const panel = document.createElement('section');
        panel.id = 'development-workflow';
        panel.className = 'sidebar-section';
        panel.hidden = true;

        panel.innerHTML = `
            <div class="workflow-heading">
                <h3>Test a development</h3>
                <button
                    id="workflow-methods-open"
                    type="button"
                    aria-haspopup="dialog"
                    aria-controls="workflow-methods"
                >
                    How is this calculated?
                </button>
            </div>

            <dialog
                id="workflow-methods"
                aria-labelledby="workflow-methods-title"
            >
                <div class="workflow-methods-heading">
                    <h4 id="workflow-methods-title">
                        How is this calculated?
                    </h4>
                    <form method="dialog">
                        <button type="submit" autofocus>Close</button>
                    </form>
                </div>

                <p>
                    The development assessment estimates changes in mapped
                    forest area, fragmentation, and potential connections
                    under a proposed development scenario. A rectangle or
                    polygon defines the development footprint directly.
                    A line is converted into a strip using the user-specified
                    total width, with half that width extending on either
                    side. For example, a 30 m width extends 15 m on each
                    side of the line. All mapped forest within the
                    footprint is assumed to be cleared.
                </p>

                <p>
                    Forest loss is calculated by overlaying the footprint
                    on the existing forest boundaries and measuring their
                    overlap. This area is removed, and the remaining
                    forest is assessed for separation into additional
                    fragments.
                </p>

                <p class="workflow-formula">
                    <strong>
                        Remaining forest area = original forest area −
                        forest area overlapping the development
                    </strong>
                </p>

                <p>
                    The results show the development area, forest
                    removed, forest remaining within affected patches,
                    patches affected, patches split, and patches completely
                    removed. Additional fragments are counted relative to
                    the original connected pieces. Dividing one connected
                    patch into three creates two additional fragments.
                    Forest pieces that touch at a corner are treated as
                    connected.
                </p>

                <p>
                    Potential connections between the selected points A
                    and B are assessed using a least-cost path calculation
                    on the source resistance map. This map consists of
                    cells approximately 30 m across, with resistance values
                    ranging from 1 to 100. Lower values represent easier
                    movement under the model’s assumptions, while higher
                    values represent greater difficulty. Movement is
                    permitted between neighbouring cells horizontally,
                    vertically, and diagonally. Each step receives a cost
                    based on its distance and the resistance of the two
                    cells it connects.
                </p>

                <p class="workflow-formula">
                    <strong>
                        Step cost = step distance in projected metres ×
                        (resistance of the first cell + resistance of the
                        second cell) ÷ 2
                    </strong>
                </p>

                <p class="workflow-formula">
                    <strong>
                        Total route cost = sum of all step costs along
                        the route
                    </strong>
                </p>

                <p>
                    The selected route minimises total resistance cost
                    rather than distance alone. Thus, a longer route through
                    low-resistance land may be preferred over
                    a shorter route through higher-resistance land. For
                    example, 100 m through cells with resistance 10
                    contributes the same cost as 1,000 m through cells
                    with resistance 1.
                </p>

                <p>
                    The route is calculated first using the existing
                    resistance map and then with every cell touched by
                    the development footprint treated as impassable.
                    Both calculations connect the same A and B. Existing
                    cells with a resistance of 100 remain traversable,
                    whereas cells affected by the proposed development
                    are excluded entirely. Because whole cells are
                    blocked, the modelled barrier may extend beyond
                    the drawn boundary. Selected endpoints are
                    represented by their cell centres.
                </p>

                <p>
                    As a comparison, the route cost before development
                    is assigned a reference score of 100.
                </p>

                <p class="workflow-formula">
                    <strong>
                        With-development score = 100 ×
                        (route cost with development ÷
                        route cost before development)
                    </strong>
                </p>

                <p>
                    A score of 120 indicates a 20% increase in modelled
                    resistance cost, and a score of 200 indicates a doubling.
                    These scores apply only to the selected A and B and
                    do not represent percentages of habitat loss,
                    movement success, or wildlife survival. Where no
                    alternative route is available, the connection is
                    considered blocked under the model’s assumptions.
                    This may indicate the loss of an opportunity for
                    a future corridor, even where no functioning
                    corridor currently exists.
                </p>

                <p>
                    High-flow overlap is assessed separately by counting
                    cells touched by the footprint that fall within the
                    highest 10% of positive values in the source
                    movement-flow map, including ties. This identifies
                    overlap with areas of relatively concentrated
                    modelled flow, rather than the number of animals
                    or movements affected.
                </p>

                <p>
                    The assessment represents changes in
                    forest geometry and potential routes under the
                    stated clearance and barrier assumptions. Route
                    lines do not specify corridor widths or demonstrate
                    canopy continuity, safe crossings, or observed
                    wildlife movement. Whilst the results support comparison
                    of development locations and footprints, they do
                    not predict future vegetation change or wildlife
                    population responses.
                </p>

                <form method="dialog" class="workflow-methods-footer">
                    <button type="submit">Close</button>
                </form>
            </dialog>

            <nav aria-label="Development assessment steps">
                <ol class="workflow-steps">
                    <li>
                        <button data-workflow-step="draw">
                            1. Draw and calculate
                        </button>
                    </li>
                    <li>
                        <button data-workflow-step="forest" disabled>
                            2. Forest changes
                        </button>
                    </li>
                    <li>
                        <button data-workflow-step="routes" disabled>
                            3. Potential routes <span>optional</span>
                        </button>
                    </li>
                </ol>
            </nav>

            <p
                id="workflow-guidance"
                role="status"
                aria-live="polite"
            ></p>

            <div
                id="workflow-map-view"
                role="group"
                aria-label="Compare landscape views"
                hidden
            >
                <button data-guide-view="before">
                    Before development
                </button>
                <button data-guide-view="scenario">
                    With development
                </button>
            </div>

            <div id="workflow-content"></div>

            <div class="workflow-actions">
                <button id="workflow-reset">Start again</button>
                <button id="workflow-exit">
                    Return to patch explorer
                </button>
            </div>
        `;

        get('sidebar').insertBefore(panel, get('development-panel'));

        get('workflow-content').append(
            get('development-panel'),
            get('connectivity-panel')
        );

        const methods = get('workflow-methods');

        get('workflow-methods-open').addEventListener('click', () => {
            if (!methods.open) {
                methods.showModal();
                methods.scrollTop = 0;
            }
        });

        get('connection-close').textContent = 'Back to forest changes';
        get('connection-development').textContent = 'Edit footprint';

        window._developmentWorkflow = {
            get active() {
                return active;
            },
            get step() {
                return step;
            },
            open,
            close,
            show,
        };

        function sync() {
            const calculated = !!development.footprint;

            panel.dataset.step = step;

            panel.querySelectorAll('[data-workflow-step]').forEach((el) => {
                const name = el.dataset.workflowStep;

                el.disabled = name !== 'draw' && !calculated;
                el.setAttribute(
                    'aria-current',
                    name === step ? 'step' : 'false'
                );
            });

            get('development-editor').hidden = step !== 'draw';

            get('development-results').hidden =
                step !== 'forest' || !calculated;

            get('development-panel').hidden =
                !active || step === 'routes';

            get('connectivity-panel').hidden =
                !active || step !== 'routes';

            get('workflow-map-view').hidden =
                !calculated || step === 'draw';

            panel.querySelectorAll('[data-guide-view]').forEach((el) => {
                const selected =
                    el.dataset.guideView === development.view;

                el.classList.toggle('selected', selected);
                el.setAttribute('aria-pressed', String(selected));
            });

            get('workflow-guidance').textContent =
                step === 'draw'
                    ? 'Test where a proposed development could clear or split forest and obstruct a potential connection. Zoom to your proposed location, then choose a shape below. A line is a development path, such as a road; the wildlife routes are assessed later.'
                    : step === 'forest'
                      ? 'Review forest cleared and remaining. Switch map views to compare. You can stop here, edit your footprint, or continue to optional route comparison.'
                      : 'Place A and B on either side of the connection you want to assess. Routes calculate automatically for the same development footprint.';

            if (window._forestMapInteraction) {
                window._forestMapInteraction.refresh();
            }
        }

        async function open() {
            if (active) {
                close();
                return;
            }

            active = true;
            panel.hidden = false;
            button.textContent = 'Return to patch explorer';
            button.classList.add('active');
            button.setAttribute('aria-expanded', 'true');

            step = 'draw';
            hadResult = !!development.footprint;

            sync();

            await development.open();

            if (!development.active) {
                close();
                return;
            }

            sync();

            panel.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        }

        function close() {
            if (methods.open) methods.close();

            active = false;
            panel.hidden = true;
            button.textContent = 'Test a development';
            button.classList.remove('active');
            button.setAttribute('aria-expanded', 'false');

            connections.close();
            development.close();

            hadResult = false;
            step = 'draw';

            sync();
        }

        async function show(next, scroll = true) {
            if (
                !active ||
                !['draw', 'forest', 'routes'].includes(next)
            ) {
                return;
            }

            if (next !== 'draw' && !development.footprint) return;

            step = next;

            if (step !== 'routes') connections.close();

            sync();

            if (step === 'routes') {
                await connections.open();

                if (!active || step !== 'routes') {
                    connections.close();
                    sync();
                    return;
                }
            }

            panel
                .querySelector(
                    '[data-workflow-step="' + step + '"]'
                )
                .focus({ preventScroll: true });

            if (scroll) {
                panel.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                });
            }
        }

        button.addEventListener('click', open);
        get('workflow-exit').addEventListener('click', close);

        get('workflow-reset').addEventListener('click', () => {
            connections.close();
            get('connection-reset').click();
            get('development-reset').click();
            show('draw');
        });

        panel
            .querySelectorAll('[data-workflow-step]')
            .forEach((el) => {
                el.addEventListener('click', () => {
                    show(el.dataset.workflowStep);
                });
            });

        panel.querySelectorAll('[data-guide-view]').forEach((el) => {
            el.addEventListener('click', () => {
                const original = get('development-results').querySelector(
                    '[data-view="' + el.dataset.guideView + '"]'
                );

                if (original) original.click();
            });
        });

        document.addEventListener('forestconnect:development', () => {
            if (!active) return;

            const calculated = !!development.footprint;

            if (calculated && !hadResult) {
                hadResult = true;
                show('forest');
            } else if (!calculated && hadResult) {
                hadResult = false;
                show('draw');
            } else {
                sync();
            }
        });

        sync();

        // A development task link opens the workflow after the map is ready.
        if (
            new URLSearchParams(location.search).get('task') ===
            'development'
        ) {
            const map = window._mapInstance;

            if (map) {
                map.once('idle', () => {
                    const onboarding = get('onboarding-overlay');

                    if (onboarding) {
                        onboarding.style.display = 'none';
                    }

                    open();
                });
            }
        }
    });
})();
