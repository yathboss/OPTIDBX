# Dedicated pages, stepper repair, and OS/DBMS artwork

Implemented on top of the existing uncommitted Home/SessionRunner UI. Earlier work and scenario data were preserved. No commit or push was performed.

## Pages

- Home: `http://localhost:3000/#/`
- Scenarios: `http://localhost:3000/#/scenarios`
- Each scenario: `http://localhost:3000/#/scenarios/<id>`
- Live Session: `http://localhost:3000/#/live`
- Results & History: `http://localhost:3000/#/results`
- Performance Study: `http://localhost:3000/#/performance-study`

These are distinct client-routed pages with bookmarkable URLs, refresh support, browser history, and normal links that can open in another tab. Hash routing avoids requiring static-host rewrite configuration. Each page renders its own content; Performance Study is no longer an accordion inside history, and the gallery no longer sits at the bottom of Home.

The live scenario opens real workload setup rather than an unbound scripted runner. Merely navigating does not start a workload or apply any tuning. Existing navigation locking during real workloads is retained. Browser Back does not stop a running workload; a visible return-to-session banner explains that state.

Stepper circles occupy one row and labels a separate row below. Connectors run only between circles. Narrow screens scroll the stepper internally instead of overflowing the page. Simulated panels now say "Illustrative telemetry" and "Scenario narration".

## Verification

- RED: the new routing unit tests failed because `navigation.mjs` did not exist; the browser test confirmed that direct Results navigation did not work.
- First GREEN attempt: routing passed, but the mobile page overflowed. Header, title wrapping, and grid sizing were corrected.
- `node --test tests/*.test.mjs`: **11 passed**.
- `node node_modules/@playwright/test/cli.js test pages.spec.js --reporter=line --output=../.optidbx/pages-final`: **5 passed**.
- `node --experimental-test-coverage --test --test-coverage-include=src/navigation.mjs tests/navigation.test.mjs`: **100% lines, branches, and functions** for the routing module only.
- `node node_modules/vite/bin/vite.js build`: **passed**.
- `git diff --check`: passed, with only Windows line-ending notices.
- Browser checks cover 1440/768/390px layouts, connectors not intersecting labels, separate pages, refresh/back/forward, unknown routes, live setup without mutations, and successful artwork loading.
- Browser tests use controlled API responses. No real workload, tuning action, or performance experiment was run for this UI task. The older browser suites targeting the previous Demo/Advanced-controls UI were not used as evidence for this newer UI.

Screenshots are in `docs/testing/evidence/`: `scenario-page-1440.png`, `scenario-page-390.png`, `home-systems-illustration.png`, and `performance-study-page.png`. Desktop and mobile scenario screenshots were visually inspected.

Pre-edit copies of changed existing files are in the ignored local directory `.optidbx/page-navigation-before/`, including the pre-existing tracked diff. This allows these edits to be distinguished from the user's earlier work.

## Generated image

Built-in image generation was used, not the CLI. The educational asset is saved at `dashboard/public/images/optidbx-systems-concept.png` and rendered by HomeView. Its original generated file was retained. It is conceptual artwork, never a data source for telemetry or reports.

Final asset prompt:

> Generate a premium wide 16:9 educational hero illustration for OptiDBX, a PostgreSQL OS/DBMS research dashboard. Palette pure white and very pale cool gray background, vivid orange #ff6500 accents, navy #182538 text, gentle shadows. Clean isometric 3D/vector-like infographic illustration with ample whitespace. Left: an elegant operating-system microchip and small CPU and RAM resource tiles under label 'OS'. Center: stacked database cylinders under label 'DBMS', connected with subtle orange data paths. Right: two beautiful miniature conceptual graph panels, one labeled 'Throughput · QPS' with a gently rising orange curve and one labeled 'Latency · ms' with a smoothly falling navy curve. No numeric values, no percentages, no success badges, no KEEP labels: these charts illustrate concepts rather than measured performance. Include a small bottom caption 'Concept illustration · not live measurements'. Small labels CPU, RAM, Disk I/O, PostgreSQL can appear with tasteful readable typography. Sophisticated research-software aesthetic, restrained gradients, crisp edges, rounded rectangular tiles, visually balanced composition, high visual quality. No people, photographs, company logos, browser chrome, or full website mockups. This will be used as a decorative educational header image beside real HTML copy.

An earlier three-page generated layout preview was shown in the conversation only. Its illustrative controls and simulated-study wording are not the implemented benchmark workflow; the application retains the existing real PerformanceEvidence component.
