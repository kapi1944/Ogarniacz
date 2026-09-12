Ogarniacz 1.0.8

- poprawiono gubienie wypowiedzi Echo przy NO_MATCH, SPEECH_TIMEOUT i kontrolowanym timeout,
- Echo może bezpiecznie wykorzystać ostatni częściowy wynik STT,
- finalny wynik rozpoznawania nadal ma pierwszeństwo,
- anulowanie rozmowy nigdy nie wykonuje zachowanego partiala,
- zabezpieczono spóźnione callbacki i podwójne wykonanie polecenia,
- poprawiono naturalne pytania o zadania, np. „Co mam dzisiaj?”,
- rozszerzono diagnostykę STT i wake word.

Wake word „Hej Echo” pozostaje nieskonfigurowany do czasu dostarczenia prywatnego klucza Picovoice i modelu `.ppn`.
