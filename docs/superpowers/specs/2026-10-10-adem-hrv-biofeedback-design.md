# `/adem` — HRV-biofeedback met vingertop-camera, geluid en beeld

Datum: 2026-10-10 · Status: ontwerp goedgekeurd, spec ter review

## Doel

Een losstaande oefening op de iPhone: ademen in een rustig ritme terwijl de pagina via de camera je hartslag meet en met **beeld en geluid** terugkoppelt hoe "coherent" je hartritme is. Geen onderdeel van het Derwisch-ritueel; geen koppeling met KV of de LLM.

Het is **biofeedback (HRV)**, geen EEG-neurofeedback: een camera meet geen hersenactiviteit. HRV-biofeedback met ademen rond 0,1 Hz is de best onderbouwde variant (meta-analyse Goessl 2017, 24 studies, g ≈ 0,8 op stress/angst).

**Succes =** op Bob's iPhone 15 Pro in Safari levert een sessie van 5 minuten een stabiele hartslag, plausibele RMSSD en een coherentiescore die zichtbaar stijgt bij rustig ademen op het ritme van de gids, met feedback die ook met ogen dicht te volgen is.

## Wat de spike (2026-10-10) heeft aangetoond

Wegwerp-testpagina op iPhone 15 Pro, iOS 26 / Safari 26.6:

- **Alleen "Telelens aan achterzijde" werkt** (ligt naast de flitser). Hoofdlens, ultragroothoek en virtuele Dual/Triple-camera's: geen bruikbaar signaal.
- Telelens: 60 fps, `requestVideoFrameCallback` met `captureTime`, gemiddelde RGB ≈ 200/1/32, kwaliteit (autocorrelatie) 0,87–0,96, 47/48 slagen schoon, HR per slag 71 vs autocorrelatie 72, RMSSD 26–30 ms. Piek- en hellingsdetectie verschillen enkele ms. Ademhalingsgolf in de RR-reeks zichtbaar.
- Safari-capabilities: `torch` ✓, `whiteBalanceMode` manual ✓, `frameRate` max 60; `exposureMode`, `focusMode`, `iso` niet beschikbaar.
- Camera-labels zijn gelokaliseerd (NL) en deels Engels ("Back Triple Camera").
- Een kleurdrempel ("rood ≫ groen") is onbetrouwbaar als vingerdetectie; signaalkwaliteit werkt wel.

## Architectuur

Statische pagina in deze relay, zonder build-stap (zoals `dashboard.html`). Alle verwerking op het toestel; er verlaat geen video of meetdata de telefoon.

```
adem.html            UI-skelet, stijl, startknop (iOS vereist een tik voor camera + audio)
adem/app.mjs         orkestratie: sessie-toestanden, koppelt camera → signaal → hrv → feedback
adem/camera.mjs      camera kiezen/openen, flitser, witbalans vastzetten, frames → {t, r, g, b}
adem/signal.mjs      PUUR: biquad-filters, streaming slagdetectie (sub-frame), kwaliteit (autocorrelatie)
adem/hrv.mjs         PUUR: RR opschonen, HR, RMSSD, coherentie
adem/feedback.mjs    ademgids-timing (PUUR deel) + canvas-visual + Web Audio-geluid
tests/adem/*.test.mjs   unit-tests voor signal/hrv/ademgids
tests/run.mjs        mini-testrunner (`assert`) — orin3 heeft Node 12, geen `node --test`
vercel.json          + rewrite { "/adem" → "/adem.html" }
```

`signal.mjs`, `hrv.mjs` en het timingdeel van `feedback.mjs` hebben geen DOM-afhankelijkheden, zodat ze in Node te testen zijn. ES-modules als `.mjs`, zodat Node 12 ze zonder `"type":"module"` laadt en `package.json` (Vercel-functies) ongemoeid blijft.

### Dataflow

```
camera frame (60 fps, captureTime)
  → gemiddelde R,G,B over 40×30 downscale
  → signaal: −kanaal → hoogdoorlaat 0,6 Hz → laagdoorlaat 4 Hz (2e-orde Butterworth-biquads, fs geschat uit timestamps)
  → slagdetectie: maximum van eerste afgeleide (steilste stijging) met parabolische sub-frame-interpolatie,
                  drempel 0,4 × max afgeleide over 3 s, refractair 0,33 s
  → kwaliteit: aandeel van de laatste 8 s met 'goede' slagen — golfvorm lijkt op vorige slag (r ≥ 0,85),
               interval < 30 % anders dan het vorige (autocorrelatie viel weg bij sterke HRV; live-test 2026-10-10)
  → RR-intervallen → opschonen (|RR − lokale mediaan van 9 intervallen| < 25 %) → HR, RMSSD, coherentie
  → feedback (beeld + geluid)
```

Kanaal: het kanaal (R of G) met de grootste gefilterde amplitude over de laatste 10 s; bij volle verzadiging van R valt dit automatisch op G terug.

### Coherentie

Elke 5 s over de opgeschoonde RR-reeks van de laatste 64 s:

1. RR-tachogram lineair herbemonsteren op 4 Hz, lineaire trend eraf, Hann-venster.
2. Vermogensspectrum (DFT, 256 punten).
3. Piek zoeken in 0,04–0,26 Hz; piekvermogen = som over piek ± 0,015 Hz.
4. **Coherentie = piekvermogen / totaalvermogen (0,0033–0,4 Hz)**, bereik 0–1.

Niveaus (constanten, bij live-test te kalibreren): laag < 0,3 · midden 0,3–0,6 · hoog > 0,6. Voor feedback wordt de waarde exponentieel gladgestreken (τ ≈ 10 s), zodat beeld en geluid niet springen.

Minimaal 45 s aan schone RR nodig; daarvoor toont de pagina "inlezen…".

## Camera

- Na de eerste `getUserMedia({facingMode:'environment'})` zijn labels beschikbaar; kies dan het apparaat met label `/tele/i`. Geen telelens → apparaat met `/back|achter/i` zonder `/dual|triple|ultra|dubbel|drievoud|breed|front|voor/i`.
- Constraints: 640×480 ideaal, `frameRate {ideal: 60}` — bewust géén `min`: een tragere camera moet openen, de app waarschuwt bij < 24 fps.
- Flitser: `applyConstraints({advanced:[{torch:true}]})`.
- Witbalans: 2,5 s nadat de signaalkwaliteit voor het eerst > 0,5 is → `whiteBalanceMode: 'manual'` (als ondersteund).
- Timestamps: `requestVideoFrameCallback` → `metadata.captureTime`, anders `mediaTime`, anders `performance.now()`.
- UI-knop **"Andere lens"** loopt de achtercamera's af, voor andere iPhone-modellen. De keuze wordt per toestel onthouden in `localStorage` (in try/catch).

## Wat je ziet en hoort

### Sessieverloop

`start` → `zoek-vinger` → `inlezen` (tot 45 s schone data) → `oefenen` → `einde`; `pauze` vanuit elke meetfase.

- **Start**: tik op "Begin". Instellingen: ademtempo (4,5–7 per minuut, standaard 5,5) en duur (2 / 3 min, standaard 3 — de flitser wordt warm; na live-test 2026-10-10).
- **Zoek-vinger**: tekst "Leg je wijsvinger licht op de lens naast de flitser" tot kwaliteit > 0,5 gedurende 3 s.
- **Pauze**: kwaliteit < 0,3 gedurende 3 s → klank dempt naar 30 % (niet stil: anders lijkt het geluid kapot), ademtonen blijven, tekst "vinger kwijt — leg hem terug" (bij te weinig signaal ook "druk lichter"). De sessieklok loopt door; de pauzetijd wordt apart geteld.
- **Einde**: samenvattingsscherm.

### Ademgids (beeld)

- Cirkel die groeit bij inademen en krimpt bij uitademen; easing met sinus.
- Ritme: tempo `b` per minuut → cyclus `60/b` s, inademen 40 %, uitademen 60 % (bij 5,5/min: 4,4 s in, 6,5 s uit).
- Kleur en gloed van de cirkel volgen de gladgestreken coherentie: koel blauwgrijs, dof (laag) → warm goud, heldere gloed (hoog).
- Klein in een hoek: live hartslag en een mini-pulsgolf (bewijs dat de meting werkt).
- **Vinger-indicator** (bovenaan): een hartje dat bij elke gedetecteerde slag oplicht, groen/oranje/rood voor signaal goed/zwak/geen, met korte tekst.
- Respecteert `prefers-reduced-motion` (dan alleen schaal, geen gloed-animatie).

### Geluid (Web Audio)

- **Grondtoon**: zachte drone (twee licht ontstemde sinussen rond 110 Hz, laagdoorlaat).
- **Coherentie → klank**: bij laag mengt gefilterde ruis ("wind") mee en blijft de drone kaal; bij hoog verdwijnt de ruis en komen zuivere harmonischen (kwint, octaaf) erbij. Overgangen met lineaire ramps van ≥ 2 s.
- **Ademsignaal**: korte, zachte toon bij het begin van inademen (hoger) en uitademen (lager), zodat de oefening met ogen dicht werkt.
- Volume-schuif en een mute-knop. Audio start pas na de tik op "Begin" (iOS-eis).

### Eindscherm

Gemiddelde HR, RMSSD (hele sessie), gemiddelde coherentie, % tijd in "hoog", pauzetijd. Laatste 20 sessies in `localStorage` als lijstje (datum, duur, gem. coherentie). Geen serveropslag.

## Uitbreiding na live-test (2026-10-10)

**Modus "Alleen ademen"** — keuze bij de start naast "Met hartslag". Geen camera en geen flitser (die werd te warm); de sessie start direct in `oefenen`, pauzeert nooit en eindigt op tijd (`createSession(sec, {measured: false})`). Duur 3 / 5 / 10 / 20 min (standaard 5); in de hartslagmodus blijft het 2 / 3 min. De cirkel heeft een vaste warme tint, de klank een rustig akkoord; de vinger-indicator en de knop "Andere lens" zijn verborgen. Eindscherm: modus en ademtempo; de geschiedenis vermeldt de modus.

**Klank volgens wat onderzoek ondersteunt:**
- *Klank die meeademt* (beide modi, altijd aan): de grondtoon wordt helderder en luider bij inademen (laagdoorlaat 300 → 1300 Hz, volume 0,10 → 0,24) en donkerder bij uitademen. Muzikaal begeleid resonantie-ademen is het best onderbouwde effect van geluid hier (adem → HRV), sterker dan claims over hersengolven.
- *Binaurale toon* (optioneel, schakelaar, standaard uit, alleen met koptelefoon): links 200 Hz, rechts 206 Hz → 6 Hz theta-verschil, zacht (0,05). De pagina vermeldt dat het bewijs voor het meenemen van hersengolven niet eenduidig is (review 2023: 5 van 14 EEG-studies vóór).
- Isochrone pulsen en 40 Hz-stimulatie: niet opgenomen (zwak bewijs resp. ander doel).

## Foutafhandeling

| Situatie | Gedrag |
|---|---|
| Geen cameratoegang | Uitleg: Instellingen → Safari → Camera → Sta toe; knop "opnieuw" |
| Flitser niet aan te zetten | Melding "flitser niet beschikbaar — werk iOS bij (≥ 17.5) of meet bij fel licht"; sessie mag door |
| Geen telelens / slecht signaal | Knop "Andere lens"; aanwijzing blijft staan tot kwaliteit goed |
| < 24 fps | Waarschuwing "meting minder nauwkeurig" |
| Scherm vergrendelt | `navigator.wakeLock.request('screen')`, opnieuw na `visibilitychange` |
| Tabblad naar achtergrond | Sessie pauzeert; camera + flitser uit; hervat bij terugkomst |
| Flitser warm | Tekst bij start: "de flitser wordt warm, haal je vinger weg als het onprettig wordt" |

In de voettekst staat: "Geen medisch instrument."

## Testen

**Unit-tests (Node 12, `node tests/run.mjs`):**

- `signal`: synthetische PPG-golf (60 fps, bekende slagtijden, ruis + jitter in de timestamps) → gedetecteerde slagtijden binnen 5 ms van de echte; HR klopt binnen 1 bpm; kwaliteit > 0,8. Bij pure ruis: kwaliteit < 0,3.
- `hrv`: RR-reeks die met 0,1 Hz moduleert → coherentie > 0,6; willekeurige RR → < 0,3; RMSSD van een bekende reeks exact; 3 ingestrooide valse slagen worden eruit gefilterd.
- `feedback` (timing): faseduur en inademen-/uitademen-fractie per tempo; overgangsmomenten van de ademtonen.

**Live (Bob, iPhone 15 Pro):**

1. Preview via Tailscale serve (HTTPS, alleen tailnet), zoals bij de spike: één sessie van 5 min. Controle: telelens automatisch gekozen, HR stabiel, coherentie stijgt bij rustig ademen op het ritme, geluid en beeld reageren, pauze/hervatten bij vinger weg.
2. Na akkoord commit ik; **pushen en Vercel-deploy doet Bob**. Daarna één controle op `derwisch-relay.vercel.app/adem`, ook dat `.mjs` met een JavaScript-MIME-type wordt geserveerd.

## Buiten scope (YAGNI)

- Contactloze meting via de voorcamera (optie B) — de tweede modus is nu "alleen ademen" zonder meting.
- EEG / Muse (optie C).
- Opslag in KV, koppeling met ritueel of LLM-reflectie.
- Account/login: de pagina is publiek bereikbaar maar verwerkt alles lokaal.
- Ademtempo automatisch afstemmen op de persoonlijke resonantiefrequentie.

## Risico's

- **Andere iPhones**: andere lensindeling; opgevangen met "Andere lens" + onthouden keuze. Alleen getest op 15 Pro.
- **Vercel `.mjs` MIME-type**: bij een verkeerd type laden de modules niet. Terugvaloptie: hernoemen naar `.js` en de tests via een kopie draaien.
- **Coherentiedrempels**: zelf gekozen, niet de HeartMath-schaal; kalibreren in de live-test.
