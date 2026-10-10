# Adem — HRV-biofeedback in de browser

Rustig ademen op een vast ritme, terwijl je telefoon via de camera je hartslag meet en met
**kleur en klank** terugkoppelt hoe coherent je hartritme is. Live op
**[adem.felixisfelix.com](https://adem.felixisfelix.com)**.

*Breathing-paced HRV biofeedback in the browser: fingertip PPG via the phone camera, colour and
sound feedback, all processing on-device. Dutch UI, MIT licensed.*

## Wat het doet

- **Met hartslag** — leg je vingertop op de camera (met flitser). De pagina meet de hartslag
  per slag (PPG), berekent RMSSD en coherentie en kleurt de ademcirkel van koel blauw naar warm
  amber naarmate je hart meer met je adem meegolft.
- **Alleen ademen** — zonder camera; de cirkel en de klank begeleiden het ritme.
- **Profiel** (leeftijd, geslacht, lengte, gewicht, alles optioneel) — vergelijkt je uitkomsten
  met leeftijdsnormen en stelt een ademtempo voor. Na elke sessie vraagt de app hoe het tempo
  voelde en past het voorstel daarop aan.

## Privacy

Alles gebeurt op je toestel. Er gaat geen video, meting of profiel naar een server; profiel en
geschiedenis staan in de `localStorage` van je browser.

## Geen medisch instrument

Deze app is bedoeld als ontspannings- en oefenhulp. Hij stelt geen diagnose en vervangt geen
arts. Voel je je duizelig of benauwd, stop dan en adem normaal.

## Werkt op

Getest op iPhone 15 Pro (Safari, iOS 26): alleen de **telelens** naast de flitser levert een
bruikbaar vingertopsignaal; de app kiest die zelf. Andere telefoons werken vaak ook, maar zijn
niet getest. "Alleen ademen" werkt in elke moderne browser.

## Bronnen

- **Leeftijdsnormen RMSSD en hartslag** — Voss e.a. (2015), *Short-term heart rate variability —
  influence of gender and age in healthy subjects*, PLoS ONE 10(3): e0118308 (1906 gezonde
  volwassenen). De band "gemiddeld" is P25–P75, afgeleid uit gemiddelde ± SD.
- **Geschat ademtempo (resonantiefrequentie) uit lengte en geslacht** — mannen
  17,90 − 0,07·lengte(cm), vrouwen 15,88 − 0,06·lengte(cm); n = 122, R² ≈ 0,5
  ([PMC10869367](https://pmc.ncbi.nlm.nih.gov/articles/PMC10869367/)).
- **HRV-biofeedback rond 0,1 Hz** — meta-analyse Goessl e.a. (2017), *Psychological Medicine*.
- **BMI-indeling** — WHO.

## Ontwikkelen

Geen build-stap en geen afhankelijkheden: statische HTML plus ES-modules.

```sh
python3 -m http.server 8000      # open http://localhost:8000
node tests/run.mjs               # tests (Node ≥ 12)
```

Camera en flitser vragen HTTPS; test op een telefoon via een gedeployde versie of een tunnel.

| Bestand | Rol |
|---|---|
| `index.html` | schermen en stijl |
| `adem/app.mjs` | koppelt alles in de browser |
| `adem/camera.mjs` | camera kiezen, flitser, witbalans |
| `adem/signal.mjs` | PPG → hartslagen, vingerdetectie, signaalkwaliteit |
| `adem/hrv.mjs` | RR-reeks, hartslag, RMSSD, coherentie |
| `adem/breath.mjs`, `session.mjs` | ademgids en sessieverloop |
| `adem/visual.mjs`, `palette.mjs`, `audio.mjs` | beeld (OKLCH koel → warm) en klank |
| `adem/norms.mjs`, `tempo.mjs`, `explain.mjs` | normen, tempovoorstel, uitleg |
| `adem/store.mjs` | opslag van profiel en sessies |

### Eigen opslag

Standaard bewaart de app alles in `localStorage`. Een andere omgeving (bijvoorbeeld een
dashboard met login) kan vóór het laden van `adem/app.mjs` een eigen opslag meegeven als
`globalThis.ADEM_STORE`, met hetzelfde synchrone contract als `localStore` in
`adem/store.mjs`.

Ontwerp en plan staan in `docs/superpowers/`.

## Licentie

[MIT](LICENSE)
