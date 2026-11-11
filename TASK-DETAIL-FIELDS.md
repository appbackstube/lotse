# Prüfung der Task-Detailfelder

Stand: 6. November 2026. Geprüft wurde der Tab **Detail** einer bestehenden Task mit synthetischen Daten. Die benachbarte Chat-Eingabe ist bereits lokal gepuffert; ihre Entwürfe, Moduswechsel und das Senden sind zusätzlich durch die bestehenden Modal-/Performance-Tests abgedeckt.

| Feld / Kontrolle | Befund und Ergebnis |
| --- | --- |
| Titel | Der lokale Entwurf aktualisierte das gesamte Detailpanel. In eine eigene Komponente verschoben; Fokus, Enter, Speichern beim Verlassen und leere Titel geprüft. |
| Beschreibung | Eigener lokaler Entwurf, Speichern per Save oder beim Verlassen, Schließen und Wechseln. Externe Änderungen ersetzen keinen aktiven Entwurf; beim Speichern gewinnt der lokale Text. Cursorposition und Scrollposition werden geprüft. |
| Status | Eine Änderung pro Auswahl. Auswahl und gespeicherter Status geprüft. |
| Farbe | Eine Änderung pro Auswahl. Auswahl und gespeicherte Farbe geprüft. |
| Arbeitsort | Workspace, neuer Branch und bestehender Branch geprüft. |
| Branch-Name | Änderte mit jedem Zeichen den globalen Task-Zustand. Jetzt lokaler Entwurf, Speichern nach 300 ms Ruhe oder beim Verlassen. |
| Startpunkt / „Start from“ | Branch-Auswahl und Speicherung geprüft. |
| Bestehender Branch | Auswahl eines bestehenden Remote-Branches und Speicherung geprüft. |
| Branch-Suche | Filtert lokal. Schnelle Eingaben lösen weder globale Task-Änderungen noch weitere Branch-Abfragen aus. |
| Startdatum | Gültige Zwischenwerte aktualisierten sofort den globalen Zustand. Jetzt lokal gepuffert; schnelle Eingaben, unvollständige Datumswerte und ungültige Bereiche geprüft. |
| Deadline | Ebenfalls lokal gepuffert. Schnelle Eingaben, Speichern und Leeren geprüft; ungültige Bereiche bleiben ungespeichert. |
| Benutzerdefinierter Text | Änderte mit jedem Zeichen den globalen Zustand. Jetzt lokal gepuffert; Autosave und Leeren geprüft. |
| Benutzerdefinierter mehrzeiliger Text | Gleicher Engpass behoben. Zeilenumbrüche und gespeicherter Inhalt geprüft. |
| Benutzerdefinierte URL | Gleicher Engpass behoben. Link-Aktion verwendet sofort den aktuellen Entwurf; ungültige Protokolle bleiben gesperrt. |
| Benutzerdefinierte Auswahl | Auswahl und Entfernen eines Werts geprüft. |
| Neuer Kommentar | Der Entwurf aktualisierte das gesamte Panel. In eigenes Formular verschoben; noch nicht abgesendeter Text bleibt lokal. Absenden per Schaltfläche und Tastenkürzel geprüft. |
| Kommentar-Checkbox | Einzelne Änderung und Speicherung geprüft; bestehendes Markdown wird bei unverändertem Inhalt wiederverwendet. |
| Kommentar löschen | Entfernen und Speicherung geprüft. |
| GitHub-Verknüpfung | Keine Texteingabe. Öffnen der bekannten URL über den gemockten nativen Aufruf geprüft. |
| Anhänge | Keine Texteingabe. Auswahl, Import, asynchrone Vorschau und Entfernen mit gemockten nativen Aufrufen geprüft. |

Die Eingabetests prüfen bei schnellen Änderungen, dass das Eingabefeld und der Tastaturfokus erhalten bleiben und keine globalen Task-Speicheraktualisierungen pro Tastendruck stattfinden. Disk-Speicherung und MCP-Veröffentlichung werden zusätzlich geprüft. Mehrere offene Branch-/Custom-Field-Änderungen bleiben beim nativen Schließereignis erhalten; Task- und Repository-Wechsel schreiben in die ursprüngliche Task und das ursprüngliche Repository.

Wiederholbar mit laufendem `npm run dev` und installiertem `agent-browser`:

```sh
npm run test:browser -- task-fields task-performance task-modal branch-name markdown gantt
```

Die separate Feldprüfung verwendet `/scripts/task-fields-ui.html`. Der vollständige Browserlauf entdeckt sie automatisch. Native Dialoge, Dateizugriffe und Fensterereignisse werden dabei gemockt. Das tatsächliche Tippgefühl im macOS-WebView wurde nicht direkt gemessen.
