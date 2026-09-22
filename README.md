# 3D Portfolio

Een draaibare wereldbol met de reizen en projecten van Niels Reuvekamp, binnen zijn studie en daarbuiten.

Live: https://nreuvekamp-creator.github.io/3d-portfolio/

## Zelf iets aanpassen

Alle inhoud staat in **`trips.json`**. Je hoeft geen code aan te raken.

- **Tekst wijzigen**: zoek de reis op `id` en pas `title`, `summary` of `body` aan.
- **Reis toevoegen**: kopieer een bestaand blok, geef het een nieuw uniek `id` en vul de velden in.
- **Vraagteken weghalen**: als de gegevens kloppen, verwijder de regel `"todo": true`.

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
| `todo` | `true` toont een paars vraagteken-blok |

## Foto's

Zet een foto in `photos/` met de naam van het `id`, bijvoorbeeld `photos/madrid.jpg`.
De site pakt hem automatisch op; `.jpg`, `.png`, `.jpeg` en `.webp` werken allemaal.
Zonder foto verschijnt een gekleurde tegel met de titel erin.

Aanbevolen formaat: liggend, ongeveer 1600 bij 1000 pixels.

## Lokaal bekijken

De site laadt `trips.json` via fetch, dus `index.html` dubbelklikken werkt niet.
Start een servertje in deze map:

```
python3 -m http.server 8777
```

Ga dan naar http://localhost:8777

## Techniek

Een los `index.html` met MapLibre GL 5.9 in globe-projectie, Esri Dark Gray als kaartlaag,
en clustering zodat plekken die dicht bij elkaar liggen samenvallen als je uitzoomt.
Geen build, geen dependencies.
