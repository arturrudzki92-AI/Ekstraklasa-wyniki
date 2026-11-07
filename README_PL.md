# Ekstraklasa Senior PWA

Aplikacja PWA na Androida: **Nadchodzące · Wyniki · Tabela**. Duże czcionki, wysoki kontrast, duże przyciski, bez herbów.

## Jak działa

- `fetch_data.py` pobiera dane z bezpłatnego Football API Bzzoiro (BSD).
- Skrypt sam wyszukuje Ekstraklasę w polskich ligach i pobiera bieżący sezon z API. Nie zakłada na sztywno identyfikatora ligi ani sezonu.
- GitHub Actions odświeża dane raz na godzinę i publikuje aplikację w GitHub Pages.
- Klucz API jest przechowywany w GitHub Secrets, nie w aplikacji.

**Ważne:** projekt jest gotowy do konfiguracji, ale nie jest jeszcze połączony z Twoim kontem. Bez Twojego prywatnego tokenu nie mogę przetestować faktycznej odpowiedzi API. Aplikacja nie generuje przykładowych wyników.

## 1. Załóż bezpłatne konto Bzzoiro

1. Otwórz https://sports.bzzoiro.com/register/ i zarejestruj konto.
2. Potwierdź adres e-mail.
3. Zaloguj się, otwórz panel i skopiuj API key.
4. Nie wysyłaj klucza nikomu i nie wpisuj go do plików projektu.

Piłkarskie API ma bezpłatny limit opisany przez dostawcę jako 7500 zapytań dziennie. Nasz skrypt wykonuje tylko kilka zapytań na godzinę.

## 2. Utwórz repozytorium GitHub

1. Otwórz https://github.com/new.
2. Repository name: `ekstraklasa-pwa`.
3. Ustaw **Public** (GitHub Pages i standardowe Actions są wtedy bezpłatne).
4. Zaznacz **Add a README file**, utwórz repozytorium.
5. Rozpakuj ZIP. W repozytorium wybierz **Add file → Upload files** i wgraj zawartość folderu projektu, w tym folder `.github`.
6. Jeśli telefon nie pozwala przesłać `.github`, utwórz ręcznie plik `.github/workflows/update-and-deploy.yml` w GitHub i wklej zawartość pliku z ZIP.

## 3. Dodaj sekret API

W repozytorium wybierz **Settings → Secrets and variables → Actions → New repository secret**.

- Name: `BSD_API_KEY`
- Secret: wklej klucz z Bzzoiro

Zapisz. Nie umieszczaj klucza w kodzie.

## 4. Włącz GitHub Pages

Otwórz **Settings → Pages**. W sekcji **Build and deployment** ustaw **Source: GitHub Actions**.

## 5. Uruchom pierwsze pobieranie

1. Otwórz zakładkę **Actions**.
2. Wybierz workflow **Aktualizuj dane Ekstraklasy i publikuj PWA**.
3. Kliknij **Run workflow → Run workflow**.
4. Poczekaj na zakończenie zadania. Otwórz szczegóły, jeśli pojawi się błąd.
5. Po publikacji adres strony znajdziesz w **Settings → Pages**. Zwykle wygląda tak: `https://TWOJ_LOGIN.github.io/ekstraklasa-pwa/`.

Workflow uruchamia się potem automatycznie co godzinę. GitHub może czasem opóźnić start zadania.

## 6. Zainstaluj na Androidzie

1. Otwórz adres aplikacji w Chrome.
2. Otwórz menu ⋮.
3. Wybierz **Zainstaluj aplikację** albo **Dodaj do ekranu głównego**.
4. Potwierdź.

Aplikacja zachowuje ostatnie pobrane dane w pamięci przeglądarki. Przy braku internetu pokaże ostatnio zapisane dane, jeśli były już pobrane.

## Błędy

- **401:** błędny sekret `BSD_API_KEY`, nieaktywne konto lub niepotwierdzony e-mail.
- **402:** endpoint wymaga płatnego dostępu. Skrypt zgłosi to w logach.
- **429:** przekroczono limit API. Spróbuj później.
- **Nie znaleziono Ekstraklasy:** sprawdź logi Actions; skrypt wypisuje nazwy polskich lig zwrócone przez API.
- **Brak sezonu:** dostawca może jeszcze nie mieć zsynchronizowanego bieżącego sezonu. Skrypt nie tworzy fikcyjnych danych.

## Pliki

- `fetch_data.py` – pobieranie i normalizacja danych.
- `.github/workflows/update-and-deploy.yml` – harmonogram i publikacja.
- `site/` – aplikacja PWA.
