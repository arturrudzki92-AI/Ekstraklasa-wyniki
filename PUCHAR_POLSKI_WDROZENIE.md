# Ekstraklasa + Puchar Polski (wersja 5.0)

## Jak wdrożyć

1. Otwórz Pull Request „Dodaj Puchar Polski do aplikacji Ekstraklasa” i zatwierdź **Merge pull request**.
2. W **GitHub Actions** uruchom istniejący workflow przyciskiem **Run workflow**.
3. Po zielonym znaczniku wejdź do aplikacji i wybierz **PUCHAR POLSKI** nad zakładkami.
4. Jeżeli Puchar pokaże brak danych, sprawdź log etapu **Pobierz dane meczow**.

## Zachowane funkcje

Ekstraklasa jest rozgrywką domyślną z widokiem WYNIKI. Jej tabela, pięć najbliższych kolejek, mecze na żywo, trzy motywy, trzy rozmiary czcionki i wyróżnienie Górnika Zabrze są zachowane. Puchar Polski ma WYNIKI i NADCHODZĄCE podzielone na etapy i bez tabeli.

Puchar korzysta z ligi Bzzoiro #46 i istniejącego sekretu BSD_API_KEY. Błąd pucharu nie blokuje publikowania danych Ekstraklasy.

Nie zmieniaj pliku workflow ani tokenu w cron-job.org.

Uwaga: działanie na żywych danych Pucharu musi zostać zweryfikowane po pierwszej aktualizacji; nie mam dostępu do prywatnego klucza API.