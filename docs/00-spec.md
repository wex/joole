# Joole – tekninen määrittely

Nov 24, 2026 · @Niko Hujanen

## Tausta ja tavoitteet

Rakennetaan selaimessa toimiva brush-pohjainen karttaeditori Quake 2:lle TypeScriptillä ja WebGL2:lla. Toiminnallinen esikuva on Qoole 99 (v0.99, GPL), jonka [lähdekoodi](https://github.com/demoth/qoole) on noin 150 C++-tiedostoa MFC:n päällä. Editori julkaistaan GNU GPL v2.0 -lisenssillä. Qoolen koodi on lisensoitu "GPL v2 tai myöhempi", joten sitä saa käyttää suoraan. Ensisijaisesti Qoolesta otetaan kuitenkin käyttöön sen todetut ratkaisut: objektipuu, CSG-operaatiot, pelikohtainen abstraktio ja 2D/3D-näkymäjako.

Tavoitteet:

1. **Täysi Q2-kenttäkierros selaimessa.** Avataan `.map`, muokataan, tallennetaan `.map` ja testataan se kääntäjällä. Tavoitteena on, että mikä tahansa vanilla-Q2:n kenttä aukeaa ja tallentuu ilman häviöitä.
2. **Ei asennusta.** Käyttäjä valitsee pelikansionsa tai `baseq2/pak0.pak`:n, ja tekstuurit ja entiteetit luetaan sieltä. Mitään ei lähetetä palvelimelle.
3. **Qoolen tasoinen työnkulku.** Mukana ovat neljän näkymän asettelu, brushien luonti ja muokkaus, CSG-vähennys, ontoksi tekeminen, leikkaus tasolla, entiteettien ominaisuudet, tekstuuriselain ja prefabit.
4. **Moderni perusta.** Mukana ovat rajaton undo, automaattinen tallennus selaimen tallennustilaan ja yksikkötestattu geometriaydin, joka ei riipu UI:sta.

## Rajaus

V1 tukee vain Quake 2:ta. Qoolen `Game`-abstraktio (Quake, Hexen II, Half-Life, Sin, Heretic II) jätetään pois, mutta pelikohtaiset asiat eristetään silti yhteen moduuliin (`game/q2`). Näin uuden pelin lisääminen myöhemmin ei vaadi ytimen muutoksia.

| Mukana v1:ssä | Ei mukana v1:ssä |
| --- | --- |
| Q2 `.map` luku ja kirjoitus (id:n alkuperäinen formaatti) | Valve 220 -tekstuuriformaatti, Quake 3 -patchit ja curvet |
| Oma JSON-projektiformaatti ensisijaisena tallennusmuotona | Qoolen `.qle`-tiedostojen tuonti (myöhempi vaihe) |
| `.wal`-tekstuurit `pak`-tiedostoista ja irtohakemistoista, myös Q2-modien pelihakemistoista | `.wad`-tekstuurit, Qoolen pelien välinen karttamuunnos |
| Brushit, entiteetit, ryhmät, prefabit | Terrain-työkalut, mallieditori |
| CSG: vähennys, leikkaus, onton tekeminen, tasoleikkaus, peilaus | BSP-tiedoston avaaminen muokattavaksi (dekompilointi) |
| Entiteettien ominaisuudet määritystiedoston pohjalta, md2-mallit laatikkona tai rautalankana | Valaistuksen esikatselu (qrad3-tulosta vastaava) |
| Kääntäjäajo ja vuotopistetiedoston (`.pts`) näyttäminen | Moninpelieditointi (reaaliaikainen yhteismuokkaus) |
| Chromium-selaimet täydellä tiedostotuella, Firefox ja Safari lataus-/tallennuspohjaisesti | Mobiili- ja kosketuskäyttö |

Qoolen omat Windows-erityispiirteet, kuten Glide-, DirectX- ja MGL-renderöijät sekä MFC:n telakoituvat ikkunat, korvataan WebGL2:lla ja selaimen omalla paneeliasettelulla.

## Arkkitehtuuri

Sovellus jaetaan neljään kerrokseen. Kerros saa riippua vain itseään alemmista kerroksista ja ytimestä. Ytimessä ei ole selainriippuvuuksia, joten geometriaa, formaatteja ja komentoja voi testata Nodessa. Laatikoissa näkyy myös, mihin Qoolen moduuliin kukin osa vastaa.

&#91;embedded content: kerrosarkkitehtuuri · 4 kerrosta ja pelimoduuli\]

Pelikohtaiset tiedot (paletti, pintaliput, hakemistopolut, käännösprofiilit ja oletustekstuuri `e2u1/mine10_1` kuten Qoolessa) ovat `game/q2`-moduulissa. Se vastaa Qoolen `Game`-luokan `Quake2`-toteutusta, mutta toisia pelejä ei v1:ssä ole.

**Teknologiat:** TypeScript 5 (`strict`), Vite, raaka WebGL2 ilman 3D-kirjastoa (renderöinti on kapea ja hallittu), Solid tai Preact paneeleihin, Vitest ja Playwright testeihin sekä Emscripten Q2-työkaluille. Matematiikka on omaa koodia: float64 ytimessä ja `Float32Array` vasta GPU-puskureissa.

```text
src/
  core/doc/       dokumenttimalli, komennot, patchit
  core/geom/      tasot, windingit, CSG, poiminta, BVH
  core/formats/   map, pak, wal, pcx, md2, def, pts
  game/q2/        Q2-vakiot ja -oletukset
  app/            CommandBus, valinta, asetukset, työkalutilat
  render/         WebGL2, varjostimet, näkymät
  platform/       tiedostot, OPFS, IndexedDB, workerit
  ui/             paneelit
workers/          tekstuurimuunnos, qbsp3/qvis3/qrad3.wasm
```

## Tietomalli

Dokumentti on puu, jonka solmut ovat ryhmiä, entiteettejä tai brusheja. Ratkaisu on sama kuin Qoolessa, jossa yksi `Object`-luokka voi sisältää lapsia, brushin (`Geometry`) tai entiteetin (`Entity`). Selainversiossa solmutyypit erotetaan tyyppiturvallisiksi muodoiksi. Jokaisella solmulla on pysyvä tunniste, jota undo, valinta ja renderöinnin välimuisti käyttävät.

```typescript
type Id = string;               // nanoid, pysyy samana tallennusten yli
type Vec3 = [number, number, number];   // float64, Q2-koordinaatit (Z ylös)

interface Plane { n: Vec3; d: number }  // n·p = d, normaali osoittaa ulospäin

interface FaceTexture {
  name: string;                 // esim. "e1u1/floor1_3" ilman .wal-päätettä
  offset: [number, number];     // xoff yoff
  rotation: number;             // asteina
  scale: [number, number];      // xscale yscale
  contents: number;             // CONTENTS_*-bittikenttä
  flags: number;                // SURF_*-bittikenttä
  value: number;                // esim. valon voimakkuus
}

interface Face {
  points: [Vec3, Vec3, Vec3];   // määrittävät tason kuten .map:ssa
  tex: FaceTexture;
}

interface BrushNode   { kind: 'brush';  id: Id; faces: Face[] }
interface EntityNode  { kind: 'entity'; id: Id; props: [string, string][]; children: Id[] }
interface GroupNode   { kind: 'group';  id: Id; name: string; children: Id[]; locked?: boolean; hidden?: boolean }
type MapNode = BrushNode | EntityNode | GroupNode;

interface MapDocument {
  nodes: Map<Id, MapNode>;
  parent: Map<Id, Id>;
  worldspawn: Id;               // aina olemassa, juurisolmu
}
```

Suunnittelupäätökset:

- **Brushin totuus on tasojoukko, ei verteksit.** Tallennettavat tiedot ovat kolme pistettä per sivu, kuten `.map`-tiedostossa. Polygonit, verteksit ja reunat ovat johdettua välimuistia, joka lasketaan leikkaamalla iso kuutio tasoilla. Qoole tallentaa B-rep-mallin (verteksit, reunat, polygonit ja tasot) ja ylläpitää sen eheyttä erikseen (`IntegrityCheck`). Tasomalli poistaa tämän virhelähteen, ja tallennus ilman häviöitä tulee ilmaiseksi.
- **Ominaisuudet järjestettynä listana.** Entiteettien avain–arvo-parit säilytetään alkuperäisessä järjestyksessä ja myös tuntemattomat avaimet. Silloin tiedoston avaaminen ja tallentaminen ei muuta mitään.
- **Ei paikallisia muunnosmatriiseja.** Qoolessa jokaisella solmulla on oma `TransSpace`, ja koordinaatit muunnetaan absoluuttisiksi vasta tallennuksessa (`TransObj2Abs`). Selainversiossa kaikki koordinaatit ovat maailmakoordinaatteja, mikä yksinkertaistaa CSG:tä ja poimintaa. Ryhmän siirto on komento, joka siirtää jokaisen lapsen.
- **Ryhmät `.map`-kommentteina.** Q2:n `.map` ei tunne ryhmiä. Ne tallennetaan `// @group <id> <nimi>` -kommentteina, jotka qbsp3:n jäsennin ohittaa. Ensisijainen tallennusmuoto on kuitenkin oma JSON-projektiformaatti, joka säilyttää kaiken editorin tiedon (ks. Tiedostoformaatit).
- **Brush-entiteetit** (`func_door` ym.) ovat `EntityNode`ja, joiden lapsina on brusheja. Piste-entiteeteillä ei ole lapsia, ja niiden sijainti on `origin`-ominaisuudessa.

## Tiedostoformaatit

Editori lukee viittä binääri- tai tekstiformaattia ja kirjoittaa yhtä. Kaikki jäsentäjät ovat puhtaita TypeScript-funktioita (`ArrayBuffer` tai `string` sisään, tietorakenne ulos), joten niitä voi testata Nodessa ilman selainta. Binääriformaatit ovat little-endian-muotoisia.

| Formaatti | Suunta | Rakenne | Huomiot |
| --- | --- | --- | --- |
| `.map` | luku + kirjoitus | Tekstiä: entiteetit `{ "avain" "arvo" … { brush } }`, brushin sivu `( x y z ) ( x y z ) ( x y z ) tekstuuri xoff yoff rot xscale yscale [contents flags value]` | Kolme viimeistä kenttää ovat valinnaisia. Jos ne puuttuvat, qbsp3 ottaa oletukset `.wal`-otsakkeesta. Editori kirjoittaa ne vain, jos ne poikkeavat tekstuurin oletuksista, jolloin avaus ja tallennus säilyttävät tiedoston ennallaan. `//`-kommentit sallitaan. |
| `.pak` | luku | Otsake `PACK`, hakemiston offset (int32), hakemiston pituus (int32). Merkintä on 64 tavua: nimi (56 tavua), sijainti (int32), pituus (int32). | Pakkaamaton, joten tiedostot luetaan suoraan `Blob.slice`-kutsulla ilman koko pakin lataamista muistiin. Tiedostot haetaan samassa järjestyksessä kuin pelimoottorissa (ks. Modit alla). |
| `.wal` | luku | 100-tavuinen otsake: nimi (32), leveys, korkeus, 4 mip-offsetia, animaatioketjun seuraava nimi (32), flags, contents, value. Sen jälkeen 8-bittiset indeksoidut pikselit. | Editori käyttää vain mip 0:aa ja antaa WebGL:n generoida mipmapit. Otsakkeen flags, contents ja value ovat sivun oletusarvot. |
| `pics/colormap.pcx` | luku | PCX:n 768 viimeistä tavua ovat 256 värin RGB-paletti. | Paletti muuntaa `.wal`-tekstuurit RGBA8-muotoon. Indeksi 255 ei ole läpinäkyvä Q2:ssa, joten alfakanavaa ei käytetä. |
| `.md2` | luku | Otsake `IDP2`, versio 8, kehykset ja GL-komennot | Valinnainen. Näytetään piste-entiteettien esikatseluna (kehys 0). Qoole näytti md2-mallit rautalankana (`Quake2::LoadModel`). |
| entiteettimääritykset | luku | Radiantin `/*QUAKED luokka (r g b) (min) (max) LIPPU1 LIPPU2 … kuvaus */` -lohkot | Ominaisuuspaneeli, värit, laatikoiden koot ja spawnflags-valintaruudut tulevat tästä. Qoolessa vastaava on oma tyypitetty formaatti (`EntList`: VEC, INT, STR, FLAGDEF, COLOR …), joten editorin sisäinen malli tukee samoja tyyppejä. |
| `.pts` | luku | Rivejä muodossa `x y z` | qbsp3:n vuotopolku, joka näytetään viivana kaikissa näkymissä (vrt. Qoolen `LoadLeakFile`). |

`.map`-kirjoittaja muuntaa luvut tekstiksi näin: kokonaisluvut ilman desimaaleja ja muut enintään kuudella desimaalilla ilman peränollia. Hilaan kohdistettu brush tuottaa siis samat rivit kuin alkuperäinen tiedosto. Testiaineistona on kierrostesti (luku → kirjoitus → luku), jonka täytyy tuottaa identtinen tietorakenne kaikille käyttäjän antamille testikartoille.

**Oma projektiformaatti (`.q2proj.json`).** Projekti on ensisijainen tallennusmuoto, ja `.map` on vientiformaatti kääntäjälle ja muille editoreille. Ctrl+S tallentaa projektin. `.map` kirjoitetaan erikseen *Vie*-komennolla ja automaattisesti ennen käännöstä. Projekti tallentaa kaiken, mikä `.map`-tiedostosta katoaa:

```json
{
  "format": "q2-web-editor-project",
  "version": 1,
  "game": { "baseDir": "baseq2", "modDir": "mymod" },
  "document": {
    "worldspawn": "w0",
    "nodes": [
      { "kind": "entity", "id": "w0", "props": [["classname", "worldspawn"]], "children": ["g1"] },
      { "kind": "group", "id": "g1", "name": "Eteinen", "children": ["b1"], "locked": false, "hidden": false },
      { "kind": "brush", "id": "b1", "faces": [ { "points": [[0,0,0],[0,64,0],[64,0,0]], "tex": { "name": "e1u1/floor1_3", "offset": [0,0], "rotation": 0, "scale": [1,1], "contents": 0, "flags": 0, "value": 0 } } ] }
    ]
  },
  "editor": { "grid": 8, "textureLock": true, "cameras": {}, "compileProfile": "normal" }
}
```

- Solmut ovat tasaisena listana, ja puun rakenne tulee `children`-kentistä. Muoto vastaa suoraan tietomallin `MapDocument`ia.
- Luvut tallennetaan JavaScriptin oletusmuunnoksella, joka säilyttää float64-arvon tarkasti, joten avaus ja tallennus ei muuta mitään.
- `version` kasvaa jokaisessa yhteensopimattomassa muutoksessa. Lukija ajaa siirtofunktiot vanhasta versiosta uusimpaan, ja jokaiselle versiolle on testitiedosto.
- Tekstuureja ei upoteta projektiin, vaan niihin viitataan nimellä pelihakemistosta.
- `.map`-vienti kirjoittaa ryhmät edelleen `// @group` -kommentteina, joten `.map` voidaan myös tuoda ilman, että ryhmät katoavat.

**Modit.** Pelin asetuksissa annetaan `baseq2` ja valinnainen modin hakemisto (esim. `rogue`, `xatrix` tai oma). Tiedosto haetaan Q2-moottorin järjestyksessä: modin pakit suurimmasta numerosta pienimpään, modin irtotiedostot, `baseq2`:n pakit ja lopuksi `baseq2`:n irtotiedostot. Järjestys tarkistetaan moottorin tiedostojärjestelmäkoodista ennen toteutusta. Tekstuuriselain näyttää modin tekstuurit omana juurikansionaan ja merkitsee, mistä lähteestä kukin tekstuuri tulee. Modin entiteettimääritykset käsitellään entiteettimääritysten yhteydessä myöhemmin.

## Geometriaydin

Geometriaydin (`core/geom`) on riippuvuudeton TypeScript-kirjasto, joka laskee float64-tarkkuudella ja jota ei kutsuta suoraan UI:sta, vaan aina komentojen kautta. Qoolessa vastaavat toiminnot ovat tiedostossa `Geometry.cpp` (noin 2 800 riviä). Algoritmien periaatteet otetaan sieltä, mutta toteutus perustuu tasomalliin.

Toleranssit ovat vakioita yhdessä paikassa: `PLANE_EPS = 1e-4` (pisteen luokittelu tason suhteen) ja `POINT_EPS = 1e-3` (verteksien yhdistäminen). Brush on validi, kun sen tilavuus on yli 0, sillä on vähintään neljä sivua eikä yksikään sivu ole tarpeeton. Jokainen operaatio palauttaa joko validit brushit tai virheen, ei koskaan rikkinäistä geometriaa.

| Operaatio | Qoolen vastine | Algoritmi |
| --- | --- | --- |
| Polygonien muodostus | `ConstructEdgeList`, `ConstructPlaneList` | Jokaiselle tasolle luodaan iso neliö (winding), joka leikataan kaikilla muilla tasoilla. Tyhjäksi jäävä sivu on tarpeeton ja poistetaan. |
| Uusi brush | prefabit, `MakeSegment` | Laatikko vedetään 2D-näkymässä, ja korkeus tulee toisesta näkymästä tai oletuksesta. Primitiivejä ovat laatikko, kiila, n-kulmainen lieriö, kartio ja pallon likiarvo. |
| CSG-vähennys | `CSGSubtract` | Leikkurin jokaisella tasolla leikattava jaetaan kahtia: tason ulkopuolinen osa jää uudeksi brushiksi, ja sisäpuolinen osa jatkaa seuraavaan tasoon. Lopulta sisälle jäävä osa hävitetään. Uudet sivut saavat leikkurin tekstuurin. |
| CSG-leikkaus | `CSGIntersect` | Brushien tasojoukot yhdistetään ja tarpeettomat sivut poistetaan. |
| Onton tekeminen | `HollowInward`, `HollowOutBrush` | Jokaisesta sivusta tehdään kuori, jonka paksuus on d (oletus 8 yksikköä, kuten Qoolessa), joko sisään- tai ulospäin. Toteutus on vähennys: alkuperäisestä vähennetään sen sisään siirretty kopio. |
| Tasoleikkaus | `PlaneClip` | Taso annetaan 2D-näkymässä kahdella pisteellä ja näkymän syvyysakselilla. Tilat: säilytä etupuoli, takapuoli tai molemmat erillisinä brusheina. |
| Peilaus ja kääntö | `OpPlaneMirror`, `OpPlaneFlip` | Pisteet peilataan, ja jokaisen sivun pisteiden järjestys käännetään, jotta normaali osoittaa yhä ulospäin. |
| Verteksi-, reuna- ja sivumuokkaus | `MoveVertex`, `MoveEdge`, `MoveFace`, `BreakPlanes` | Liikutetaan johdettua verteksiä, ja koskettavien sivujen tasot lasketaan uudelleen. Jos sivu ei ole enää tasomainen, se jaetaan kolmioiksi, kuten Qoolen `BreakPlanes`. Lopuksi tarkistetaan kuperuus. Jos tulos ei ole kupera, siirto hylätään ja näkymä näyttää sen punaisena. |
| Siirto, kierto, skaalaus | `OpSelectionMove`, `Rotate`, `Scale` | Kaikkiin sivujen pisteisiin sovelletaan 4×4-matriisia. Tekstuurilukon ollessa päällä tekstuurin parametrit lasketaan uudelleen (ks. Tekstuurit). |

Pisteen paikka 2D-näkymissä kohdistetaan hilaan (1, 2, 4 … 256 yksikköä, oletus 8). Hilaan kohdistetut brushit kirjoitetaan kokonaislukupisteinä, mikä välttää qbsp3:n tarkkuusongelmat. Kierron jälkeen tasopisteet pyöristetään hilaan vain, jos käyttäjä valitsee *Snap to grid* -komennon, koska automaattinen pyöristys voi tehdä brushista epäkuperan.

## Renderöinti WebGL2:lla

Kaikki neljä näkymää piirretään yhteen WebGL2-kontekstiin ja yhteen `<canvas>`-elementtiin `gl.scissor`- ja `gl.viewport`-kutsuilla. Silloin tekstuurit ja puskurit jaetaan näkymien kesken eikä selaimen konteksteja kulu neljää. Qoolen `QDraw`-abstraktio (OpenGL, Glide, DirectX, MGL, ohjelmistopiirto) korvautuu yhdellä renderöijällä.

**Geometrian välimuisti.** Jokaisesta brushista lasketaan polygonit kerran muutoksen jälkeen (likainen-lippu brushin tunnisteen mukaan). Polygonit kolmioidaan viuhkaksi ja kootaan tekstuureittain eriteltyihin VBO-puskureihin. Muutos päivittää vain kyseisen brushin osuuden (`bufferSubData` ja vapaiden välien lista). Verteksiformaatti: sijainti (3×f32), UV (2×f32), normaali (3×i8), brushin indeksi (u32) poimintaa ja valintakorostusta varten.

**2D-näkymät (ylä, etu, sivu).** Ortografinen projektio akseleille XY, XZ ja YZ. Hila piirretään proseduraalisesti fragmenttivarjostimessa koko näkymän kokoisena neliönä, ja hilaviivat himmenevät, kun niiden väli on alle 4 pikseliä. Brushit piirretään rautalankana reunalistoista, entiteetit määritystiedoston värillä ja valitut punaisella. Viivanleveys tehdään instansoiduilla nelikulmioilla, koska `gl.lineWidth` on useimmilla alustoilla rajattu yhteen pikseliin.

**3D-näkymä.** Perspektiivikamera ja lentokamera (WASD ja hiiren katselu osoittimen lukituksella). Tilat: rautalanka, tasaväriä ja tekstuurit. Tekstuuritilassa sivun kirkkaus riippuu sen normaalista, jotta muodot erottuvat ilman valaistusta. `SURF_TRANS33`- ja `SURF_TRANS66`-sivut piirretään läpinäkyvinä viimeisenä, `SURF_SKY` taivaanvärillä ja `SURF_NODRAW`, clip ja hint himmeänä tai piilotettuina asetuksen mukaan. Kaukaiset brushit karsitaan näkyvyyskartiolla brushien rajauslaatikoiden perusteella.

**Tekstuurit.** `.wal` muunnetaan paletin avulla RGBA8-muotoon Web Workerissa ja ladataan erillisinä `WebGLTexture`-olioina (`REPEAT`, mipmapit, `NEAREST_MIPMAP_LINEAR` aidon Q2-tuntuman vuoksi). Tekstuurit ladataan laiskasti: vasta kun niitä tarvitaan näkymässä tai tekstuuriselaimessa. Siihen asti käytetään ruudukkokuviota. Muunnetut tekstuurit tallennetaan välimuistiin OPFS:ään.

**Poiminta.** Poiminta tehdään prosessorilla. Säde leikataan brushin tasojen puoliavaruuksilla (sama periaate kuin Qoolen `HitGeometry`). Brushit haetaan dynaamisesta BVH-puusta, joka päivitetään muutosten yhteydessä. 2D-näkymissä osuma tarkoittaa lähintä reunaa 4 pikselin säteellä tai sisältävää brushia. Toistuva napsautus samassa kohdassa kiertää päällekkäisiä brusheja (Qoolen `Selector`). Prosessoripoiminta valitaan GPU:n ID-puskurin sijaan, koska sama koodi palvelee myös verteksi- ja sivumuokkausta sekä testejä.

**Kehyssilmukka.** Piirto tehdään vain, kun jokin muuttuu (dokumentti, kamera tai osoitin), ei jatkuvasti `requestAnimationFrame`-silmukassa. Näin kannettavan akku ei tyhjene editorin ollessa auki.

## Tekstuurit ja pintojen ominaisuudet

UV-koordinaatit lasketaan täsmälleen kuten qbsp3:ssa, jotta editorin näkymä ja peli näyttävät saman. Sivun normaalia lähimpänä oleva perusakseli valitaan kuuden akselin taulukosta (lattia, katto ja neljä seinää). Sen jälkeen akselit kierretään `rotation`-kulmalla, jaetaan `scale`-arvoilla ja siirretään `offset`-arvoilla. Lopuksi tulos jaetaan tekstuurin leveydellä ja korkeudella. Funktio `texAxes(plane, tex)` on ytimessä, ja sitä käyttävät sekä renderöijä että tekstuurilukko.

**Tekstuurilukko.** Siirrossa ja kierrossa vanhat tekstuuriakselit muunnetaan samalla matriisilla, ja niistä ratkaistaan uudet `offset`-, `rotation`- ja `scale`-arvot (vrt. Qoolen `FaceTex::Transform` ja `lockTex`). Quaken parametrimuoto ei pysty esittämään vinoutusta. Jos ratkaisun virhe ylittää 0,5 tekseliä, sivu merkitään ja käyttäjä näkee varoituksen. Siirto lukon kanssa on aina tarkka.

**Tekstuurityökalut** (Qoolen `OpTextureApply`, `ApplyFace`, `FaceManip`, `BrushManip`):

- tekstuurin asetus koko brushille tai valituille sivuille, ja tekstuurin poiminta sivulta pipetillä
- siirto ja kierto nuolinäppäimillä hilan mukaan, sovita sivuun (fit), tasaa reunaan (justify), palauta oletukset
- tekstuuriselain: kansiopuu (`textures/e1u1` …), haku nimellä, käytössä olevat tekstuurit -suodatin, esikatselu ja koko

**Pinnan ominaisuudet** muokataan sivukohtaisessa paneelissa valintaruutuina. Arvot ovat Q2:n `qfiles.h`:n vakioita. Paneeli näyttää, poikkeaako arvo `.wal`-tekstuurin oletuksesta (Qoolen `OpModSurfaceAttrib` ja `OpModContentAttrib`).

| Ryhmä | Liput (heksadesimaaliarvo) |
| --- | --- |
| Surface flags | LIGHT 0x1, SLICK 0x2, SKY 0x4, WARP 0x8, TRANS33 0x10, TRANS66 0x20, FLOWING 0x40, NODRAW 0x80, HINT 0x100, SKIP 0x200 |
| Contents | SOLID 0x1, WINDOW 0x2, AUX 0x4, LAVA 0x8, SLIME 0x10, WATER 0x20, MIST 0x40, AREAPORTAL 0x8000, PLAYERCLIP 0x10000, MONSTERCLIP 0x20000, CURRENT\_0…CURRENT\_DOWN 0x40000–0x800000, ORIGIN 0x1000000, DETAIL 0x8000000, TRANSLUCENT 0x10000000, LADDER 0x20000000 |
| Value | kokonaisluku, LIGHT-lipun kanssa valon voimakkuus |

Arvot tarkistetaan Q2:n alkuperäisestä `qfiles.h`:sta ennen toteutusta. Taulukko on laadittu muistinvaraisesti.

## Editoritoiminnot ja käyttöliittymä

Oletusasettelussa on neljä näkymää 2×2-ruudukossa (3D, ylä, etu, sivu), oikealla ominaisuuspaneeli ja alhaalla tekstuuriselain ja lokiruutu. Paneelien rajoja voi siirtää, ja yksittäisen näkymän voi suurentaa koko ruudulle. Qoolen MFC-telakat (`Interface2/`) korvautuvat CSS Gridillä. Paneelit ovat kevyen UI-kirjaston komponentteja (Solid tai Preact). Näkymät ovat yksi canvas, jota UI-kirjasto ei renderöi.

**Työkalutilat** (yksi kerrallaan, pikanäppäin suluissa):

| Tila | Toiminta | Qoolen vastine |
| --- | --- | --- |
| Valinta (S) | napsautus, Shift lisää valintaan, alueen raahaus, siirto raahaamalla, kahvat skaalaukseen, Ctrl+raahaus kiertää | `OpSelect*`, `OpSelectionMove/Rotate/Scale` |
| Brush (B) | raahaus 2D-näkymässä luo valitun primitiivin | prefabit, `QPrefbVw` |
| Entiteetti (E) | napsautus luo valitun luokan entiteetin. Brush-luokka (`func_*`, `trigger_*`) muuttaa valitut brushit entiteetiksi | `QEntSel` |
| Leikkaus (C) | kaksi pistettä 2D-näkymässä, Enter leikkaa, Tab vaihtaa säilytettävän puolen | `OpPlaneClip` (scissors-ikoni) |
| Verteksi (V), reuna, sivu (F) | kahvat johdetuille elementeille, raahaus hilaan kohdistettuna | `MoveVertex`, `MoveEdge`, `MoveFace` |
| Tekstuuri (T) | sivun valinta 3D-näkymässä, tekstuurin asetus ja säätö | `QPropSrf`, `QPropTex` |

**Komennot valikoissa ja pikanäppäiminä:** leikkaa, kopioi, liitä ja monista (leikepöydällä `.map`-tekstinä, jolloin siirto toiseen editoriin toimii). Lisäksi CSG-vähennys, CSG-leikkaus, onton tekeminen sisään ja ulos, peilaus X/Y/Z, kierto 90°, ryhmittely ja purku, piilota ja näytä, lukitse sekä hilan koko \[ ja \].

**Puunäkymä ja ryhmän sisälle meneminen.** Sivupaneelin puu näyttää worldspawnin, entiteetit ja ryhmät, ja solmuja voi siirtää raahaamalla (Qoolen `QTrView` ja `OpTreeViewDragMove`). Kaksoisnapsautus vie ryhmän sisälle, jolloin valinta ja uudet brushit rajautuvat siihen ja muu kartta himmenee. Tämä on Qoolen *scope*-käsite (`OpScopeChange`).

**Entiteettipaneeli.** Lomake määritystiedoston mukaan: `spawnflags` valintaruutuina, `_color` värinvalitsimena, `angle` kompassina ja `target`/`targetname` pudotusvalikkona kartan olemassa olevista nimistä. Lomakkeen alla on raaka avain–arvo-taulukko, jolla tuntemattomia avaimia voi muokata. Kohteiden väliset `target`-yhteydet piirretään viivoina 2D-näkymiin.

**Prefabit.** Valinnan voi tallentaa prefabiksi (`.map`-pätkä OPFS:ään) ja raahata prefabiselaimesta näkymään (Qoolen `QPrefMgr`).

## Komennot, undo/redo ja tiedostojen käsittely

Kaikki dokumentin muutokset kulkevat yhden `CommandBus`-väylän kautta, eikä mikään UI-koodi muuta dokumenttia suoraan. Qoolessa on noin 30 `Operation`-aliluokkaa ja `OpManager`, ja suurin osa niistä tallentaa vanhat objektit ja vaihtaa ne undossa takaisin (`OpObjModification::SwapObjs`). Selainversio yleistää saman mallin yhdeksi mekanismiksi.

```typescript
interface Patch {                // yhden komennon vaikutus
  before: Map<Id, MapNode | null>;   // null = solmua ei ollut
  after:  Map<Id, MapNode | null>;   // null = solmu poistettiin
  parentBefore: Map<Id, Id | null>;
  parentAfter:  Map<Id, Id | null>;
}
interface Command { label: string; mergeKey?: string; run(doc: Readonly<MapDocument>): Patch }
```

- **Undo** soveltaa `before`-tilan ja **redo** `after`-tilan. Solmut ovat muuttumattomia olioita, joten tilannekuva on halpa: muuttumattomia solmuja ei kopioida.
- **Yhdistäminen:** saman raahauksen aikana syntyvät komennot, joilla on sama `mergeKey`, yhdistetään yhdeksi undo-askeleeksi.
- **Historia** on rajaton, mutta muistin käytölle asetetaan yläraja (oletus 256 Mt arvioituna). Vanhimmat askeleet poistetaan.
- **Valinta** ei ole osa dokumenttia eikä undo-historiaa, mutta undo palauttaa komentoa edeltäneen valinnan (vrt. Qoolen `OpSelectNewObjs`).
- Patchit menevät myös renderöijälle, BVH:lle ja puunäkymälle muutosilmoituksina, jolloin vain muuttuneet osat lasketaan uudelleen.

**Tiedostojen käsittely selaimessa:**

| Tarve | Chromium (Chrome, Edge) | Firefox, Safari |
| --- | --- | --- |
| Pelikansion valinta | File System Access API: `showDirectoryPicker()`, kahva tallennetaan IndexedDB:hen, ja lupa pyydetään uudelleen seuraavalla käynnistyskerralla | `<input type=file webkitdirectory>` tai yksittäinen `pak0.pak` |
| Kartan avaus | `showOpenFilePicker()`, ja tiedostokahva muistetaan | `<input type=file>` tai raahaus |
| Tallennus | Kirjoitus suoraan samaan tiedostoon (`createWritable`) | Lataus (`<a download>`) |
| Automaattinen tallennus | OPFS 30 sekunnin välein ja ennen sivun sulkemista | OPFS |
| Asetukset, viimeisimmät tiedostot | IndexedDB | IndexedDB |

Kun sovellus käynnistetään ja OPFS:ssä on uudempi automaattinen tallennus kuin tallennettu tiedosto, käyttäjältä kysytään, palautetaanko se. Sovellus on PWA ja toimii myös ilman verkkoyhteyttä.

## Kartan kääntäminen ja testaus pelissä

V1:ssä käännös tehdään selaimessa WebAssemblyksi käännetyillä qbsp3-, qvis3- ja qrad3-työkaluilla. Varavaihtoehtona `.map` vietään käyttäjän omalle koneelle käännettäväksi. Qoole ajoi samat kolme ohjelmaa ulkoisina prosesseina parametrilla `%file%` ja käynnisti pelin parametrilla `+map %file%` (`Quake2::Quake2`, `QCompile`). Selaimessa ulkoisia prosesseja ei ole, joten:

1. **WASM-käännös.** Työkalujen C-koodi käännetään Emscriptenillä, ja jokainen työkalu ajetaan omassa Web Workerissaan. Syöte ja tuloste välitetään Emscriptenin muistitiedostojärjestelmän kautta: `.map` sisään, `.bsp`, `.pts` ja `.prt` ulos. Tekstuurien `.wal`-otsakkeet annetaan työkaluille pakista. Stdout ohjataan lokiruutuun reaaliajassa. qvis3 ja qrad3 voivat kestää isoilla kartoilla minuutteja, joten käyttäjä valitsee profiilin: *nopea* (qbsp3, qvis3 `-fast`, ei qrad3:a), *normaali* tai *lopullinen* (qrad3 `-extra`).
2. **Säikeistys.** qvis3 ja qrad3 ovat monisäikeisiä. WASM-säikeet vaativat `SharedArrayBuffer`in, joka puolestaan vaatii COOP- ja COEP-otsakkeet. Isännöinnin täytyy lähettää ne, ja ilman niitä käytetään yhden säikeen käännöstä.
3. **Vuodot.** Jos qbsp3 löytää vuodon, `.pts` ladataan automaattisesti ja polku näytetään kaikissa näkymissä. Komento *Seuraava vuotopiste* siirtää kameran polkua pitkin.
4. **Testaus pelissä.** Valmis `.bsp` tallennetaan pelikansion `baseq2/maps/`-hakemistoon (Chromium) tai ladataan. Peliä ei voi käynnistää selaimesta, joten editori näyttää kopioitavan komennon `+map <nimi>`. Selaimessa toimivan Q2-portin upottaminen esikatseluun on v2:n asia.

Lisenssit tarkistetaan ennen toteutusta: id julkaisi Q2:n moottorin ja työkalujen lähdekoodin GPL-lisenssillä, mutta käytettävä työkaluversio ja sen lisenssi varmistetaan. Editori julkaistaan GPLv2-lisenssillä, joten työkalut voidaan sisällyttää, kunhan käytettävän työkaluversion lisenssi on GPLv2-yhteensopiva.

## Suorituskyky, testaus ja laatu

Tavoitteet on mitoitettu niin, että iso Q2-kartta toimii integroidulla näytönohjaimella. Ne ovat lähtöoletuksia, jotka tarkistetaan ensimmäisellä prototyypillä.

| Mittari | Tavoite | Mittaustapa |
| --- | --- | --- |
| 3D-näkymän kuvataajuus, 20 000 brushia, tekstuurit päällä | ≥ 60 fps | Kannettava, jossa integroitu näytönohjain, Chrome |
| `.map`-tiedoston avaus, 5 000 brushia, näkymät valmiina | < 2 s | Suorituskykytesti Playwrightilla |
| Yksittäisen brushin muokkauksen viive (raahaus) | < 8 ms per kehys | Performance-aikajana |
| CSG-vähennys, 1 leikkuri ja 50 leikattavaa | < 50 ms | Vitest-benchmark |
| Muistinkäyttö ilman tekstuureja, 20 000 brushia | < 300 Mt | Chromen muistiprofiili |

**Testaus:**

- **Yksikkötestit (Vitest)** geometriaytimelle ja jäsentäjille, tavoitteena vähintään 90 % rivikattavuus `core/`-kansiossa. Jokaiselle CSG-operaatiolle ominaisuuspohjaiset testit (fast-check): satunnaisista kuperista brusheista tuloksen pitää olla validi, ja vähennyksessä tilavuuksien summan pitää täsmätä toleranssin rajoissa.
- **Kierrostestit:** jokainen testiaineiston `.map` luetaan, kirjoitetaan ja luetaan uudelleen. Tietorakenteiden täytyy olla identtiset ja tekstin rivitasolla sama, kommentteja ja välilyöntejä lukuun ottamatta.
- **Kääntäjätesti:** CI kirjoittaa testikartat ja ajaa qbsp3:n WASM-versiona Nodessa. Testi epäonnistuu, jos kääntäjä varoittaa virheellisistä brusheista.
- **E2E (Playwright)** päätyönkulkuihin: avaa, luo brush, vähennä, undo, tallenna. Lisäksi kuvavertailutestit näkymille (pikselivertailu SwiftShader-ohjelmistorenderöinnillä).

**Koodin laatu:** TypeScriptin `strict`-tila, ESLint ja Prettier. `core/` ei saa tuoda mitään DOM- tai WebGL-tyyppejä, ja sääntö valvotaan ESLintin import-rajoituksella.

## Toteutusvaiheet ja päätökset

Toteutus etenee viitenä vaiheena. Jokaisen vaiheen lopussa on käyttökelpoinen versio, ja seuraava vaihe alkaa vasta, kun edellisen hyväksymiskriteeri täyttyy.

1. **Lukija ja katselin.** Pak-, wal- ja paletti-jäsentäjät, modihakemistojen hakujärjestys, `.map`-lukija ja -kirjoittaja, polygonien muodostus, neljä näkymää ja kamerat. *Valmis, kun* vanilla-Q2:n kartta aukeaa tekstuureineen ja kierrostesti menee läpi.
2. **Brushien muokkaus.** CommandBus ja undo, valinta, siirto, kierto ja skaalaus, uusi brush, hila, JSON-projektin tallennus, .map-vienti ja automaattinen tallennus. *Valmis, kun* yksinkertaisen huoneen voi rakentaa tyhjästä ja tallentaa, ja qbsp3 hyväksyy sen ilman varoituksia.
3. **CSG ja tekstuurit.** Vähennys, leikkaus, onton tekeminen, tasoleikkaus, peilaus, verteksi-, reuna- ja sivumuokkaus, tekstuurityökalut ja -lukko sekä pinnan liput. *Valmis, kun* ominaisuuspohjaiset CSG-testit menevät läpi ja tekstuurit näkyvät editorissa ja pelissä samoin.
4. **Entiteetit ja rakenne.** Määritystiedoston jäsennin, entiteettipaneeli, brush-entiteetit, puunäkymä, ryhmät ja ryhmän sisälle meneminen, prefabit, md2-esikatselu ja `target`-viivat. *Valmis, kun* toimiva yksinpelikenttä (pelaajan aloituspiste, ovi, nappi, vihollinen) voidaan tehdä alusta loppuun.
5. **Käännös ja viimeistely.** WASM-työkalut, vuotopolku, käännösprofiilit, PWA, suorituskykytavoitteet ja Firefox/Safari-tuki. *Valmis, kun* suorituskykytaulukon tavoitteet täyttyvät ja kartta kääntyy pelattavaksi BSP-tiedostoksi poistumatta selaimesta.

**Päätökset 24.11.2026:**

- **Lisenssi:** GNU General Public License v2.0. Qoolen (GPL v2 tai myöhempi) ja Q2-työkalujen koodia saa käyttää.
- **Projektiformaatti:** oma JSON-formaatti on ensisijainen tallennusmuoto, ja `.map` on vientiformaatti.
- **Modit:** Q2-modien tekstuurit ja pelihakemistot tuetaan v1:ssä.

**Tarkennetaan myöhemmin:**

- [ ] Entiteettimääritykset: kirjoitetaanko oma Q2-määritystiedosto vai käytetäänkö olemassa olevaa (lisenssin pitää olla GPLv2-yhteensopiva), ja miten modien omat entiteetit lisätään. Päätös tarvitaan ennen vaihetta 4.
- [ ] Qoolen `.qle`-tiedostojen tuonti siirtyy v1:n jälkeiseen vaiheeseen. Lukija voidaan tehdä lähdekoodin `LoadObjFile`- ja `ReadBoundGeometry`-funktioiden pohjalta.
