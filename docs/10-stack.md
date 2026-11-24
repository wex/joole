# Käytetyt teknologiat

Tämä dokumentti kuvaa Joolen teknologiapinon: mitä käytetään, mihin ja millä rajoituksilla. Toiminnalliset vaatimukset ovat määrittelyssä ([00-spec.md](00-spec.md)), ja ulkoiset lähdeprojektit on listattu tiedostossa [20-sources.md](20-sources.md).

Versiot on kirjattu pääversioina. Tarkat versiot lukitaan `package.json`- ja `pnpm-lock.yaml`-tiedostoihin. Uuden riippuvuuden tai version pitää olla julkaistu vähintään 7 päivää ennen käyttöönottoa (ks. [Riippuvuuksien hallinta](#riippuvuuksien-hallinta)). Tilanne on tarkistettu 24.11.2026.

## Yhteenveto

| Alue | Teknologia | Pääversio | Käyttötarkoitus |
| --- | --- | --- | --- |
| Kieli | TypeScript (natiivi `tsc`) | 7 | Kaikki sovelluskoodi, `strict`-tila |
| Ajoympäristö (kehitys, CI) | Node.js LTS | 26 | Työkalut, testit, `core/`-ytimen ajo ilman selainta |
| Paketinhallinta | pnpm | 12 | Riippuvuudet, skriptit, lukkotiedosto |
| Build ja kehityspalvelin | Vite | 8 | Kehityspalvelin, tuotantobuild, workerit, staattiset resurssit |
| UI | Solid (`solid-js`, `@solidjs/web`) | 2 | Paneelit: ominaisuudet, puu, tekstuuriselain, loki, valikot |
| Solidin Vite-integraatio | `@solidjs/vite-plugin` | 3 | JSX-muunnos Solid 2:lle |
| Renderöinti | WebGL2 + GLSL ES 3.00 | – | Kaikki neljä näkymää yhdessä canvasissa, ei 3D-kirjastoa |
| Tunnisteet | nanoid | 6 | Solmujen pysyvät `Id`-tunnisteet |
| Natiivityökalut | Emscripten (emsdk) | 7 | qbsp3, qvis3 ja qrad3 WebAssemblyksi |
| PWA | vite-plugin-pwa (Workbox) | 2 | Service worker ja offline-käyttö (vaihe 5) |
| Tyylit | CSS Modules (Viten sisäänrakennettu) + CSS Grid | – | Paneelien tyylit ja asettelu |
| Isännöinti | Cloudflare Pages | – | Staattinen tuotantoisännöinti COOP- ja COEP-otsakkeineen |
| CI | GitHub Actions | – | Tarkistukset, E2E ja WASM-buildin toistettavuus |
| Yksikkötestit | Vitest + `@vitest/coverage-v8` | 5 | `core/`-ydin, jäsentäjät, benchmarkit, kattavuus |
| Ominaisuuspohjaiset testit | fast-check | 4 | CSG- ja geometriainvariantit |
| E2E ja kuvavertailu | Playwright | 1 | Työnkulut, suorituskykytestit, näkymien pikselivertailu |
| Lint | ESLint (flat config) + typescript-eslint + eslint-plugin-import-x + eslint-plugin-solid | 10 / 8 / 4 / 0.20 | Kerrosrajat, tyyppisäännöt, Solid 2 -säännöt |
| Muotoilu | Prettier | 3 | Yhtenäinen koodityyli |

## Kieli ja tyypitys: TypeScript 7

TypeScript 7 on Go-kielinen natiivitoteutus, jonka `tsc` on moninkertaisesti nopeampi kuin 5.x- ja 6.x-sarjan kääntäjä. Sitä käytetään vain tyyppitarkistukseen (`tsc -b --noEmit`). Vite ja Vitest poistavat tyypit omalla muunnoksellaan, joten build ei riipu `tsc`:stä.

- **Lähtöasetukset:** `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`, `isolatedModules`, `moduleResolution: "bundler"`, `target`/`lib` vähintään ES2023.
- **Kerroskohtaiset `tsconfig`-projektit** (project references):
  - `core/` ja `game/q2/`: `"lib": ["ES2023"]` ilman `DOM`- ja `WebWorker`-kirjastoja ja `"types": []`, jolloin globaalit DOM- ja WebGL-tyypit (`document`, `WebGL2RenderingContext`) ja Noden tyypit ovat käännösvirheitä. Importtirajoitus ei yksin riitä, koska nämä tyypit eivät tule importeista.
  - `app/`, `render/`, `platform/` ja `ui/`: `DOM`-kirjasto. `src/main.ts` kuuluu samaan projektiin.
  - `workers/`: `WebWorker`-kirjasto ilman `DOM`:ia.
  - Testit (`*.test.ts`, `*.bench.ts`): oma projekti, jossa ovat Vitestin ja `@types/node`:n tyypit. Lähdekoodin projektit eivät sisällä testitiedostoja, joten testityypit eivät vuoda ytimeen.
- **Tunnettu rajoitus:** typescript-eslint 8 tukee TypeScriptin JS-API:a vain versioon < 6.1, eikä TS 7 tarjoa sitä vielä vakaana. Siksi TS 6.0 asennetaan rinnalle typescript-eslintin parseria ja tyyppitietoisia sääntöjä varten (esim. pnpm-aliaksena tai `packageExtensions`-asetuksella), ja tyyppitarkistuksen tekee TS 7. Mekanismi valitaan ja kirjataan tähän projektipohjaa luotaessa. Kun typescript-eslint tukee TS 7:ää, TS 6 poistetaan.
- **Editori:** TS 7:n natiivi kielipalvelin. VS Codessa käytetään työtilan TypeScript-versiota.

## Ajoympäristö ja paketinhallinta: Node.js 26 LTS ja pnpm 12

Sovellus ajetaan selaimessa. Nodea tarvitaan vain kehityksessä ja CI:ssä: Vite, testit, ESLint ja WASM-työkalujen Node-testiajo (kääntäjätesti). Node 26 on ollut Active LTS -versio 28.10.2026 alkaen.

- Versio lukitaan `.nvmrc`- ja `package.json`-tiedoston `engines.node`-kenttään (`>=26`).
- pnpm valitaan, koska sen tiukka riippuvuuseristys estää käyttämästä paketteja, joita ei ole listattu `package.json`:ssa, ja koska sen asennukset ovat nopeita. Versio lukitaan `packageManager`-kenttään. Corepack ei enää sisälly Node 25+:aan, joten pnpm asennetaan erikseen (`npm install -g pnpm@12` tai pnpm:n oma asennusskripti).
- Repo on yksi paketti, ei monorepo. `pnpm-workspace.yaml` luodaan vain pnpm:n asetuksia varten.

### Riippuvuuksien hallinta

- `pnpm-workspace.yaml`: `minimumReleaseAge: 10080` (7 vrk minuutteina). pnpm ei silloin asenna alle viikon vanhoja versioita, mikä suojaa toimitusketjuhyökkäyksiltä. Asetusta ei saa ohittaa build-ongelmien kiertämiseksi.
- Versiot `^`-muodossa ja lukkotiedosto versionhallintaan. CI asentaa komennolla `pnpm install --frozen-lockfile`.
- Ajonaikaisia riippuvuuksia pidetään tarkoituksella vähän: Solid, nanoid ja PWA-ajonaikainen osa. Matematiikka, geometria, jäsentäjät ja renderöinti ovat omaa koodia.
- Huom. Solid 2.0.0 ja `@solidjs/vite-plugin` 3.0 julkaistiin 17.11.2026. Ne täyttävät 7 päivän säännön, mutta tuoreimmat 2.0.x-korjausversiot eivät välttämättä vielä täytä sitä.

## Build ja kehityspalvelin: Vite 8

Vite tarjoaa kehityspalvelimen ja tuotantobuildin (Rolldown).

- **Workerit:** `new Worker(new URL('./x.worker.ts', import.meta.url), { type: 'module' })`. Vite niputtaa workerit erikseen. Käyttökohteet: tekstuurien `.wal` → RGBA8 -muunnos ja qbsp3/qvis3/qrad3-ajot.
- **WASM ja resurssit:** Emscriptenin tuottamat `.wasm`-tiedostot ladataan `?url`-importilla, ja varjostimet ladataan merkkijonoina `?raw`-importilla.
- **COOP/COEP:** `server.headers` ja `preview.headers` asettavat `Cross-Origin-Opener-Policy: same-origin` ja `Cross-Origin-Embedder-Policy: require-corp`, jotta `SharedArrayBuffer` ja säikeistetty WASM toimivat myös kehityksessä. Tuotannossa Cloudflare Pages lähettää samat otsakkeet `public/_headers`-tiedoston perusteella (ks. [Isännöinti ja CI](#isännöinti-ja-ci)).
- **Polkualiakset** vastaavat hakemistorakennetta (`@core/*`, `@game/*`, `@app/*`, `@render/*`, `@platform/*`, `@ui/*`). `workers/`-hakemistolle ei tehdä aliasta, koska sitä ei tuoda muualta. Ne määritellään sekä `tsconfig`- että Vite-asetuksissa.

## UI: Solid 2

Solid 2 (`solid-js` 2 ja `@solidjs/web` 2) valitaan paneelikirjastoksi. Hienojakoinen reaktiivisuus päivittää vain ne DOM-solmut, joiden data muuttuu, eikä virtuaali-DOMia tarvita. Tämä sopii hyvin malliin, jossa jokainen komento tuottaa patchin muuttuneista solmuista.

- **Käyttöalue:** vain `ui/`-kerros, eli paneelit, valikot, dialogit, puunäkymä, tekstuuri- ja prefabiselain sekä lokiruutu. Näkymien `<canvas>` on yksi DOM-elementti, jonka Solid luo mutta ei renderöi. Renderöijä piirtää sen itse. Sen rajapinta ottaa vastaan vain ytimen tyyppejä (`MapDocument`, `Patch`, kameran tiedot), ja `src/main.ts` kytkee sen `app/`-kerroksen muutosilmoitusten tilaajaksi. `render/` ei tuo `app/`- eikä `ui/`-hakemistoa (ks. määrittelyn kerrossäännöt).
- **Tilan silta:** `app/` tarjoaa valinnan, asetukset ja dokumentin muutosilmoitukset. `ui/` muuttaa ne Solidin signaaleiksi ja storeiksi. `core/`, `game/`, `app/`, `render/`, `platform/` ja `workers/` eivät tuo `solid-js`:ää.
- **Vite-integraatio:** `@solidjs/vite-plugin` 3 (Babel-pohjainen JSX-muunnos). Vanha `vite-plugin-solid` 2.x on Solid 1:lle, eikä sitä asenneta.
- **Solid 2:n API eroaa Solid 1:stä:** `createResource`, `batch`, `startTransition`, `on`, `produce`, `createComputed` ja `createMutable` on poistettu, ja asynkronisuus kulkee `createMemo`n ja `<Loading>`-komponentin kautta. Solid 1:n esimerkkejä tai dokumentaatiota ei käytetä sellaisenaan (Solid 1:n dokumentaatio on osoitteessa v1.solidjs.com). Solid 2:n kehitysbuild raportoi reaktiivisuusvirheet diagnostiikkakoodeina, joten ne korjataan, eikä niitä ohiteta.
- **Tyylit ja asettelu:** CSS Modules (`*.module.css`), jonka Vite tukee ilman lisäriippuvuuksia. Jokaisella komponentilla on oma moduulinsa, ja luokkanimet ovat komponenttikohtaisia. Teeman värit ja mitat ovat globaaleina CSS-muuttujina yhdessä tiedostossa. Pääasettelu (neljä näkymää, sivu- ja alapaneelit) tehdään CSS Gridillä.

## Renderöinti: WebGL2 ilman 3D-kirjastoa

Raaka WebGL2-rajapinta valitaan, koska renderöinti on kapea-alaista ja täysin hallittua: teksturoidut kuperat polygonit, rautalanka, hila ja kahvat. Three.js:n kaltainen kirjasto toisi oman scenegraphin, joka kilpailisi dokumenttimallin kanssa.

- Yksi WebGL2-konteksti ja yksi canvas. Näkymät rajataan `gl.viewport`- ja `gl.scissor`-kutsuilla.
- Varjostimet kirjoitetaan GLSL ES 3.00:lla (`#version 300 es`) omina `.glsl`-tiedostoinaan `render/`-hakemistossa.
- Paksut viivat piirretään instansoiduilla nelikulmioilla, ja hila piirretään proseduraalisesti fragmenttivarjostimessa.
- Tekstuurit: `REPEAT`, `generateMipmap`, `NEAREST_MIPMAP_LINEAR`.
- Matematiikka (vektorit, matriisit, tasot) on omaa koodia `core/`-ytimessä float64-tarkkuudella. `Float32Array`-muunnos tehdään vasta GPU-puskureita kirjoitettaessa. gl-matrixin kaltaisia kirjastoja ei käytetä.
- Poiminta tehdään prosessorilla `core/geom/`-moduulin BVH-puulla eikä GPU:n ID-puskurilla.

## Geometriaydin ja tiedostoformaatit

`core/` on riippuvuudeton TypeScript-koodi, jonka ainoa ulkoinen riippuvuus on nanoid tunnisteille. Kaikki jäsentäjät ovat puhtaita funktioita (`ArrayBuffer` tai `string` sisään, tietorakenne ulos). Niitä ajetaan sekä selaimessa että Nodessa.

Moduulit on lueteltu riippuvuusjärjestyksessä: kukin saa tuoda vain yllä olevia.

| Moduuli | Sisältö | Ulkoinen viite |
| --- | --- | --- |
| `core/types` | tietomallin tyypit (`Id`, `Vec3`, `Plane`, `FaceTexture`, `Face`, solmutyypit, `MapDocument`, `Patch`), ei ajonaikaista koodia | – |
| `core/geom` | vektori- ja matriisilaskenta, tasot, windingit, CSG, poiminta, BVH, toleranssit (`PLANE_EPS`, `POINT_EPS`) | Qoole `source/Objects/Geometry.cpp`, Quake-2-Tools `common/polylib.c` |
| `core/doc` | solmujen luonti (nanoid), komentojen toteutukset (`Command.run` → `Patch`), patchien soveltaminen | Qoole `source/Qoole/QooleOp.cpp` |
| `core/formats` | `.map`, `.pak`, `.pkz` (ZIP), `.wal`, `.pcx`, `.md2`, entiteettimääritykset, `.pts`, `.joole.json` | q2pro `inc/format/*.h` ja `src/common/files.c` (`load_zip_file`), Quake-2-Tools `common/qfiles.h` |
| `game/q2` | paletti, pinta- ja contents-liput, hakemistot, käännösprofiilit, oletustekstuuri | Qoole `source/Game/Quake2.cpp` |

CommandBus, undo-historia (yhdistäminen, muistiraja) ja valinta ovat `app/`-kerroksessa. Ne käyttävät `core/doc`-moduulin puhtaita funktioita.

## Selaimen alusta-API:t (`platform/`)

| API | Käyttötarkoitus | Tuki |
| --- | --- | --- |
| File System Access API (`showDirectoryPicker`, `showOpenFilePicker`, `createWritable`) | Pelikansion valinta, kartan avaus ja tallennus suoraan tiedostoon, `.bsp`:n kirjoitus `baseq2/maps/`-hakemistoon | Chromium |
| `<input type=file webkitdirectory>`, raahaus, `<a download>` | Varapolku avaukseen ja tallennukseen | Firefox, Safari |
| `Blob.slice` | `.pak`-tiedostojen luku osina ilman koko tiedoston lataamista muistiin | Kaikki |
| OPFS (Origin Private File System) | Automaattinen tallennus, prefabit, muunnettujen tekstuurien välimuisti | Kaikki |
| IndexedDB | Asetukset, viimeisimmät tiedostot, File System Access -kahvat | Kaikki |
| Web Workers | Tekstuurimuunnos, WASM-kääntäjät | Kaikki |
| `SharedArrayBuffer` + COOP/COEP | Säikeistetty qvis3/qrad3 | Kaikki, kun otsakkeet ovat paikallaan |
| Pointer Lock API | 3D-näkymän lentokamera | Kaikki |
| Service Worker | PWA, offline-käyttö | Kaikki |

Ominaisuuksien tuki tarkistetaan ajonaikaisesti (feature detection), ei selaimen nimen perusteella.

## Q2-kääntäjät: Emscripten 7

qbsp3, qvis3 ja qrad3 käännetään WebAssemblyksi id Softwaren alkuperäisestä [Quake-2-Tools](https://github.com/id-Software/Quake-2-Tools)-lähdekoodista (`ext/Quake-2-Tools`). Tiedostojen otsakkeiden mukaan lisenssi on "GPL v2 tai myöhempi". Versiovalinta on kirjattu määrittelyn päätöksiin 24.11.2026.

- **Mallipohja:** q3edit kääntää vastaavasti q3mapin (`q3map-compiler/Makefile`, `src/q3map-worker.ts`). Lähtöliput: `-sMODULARIZE=1`, `-sEXPORT_NAME=…`, `-sFORCE_FILESYSTEM=1`, `-sINVOKE_RUN=0`, `-sEXIT_RUNTIME=0`, `-sALLOW_MEMORY_GROWTH=1` ja `-sEXPORTED_RUNTIME_METHODS=FS,callMain`. Ympäristönä `web,worker,node`, jotta sama build toimii myös CI:n kääntäjätestissä Nodessa.
- **Kaksi buildia per työkalu:** säikeistetty (`-pthread`, vaatii COOP/COEP:n) ja yksisäikeinen varabuild. Quake-2-Toolsin `common/threads.c` on kirjoitettu Win32- ja pthreads-rajapinnoille, joten se sovitetaan Emscriptenin pthreads-tukeen.
- **Natiivikoodi** on `tools/`-hakemistossa: kopio tarvittavista Quake-2-Toolsin tiedostoista, Emscripten-muutokset, Makefile ja README, johon jokainen muutos alkuperäiseen kirjataan q3editin tapaan.
- **Vaiheistus:** yksisäikeinen `qbsp3.wasm` (ympäristö `node`) tehdään vaiheessa 2 kääntäjätestiä varten. Selainbuildit, qvis3, qrad3 ja säikeistys tehdään vaiheessa 5.
- **Jakelu ja toistettavuus:** valmiit `.wasm`-tiedostot ja niiden JS-liimakoodi commitoidaan `workers/`-hakemistoon, joten kehittäjä ei tarvitse emsdk:ta. CI buildaa ne uudelleen lukitulla `emscripten/emsdk`-Docker-kuvalla ja epäonnistuu, jos tulos poikkeaa commitoiduista tiedostoista. Ensimmäisen buildin yhteydessä varmistetaan, että tuloste on deterministinen (ei aikaleimoja eikä absoluuttisia polkuja). `pnpm build:tools` ajaa saman buildin paikallisesti.

## Testaus

| Työkalu | Kohde | Huomiot |
| --- | --- | --- |
| Vitest 5 | `core/`, `game/q2/`, `app/` (Node-ympäristö) | Kattavuus `@vitest/coverage-v8`:lla, tavoite ≥ 90 % riveistä `core/`-hakemistossa. Benchmarkit (`vitest bench`) suorituskykytaulukon CSG-tavoitteille. |
| fast-check 4 | CSG-operaatiot, polygonien muodostus, tekstuurilukko | Satunnaisilla kuperilla brusheilla tarkistetaan tuloksen validius ja tilavuuksien säilyminen. |
| Vitest + WASM | Kääntäjätesti | qbsp3.wasm ajetaan Nodessa testikartoilla, ja testi epäonnistuu varoituksista. |
| Playwright 1 | E2E, suorituskyky, kuvavertailu | Pääselain on Chromium. Kuvavertailu ajetaan headless-Chromiumilla SwiftShader-ohjelmistorenderöinnillä (`--use-angle=swiftshader`), jotta tulos on sama joka koneella. Firefox ja WebKit testataan vaiheessa 5 lataus- ja tallennuspolkujen osalta. |

UI-komponenttien yksikkötestaukseen tarkoitettu `@solidjs/testing-library` on Solid 2:lle vasta RC-versiona, joten sitä ei oteta perusstackiin. Paneelit testataan Playwrightilla, ja paneelien logiikka pidetään `app/`-kerroksessa, jossa se on Vitestillä testattavissa.

## Koodin laatu

- **ESLint 10** flat-konfiguraatiolla (`eslint.config.js`) ja **typescript-eslint 8**:lla (ks. TS 7 -rajoitus yllä).
- **Kerrosrajat** määritellään määrittelyn kohdassa *Kerrosjärjestys ja riippuvuussäännöt*, ja niitä valvotaan **eslint-plugin-import-x 4**:n säännöllä `import-x/no-restricted-paths`. Alkuperäinen `eslint-plugin-import` (2.x) ei tue ESLint 10:tä. Polkualiakset (`@core/*` ym.) ratkaistaan `eslint-import-resolver-typescript`-paketilla (`createTypeScriptImportResolver`), jotta vyöhykkeet tunnistavat myös aliastuonnit. `src/main.ts` ei ole minkään vyöhykkeen kohteena, joten se saa tuoda kaikkea. Lähtökonfiguraatio:

  ```js
  'import-x/no-restricted-paths': ['error', { zones: [
    { target: './src/core', from: ['./src/game', './src/app', './src/render', './src/platform', './src/ui', './workers'] },
    { target: './src/core/types', from: ['./src/core/geom', './src/core/doc', './src/core/formats'] },
    { target: './src/core/geom', from: ['./src/core/doc', './src/core/formats'] },
    { target: './src/core/doc', from: ['./src/core/formats'] },
    { target: './src/game', from: ['./src/app', './src/render', './src/platform', './src/ui', './workers'] },
    { target: ['./src/render', './src/platform'], from: ['./src/app', './src/ui'] },
    { target: './src/platform', from: './src/render' },
    { target: './src/app', from: './src/ui' },
    { target: './workers', from: ['./src/app', './src/ui', './src/render'] },
    { target: ['./src/app', './src/render', './src/platform', './src/ui'], from: './workers' },
  ]}]
  ```

  Viimeinen vyöhyke varmistaa, että workereihin yhteys on vain viesteillä. `new Worker(new URL(…, import.meta.url))` ei ole import, joten worker-asiakkaat `platform/`-hakemistossa toimivat. Pakettitason rajoitukset tehdään sisäänrakennetulla `no-restricted-imports`-säännöllä: `solid-js` ja `@solidjs/*` ovat sallittuja vain `ui/`-hakemistossa. `core/types`-moduulin tuonneissa vaaditaan `import type` -muoto (`@typescript-eslint/consistent-type-imports`).
- **eslint-plugin-solid** otetaan käyttöön `ui/`-hakemistolle sen `v2`-konfiguraatiolla. Konfiguraatio sisältää Solid 2:n säännöt (esim. `solid/removed-api`, joka estää Solid 1:n poistettujen API:en käytön). Tuki on tarkistettu paketin README:stä 24.11.2026.
- **Prettier 3** muotoilee koodin. ESLintin tyylisäännöt on poistettu käytöstä (`eslint-config-prettier`), jotta työkalut eivät ole ristiriidassa.

## Lähdeprojektien rooli

Lähteet on kuvattu tiedostossa [20-sources.md](20-sources.md), ja niiden paikalliset kopiot ovat hakemistossa `ext/<repo>/`. Taulukossa on lähdeprojektien tärkeimmät tiedostot teknisten ratkaisujen kannalta, ja polut ovat suhteessa repon juureen (esim. `ext/q2pro/inc/format/pak.h`). Kaikki ovat lisenssiltään "GPL v2 tai myöhempi", joten koodia saa siirtää Jooleen (`GPL-2.0-or-later`), kun tekijänoikeusmerkinnät säilytetään.

| Lähde | Tiedostot | Mitä sieltä otetaan |
| --- | --- | --- |
| [q2pro](https://github.com/q2pro/q2pro) | `inc/format/{pak,wal,pcx,md2,bsp}.h`, `src/common/files.c`, `src/refresh/images.c`, `src/refresh/models.c` | Binääriformaattien rakenteet, pak- ja hakemistojen hakujärjestys (modit), md2:n luku |
| [Quake-2](https://github.com/id-Software/Quake-2) | `qcommon/files.c` (`FS_AddGameDirectory`), `qcommon/qfiles.h`, `game/*.c` (`/*QUAKED*/`-lohkot, spawn-funktiot), `ctf/*.c` | Vanilla-moottorin käytös (hakujärjestys), entiteettimääritysten generointi ja md2-taulukko, esimerkki modin määrityksistä (CTF) |
| [Quake-2-Tools](https://github.com/id-Software/Quake-2-Tools) `qe4/` | `eclass.c`, `csg.c` (`CSG_MakeHollow`, `CSG_Subtract`), `brush.c`, `map.c`, `points.c`, `vertsel.c`, `select.c`, `textures.c` | id:n oma Q2-editori QuakeEd 4: `/*QUAKED … */`-entiteettimääritysten jäsennys, CSG ja onton tekeminen, brushien luonti tasoista, `.map`-luku ja -kirjoitus, vuotopistetiedosto, verteksimuokkaus |
| [Quake-2-Tools](https://github.com/id-Software/Quake-2-Tools) | `common/qfiles.h`, `bsp/qbsp3/textures.c` (`TextureAxisFromPlane`, `TexinfoForBrushTexture`), `bsp/qbsp3/map.c`, `bsp/qbsp3/leakfile.c` | Pinta- ja contents-lippujen vakiot, UV-laskenta täsmälleen kuten kääntäjässä, `.map`-jäsennyksen säännöt, `.pts`-formaatti, WASM-käännettävä koodi |
| [Qoole](https://github.com/demoth/qoole) | `source/Objects/Geometry.cpp`, `source/Objects/EntList.cpp`, `source/Game/Quake2.cpp`, `source/Qoole/QooleOp.cpp`, `source/Render/Selector.cpp` | Editorin toimintalogiikka: CSG, onton tekeminen, tasoleikkaus, operaatiot ja undo, poiminta |
| [q3edit](https://github.com/drdator/q3edit) | `q3map-compiler/Makefile`, `src/q3map-worker.ts`, `src/gl-utils.ts`, `src/pak.ts`, `src/map-parser.ts` | Emscripten-liput ja worker-malli kääntäjille, WebGL2-käytännöt, selainpuolen pak- ja map-käsittely |

## Isännöinti ja CI

**Cloudflare Pages** isännöi tuotantobuildin (`dist/`). Tiedosto `public/_headers` asettaa kaikille poluille otsakkeet `Cross-Origin-Opener-Policy: same-origin` ja `Cross-Origin-Embedder-Policy: require-corp`, jotta `SharedArrayBuffer` ja säikeistetty WASM toimivat. COEP edellyttää, että kaikki resurssit tulevat samasta originista. Tämä sopii yhteen sen periaatteen kanssa, ettei ulkoisia ajonaikaisia pyyntöjä tehdä. PWA:n service worker tarjoillaan samasta originista. Julkaisu tehdään GitHub-integraatiolla tai CI:stä.

**GitHub Actions** ajaa CI:n jokaiselle pull requestille ja `main`-haaralle:

- `pnpm install --frozen-lockfile`, `pnpm check` ja `pnpm e2e` (Playwright, Chromium ja SwiftShader). Node 26 asennetaan `actions/setup-node`-actionilla ja pnpm `pnpm/action-setup`-actionilla.
- WASM-työ: `tools/` buildataan `emscripten/emsdk`-Docker-kuvalla ja verrataan commitoituihin `.wasm`-tiedostoihin.
- Kolmannen osapuolen actionit lukitaan commit-SHA:han eikä tagiin.

Repolla ei vielä ole etärepoa. Se luodaan GitHubiin ennen kuin CI otetaan käyttöön.

## Viitekoodin rajaus työkaluista (`ext/`)

`ext/` sisältää lähdeprojektien kloonit, joissa on muun muassa satoja TypeScript-tiedostoja, omia testejä (`ext/q3edit/tests/*.test.ts`), `package.json`-tiedostoja ja `index.html` (q3edit). Ne eivät saa päätyä Joolen buildiin, testeihin eikä tarkistuksiin. Siksi:

- **tsconfig:** `include` listaa vain `src/`-, `workers/`- ja `tests/`-hakemistot.
- **Vitest:** `include` rajataan hakemistoihin `src/` ja `tests/`, eikä oletusarvoista `**/*.test.ts`-hakua käytetä.
- **Playwright:** `testDir` on `tests/e2e`.
- **ESLint:** globaali `ignores: ['ext/**']` flat-konfiguraatiossa.
- **Prettier:** `ext/` lisätään tiedostoon `.prettierignore`. Prettier noudattaa myös `.gitignore`a, mutta erillinen merkintä tekee rajauksen näkyväksi.
- **Vite:** `optimizeDeps.entries: ['index.html']`, koska Vite muuten skannaa riippuvuuksia projektin kaikista HTML-tiedostoista, myös `ext/q3edit/index.html`:stä. Lisäksi `server.watch.ignored` sisältää polun `**/ext/**`, jotta kehityspalvelin ei seuraa tuhansia viitetiedostoja.
- **pnpm:** `pnpm-workspace.yaml` sisältää vain asetuksia eikä `packages`-listaa, joten `ext/`:n `package.json`-tiedostot eivät muutu workspace-paketeiksi.

## Avoimet teknologiapäätökset

- [ ] **TS 7 ja typescript-eslint:** kuinka TS 6 asennetaan rinnalle (alias tai `packageExtensions`). Päätetään projektipohjaa luotaessa.
