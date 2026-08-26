# Tajikistan Monitor UI rules

## AI chat Markdown rendering

- References: `codex-clipboard-be9c7f11-7efa-4644-a175-aecc88fae294.png` and `codex-clipboard-f2740b79-04d8-4cb7-8826-c80291c6b4ae.png`, supplied on 2026-08-21. The green annotations identify broken Markdown output; they are defect markup, not UI elements to reproduce.
- Target: assistant messages in the chat route at desktop widths shown by the references and responsive widths down to `320px`. The existing light/dark chat composition and citation chips remain authoritative.
- Typography: message copy is `14px/1.68` on desktop and `13.5px/1.68` below `640px`. Heading levels render from `19px` down to `13px`, with `600–700` weight and `1.35–1.45` line height. Paragraph and list rhythm is `12px`.
- Tables: wrapper radius uses `--radius-md`, border uses `--border-medium`, spacing is `16px`, and the table has a `520px` desktop / `460px` mobile minimum width with native horizontal overflow. Headers use a 12% accent mix, cells use `10px 14px`, and even/hover rows use existing card tokens.
- Parsing behavior: GFM-style tables accept optional outer pipes, alignment markers, escaped pipes and a missing trailing pipe. Fenced code and table rows bypass AI list-recovery heuristics. Standalone or joined ATX headings are recovered without exposing `###` markers. Raw HTML is never injected into the DOM.
- States and accessibility: links keep visible keyboard focus, tables remain horizontally scrollable by keyboard/touch, and color is not used to replace text. Citation chips retain their existing labels and favicons.
- Motion: table hover uses the existing immediate surface state; no content animation is added. Existing reduced-motion behavior is unchanged.
- Intentional deviation: the screenshots show rendering defects rather than a desired visual redesign. Green arrows, circles and boxes are not reproduced; only Markdown structure, spacing and responsive presentation are corrected.

## Map popup and label fixes

- References: the three user-supplied screenshots from 2026-08-15 showing an overflowing news popup, overlapping place/news popups, and crowded labels at country zoom.
- Target: the main map at desktop and mobile widths. The existing dark green operational-monitor visual language is preserved.
- Popup layering: a place popup uses the `bottom` anchor and remains above its point; a news popup uses the `top` anchor and remains below its point. Place popup z-index is `3`; news popup z-index is `2`.
- Popup sizing: place cards are at most `280px` wide and news cards at most `320px`, both limited to the viewport width minus `24px`. News content is capped at `min(360px, 100vh - 128px)` and scrolls internally with contained overscroll.
- News content: the heading remains sticky inside the scrolling card. Article groups retain the existing typography and use the existing `#18382b` divider.
- Label visibility: city labels appear at zoom `6.4` and above. Town labels appear at zoom `7.2` and above; town markers themselves continue to appear at zoom `6.3`.
- Interaction and accessibility: existing close buttons, keyboard-focus outlines, marker labels, and ARIA names remain unchanged. Scrollbars use the existing green panel palette.
- Motion: no new motion was added. Existing marker-content transitions stay at `150ms`; reduced-motion behavior remains unchanged.
- Intentional deviation: screenshots document defects rather than a desired new composition, so only overflow, popup placement, and label density were changed.

## AI summary action in the news popup

- Reference: the user-supplied screenshot from 2026-08-16 marks the footer of the existing news popup as the location for the new action. It is a layout reference, not an instruction embedded in the image.
- Composition: the popup heading and `СУМАРИ С ИИ` footer stay fixed; only the article list scrolls. This keeps the action reachable even when a location has many publications.
- Visual tokens: the button reuses the existing `#102b22` panel action background, `#318468` border, `--green` text, IBM Plex Mono at `9px`, and the existing amber focus outline.
- Interaction: pressing the semantic button opens the existing AI modal immediately and starts a real streamed summary. There is no simulated typing or delayed animation.
- Responsive and accessibility: the control keeps a minimum `42px` desktop hit area, has a descriptive Russian ARIA label, visible keyboard focus, and remains inside the viewport-limited popup.

## Unified panel overflow

- Reference: the user-supplied `codex-clipboard-d8920969-f60f-4a8d-afd1-c633dd74272e.png` at approximately `516 × 796`, showing a native horizontal scrollbar replacing the category controls and a second vertical scroll region in the right news panel.
- Target: the main dashboard at desktop and mobile widths. The screenshot documents a defect; the existing dark green panel composition, typography, cards, and button treatments remain unchanged.
- Right panel contract: title, search, and category controls are fixed flex siblings (`flex: 0 0 auto`). Only `.news-list` consumes remaining height (`flex: 1 1 auto; min-height: 0`) and scrolls vertically.
- Categories: filter buttons wrap onto additional rows. The filter region never creates a horizontal scrollbar, so `Все` and the remaining categories stay visible when the feed grows.
- Scrollbar tokens: every genuine scrolling surface uses an `8px` WebKit scrollbar (Firefox `thin`), track `#07110f`, thumb `#286a55`, hover `#35a57e`, a `2px` track-colored border, and `8px` radius.
- Scroll surfaces: page on mobile, left source panel, news list, location controls/results, map-news list, and AI modal. Horizontal document overflow is disabled; intentional clipped map layers and marker overflow are unaffected.
- Responsive behavior: below `820px`, the document may scroll vertically, while the `70vh` news panel keeps one internal vertical feed scrollbar. Long card text wraps instead of expanding the panel width.
- Interaction and accessibility: native keyboard, wheel, touch, and screen-reader scrolling remain available. No new animation was added and reduced-motion behavior is unchanged.

## Exa live research trace

- Place popup: a labelled native period selector offers 7, 30, 90 days or one year before the territory-specific `Все новости` action. Both controls keep a minimum 44px touch target and amber keyboard focus.
- Trace hierarchy: the AI modal shows a fixed ordered timeline of server-reported work. Completed steps remain visible, the current step pulses, and errors use text plus a red state rather than color alone.
- Source visits: Exa results appear as compact link chips with the returned site favicon, domain fallback initial, title tooltip and accessible link name. Images use fixed dimensions to avoid layout shift and no-referrer loading.
- Motion: scan, pulse and text shimmer only represent an active server step; no artificial delays are used. Animations use transform/opacity/background-position and are disabled under `prefers-reduced-motion`.
- Visual language: the trace reuses the existing dark green surfaces, `--green`, IBM Plex Mono, square borders and 8px spacing rhythm; it does not imitate ChatGPT's light composition literally.

## Administrative map silhouette

- Reference: `codex-clipboard-0079eefa-7f4f-4a09-8815-c6521d8d0f54.png` supplied on 2026-08-18. The blue marks identify the obsolete simplified country outline; the white marks identify the administrative geometry that must become authoritative.
- Geometry contract: the map fill, region separators and national outline all derive from `administrative-boundaries.json`. The older medium-detail country polygon is not rendered. Exterior segments are edges used by exactly one region; edges shared by two regions remain internal separators.
- Visual hierarchy: contiguous exterior edges are stitched into complete lines with round caps and joins, preventing sharp segment seams at country zoom. The national border uses `#41e7aa` at `0.94` opacity, `0.2px` blur and interpolates from `2.5px` at zoom `4.5` to `4.5px` at zoom `11`. Its glow uses `#35f2ac`, `0.13` opacity, `7px` blur and a `9–14px` zoom-responsive width. Region lines remain `1.25px`; district lines remain `0.7px` dashed.
- Layering: the region-derived country fill sits below interactive administrative hit areas. Internal boundaries sit above the fill, and the national outline sits above selection layers so the state border remains legible.
- Responsive and interaction behavior: geometry styling is zoom-responsive and does not change map controls, popups, hit targets, filters, markers or mobile layout.
- Motion and accessibility: no animation or semantic interaction was added. Existing keyboard, reduced-motion and map-control behavior is unchanged.
- Intentional deviation: the screenshot is a defect annotation rather than a target composition; only the duplicate silhouette and state-border weight are changed.

## Multi-scale administrative hierarchy

- Reference: the user request from 2026-08-18 for a region-first country view, all district names, unique settlement colors and circular point symbols.
- Far zoom (`4.5–5.55`): only the five region geography classes are emphasized. GBAO `#315d8a`, Sughd `#76538f`, Khatlon `#9a553f`, Dushanbe `#2f8177`, and RRP `#718246`; compact region abbreviations sit at polygon-derived representative points.
- District zoom (`5.55–6.95`): all 47 confirmed administrative polygons receive parent-region tinted fills, solid `0.9–1.7px` borders, circular label anchors and Russian names. Region borders remain visually stronger at `1.8–2.8px`. When labels collide, the smaller polygon keeps its round center while only its text waits for more zoom or a different viewport.
- Settlement zoom: cities appear at zoom `5.9`, city labels at `6.85`, towns at `6.3`, and town labels at `7.45`. City hues are unique values across the blue-green range `154–230`; town hues are unique values across the amber-orange range `27–58`.
- Settlement symbols: every place keeps a 44px interaction root while the visible geometry is circular. Cities use a 12px core with a 2px colored outer ring; towns use a 9px core with a 1px outer ring; Dushanbe uses a 14px double ring. Text retains a dark backing and a color-keyed left rule.
- Color is redundant with text, size and hierarchy: region/district/city/town semantics never depend on hue alone. Existing popup, keyboard, search and selection behavior remains available.
- Data limitation: the current source contains administrative polygons for regions and districts but only point coordinates for cities and towns. Thick city/town treatment therefore applies to marker boundaries; no municipal polygons are fabricated.
- Persistent interaction: region labels remain visible at every zoom and compact into a circular 44px button after the country overview. District centers appear from zoom `5.65` onward and never disappear at stronger zoom; collision suppression is disabled from zoom `7.5`, when every district name has enough map space. Both region and district markers are keyboard-focusable buttons that select the polygon and open its existing details/research popup.

## City-jurisdiction polygons

- Reference: `codex-clipboard-31be8ee8-eb29-4ce7-bb5b-83a0750cdcd7.png` supplied on 2026-08-18 at approximately `979 × 663`. Orange circles and white arrows identify dark administrative gaps around cities of republican or regional subordination.
- Geometry: 14 canonical cities with OSM level-6 administrative relations are rendered as real polygons. No circular or inferred municipal boundaries are fabricated; cities without an administrative relation remain point markers.
- Layering: city fills and borders begin at zoom `5.55`, above district fills and below selection overlays. Each polygon reuses its city's unique blue-green marker hue at `0.22–0.34` fill opacity and `1.4–3px` round-joined border.
- Interaction: `cities-hit` is queried before district and region hit layers. Clicking anywhere inside a city jurisdiction selects the canonical city, updates its parent-region filter, moves to its marker, highlights the whole city polygon and opens the city popup. Point markers retain their 44px keyboard/click target.
- Selection: the active city receives `#5fffc4` at `0.26` opacity with a `3.2px #8effd5` outline. Color remains redundant with the city popup, point marker and text label.
- Responsive and motion: no panel layout or breakpoint changed. Existing `650ms` map focus motion is retained and becomes instantaneous under `prefers-reduced-motion`.
- Data provenance: geometry comes from explicit OpenStreetMap relation IDs under ODbL 1.0; canonical Russian/Tajik names and hierarchy continue to come from `locations.json`.

## News route and article detail

- References: the three supplied Tajikistan Monitor news screenshots from 2026-08-23 (`codex-clipboard-be807975-f4c8-47af-ad46-43ace9458640.png`, `codex-clipboard-d701e25c-cc56-470e-b8cd-1667fa47a5a2.png`, `codex-clipboard-9730cb46-552c-49e3-9ada-e5082f9fd5d1.png`). The implemented route is `/news`; a selected item uses `/news/:id`.
- Composition: the news viewport uses a bounded white/dark surface with 12-column desktop rhythm. The first row is a `7/12 + 5/12` split: a hero with two equal secondary cards on the left and five equal «Коротко сейчас» cards on the right. The removed «Что происходит рядом», «Официально» and «Популярно сейчас» modules leave no empty columns: the horizontal feed expands to the full content width, followed by «Не пропустите».
- Tokens: 24px desktop canvas inset, 16px grid gaps, 14px card radius, 18px page radius, 42px filter controls, 146px feed cards, 220px feed images, 17px card titles, 17px article body at `1.72` line-height. Light/dark values reuse the existing `--bg-*`, `--text-*`, `--border-*` and accent tokens so the shell remains coherent with Map and Chat.
- Route behavior: cards use an actual history URL and the article is rendered as a full page, never as a backdrop, dialog or body scroll lock. The detail screen includes source/date/updated metadata, image, importance, AI summary, «Почему показано», full demo body, source link and related news.
- Data contract: `NewsPage` owns the presentation contract while the live overview API supplies source-backed articles and quick facts. Missing quick facts are omitted rather than replaced with invented content; an explicit «Нет данных» state is reserved for a requested value with no source response.
- Responsive: desktop keeps the two-column editorial composition; tablet stacks the quick-summary row; below 768px the page becomes one column, feed images move above copy, quick cards use scroll-snap, and article context becomes a normal flow section. The app's mobile bottom navigation is accounted for in the news viewport height.
- Content resilience: hero headlines clamp to three lines on desktop and four on mobile; secondary headlines clamp to three lines; source badges and icons stay inside their cards. Quick facts use equal count-aware desktop columns that fill the headline band and stable-width mobile cards, so long temperatures, emergency labels and economy values wrap without changing the surrounding rhythm.
- Alignment: the secondary-card stack starts at the hero image's top edge and ends at its bottom edge; the feed heading uses the same 14px inset as the feed image on desktop and mobile.
- Motion: page entry and article/AI reveal use a restrained 180–220ms transform/opacity transition. Card hover lifts by 2px without changing layout. Dropdowns use a 180ms `translateY(-6px) + scale(.98→1)` transition. All news motion is disabled or reduced under `prefers-reduced-motion`.
- Accessibility: cards and controls keep visible focus, semantic headings, `time` elements, `aria-expanded` for AI, `aria-pressed` for saved state and text-plus-icon importance. Mobile controls retain 44px touch targets. The only intentional deviation from the reference is replacing its profile avatar with the product's existing theme control because this product has no user-profile flow.
- Images: cards use only images extracted from the original source. When a source has no usable HTTP(S) image, a neutral fixed-size placeholder keeps the layout stable without presenting a synthetic photograph. Images retain `object-fit: cover`, descriptive alt text and a fixed aspect ratio to avoid layout shift.

## Mobile chat viewport

- The mobile shell uses the dynamic viewport (`100dvh`, with a `100vh` fallback) so Android browser chrome does not extend the content beneath the fixed navigation.
- The bottom navigation reserves `64px + env(safe-area-inset-bottom)`; the main container uses the same value for its height and bottom margin. The chat composer adds the safe-area inset to its lower breathing room, keeping the textarea and actions above the navigation on narrow devices.
- The responsive contract is checked at 360×800, 390×844 and 412×915 CSS pixels, with no horizontal overflow and a visible composer above the navigation.
