# 3D Portfolio

Een draaibare wereldbol met de reizen en projecten van Niels Reuvekamp, binnen zijn studie en daarbuiten.

Live: https://nreuvekamp-creator.github.io/3d-portfolio/

## Zelf iets aanpassen

Alle inhoud staat in **`trips.json`**. Je hoeft geen code aan te raken.

- **Tekst wijzigen**: zoek de reis op `id` en pas `title`, `summary` of `body` aan.
- **Reis toevoegen**: kopieer een bestaand blok, geef het een nieuw uniek `id` en vul de velden in.
- **Gestippeld blok weghalen**: als de gegevens kloppen, verwijder de regel `"todo": true`.

Velden per reis:

| veld | betekenis |
|---|---|
| `id` | uniek, bepaalt ook de fotonaam |
| `title` | kop in het paneel |
| `place`, `country` | locatie in woorden |
| `lat`, `lon` | coordinaten, bepalen waar de pin staat |
| `date` | `JJJJ-MM` of `JJJJ` |
| `context` | `studie`, `extracurriculair` of `prive` |
| `study` | `bi`, `cmd`, `wb`, `honours`, `stage` of `null` |
| `abroad` | `true` of `false` |
| `summary` | een zin |
| `body` | het langere verhaal |
| `tags` | vrije labels |
| `todo` | `true` toont een gestippeld blok in de brief en maakt het envelopje flauw |

## Foto's

Zet een foto in `photos/` met de naam van het `id`, bijvoorbeeld `photos/madrid.jpg`.
De site pakt hem automatisch op. Alleen `.jpg` werkt; zet een png of webp eerst om naar jpg.
Zonder foto toont de brief alleen tekst.

Aanbevolen formaat: liggend, ongeveer 1600 bij 1000 pixels.

## Lokaal bekijken

De site laadt `trips.json` via fetch, dus `index.html` dubbelklikken werkt niet.
Start een servertje in deze map:

```
python3 -m http.server 8777
```

Ga dan naar http://localhost:8777

## Techniek

Twaalf bronbestanden zonder build. MapLibre GL 5.9 (staat in de repo zelf) tekent de bol in globe-projectie,
met aquarel tot zoom 5 en Esri Light Gray daarboven, en clustering zodat plekken die dicht bij elkaar
liggen samenvallen als je uitzoomt. Alles komt van deze repo, behalve de Google-letters en de Esri-kaart als je ver inzoomt.

## Hoe de site is opgebouwd

| bestand | wat het doet |
|---|---|
| `index.html` | de structuur, meer niet |
| `style.css` | de drukkerij: papier, inkten, korrel, fotolijsten |
| `intro.css` + `intro.js` | het verhaal; **de teksten staan bovenaan `intro.js` in `SCRIPT`** |
| `globe.css` + `globe.js` | de wereldbol, de envelopjes, het paneel, de dossiermap en het postmapje |
| `fidget.js` | de laag die op je muis en je klikken reageert |
| `papier.css` | een eigen papiersoort per land, via `data-papier` |
| `sterren.css` + `sterren.js` | de sterrenhemel met citaten als je ver uitzoomt; **de citaten staan bovenaan `sterren.js` in `CITATEN`** |
| `zaal.css` + `zaal.js` | de museumzaal achter de Louvre-pin |
| `maplibre-gl.js` + `maplibre-gl.css` | de kaartbibliotheek, ongewijzigd, versie 5.9.0 |
| `fonts/` | drie schrijfmachineletters, licenties in `LICENTIES.txt` |
| `glyphs/` | de letters die de kaart zelf tekent (titels onder de envelopjes, cijfers op de stapels) |
| `tiles/watercolor/` | de aquarelkaart, zoom 0 tot 5, in deze repo zelf |

Het verhaal aanpassen doe je in `SCRIPT` bovenaan `intro.js`: elke regel heeft een
tekst en een `wacht` in milliseconden.

De aquareltegels staan in de repo omdat het archief waar ze vandaan komen geen
CORS-kop meestuurt, waardoor de browser ze niet in een WebGL-kaart mag gebruiken.
Vanaf zoom 5 schuift er een lichte kaart van Esri overheen (de plaatsnamen al vanaf zoom 4)
zodat je tot straatniveau kunt blijven zoomen.
