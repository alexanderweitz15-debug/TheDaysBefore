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

## Nachtrag M2/M3 B1
- M2: layers/zones.ts, corpses.ts, shapes.ts (Typ-Formen), agent-set.ts mit Kamera-Culling (AGENT_CULL_MARGIN_M), ui/tools/zone-tools.ts (K/Z/V, Löschen mit 4 s Rückgängig, Einstellung confirmRemoval).
- M3 B1: ui/hud/ top-bar.tsx, context-panel.tsx, command-bar.tsx, minimap.tsx, selection-box.tsx, use-poll.ts; status-hud.tsx nur noch ToolHint. ui/tools/ select-tool.ts (Auswahl, Rechtsklick-Befehle), build-tool.ts (Platzierung: Punkt Klick, Linie Ziehen, R dreht), game-keys.ts (Tasten, Gruppen Umschalt+Ziffer, requestDemolish). render/layers/selection.ts (Ringe).
- view-state.ts: selectedUnits, selectedStructure (Signale, Array ersetzen), buildArm, buildState.rotation, activeTool 'build', toolDraft (cursorX/Y, startX/Y) – reicht für Bau-Vorschau; ZonesLayer.drawPreview ignoriert 'build' noch. selectionBox, jumpCamera(x, y).
- ui-state.ts: commandTab, demolishConfirm, pendingRemoval, toolNotice. data/hud.ts: HUD-Werte. i18n-Gruppen unit.*, structure.*, stance.*, fire.*, rank.*, ctx.*, cmd.*, hud.*, tool.build.*, minimap.*.
- Layout styles.css: Leiste oben, Perf darunter (3,5rem), Minikarte + Kontextpanel rechts unten, Befehlsleiste unten Mitte, ToolHint darüber (9rem).
- Einheiten: sim.curr.units (kind = Index UNIT_TYPE_ORDER, id = UnitView.id) + sim.units für Details. Harness: structures leer, für Tests eintragen.
- Offen: Einheiten/Bauwerke/Projektile/FX zeichnen, Bau-Vorschau, AttackArea verdrahten, 1280x720 prüfen.

## Nachtrag M3 B2
- render/layers/: units.ts (taktische Symbole, ab Zoom 4 Silhouetten, Balken nach Einstellung unitBars), structures.ts + structure-geometry.ts, projectiles.ts, fx.ts + particles.ts (feste Pools), build-preview.ts (grün/rot, Live-Kosten), tracked.ts. ui/tools/attack-tool.ts (Taste G, Zivilisten-Schätzung). data/render-combat.ts.
- Einstellungen neu: unitBars, particles, screenShake, noFlashes, confirmRemoval, devTools.
- Konventionen der Sim (combat.ts): FX-param shot = rad, explosion/mineBlast = Radius; Projektil-kind 0 Geschoss, 1 Granate; Tor flag true = offen.
- Befehlsleiste einzeilig, horizontal scrollbar (1280x720 geprüft). build-tool sendet nur bei zulässiger Platzierung.
- M4 neu: SimView.mission (MissionView, src/core/types/mission.ts), SessionControl.restart(seed, size, scenario) in UiDeps.session; onMap feuert nach jedem Restart erneut -> Renderer muss neue Karte komplett neu aufbauen.

## Nachtrag M4 B1/B2
- data/scenarios/ (schema.ts zod, rheinstadt.ts, hafenstadt.ts, index.ts mit FREE_MODE, Hinweis-Schwelle, Wertungsfaktor), data/hud-economy.ts. BUILT_MILESTONE = 4, Szenario freigeschaltet.
- ui/session.ts (startScenario, restartMission, toMainMenu, finishLoading), ui-state: sidePanel, briefingOpen, activeScenario, loadingState, openWarning. screens/briefing.tsx (Vorschau via core/map-preview requestMap, gemalt in briefing.tsx), loading.tsx (Schritte aus mapBake in view-state + sim.mission), main-menu mit Pausenabschnitt.
- hud/: resource-bar (Ebenen ok/warn/crit, Marker "!"/"!!"), phase-indicator (Countdown, Ausbruch auslösen mit Bestätigung, Moral), warning-markers (DOM-Marker per rAF aus cameraView). windows/: side-panel + economy/population/decrees. Taste P: Bevölkerung -> Erlasse -> zu. Wirtschaft nur per Befehlsleiste.
- Umwidmen: Wirtschaftsfenster offen + Klick auf Stadtgebäude (select-tool) -> repurposeTarget; render/layers/economy-marks.ts zeichnet Umrisse (Engpass rot + Kreuz).
- Browser-Test: /tmp-Skript per CDP (google-chrome --remote-debugging-port, Node-WebSocket); kein Playwright installiert. Viewport headless nur ca. 1280x520.
- Offen: Warnzeichen-Marker und Umwidmen nicht live getestet (keine Warnungen/Gebäude im Testlauf sichtbar); Power-Semantik (amount<0 = rot) geraten; main.ts hat Seed doppelt (FREE_MODE).

## Nachtrag M5 B1/B2
- Neu: data/game.ts, scenarios/kaltenbach.ts, scenarios/skirmish.ts, data/tutorial/ (Lektion 1 + 2, unlosable), ui/saves.ts, ui/game-flow.ts, ui/command-tap.ts, ui/audio/audio.ts, ui/tutorial/ (Controller, Overlay, Fortschritt), ui/hud/objectives.tsx, ui/screens/ (Pausenmenü, Speicherstände, Auswertung/debrief.tsx mit KEYS_COMPLETE), ui/settings/key-bindings.tsx. Settings-Store generisch, Panel mit 5 Reitern (Spiel, Grafik, Audio, Steuerung, Oberfläche).
- Feste Keys aus core outcome.ts (score.*, moment.*, cause.*). K/Z/V/P frei belegbar (toolCorridor, toolSafeZone, toolRally, population).
- Offen: Autopause nur beim Phasenwechsel; Musik/Funk-Regler, Tag-Länge, Bot-Bericht, Kodex in der Auswertung fehlen (spätere Meilensteine).

## Nachtrag M5 Abnahme-Fixes
- Tutorial-Marker: ui-Id mit Bindestrich am Ende = Präfix-Match (z. B. order-stance-); Marker { none: true } für Schritte ohne Element.
- hud/pause-banner.tsx zeigt die Pause (Quelle sim.stats.speed; Core sendet seit dem Fix auch in der Pause einen Snapshot nach SetGameSpeed).
- Autopause über settings.autopause (localStorage sperrzone.settings, JSON).
- order-tool.armOrder: Standardstärke ORDER_DEFAULT_SHARE (0,5, aufgerundet) je Typ in der Reserve; OrderList rückt bei offenem Seitenfenster nach rechts (.sz-orders--shifted).
- Linien-Bauwerke: Senden bei mindestens einem freien Sample, Vorschau-Kosten nur freie Teilstücke; i18n tool.build.lineBlocked, linePartial, lineShort, hud.paused.
- Offen: Budget-Trend (SHOW_BUDGET_TREND=false, braucht Einkommen ohne Einmalkäufe von der Sim), Hinweisfeld verdeckt Kartenmitte.
