# Performance: Aufgaben und Aufgabendetails

- [x] 1. Kubische Berechnung der Aufgabenliste durch vorberechnete Hierarchiedaten ersetzen; Reihenfolge und eingeklappte Unteraufgaben testen.
- [x] 2. Terminal-Sitzungen explizit schließen und ihre Zahl begrenzen, ohne laufende Befehle beim Aufgabenwechsel abzubrechen.
- [x] 3. Teure Git-Abfragen im ausgeblendeten Changes-Panel stoppen; Änderungsanzeige und Wiederöffnen testen.
- [x] 4. Aufgabenspeicherung vor der Serialisierung bündeln und nach Repository aufteilen; bestehende Daten migrieren und Flush-Verhalten erhalten.
- [x] 5. MCP-Kontext auf benötigte Felder beschränken und Aktualisierungen bündeln; Backend-Vertrag testen.

Prüfung: gezielte Regressionstests je Punkt, anschließend TypeScript-Build und vorhandene Tests. Keine Änderungen an produktiven Aufgabendaten.

## Ergebnis

- `npm test`: bestanden, einschließlich verzögerter Serialisierung, Schreibfehlern und Repository-Isolation.
- `npm run build`: bestanden.
- Rust: 144 Tests bestanden, einschließlich Migration und Fehlerwiederaufnahme.
- Zehn Browser-Suiten bestanden: Task-Performance, Task-Details, Task-Git, neue Aufgaben, Kanban-Drag, Branch-Auswahl, Scheduler, Lane-Automation, Orchestrator und GitHub.
- Die Regressionstests prüfen insbesondere lineare Metadaten bei flachen Listen, maximal fünf Terminal-Sitzungen, explizites Schließen, gemeinsame Workspace-Terminals, inaktive Git-Panels, Fenstersichtbarkeit, Änderungsmarkierung und gebündelte Task-/MCP-Schreibvorgänge.

Nicht geprüft: Live-Heap-/CPU-Profiling und Installation eines neuen nativen App-Pakets. Produktive Aufgabendaten wurden nicht verändert. Die Migration läuft beim Start der aktualisierten nativen App.

## Zweite Runde: verbleibende Befunde

- [x] 1. Task-Streaming pro Frame bündeln; Text vor Abschluss, Tool-Ereignissen und Rückfragen vollständig übernehmen.
- [x] 2. Orchestrator-Historie und bestätigte Ergebnis-Caches begrenzen; Wiederholungs- und Fehlerschutz erhalten.
- [x] 3. Unteraufgaben je Spaltenmenü einmal durchlaufen und die Menü-Metadaten zwischenspeichern.
- [x] 4. Datei-Snapshots mit begrenztem Arbeitsspeicher berechnen und Datei-Lesevorgänge je Refresh wiederverwenden; Snapshot-Verträge testen.
- [x] 5. Begrenzte Bild-Thumbnails bei Bedarf laden; Originale erst in der Vorschau öffnen.

Je Punkt: gezielte Regressionstests. Danach Build und relevante vorhandene Daten-, Backend- und Browsertests.

## Ergebnis zweite Runde

- `npm test` und `npm run build`: bestanden.
- Rust: alle 147 Tests bestanden, einschließlich Snapshot-Kompatibilität, begrenzter Historie und Thumbnail-Cache.
- Fünf Browser-Suiten bestanden: Task-Performance, Task-Details, Kanban-Drag, Orchestrator und Thumbnails.
- Isolierter Vergleich der Unteraufgaben-Berechnung mit 2.000 Aufgaben: Median aus fünf Durchläufen von 59,63 ms auf 0,50 ms gesenkt. Dies misst den Helfer, nicht die gesamte Oberfläche.

Nicht geprüft: Live-Heap-/CPU-Profiling und Installation eines neuen nativen App-Pakets. Die Thumbnail-Erzeugung verwendet macOS; andere Plattformen zeigen vorerst das Dateisymbol. Produktive Aufgabendaten wurden nicht verändert.

## Nachprüfung: Thumbnail-Anzeige

- [x] Versteckten `.thumbnails`-Cache gezielt im Tauri-Asset-Protokoll freigeben. Der bisherige rekursive Pfad erlaubte unter macOS keine versteckten Ordner.
- [x] Regression mit tatsächlichen Tauri-Zugriffsregeln reproduziert und behoben; fremde und sonstige versteckte Ordner bleiben gesperrt.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib --offline task_thumbnail`: beide Tests bestanden, einschließlich Erzeugung, Cache-Nutzung und Löschung.

Die geänderte native Konfiguration erfordert einen Neustart des Tauri-Entwicklungsprozesses beziehungsweise einen neu gebauten App-Stand. Die installierte App wurde nicht ersetzt.

## Draw und Sandbox: Tabwechsel

- [x] Draw-Code beim Öffnen der Task im Leerlauf vorbereiten; den Editor erst beim ersten Besuch initialisieren.
- [x] Tab-Auswahl vor teurer Initialisierung darstellen; Ladefläche ohne Höhensprung und kurze Überblendung mit Reduced-Motion-Unterstützung.
- [x] Zeichenfläche samt Zoom/Position und Sandbox samt Formular-/Scrollzustand beim Tabwechsel erhalten.
- [x] Ressourcen auf die geöffnete Task begrenzen; beim Wechsel/Schließen auch verspätet vorbereitete Vorschauen freigeben.
- [x] Fehler direkt in der Sandbox erneut laden können; versteckte Vorschauen dürfen keine Browser-Links öffnen.
- [x] Regressionen mit echtem Excalidraw und iframe unter nativer Sandbox-CSP sowie gebündelte Produktionsansicht unter nativer App-CSP prüfen.

Prüfung: `npm test`, ESLint ohne Warnungen, beide TypeScript-Konfigurationen, Produktionsbuild und alle 17 Entwicklungs-Browser-Suiten bestanden. Die Produktions-Browsertests prüfen zusätzlich SVG-/PNG-Export. Apple-Silicon- und Intel-Pakete neu gebaut; Architektur, tiefe Signaturprüfung und DMG-Prüfsummen bestanden. Die Pakete sind ad hoc signiert.

Die Sandbox bleibt beim Tabwechsel aktiv und kann dabei Skripte weiter ausführen. Der erste Besuch benötigt weiterhin die Initialisierung. Die gefühlte Geschwindigkeit und Frame-Zeiten im nativen macOS-Fenster wurden nicht gemessen.
