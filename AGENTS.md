# AGENTS.md – Joole

Joole on selaimessa toimiva brush-pohjainen Quake 2 -karttaeditori (TypeScript, WebGL2, Solid 2). Toiminnallinen esikuva on Qoole 99. Lisenssi on GNU GPL v2.0 tai myöhempi (`GPL-2.0-or-later`).

Tämä tiedosto on ohje sekä ihmiskehittäjille että koodausagenteille: mistä tieto löytyy, miten kehitys etenee ja mitä sääntöjä noudatetaan.

## Dokumentaatio

| Tiedosto | Sisältö | Milloin päivitetään |
| --- | --- | --- |
| [docs/00-spec.md](docs/00-spec.md) | Tekninen määrittely: tavoitteet, rajaus, arkkitehtuuri, tietomalli, formaatit, algoritmit, toteutusvaiheet, päätökset | Kun toiminnallisuus, rajaus tai arkkitehtuuri muuttuu tai kun "tarkistetaan ennen toteutusta" -kohta on tarkistettu |
| [docs/10-stack.md](docs/10-stack.md) | Teknologiat, pääversiot, käyttötarkoitukset ja rajoitukset | Kun riippuvuus lisätään, poistetaan tai sen pääversio vaihtuu, tai kun teknologiapäätös tehdään |
| [docs/20-sources.md](docs/20-sources.md) | Ulkoiset lähdeprojektit, niiden käyttötarkoitus ja paikalliset kopiot `ext/`-hakemistossa | Kun uusi lähde otetaan käyttöön (kloonataan myös `ext/`-hakemistoon) |
| [PLAN.md](PLAN.md) | Toteutussuunnitelma: vaiheet 0–5, työpaketit (`P<vaihe>.<n>`), riippuvuudet, portit ja riskit (englanniksi) | Kun työpaketti valmistuu (valintaruutu), kun järjestys tai jako muuttuu, tai kun määrittely muuttuu |
| `AGENTS.md` | Kehitysprosessi, komennot ja käytännöt | Kun komento, prosessi tai käytäntö muuttuu |

**Säännöt:**

- **Määrittely on normatiivinen.** Jos toteutus poikkeaa määrittelystä, määrittely päivitetään samassa muutoksessa, tai muutos jätetään tekemättä ja asiasta kysytään. Koodia ei kirjoiteta määrittelyn vastaisesti.
- **Tieto on yhdessä paikassa.** Teknologiat ja versiot ovat vain tiedostossa `10-stack.md`, ja määrittely viittaa sinne. Toiminnalliset vaatimukset ovat vain määrittelyssä.
- **Päätökset kirjataan** määrittelyn kohtaan *Päätökset pp.kk.vvvv* päivämäärän kanssa. Avoimet asiat ovat `- [ ]`-tehtävinä *Tarkennetaan myöhemmin* -listassa (määrittely) tai *Avoimet teknologiapäätökset* -listassa (stack). Ratkaistu kohta merkitään tehdyksi tai siirretään päätöksiin.
- **Numerointi:** `docs/`-tiedostot numeroidaan kymmenin (`00`, `10`, `20` …). Uusi dokumentti saa seuraavan vapaan numeron, esim. `30-testdata.md`.
- **Kaaviot** kirjoitetaan Mermaid-muodossa (` ```mermaid `), jotta ne näkyvät GitHubissa ja ovat luettavissa tekstinä. Upotettuja kuvia tai ulkoisia kaaviotyökaluja ei käytetä.
- **Kieli:** dokumentaatio kirjoitetaan suomeksi. Poikkeus: `PLAN.md` on omistajan pyynnöstä englanniksi. Koodin tunnisteet, koodikommentit ja commit-viestit kirjoitetaan englanniksi. Tiedostonimet, tunnisteet ja komennot merkitään dokumenteissa `koodina`.

## Projektin tila

Repossa on toistaiseksi vain dokumentaatio. Toteutus etenee [PLAN.md](PLAN.md):n mukaan, ja ensimmäinen vaihe on vaihe 0 (*Foundations*: etärepo, `package.json`, `tsconfig`-projektit, Vite, ESLint, Prettier, Vitest, Playwright ja CI). Alla olevat komennot ja hakemistot kuvaavat tavoitetilaa. Kun projektipohja on tehty (P0.9), tämä osio päivitetään vastaamaan todellista tilaa.

## Hakemistorakenne ja kerrossäännöt

Kerrosarkkitehtuuri, kaavio ja riippuvuussäännöt ovat määrittelyn kohdassa *Arkkitehtuuri* (*Kerrosjärjestys ja riippuvuussäännöt*). ESLint-konfiguraatio on stackin kohdassa *Koodin laatu*. Alla on tiivistelmä.

```text
docs/             määrittely, stack, lähteet
ext/              lähdeprojektien Git-kloonit, vain luettavaksi (ei koskaan Gitiin)
src/
  main.ts         käynnistys: ainoa tiedosto, joka saa tuoda kaikkia kerroksia
  core/types/     tietomallin jaetut tyypit (vain tyyppejä)
  core/geom/      tasot, windingit, CSG, poiminta, BVH
  core/doc/       dokumenttimalli, komennot, patchit
  core/formats/   map, pak, pkz, wal, pcx, md2, def, pts, projekti (.joole.json)
  game/q2/        Q2-vakiot ja -oletukset, generoitu q2.def, md2-taulukko
  app/            CommandBus ja undo, valinta ja scope, asetukset, työkalujen logiikka
  render/         WebGL2, varjostimet, näkymien piirto
  platform/       tiedostot, OPFS, IndexedDB, worker-asiakkaat
  ui/             Solid-paneelit, näkymien syöte ja kamerat
workers/          tekstuurimuunnos, qbsp3/qvis3/qrad3.wasm (commitoidut buildit)
tools/            Q2-kääntäjien C-lähdekoodi, Emscripten-build ja muutoslista (README)
tests/            E2E-testit (Playwright) ja testiaineisto
```

Yksikkötestit sijoitetaan testattavan tiedoston viereen (`foo.ts` → `foo.test.ts`).

**Riippuvuusjärjestys** ylhäältä alas: **UI (`ui/`) → sovellus (`app/`) → alusta (`render/`, `platform/`, `workers/`) → ydin (`core/`)**. `game/q2/` on ytimen ja muiden kerrosten välissä. Kerros saa tuoda vain alempia kerroksia ja ydintä.

**Ehdottomat säännöt** (valvotaan `import-x/no-restricted-paths`-säännöllä ja tsconfig-projekteilla):

1. `core/` ei tuo muita `src/`-kerroksia eikä käytä DOM-, WebGL- tai Node-rajapintoja. Ulkoisista paketeista se käyttää vain nanoidia. Se ajetaan sellaisenaan Nodessa.
2. Ytimen sisäinen järjestys on `core/types` ← `core/geom` ← `core/doc` ← `core/formats`. `core/types` sisältää vain tyyppejä, ja sitä tuodaan `import type` -muodossa.
3. `game/q2/` saa tuoda vain `core/`:ta, eikä ydin tuo `game/q2/`:ta. Pelikohtaiset vakiot (paletti, liput, polut, oletustekstuuri, käännösprofiilit) ovat vain siellä.
4. Alusta (`render/`, `platform/`, `workers/`) ei tuo `app/`- eikä `ui/`-hakemistoa. `render/` saa tuoda `platform/`-hakemistoa, mutta ei päinvastoin.
5. `workers/` saa tuoda vain `core/`- ja `game/q2/`-moduuleja. Muut kerrokset eivät tuo worker-koodia, vaan kommunikoivat workerin kanssa viesteillä `platform/`-hakemiston worker-asiakkaiden kautta.
6. `app/` ei tuo `ui/`-hakemistoa. Kerroksen sisällä tuonnit ovat vapaita.
7. Dokumenttia muutetaan vain `CommandBus`-väylän kautta. UI, renderöijä ja alusta eivät koskaan muuta `MapDocument`ia suoraan.
8. Renderöijän rajapinta ottaa vastaan vain ytimen tyyppejä (`MapDocument`, `Patch`, kamera). `src/main.ts` kytkee sen sovelluksen muutosilmoitusten tilaajaksi.
9. Työkalujen tilakone ja logiikka (mitä komentoa syöte tuottaa) ovat `app/`:ssa. `ui/`:n näkymät muuntavat syötteen maailmakoordinaateiksi, hoitavat kamerat ja välittävät tapahtumat työkalulle.
10. `solid-js` ja `@solidjs/*` ovat käytössä vain `ui/`:ssa.

Jos muutos vaatii uuden riippuvuussuunnan, määrittelyn sääntötaulukko, Mermaid-kaavio ja ESLint-vyöhykkeet päivitetään samassa muutoksessa. Sääntöä ei kierretä `eslint-disable`-kommentilla.

## Kehitysympäristö

- **Node.js 26 LTS** (`.nvmrc`) ja **pnpm 12** (`packageManager`-kenttä). Corepack ei sisälly Node 26:een, joten pnpm asennetaan erikseen.
- **Chromium-pohjainen selain** (Chrome tai Edge) kehitykseen, koska File System Access API toimii vain niissä. Firefox- ja Safari-polut testataan erikseen.
- **emsdk** (tai Docker ja `emscripten/emsdk`-kuva) tarvitaan vain, kun Q2-kääntäjiä (`tools/`) muutetaan. Valmiit `.wasm`-tiedostot ovat repossa.
- **Lähdeprojektit:** kloonaa `docs/20-sources.md`:ssä listatut repot hakemistoon `ext/` (komennot ovat siinä tiedostossa). Niitä tarvitaan lähdekoodin lukemiseen, mutta ei buildiin eikä testeihin.
- **`JOOLE_Q2_DIR`:** paikallisen Q2-asennuksen polku (hakemisto, jossa on `baseq2/`) pelidataa käyttäviä testejä varten.
- **Q2-pelidata:** testaamiseen tarvitaan oma laillinen Quake 2 -asennus (`baseq2/pak0.pak`). Pelidata ei ole GPL-lisensoitua, eikä sitä koskaan lisätä repoon (ks. testiaineisto).

## Komennot (tavoitetila)

| Komento | Tarkoitus |
| --- | --- |
| `pnpm install` | Riippuvuuksien asennus (`--frozen-lockfile` CI:ssä) |
| `pnpm dev` | Viten kehityspalvelin COOP/COEP-otsakkeilla |
| `pnpm build` | Tuotantobuild hakemistoon `dist/` |
| `pnpm preview` | Tuotantobuildin paikallinen ajo |
| `pnpm typecheck` | `tsc -b --noEmit` TypeScript 7:llä, kaikki tsconfig-projektit |
| `pnpm lint` / `pnpm lint:fix` | ESLint, mukaan lukien kerrosrajat |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm test` | Vitest kerran ajettuna |
| `pnpm test:watch` | Vitest seurantatilassa |
| `pnpm test:coverage` | Kattavuus, `core/`-raja ≥ 90 % |
| `pnpm bench` | Vitest-benchmarkit |
| `pnpm e2e` | Playwright-testit, myös kuvavertailu |
| `pnpm build:tools` | qbsp3, qvis3 ja qrad3 WebAssemblyksi `workers/`-hakemistoon (vaatii emsdk:n tai Dockerin) |
| `pnpm gen:entities` | Generoi `game/q2/q2.def`-tiedoston ja md2-taulukon pelikoodista (lukee `ext/Quake-2/game/`) |
| `pnpm check` | Kaikki tarkistukset ennen committia: format:check, lint, typecheck, test, build |

Kun komento lisätään `package.json`:iin tai sen nimi muuttuu, taulukko päivitetään samassa muutoksessa.

## Kehitystyön kulku

Toteutus etenee määrittelyn viiden vaiheen järjestyksessä. Seuraava vaihe aloitetaan vasta, kun edellisen *Valmis, kun* -kriteeri täyttyy. Myöhempien vaiheiden ominaisuuksia ei toteuteta etuajassa, mutta rakenne ei saa estää niitä.

Yksittäinen muutos tehdään näin:

1. **Lue määrittelyn osio**, jota muutos koskee, ja tarkista `PLAN.md`:stä, mihin työpakettiin se kuuluu ja ovatko sen riippuvuudet valmiita. Jos määrittely on epäselvä tai ristiriitainen, kysy ennen toteutusta.
2. **Tarkista lähteet.** Algoritmeissa ja editorin käytöksessä esikuvana on Qoole. Formaateissa ja vakioissa totuuden lähteenä ovat id:n alkuperäinen moottori (`ext/Quake-2`) ja Quake-2-Tools (`common/qfiles.h`). Laajennuksissa (`.pkz`, pakettien hakusäännöt) lähteenä on q2pro. Selainratkaisuissa mallina on q3edit. Koodi luetaan paikallisesta kopiosta `ext/<repo>/`, ja tiedostokohtaiset viitteet ovat stackin kohdassa *Lähdeprojektien rooli*. Editorin perustoimintoihin (entiteettimääritykset, CSG, `.map`) kannattaa katsoa myös id:n omaa editoria `ext/Quake-2-Tools/qe4/`. Määrittelyn "tarkistetaan ennen toteutusta" -kohdat (esim. kääntäjien versio ja lisenssi) tarkistetaan lähdekoodista, ja tulos kirjataan määrittelyyn.
3. **Kirjoita testi ensin** aina, kun muutos koskee `core/`- tai `app/`-koodia: yksikkötesti, fast-check-ominaisuus tai kierrostesti. Bugikorjaukseen kuuluu testi, joka epäonnistuu ennen korjausta.
4. **Toteuta** noudattaen kerrossääntöjä ja koodauskäytäntöjä.
5. **Aja `pnpm check`.** Renderöintiä tai UI:ta koskevissa muutoksissa aja myös `pnpm e2e`. Suorituskykykriittisissä muutoksissa (geometria, renderöinnin välimuisti, jäsentäjät) aja `pnpm bench` ja vertaa määrittelyn suorituskykytaulukkoon.
6. **Päivitä dokumentaatio** samassa muutoksessa: määrittely, stack, `PLAN.md` (työpaketin tila) ja tämä tiedosto tarpeen mukaan.
7. **Commitoi** pieninä, yhden asian kokonaisuuksina (ks. Git).

## Koodauskäytännöt

**Yleiset:**

- TypeScriptin `strict`-tila. Ei `any`-tyyppiä eikä `@ts-ignore`-kommenttia ilman perustelukommenttia. Mieluummin `@ts-expect-error` perustelun kanssa.
- Tunnisteet, kommentit ja virheilmoitusten avaimet englanniksi.
- Uusi riippuvuus vaatii perustelun, ja se lisätään tiedostoon `10-stack.md`. Ensisijaisesti kirjoitetaan oma kapea toteutus. Versio asennetaan `pnpm add` -komennolla ja on vähintään 7 päivää vanha. `minimumReleaseAge`-asetusta ei ohiteta.

**Ydin (`core/`):**

- Laskenta tehdään float64-tarkkuudella. `Float32Array` on sallittu vain renderöijän GPU-puskureissa.
- Solmut (`MapNode`) ovat muuttumattomia. Muutos tuottaa uuden olion, ja muuttumattomat solmut jaetaan vanhan ja uuden tilan kesken.
- Brushin totuus on tasojoukko (kolme pistettä per sivu). Verteksit, reunat ja polygonit ovat johdettua välimuistia, eikä niitä tallenneta.
- Kaikki koordinaatit ovat maailmakoordinaatteja, eikä paikallisia muunnosmatriiseja käytetä.
- Toleranssit (`PLANE_EPS`, `POINT_EPS`) määritellään yhdessä paikassa, eikä uusia taikalukuja lisätä.
- Geometriaoperaatio palauttaa validit brushit tai virheen (tulostyyppi), ei koskaan rikkinäistä geometriaa. Ennakoitavissa olevista virheistä ei heitetä poikkeusta.
- Jäsentäjät ovat puhtaita funktioita: `ArrayBuffer` tai `string` sisään, tietorakenne ulos. Binääriformaatit luetaan little-endian-muodossa `DataView`:llä.
- Avaus ja tallennus eivät saa muuttaa mitään. Entiteettien ominaisuuksien järjestys ja tuntemattomat avaimet säilytetään, ja `.map`-lukujen muotoilu noudattaa määrittelyä.

**Komennot ja tila:**

- Jokainen dokumentin muutos on `Command`, jonka `run()` palauttaa `Patch`in. Raahauksen välivaiheet yhdistetään `mergeKey`:llä yhdeksi undo-askeleeksi.
- Valinta ei kuulu dokumenttiin eikä undo-historiaan.

**Renderöinti ja UI:**

- Piirto tehdään vain muutoksen yhteydessä (dokumentti, kamera tai osoitin). Jatkuvaa `requestAnimationFrame`-silmukkaa ei käytetä.
- Renderöijä päivittää vain patchien kertomat brushit, eikä koko puskuria rakenneta uudelleen.
- Solid 2:n API:a käytetään sen omien ohjeiden mukaan. Solid 1:n poistettuja API:a ei käytetä (lista stackissa). Kehitysbuildin reaktiivisuusdiagnostiikat korjataan.
- Paneelien logiikka (validointi, muunnokset) on `app/`-kerroksessa, ja `ui/` vain esittää ja välittää tapahtumat.
- Tyylit kirjoitetaan CSS Modules -tiedostoina (`Komponentti.module.css`) komponentin viereen. Värit ja mitat otetaan teeman CSS-muuttujista, eikä niitä kovakoodata.

**Yksityisyys:** käyttäjän tiedostoja ei lähetetä minnekään. Ei telemetriaa, analytiikkaa eikä ulkoisia ajonaikaisia pyyntöjä (CDN-fontit, kolmannen osapuolen skriptit). Sovelluksen pitää toimia ilman verkkoyhteyttä.

## Testaus ja testiaineisto

- **Yksikkötestit (Vitest):** kaikki `core/`- ja `game/q2/`-koodi sekä `app/`-logiikka. Kattavuusraja `core/`:ssa on ≥ 90 % riveistä, ja raja on CI:ssä pakollinen.
- **Ominaisuuspohjaiset testit (fast-check):** jokainen CSG-operaatio, polygonien muodostus ja tekstuurilukko. Epäonnistuneen tapauksen siemen (seed) ja minimoitu syöte lisätään pysyväksi regressiotestiksi.
- **Kierrostestit:** jokainen testikartta luetaan, kirjoitetaan ja luetaan uudelleen. Tietorakenteen pitää olla aina identtinen, ja tekstin pitää olla sama rivitasolla, kun tiedosto on kanonisessa muodossa (määrittely, *Tiedostoformaatit*). Sama tehdään `.joole.json`-formaatille, ja jokaisella projektiformaatin versiolla on oma testitiedostonsa.
- **Kääntäjätesti:** qbsp3.wasm ajetaan Nodessa testikartoilla, ja varoitukset virheellisistä brusheista kaatavat testin.
- **E2E (Playwright):** päätyönkulut (avaa, luo brush, vähennä, undo, tallenna), suorituskykytestit ja näkymien kuvavertailu SwiftShaderilla. Vertailukuvat päivitetään vain tarkoituksellisen visuaalisen muutoksen yhteydessä, ja syy kirjataan commit-viestiin.
- **Testiaineisto:**
  - Repoon lisätään vain itse tehtyjä tai GPL-yhteensopivasti lisensoituja karttoja ja tekstuureja (`tests/fixtures/`).
  - id Softwaren pelidataa (`pak0.pak`, `.wal`-tekstuurit, vanilla-kartat, `colormap.pcx`) ei commitoida. Niitä käyttävät testit lukevat Q2-asennuksen polun ympäristömuuttujasta `JOOLE_Q2_DIR`, ja ne ohitetaan, jos muuttujaa ei ole asetettu. CI ajaa vain repon omalla aineistolla.
  - Paletista ja `.wal`-rakenteesta tehdään pieniä synteettisiä testitiedostoja, jotta perustestit toimivat ilman pelidataa.

## Git ja commitit

- Päähaara on `main`. Muutokset tehdään pieninä, yhden asian kokonaisuuksina.
- Commit-viestit noudattavat Conventional Commits -muotoa englanniksi (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `perf:`), esim. `feat(geom): add CSG subtract`. Laajuus (scope) on hakemiston nimi: `geom`, `formats`, `doc`, `q2`, `app`, `render`, `platform`, `ui`, `tools`.
- `pnpm check` menee läpi ennen committia. CI (GitHub Actions) ajaa saman sekä E2E-testit ja WASM-buildin toistettavuustarkistuksen jokaiselle pull requestille. Hookeja ei ohiteta (`--no-verify`).
- Lukkotiedosto (`pnpm-lock.yaml`) commitoidaan. Buildin tuotokset (`dist/`, kattavuusraportit, Playwrightin raportit), paikallinen pelidata ja `ext/` ovat `.gitignore`:ssa.
- `ext/`-hakemistoa tai sen sisältöä ei koskaan lisätä Gitiin, ei myöskään alimoduuleina tai `git add -f` -komennolla. Ennen committia tarkista, ettei `git status` näytä `ext/`-polkuja.

## Lisenssi ja lainattu koodi

- Joole julkaistaan GNU GPL v2.0 tai myöhemmän version lisenssillä. SPDX-tunniste on `GPL-2.0-or-later` (`package.json`, `LICENSE` ja lähdetiedostojen otsakkeet).
- Qoolen, q2pro:n, Quake-2:n, Quake-2-Toolsin ja q3editin koodia saa käyttää (kaikki "GPL v2 tai myöhempi"). Kun koodia siirretään tai käännetään toiselle kielelle:
  - tiedoston alkuun kirjataan alkuperä (projekti, tiedosto, funktio) ja alkuperäiset tekijänoikeusmerkinnät
  - lähde lisätään tiedostoon `THIRD_PARTY_NOTICES.md` (luodaan ensimmäisen lainauksen yhteydessä)
  - uusi lähdeprojekti lisätään tiedostoon `docs/20-sources.md`.
- Lisättävän koodin ja datan lisenssin pitää sallia Joolen jakaminen GPLv2:lla. Esimerkiksi MIT, BSD, ISC, LGPL ja GPL-2.0-or-later sallivat sen. GPLv3-only- tai Apache-2.0-koodi pakottaisi koko teoksen GPLv3:ksi, joten sellaista ei lisätä ilman erillistä päätöstä.

## Ohjeet koodausagenteille

- Lue määrittelyn ja stackin relevantit osiot ennen muutosta. Älä oleta API:a, versiota tai formaatin yksityiskohtaa, vaan tarkista se lähdekoodista, dokumentaatiosta tai npm:stä.
- Solid 2 julkaistiin marraskuussa 2026. Koulutusdatan Solid-esimerkit ovat todennäköisesti Solid 1:n API:a, joten käytä Solid 2:n dokumentaatiota ja sen mukana tulevia agenttiohjeita.
- TypeScript 7:n `tsc` on natiivi binääri, eikä sillä ole vakaata JS-API:a. Älä tuo `typescript`-pakettia ajonaikaiseen koodiin.
- Älä lataa, pura tai commitoi Q2-pelidataa.
- **`ext/` on vain luettavissa.** Älä muokkaa sen tiedostoja, älä aja siellä `git`-komentoja, jotka muuttavat tilaa (paitsi `pull` käyttäjän pyynnöstä), äläkä tuo sieltä koodia buildiin. Generointiskriptit (`pnpm gen:entities`) saavat lukea `ext/`:tä, mutta niiden tuotos commitoidaan, eikä build, testit tai CI saa riippua `ext/`:stä. Lainattu koodi kopioidaan `src/`- tai `tools/`-hakemistoon ja alkuperä merkitään.
- **Haku `ext/`-hakemistosta:** ripgrep ja siihen perustuvat hakutyökalut noudattavat `.gitignore`a, joten projektin juuresta tehty haku ohittaa `ext/`:n. Hae antamalla polku eksplisiittisesti (esim. `rg TextureAxisFromPlane ext/Quake-2-Tools`) tai käytä `--no-ignore`-valitsinta. Vastaavasti `ext/`:n tulokset eivät saa sotkea Joolen omaa koodia koskevia hakuja.
- Kun viittaat dokumentaatiossa `ext/`:n koodiin, käytä repon juuresta laskettua polkua ja funktion nimeä (esim. `bsp/qbsp3/textures.c`, `TextureAxisFromPlane`). Rivinumerot vanhenevat.
- Älä muuta turvallisuusasetuksia (`minimumReleaseAge`, COOP/COEP-käytäntö) build- tai CI-ongelman kiertämiseksi, vaan kysy ensin.
- Kun teet päätöksen, jota dokumentaatio ei kata, kirjaa se oikeaan dokumenttiin ja mainitse se yhteenvedossa.
