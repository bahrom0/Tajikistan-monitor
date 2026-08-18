# Tajikistan Monitor UI rules

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
