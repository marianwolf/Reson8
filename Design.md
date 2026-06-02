# Reson8 Design

## Zielbild

Reson8 ist ein professionelles Audio-Analyse-Tool fuer schnelle Signalpruefung im Browser. Die Anwendung priorisiert unmittelbare Arbeit mit Audio: Datei ablegen, Pegel sehen, Spektrum beurteilen, Filter justieren und relevante Kennzahlen live vergleichen.

## Interaktionsprinzipien

- Der erste Bildschirm bleibt das Analyse-Dashboard, keine Marketing- oder Landing-Page.
- Die Analyse ist sowohl im Studio als auch direkt ueber die Subpage `/analysis` erreichbar.
- Drag-and-Drop und klassischer Datei-Upload fuehren zur gleichen Analyse-Pipeline.
- Lokale Einstellungen werden im Browser gespeichert, damit Filtertyp, Cutoff, Gain, Modus und letzte Datei-Metadaten nach einem Reload erhalten bleiben.
- Audiodateien selbst werden nicht persistiert, weil Browser sie aus Sicherheitsgruenden nicht ohne erneute Nutzerauswahl wiederherstellen duerfen.

## Analyseumfang

- Frequency Spectrum fuer schnelle Energieverteilung.
- Oscilloscope fuer Zeitbereich und Signalform.
- Round Oscillator fuer eine zirkulare Zeitbereichsdarstellung.
- Volume Meter mit RMS- und Peak-Verlauf.
- Static RMS mit Current, Average, Min, Max und Sample-Anzahl.
- Analysis Snapshot mit Dominant Frequency, Spectral Centroid, Spectral Rolloff, Zero Crossing Rate, Crest-Faktor, Sample Rate und Kanalanzahl.
- Audio Tools fuer Gain, Lowpass/Highpass und Cutoff Frequency.

## Datei-Export

Geladene Audiodateien koennen als neuer WAV-Output heruntergeladen werden. Der Export wird offline gerendert und nutzt die aktuell eingestellten Werte fuer Gain, Filtertyp und Cutoff Frequency.

## Monitoring

Beim Mikrofon-Modus wird das Eingangssignal durch Gain, Filter und Analyzer auch an die Lautsprecher geroutet. Dadurch kann das Signal gehoert und gleichzeitig analysiert werden. Nutzer sollten Gain vorsichtig einstellen, um Feedback bei offenen Lautsprechern zu vermeiden.

## Visuelle Regeln

- Bestehende dunkle Studio-Aesthetik bleibt erhalten: Slate-Hintergrund, Cyan/Violet-Akzente, leichte Transparenz, Glow und kompakte Karten.
- Neue UI-Elemente verwenden vorhandene Tailwind-Muster aus der App.
- Statusinformationen stehen nah an der jeweiligen Aufgabe: Datei-Metadaten im Input-Bereich, Signalmetriken im Analysis Snapshot.
- Die rechte Seitenleiste bleibt das operative Control Center, die linke Flaeche bleibt fuer visuelle Analyse reserviert.

## Persistenz

Gespeichert werden:

- Input-Modus
- Gain
- Filtertyp
- Cutoff Frequency
- letzter Dateiname
- letzte Dateigroesse
- letzter Dateityp

Nicht gespeichert werden:

- Dateiinhalt
- Mikrofonberechtigung
- laufende Wiedergabe
