# Wyniki dla Seniorów

Publiczna, neutralna wersja aplikacji do prezentacji na LinkedIn i dla wszystkich kibiców. 

## Dwa osobne adresy

- Aplikacja rodzinna pozostaje w głównym katalogu serwisu.
- Publiczna wersja znajduje się pod `/wyniki-dla-seniorow/`.

To dwie osobne instalowalne aplikacje PWA: mają niezależny interfejs, ikonę, manifest, service worker i zapisane ustawienia. Obie korzystają ze **wspólnego pliku danych** `../data.json` generowanego przez istniejące GitHub Actions. Dzięki temu nie powielamy klucza API ani limitów wywołań.

Publiczna wersja **nie posiada wyróżnienia żadnej drużyny**. Utrzymuje duże litery, jasny/ciemny/kontrastowy motyw, Ekstraklasę, Puchar Polski, terminarz, wyniki na żywo, dogrywki i karne.

## Publikacja

Po złączeniu gałęzi `feature/wyniki-dla-seniorow-public` do `main` uruchom istniejący workflow GitHub Actions (`Run workflow`). Po publikacji GitHub Pages publiczna aplikacja będzie pod adresem:

https://arturrudzki92-ai.github.io/Ekstraklasa-wyniki/wyniki-dla-seniorow/

Aplikacja dziadka pozostaje pod dotychczasowym adresem:

https://arturrudzki92-ai.github.io/Ekstraklasa-wyniki/

Nie trzeba zmieniać cron-job.org, `fetch_data.py`, sekretów ani dat aktualizacji.