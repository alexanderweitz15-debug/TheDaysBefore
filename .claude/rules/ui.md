---
paths:
  - "src/render/**"
  - "src/ui/**"
---
- Render liest den Sim-Zustand nur lesend, interpoliert zwischen zwei Ticks.
- Farben nur aus `src/render/palette.ts`. Jede Farbe mit Bedeutung hat eine farbenblind-sichere Alternative.
- Jeder Effekt (Partikel, Licht, Wetter, Blut) ist über eine Einstellung abschalt- oder skalierbar.
- Alle UI-Texte über `t('key')`. UI skaliert 75 bis 200 Prozent.
