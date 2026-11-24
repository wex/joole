# Lähteet

Tämä dokumentti sisältää linkkejä projektiin liittyviin lähteisiin, ja kuvaukset niiden sisällöstä ja käyttötarkoituksesta.

## Paikalliset kopiot (`ext/`)

Kaikki alla listatut Git-repot kloonataan projektin `ext/`-hakemistoon, jolloin niiden koodia voi lukea ja hakea paikallisesti. Hakemiston nimi on repon nimi.

- `ext/` on `.gitignore`-tiedostossa, eikä sitä tai sen sisältöä koskaan lisätä Joolen Git-repoon (ei myöskään alimoduuleina).
- `ext/` on vain luettavaksi tarkoitettua viitekoodia. Siellä olevia tiedostoja ei muokata, eikä Joolen koodi tuo niitä tai viittaa niihin buildissa. Generointiskriptit (esim. `q2.def` pelikoodista) saavat lukea `ext/`:tä, mutta niiden tuotos commitoidaan, joten build, testit ja CI eivät tarvitse `ext/`:tä. Jos koodia lainataan, se kopioidaan `src/`- tai `tools/`-hakemistoon ja alkuperä merkitään (ks. AGENTS.md, *Lisenssi ja lainattu koodi*).
- Kloonaus uudelle koneelle:

  ```sh
  mkdir -p ext && cd ext
  git clone https://github.com/q2pro/q2pro.git
  git clone https://github.com/demoth/qoole.git
  git clone https://github.com/drdator/q3edit.git
  git clone https://github.com/id-Software/Quake-2-Tools.git
  git clone https://github.com/id-Software/Quake-2.git
  ```

- Päivitys: `git -C ext/<repo> pull`. Kun dokumentaatio viittaa tiettyyn kohtaan lähdekoodissa, viitattu commit voidaan kirjata dokumenttiin (`git -C ext/<repo> log -1 --format=%h`).

| Hakemisto | Haara | Commit 24.11.2026 |
| --- | --- | --- |
| `ext/q2pro` | `master` | `601a8df8` (2025-12-11) |
| `ext/qoole` | `master` | `6e61028` (2019-09-21) |
| `ext/q3edit` | `main` | `02f8764` (2026-08-05) |
| `ext/Quake-2-Tools` | `master` | `707e849` (2012-01-31) |
| `ext/Quake-2` | `master` | `372afde` (2012-01-31) |

## Repot

- https://github.com/q2pro/q2pro (`ext/q2pro`)
  - Moderni Quake 2-client
  - Sisältää tarvittavat tietomallit ja logiikan mm. tekstuurien, karttojen ja modelien käsittelyyn
  - Käytetyt kielet: C/C++

- https://github.com/demoth/qoole (`ext/qoole`)
  - Editorin esikuva: Qoole
  - Työpöytäohjelma, jolla voidaan suunnitella, teksturoida ja renderöidä Quake 2 -karttoja
  - Käytetyt kielet: C/C++

- https://github.com/drdator/q3edit (`ext/q3edit`)
  - Vastaavanlainen selaintoteutus Quake 3 -karttojen editoimiseen
  - Eteenkin WebGL-toteutus on hyödyllinen lähde

- https://github.com/id-Software/Quake-2-Tools (`ext/Quake-2-Tools`)
  - id Softwaren alkuperäiset Quake 2 -karttatyökalut: qbsp3, qvis3 ja qrad3 (GPL v2 tai myöhempi)
  - Sisältää `common/qfiles.h`:n pinta- ja contents-lippujen vakiot sekä kääntäjän UV-laskennan (`bsp/qbsp3/textures.c`) ja `.map`-jäsennyksen (`bsp/qbsp3/map.c`)
  - Lähdekoodi käännetään Emscriptenillä WebAssemblyksi selaimessa ajettavaa käännöstä varten
  - `qe4/` sisältää id:n oman Q2-karttaeditorin QuakeEd 4:n lähdekoodin: entiteettimääritysten (`/*QUAKED … */`) jäsennys, CSG, onton tekeminen, `.map`-luku ja -kirjoitus sekä vuotopistetiedoston näyttäminen
  - Käytetyt kielet: C

- https://github.com/id-Software/Quake-2 (`ext/Quake-2`)
  - id Softwaren alkuperäinen Quake 2 -moottori ja pelikoodi (GPL v2 tai myöhempi, julkaistu 21.12.2001)
  - Totuuden lähde vanilla-käytökselle: tiedostojärjestelmän hakujärjestys (`qcommon/files.c`, `FS_AddGameDirectory`) ja formaattien määrittelyt (`qcommon/qfiles.h`)
  - `game/*.c` sisältää 148 `/*QUAKED*/`-lohkoa, joista vanilla-entiteettimääritykset generoidaan, sekä spawn-funktiot, joista md2-mallien polut kootaan. `ctf/` on esimerkki modin lähdekoodista ja määrityksistä.
  - Käytetyt kielet: C
