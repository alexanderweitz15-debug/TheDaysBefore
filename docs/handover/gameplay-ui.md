# Übergabe gameplay-ui (Stand M1, B1–B4)

## src/render
- renderer.ts: Pixi-App, Weltcontainer mit Layern (Karte, Zivilisten, Zombies, Dichte, Overlay). onSnapshot -> agents.ingest, onMap -> Karte. Beim Start sim.curr einlesen.
- camera.ts (Zoom 0,1–8) schreibt cameraView in view-state.ts; dort auch overlayMode (Signal), screenToWorld.
- palette.ts: alle Farben + Farbenblind-Musternamen (map, overlay, ui).
- layers/map-layer.ts: 256-m-Kacheln, 2 px/m, RenderTextures, max 6 ms/Frame; Zeichencode in map/.
- layers/agent-set.ts (ParticleContainer je Art, Kopie pro ID, Interpolation), agents.ts (Sprite<->Dichte mit Hysterese, Grenze aus Einstellung oder Zoom < 0,25), density.ts, overlay.ts (Flow, Dichte, Sektoren, Raster), grid.ts. dev/ = Fixture + Harness (löschbar).

## src/ui
- app.tsx (Mount, Esc, UI-Skalierung über Root-Schriftgröße, rem), palette-vars.ts, styles.css, i18n.ts, hotkeys.ts (O), ui-state.ts.
- screens/main-menu.tsx, settings/store.ts + settings-panel.tsx, hud/perf-overlay.tsx, hud/debug-panel.tsx (F10, Z), hud/overlay-status.tsx, components/icons.tsx.
- data/: render.ts, dev/debug-spawn.ts, menu.ts (BUILT_MILESTONE), i18n/de.ts (Keys) + en.ts (Record<MessageKey,string>).

## Konventionen
- Farben nur palette.ts, UI über var(--sz-*). Texte nur t(key). Neue Einstellung: zod-Schema, Default, Signal, current(), resetSettings; Version nur bei Umbenennen/Entfernen erhöhen.
- data-tutorial-id: menu-<id>, settings, settings-<opt>, perf-overlay, debug-panel, loading-city, overlay-badge.

## Offen / Schwächen
- Karte unscharf über Zoom 2, Flimmern beim Rauszoomen (keine Mipmaps). Dichte-Grenze zählt alle statt sichtbare Zombies.
- Panik-Ring, Farbenblind-Muster, Farb-Overrides, 10 Reiter, Leistungskosten-Anzeige, Hügel, Zombie-Typen-Formen fehlen.
- render importiert ui/settings/store. Debug-Taste Z kollidiert mit GDD 14 (Schutzzone).

## Fallen
- RenderTexture mit antialias/autoGenerateMipmaps blieb unter SwiftShader leer -> aus; auf echter GPU unverifiziert.
- Pixi 8.23: ParticleContainer nur position dynamisch; statische Änderung -> view.update(). renderer.render({container, target, clear}) für Kacheln. pixelLine: true = immer 1 px. Dichte via BufferImageSource, alphaMode 'premultiplied-alpha', Pixel vormultipliziert. Typed Arrays beim Tauschen explizit typisieren (ArrayBufferLike).
- Snapshot-Puffer gehen zurück an den Worker: nie Views halten.
- Preact 11 + signals: Lesen im Render reicht; useEffect mit Unsubscribe.
- Biome meckert: Zuweisung in Ausdruck, forEach mit Rückgabe, Name `fit`.
