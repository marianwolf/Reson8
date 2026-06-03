import { useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import {
  type AudioInputMode,
  type FilterMode,
  type GeneratorType,
  useAudioProcessor,
} from "../hooks/useAudioProcessor";

const MIN_FILTER_FREQUENCY = 40;
const MAX_FILTER_FREQUENCY = 18_000;

const MIN_GENERATOR_FREQUENCY = 40;
const MAX_GENERATOR_FREQUENCY = 20_000;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function frequencyToSliderValue(
  frequency: number,
  min = MIN_FILTER_FREQUENCY,
  max = MAX_FILTER_FREQUENCY,
) {
  const minimumLog = Math.log10(min);
  const maximumLog = Math.log10(max);
  const frequencyLog = Math.log10(clamp(frequency, min, max));

  return ((frequencyLog - minimumLog) / (maximumLog - minimumLog)) * 100;
}

function sliderValueToFrequency(
  value: number,
  min = MIN_FILTER_FREQUENCY,
  max = MAX_FILTER_FREQUENCY,
) {
  const minimumLog = Math.log10(min);
  const maximumLog = Math.log10(max);
  const frequencyLog = minimumLog + (value / 100) * (maximumLog - minimumLog);

  return Math.round(10 ** frequencyLog);
}

function formatTime(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = Math.floor(safeSeconds % 60);

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function formatFrequency(frequency: number) {
  if (!Number.isFinite(frequency) || frequency <= 0) {
    return "0 Hz";
  }

  if (frequency >= 1_000) {
    return `${(frequency / 1_000).toFixed(frequency >= 10_000 ? 1 : 2)} kHz`;
  }

  return `${Math.round(frequency)} Hz`;
}

function formatFileSize(fileSizeBytes: number | null) {
  if (!fileSizeBytes) {
    return "Keine Datei";
  }

  if (fileSizeBytes >= 1_000_000) {
    return `${(fileSizeBytes / 1_000_000).toFixed(1)} MB`;
  }

  if (fileSizeBytes >= 1_000) {
    return `${Math.round(fileSizeBytes / 1_000)} KB`;
  }

  return `${fileSizeBytes} B`;
}

function formatPercentage(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatSampleRate(sampleRate: number | null) {
  if (!sampleRate) {
    return "n/a";
  }

  return `${(sampleRate / 1_000).toFixed(1)} kHz`;
}

function formatDb(value: number) {
  return `${value.toFixed(1)} dB`;
}

function modeLabel(mode: AudioInputMode) {
  if (mode === "microphone") return "Mikrofon";
  if (mode === "file") return "Audiodatei";
  return "Signal-Generator";
}

function filterLabel(filterType: FilterMode) {
  switch (filterType) {
    case "lowpass":
      return "Lowpass";
    case "highpass":
      return "Highpass";
    case "bandpass":
      return "Bandpass";
    case "notch":
      return "Notch (Kerb)";
    case "peaking":
      return "Peaking (Glocke)";
    case "lowshelf":
      return "Lowshelf";
    case "highshelf":
      return "Highshelf";
    default:
      return filterType;
  }
}

export default function AudioVisualizerDashboard() {
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "input" | "eq" | "filter" | "dynamics" | "delay" | "generator"
  >("input");

  const { state, refs, controls } = useAudioProcessor();

  const levelPercent = clamp(((state.levelDb + 96) / 84) * 100, 0, 100);
  const peakPercent = clamp(((state.peakDb + 96) / 84) * 100, 0, 100);
  const progressPercent =
    state.duration > 0 ? clamp((state.currentTime / state.duration) * 100, 0, 100) : 0;
  const filterSliderValue = frequencyToSliderValue(state.filterFrequency);
  const generatorSliderValue = frequencyToSliderValue(
    state.generatorFrequency,
    MIN_GENERATOR_FREQUENCY,
    MAX_GENERATOR_FREQUENCY,
  );

  const handleModeChange = (mode: AudioInputMode) => {
    controls.setInputMode(mode);
  };

  const loadDroppedOrSelectedFile = async (file: File | undefined) => {
    if (file) {
      await controls.loadAudioFile(file);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    await loadDroppedOrSelectedFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleFileDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDraggingFile(true);
  };

  const handleFileDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDraggingFile(false);
  };

  const handleFileDrop = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDraggingFile(false);
    await loadDroppedOrSelectedFile(event.dataTransfer.files[0]);
  };

  const handleFilterSliderChange = (event: ChangeEvent<HTMLInputElement>) => {
    controls.setFilterFrequency(sliderValueToFrequency(Number(event.target.value)));
  };

  const handleGeneratorSliderChange = (event: ChangeEvent<HTMLInputElement>) => {
    controls.setGeneratorFrequency(
      sliderValueToFrequency(
        Number(event.target.value),
        MIN_GENERATOR_FREQUENCY,
        MAX_GENERATOR_FREQUENCY,
      ),
    );
  };

  const handleGainChange = (event: ChangeEvent<HTMLInputElement>) => {
    controls.setGain(Number(event.target.value));
  };

  const handleDownloadFilteredFile = async () => {
    await controls.downloadFilteredFile();
  };

  const tabs = [
    { id: "input", name: "Eingang" },
    { id: "eq", name: "3-Band EQ" },
    { id: "filter", name: "Filter & FFT" },
    { id: "dynamics", name: "Dynamik" },
    { id: "delay", name: "Delay" },
    { id: "generator", name: "Generator" },
  ] as const;

  return (
    <main className="min-h-screen overflow-x-hidden px-4 py-6 text-slate-100 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/40">
      <section className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col justify-between gap-5 rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 shadow-glow backdrop-blur-xl lg:flex-row lg:items-center">
          <div>
            <p className="mb-3 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.32em] text-cyan-200">
              Reson8 Studio
            </p>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-5xl bg-clip-text text-transparent bg-gradient-to-r from-white via-cyan-100 to-violet-300">
              Web Audio Analyzer
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Professionelle Echtzeit-Signalverarbeitung. Nutzen Sie parametrische Equalizer,
              Dynamik-Kompressoren, Echo-Verzögerungen, Signalgeneratoren und präzise FFT-Analyse.
            </p>
          </div>
        </header>

        {state.error && (
          <div className="rounded-3xl border border-rose-400/30 bg-rose-500/10 px-5 py-4 text-sm font-medium text-rose-100">
            {state.error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_25rem]">
          {/* Visualizers (Left Column) */}
          <section className="grid gap-6">
            <article className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-white">Frequency Spectrum</h2>
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                    FFT Bar Chart · {state.isPlaying ? "Aktiv" : "Inaktiv"} · Size: {state.fftSize}
                  </p>
                </div>
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-100">
                  {modeLabel(state.inputMode)}
                </span>
              </div>
              <canvas
                ref={refs.frequencyCanvasRef}
                className="h-72 w-full rounded-3xl border border-white/5 bg-slate-900/80"
              />
            </article>

            <article className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-white">Oscilloscope</h2>
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                    Time Domain Waveform
                  </p>
                </div>
                <span className="rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1 text-xs font-bold text-violet-100">
                  Cutoff: {formatFrequency(state.filterFrequency)}
                </span>
              </div>
              <canvas
                ref={refs.waveformCanvasRef}
                className="h-56 w-full rounded-3xl border border-white/5 bg-slate-900/80"
              />
            </article>

            <article className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-white">Round Oscillator</h2>
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                    Circular Time Domain
                  </p>
                </div>
              </div>
              <div className="flex justify-center">
                <canvas
                  ref={refs.circularOscillatorCanvasRef}
                  className="aspect-square h-80 max-h-[22rem] w-full max-w-[22rem] rounded-full border border-white/5 bg-slate-900/80"
                />
              </div>
            </article>
          </section>

          {/* Control Center (Right Column) */}
          <aside className="flex flex-col gap-6">
            {/* Tab Navigation */}
            <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`whitespace-nowrap rounded-2xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition duration-150 ${
                    activeTab === tab.id
                      ? "bg-cyan-300 text-slate-950 shadow-md shadow-cyan-300/20"
                      : "bg-slate-900/50 text-slate-400 hover:bg-slate-850 hover:text-white"
                  }`}
                >
                  {tab.name}
                </button>
              ))}
            </div>

            {/* TAB CONTENT PANEL */}
            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl shadow-xl flex-1 flex flex-col gap-6">
              
              {/* TAB 1: EINGANG (Input Management & Stats) */}
              {activeTab === "input" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-white">Eingangs-Quelle</h2>
                    <div className="mt-3 grid grid-cols-3 gap-2 rounded-2xl bg-slate-950/70 p-1">
                      {(["microphone", "file", "generator"] as AudioInputMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => handleModeChange(mode)}
                          className={`rounded-xl px-2 py-2 text-xs font-bold transition truncate ${
                            state.inputMode === mode
                              ? "bg-cyan-300 text-slate-950 font-black"
                              : "text-slate-300 hover:bg-white/10"
                          }`}
                        >
                          {modeLabel(mode)}
                        </button>
                      ))}
                    </div>

                    {state.inputMode === "microphone" && (
                      <button
                        type="button"
                        onClick={controls.startMicrophone}
                        className="mt-4 w-full rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/20"
                      >
                        Mikrofon aktivieren & abhören
                      </button>
                    )}

                    {state.inputMode === "generator" && (
                      <button
                        type="button"
                        onClick={() => controls.setGeneratorEnabled(!state.generatorEnabled)}
                        className={`mt-4 w-full rounded-2xl border px-4 py-3 text-sm font-bold transition ${
                          state.isPlaying
                            ? "bg-rose-500/20 border-rose-400/30 text-rose-200 hover:bg-rose-500/30"
                            : "bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                        }`}
                      >
                        {state.isPlaying ? "Test-Signal stoppen" : "Test-Signal starten"}
                      </button>
                    )}

                    {state.inputMode === "file" && (
                      <label
                        onDragOver={handleFileDragOver}
                        onDragLeave={handleFileDragLeave}
                        onDrop={handleFileDrop}
                        className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-6 text-center transition ${
                          isDraggingFile
                            ? "border-cyan-300/80 bg-cyan-300/10"
                            : "border-slate-500/60 bg-slate-950/60 hover:border-cyan-300/60 hover:bg-cyan-300/5"
                        }`}
                      >
                        <span className="text-sm font-bold text-white">
                          Audiodatei ablegen oder hochladen
                        </span>
                        <span className="mt-1 text-xs text-slate-400">
                          {state.hasLoadedFile
                            ? state.fileName
                            : state.fileName
                              ? `Zuletzt: ${state.fileName}`
                              : "MP3, WAV, FLAC oder andere lokale Audiodatei"}
                        </span>
                        <input
                          type="file"
                          accept="audio/mpeg,audio/mp3,audio/*"
                          onChange={handleFileChange}
                          className="sr-only"
                        />
                      </label>
                    )}
                  </div>

                  {state.inputMode === "file" && (
                    <div className="border-t border-white/5 pt-4">
                      <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-2xl bg-slate-950/70 px-3 py-2">
                          <p className="uppercase tracking-[0.18em] text-slate-500 text-[10px]">Größe</p>
                          <p className="mt-1 font-mono font-bold text-slate-200">
                            {formatFileSize(state.fileSizeBytes)}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-slate-950/70 px-3 py-2">
                          <p className="uppercase tracking-[0.18em] text-slate-500 text-[10px]">Format</p>
                          <p className="mt-1 truncate font-mono font-bold text-slate-200">
                            {state.fileType ?? "n/a"}
                          </p>
                        </div>
                      </div>
                      <div className="mb-2 flex justify-between text-xs text-slate-400">
                        <span>{formatTime(state.currentTime)}</span>
                        <span>{formatTime(state.duration)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-violet-400"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={state.isPlaying ? controls.pauseFile : controls.playFile}
                        disabled={!state.hasLoadedFile || state.isLoading}
                        className="mt-4 w-full rounded-2xl bg-violet-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {state.isLoading
                          ? "Lade Datei..."
                          : state.isPlaying
                            ? "Pause"
                            : "Datei abspielen"}
                      </button>
                    </div>
                  )}

                  {/* Volume Meter Section */}
                  <div className="border-t border-white/5 pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-bold text-white">Master Pegel</h3>
                      <span className="font-mono text-sm font-bold text-cyan-200">
                        {formatDb(state.levelDb)}
                      </span>
                    </div>
                    <div className="h-5 overflow-hidden rounded-full bg-slate-950 ring-1 ring-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-cyan-300 to-rose-400 transition-[width] duration-75"
                        style={{ width: `${levelPercent}%` }}
                      />
                    </div>
                    <div className="relative mt-2 h-2 rounded-full bg-slate-900">
                      <div
                        className="absolute top-0 h-2 w-1 rounded-full bg-white shadow-[0_0_14px_rgba(255,255,255,0.7)]"
                        style={{ left: `${peakPercent}%` }}
                      />
                    </div>
                    <div className="mt-2 flex justify-between text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">
                      <span>-96</span>
                      <span>-48</span>
                      <span>-12 dB</span>
                    </div>
                  </div>

                  {/* Analysis Snapshot */}
                  <div className="border-t border-white/5 pt-4">
                    <h3 className="text-sm font-bold text-white mb-3">Signal-Analyse</h3>
                    <dl className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-xl bg-slate-950/70 px-3 py-2">
                        <dt className="uppercase tracking-[0.12em] text-slate-500">Dominant Freq</dt>
                        <dd className="mt-1 font-mono font-bold text-cyan-100">
                          {formatFrequency(state.dominantFrequency)}
                        </dd>
                      </div>
                      <div className="rounded-xl bg-slate-950/70 px-3 py-2">
                        <dt className="uppercase tracking-[0.12em] text-slate-500">Centroid</dt>
                        <dd className="mt-1 font-mono font-bold text-cyan-100">
                          {formatFrequency(state.spectralCentroid)}
                        </dd>
                      </div>
                      <div className="rounded-xl bg-slate-950/70 px-3 py-2">
                        <dt className="uppercase tracking-[0.12em] text-slate-500">Peak</dt>
                        <dd className="mt-1 font-mono font-bold text-cyan-100">
                          {formatDb(state.peakDb)}
                        </dd>
                      </div>
                      <div className="rounded-xl bg-slate-950/70 px-3 py-2">
                        <dt className="uppercase tracking-[0.12em] text-slate-500">Crest Factor</dt>
                        <dd className="mt-1 font-mono font-bold text-cyan-100">
                          {formatDb(state.crestDb)}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              )}

              {/* TAB 2: EQ (Parametric 3-Band Equalizer) */}
              {activeTab === "eq" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-white">3-Band Equalizer</h2>
                      <p className="text-xs text-slate-400">
                        Parametrische Frequenz-Anhebung / Absenkung
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        controls.setEqLow(0);
                        controls.setEqMid(0);
                        controls.setEqHigh(0);
                      }}
                      className="rounded-lg bg-white/10 px-2 py-1 text-xs font-bold text-slate-300 hover:bg-white/20 transition"
                    >
                      Flat Reset
                    </button>
                  </div>

                  <div className="space-y-5 rounded-2xl bg-slate-950/70 p-4">
                    {/* Low Slider */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-300">Bass (Low Shelf @ 200 Hz)</span>
                        <span className="font-mono text-cyan-300 font-bold">
                          {state.eqLow > 0 ? `+${state.eqLow.toFixed(1)}` : state.eqLow.toFixed(1)} dB
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-12"
                        max="12"
                        step="0.5"
                        value={state.eqLow}
                        onChange={(e) => controls.setEqLow(Number(e.target.value))}
                        className="h-2 w-full cursor-pointer accent-cyan-300"
                      />
                    </div>

                    {/* Mid Slider */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-300">Mitten (Peak @ 1000 Hz)</span>
                        <span className="font-mono text-violet-400 font-bold">
                          {state.eqMid > 0 ? `+${state.eqMid.toFixed(1)}` : state.eqMid.toFixed(1)} dB
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-12"
                        max="12"
                        step="0.5"
                        value={state.eqMid}
                        onChange={(e) => controls.setEqMid(Number(e.target.value))}
                        className="h-2 w-full cursor-pointer accent-violet-400"
                      />
                    </div>

                    {/* High Slider */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-300">Höhen (High Shelf @ 5000 Hz)</span>
                        <span className="font-mono text-fuchsia-400 font-bold">
                          {state.eqHigh > 0 ? `+${state.eqHigh.toFixed(1)}` : state.eqHigh.toFixed(1)} dB
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-12"
                        max="12"
                        step="0.5"
                        value={state.eqHigh}
                        onChange={(e) => controls.setEqHigh(Number(e.target.value))}
                        className="h-2 w-full cursor-pointer accent-fuchsia-400"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/5 bg-slate-900/30 p-3 text-[11px] text-slate-400">
                    <p className="font-semibold text-slate-300 mb-1">Was bewirkt der EQ?</p>
                    Der Equalizer filtert die Audiosignale vor dem Spektrum. Der Bassregler regelt Frequenzen unter 200Hz, Mitten bearbeiten Stimmen & Instrumente um 1kHz, Höhen regeln Präsenz ab 5kHz.
                  </div>
                </div>
              )}

              {/* TAB 3: FILTER (Filter & Analyser configuration) */}
              {activeTab === "filter" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-white">Filter & FFT Optionen</h2>
                    <p className="text-xs text-slate-400">
                      Biquad-Cutoff Filter & Frequenzanalyse-Parameter
                    </p>
                  </div>

                  {/* Volume Control */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-300">Input-Verstärkung (Gain)</span>
                      <span className="font-mono text-cyan-300">
                        {(state.gain * 100).toFixed(0)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.01"
                      value={state.gain}
                      onChange={handleGainChange}
                      className="h-2 w-full cursor-pointer accent-cyan-300"
                    />
                  </div>

                  {/* Filter controls */}
                  <div className="border-t border-white/5 pt-4 space-y-4">
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-300">Filter-Charakteristik</label>
                      <select
                        value={state.filterType}
                        onChange={(e) => controls.setFilterType(e.target.value as FilterMode)}
                        className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-300"
                      >
                        {(
                          [
                            "lowpass",
                            "highpass",
                            "bandpass",
                            "notch",
                            "peaking",
                            "lowshelf",
                            "highshelf",
                          ] as FilterMode[]
                        ).map((mode) => (
                          <option key={mode} value={mode}>
                            {filterLabel(mode)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-300">Grenzfrequenz (Cutoff)</span>
                        <span className="font-mono text-violet-400 font-bold">
                          {formatFrequency(state.filterFrequency)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="0.1"
                        value={filterSliderValue}
                        onChange={handleFilterSliderChange}
                        className="h-2 w-full cursor-pointer accent-violet-400"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-300">Filter-Güte / Resonanz (Q)</span>
                        <span className="font-mono text-violet-400 font-bold">
                          {state.filterQ.toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="18"
                        step="0.05"
                        value={state.filterQ}
                        onChange={(e) => controls.setFilterQ(Number(e.target.value))}
                        className="h-2 w-full cursor-pointer accent-violet-400"
                      />
                    </div>
                  </div>

                  {/* FFT Settings */}
                  <div className="border-t border-white/5 pt-4 space-y-4">
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-300">FFT-Fenstergröße</label>
                      <select
                        value={state.fftSize}
                        onChange={(e) => controls.setFftSize(Number(e.target.value))}
                        className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-300"
                      >
                        {[256, 512, 1024, 2048, 4096, 8192, 16384].map((size) => (
                          <option key={size} value={size}>
                            {size} Samples
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-300">Dämpfung / Glättung</span>
                        <span className="font-mono text-cyan-300 font-bold">
                          {state.smoothing.toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="0.95"
                        step="0.01"
                        value={state.smoothing}
                        onChange={(e) => controls.setSmoothing(Number(e.target.value))}
                        className="h-2 w-full cursor-pointer accent-cyan-300"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleDownloadFilteredFile}
                    disabled={!state.hasLoadedFile || state.isExporting}
                    className="w-full rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {state.isExporting ? "Exportiere Audio..." : "Gefilterte WAV herunterladen"}
                  </button>
                </div>
              )}

              {/* TAB 4: DYNAMICS (Compressor) */}
              {activeTab === "dynamics" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-white">Dynamikkompression</h2>
                      <p className="text-xs text-slate-400">Mastering Compressor / Peak-Limiter</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => controls.setCompressorEnabled(!state.compressorEnabled)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                        state.compressorEnabled
                          ? "bg-emerald-400 text-slate-950"
                          : "bg-white/10 text-slate-400 hover:bg-white/20"
                      }`}
                    >
                      {state.compressorEnabled ? "Aktiviert" : "Bypass"}
                    </button>
                  </div>

                  <div className="space-y-5 rounded-2xl bg-slate-950/70 p-4">
                    {/* Threshold */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-300">Schwellenwert (Threshold)</span>
                        <span className="font-mono text-emerald-400 font-bold">
                          {state.compressorThreshold.toFixed(0)} dB
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-60"
                        max="0"
                        step="1"
                        disabled={!state.compressorEnabled}
                        value={state.compressorThreshold}
                        onChange={(e) => controls.setCompressorThreshold(Number(e.target.value))}
                        className="h-2 w-full cursor-pointer accent-emerald-400 disabled:opacity-30"
                      />
                    </div>

                    {/* Ratio */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-300">Verhältnis (Ratio)</span>
                        <span className="font-mono text-emerald-400 font-bold">
                          {state.compressorRatio.toFixed(1)}:1
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="20"
                        step="0.5"
                        disabled={!state.compressorEnabled}
                        value={state.compressorRatio}
                        onChange={(e) => controls.setCompressorRatio(Number(e.target.value))}
                        className="h-2 w-full cursor-pointer accent-emerald-400 disabled:opacity-30"
                      />
                    </div>

                    {/* Attack */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-300">Ansprechzeit (Attack)</span>
                        <span className="font-mono text-emerald-400 font-bold">
                          {(state.compressorAttack * 1000).toFixed(0)} ms
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.001"
                        max="1.0"
                        step="0.005"
                        disabled={!state.compressorEnabled}
                        value={state.compressorAttack}
                        onChange={(e) => controls.setCompressorAttack(Number(e.target.value))}
                        className="h-2 w-full cursor-pointer accent-emerald-400 disabled:opacity-30"
                      />
                    </div>

                    {/* Release */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-300">Abklingzeit (Release)</span>
                        <span className="font-mono text-emerald-400 font-bold">
                          {(state.compressorRelease * 1000).toFixed(0)} ms
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.01"
                        max="3.0"
                        step="0.05"
                        disabled={!state.compressorEnabled}
                        value={state.compressorRelease}
                        onChange={(e) => controls.setCompressorRelease(Number(e.target.value))}
                        className="h-2 w-full cursor-pointer accent-emerald-400 disabled:opacity-30"
                      />
                    </div>

                    {/* Knee */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-300">Kompressionkurve (Knee)</span>
                        <span className="font-mono text-emerald-400 font-bold">
                          {state.compressorKnee.toFixed(0)} dB
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="40"
                        step="1"
                        disabled={!state.compressorEnabled}
                        value={state.compressorKnee}
                        onChange={(e) => controls.setCompressorKnee(Number(e.target.value))}
                        className="h-2 w-full cursor-pointer accent-emerald-400 disabled:opacity-30"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/5 bg-slate-900/30 p-3 text-[11px] text-slate-400">
                    <p className="font-semibold text-slate-300 mb-1">Was bewirkt der Kompressor?</p>
                    Ein Kompressor gleicht Pegelunterschiede aus. Er senkt laute Pegelspitzen über dem Schwellenwert (Threshold) ab und macht leise Stellen deutlicher hörbar. Dies erhöht die Dichte und den Druck im Gesamtsignal.
                  </div>
                </div>
              )}

              {/* TAB 5: DELAY (Echo-Effect) */}
              {activeTab === "delay" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-white">Delay & Echo</h2>
                      <p className="text-xs text-slate-400">Klassischer Stereo Echo-Verzögerer</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => controls.setDelayEnabled(!state.delayEnabled)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                        state.delayEnabled
                          ? "bg-violet-400 text-slate-950"
                          : "bg-white/10 text-slate-400 hover:bg-white/20"
                      }`}
                    >
                      {state.delayEnabled ? "Aktiviert" : "Bypass"}
                    </button>
                  </div>

                  <div className="space-y-5 rounded-2xl bg-slate-950/70 p-4">
                    {/* Delay Time */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-300">Echo-Verzögerung (Zeit)</span>
                        <span className="font-mono text-violet-300 font-bold">
                          {(state.delayTime * 1000).toFixed(0)} ms
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.01"
                        max="2.0"
                        step="0.01"
                        disabled={!state.delayEnabled}
                        value={state.delayTime}
                        onChange={(e) => controls.setDelayTime(Number(e.target.value))}
                        className="h-2 w-full cursor-pointer accent-violet-400 disabled:opacity-30"
                      />
                    </div>

                    {/* Feedback */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-300">Rückkopplung (Feedback)</span>
                        <span className="font-mono text-violet-300 font-bold">
                          {(state.delayFeedback * 100).toFixed(0)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="0.95"
                        step="0.01"
                        disabled={!state.delayEnabled}
                        value={state.delayFeedback}
                        onChange={(e) => controls.setDelayFeedback(Number(e.target.value))}
                        className="h-2 w-full cursor-pointer accent-violet-400 disabled:opacity-30"
                      />
                    </div>

                    {/* Mix */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-300">Effekt-Stärke (Dry / Wet Mix)</span>
                        <span className="font-mono text-violet-300 font-bold">
                          {(state.delayMix * 100).toFixed(0)}% Wet
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.01"
                        disabled={!state.delayEnabled}
                        value={state.delayMix}
                        onChange={(e) => controls.setDelayMix(Number(e.target.value))}
                        className="h-2 w-full cursor-pointer accent-violet-400 disabled:opacity-30"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/5 bg-slate-900/30 p-3 text-[11px] text-slate-400">
                    <p className="font-semibold text-slate-300 mb-1">Was macht das Delay?</p>
                    Ein Delay verzögert das Audiosignal. Feedback (Rückkopplung) speist das Echo wieder zurück in das Delay, um eine abklingende Echofolge zu erzeugen. Der Mix bestimmt das Lautstärkeverhältnis zwischen dem trockenen (Dry) und verhallten (Wet) Ton.
                  </div>
                </div>
              )}

              {/* TAB 6: GENERATOR (Test Tone Signal Generator) */}
              {activeTab === "generator" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-white">Signalgenerator</h2>
                    <p className="text-xs text-slate-400">Generiert präzise Test-Töne und Rauschen</p>
                  </div>

                  {state.inputMode !== "generator" ? (
                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-5 text-center">
                      <p className="text-sm font-bold text-amber-200">
                        Generator ist zurzeit inaktiv
                      </p>
                      <p className="mt-2 text-xs text-slate-400">
                        Wählen Sie im Tab <strong>Eingang</strong> die Quelle{" "}
                        <strong>Test-Generator</strong> aus, um den Tongenerator freizuschalten.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          handleModeChange("generator");
                          setActiveTab("generator");
                        }}
                        className="mt-4 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-300"
                      >
                        Als Eingang festlegen
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-slate-300">Wellenform</label>
                        <div className="grid grid-cols-2 gap-2">
                          {(["sine", "square", "sawtooth", "triangle", "white_noise"] as GeneratorType[]).map(
                            (type) => (
                              <button
                                key={type}
                                type="button"
                                onClick={() => controls.setGeneratorType(type)}
                                className={`rounded-xl px-2 py-2 text-xs font-bold transition capitalize ${
                                  state.generatorType === type
                                    ? "bg-cyan-300 text-slate-950 font-black"
                                    : "bg-slate-950/60 text-slate-300 hover:bg-white/5"
                                } ${type === "white_noise" ? "col-span-2" : ""}`}
                              >
                                {type === "white_noise"
                                  ? "Weißes Rauschen"
                                  : type === "sine"
                                    ? "Sinus"
                                    : type === "square"
                                      ? "Rechteck"
                                      : type === "sawtooth"
                                        ? "Sägezahn"
                                        : "Dreieck"}
                              </button>
                            ),
                          )}
                        </div>
                      </div>

                      {state.generatorType !== "white_noise" && (
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="font-semibold text-slate-300">Tonfrequenz</span>
                            <span className="font-mono text-cyan-300 font-bold">
                              {formatFrequency(state.generatorFrequency)}
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="0.1"
                            value={generatorSliderValue}
                            onChange={handleGeneratorSliderChange}
                            className="h-2 w-full cursor-pointer accent-cyan-300"
                          />
                          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                            <span>40 Hz</span>
                            <span>1 kHz</span>
                            <span>20 kHz</span>
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold text-slate-300">Generator-Pegel</span>
                          <span className="font-mono text-cyan-300 font-bold">
                            {(state.generatorVolume * 100).toFixed(0)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.0"
                          max="1.0"
                          step="0.01"
                          value={state.generatorVolume}
                          onChange={(e) => controls.setGeneratorVolume(Number(e.target.value))}
                          className="h-2 w-full cursor-pointer accent-cyan-300"
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => controls.setGeneratorEnabled(!state.generatorEnabled)}
                          className={`w-full rounded-2xl py-3 text-sm font-bold text-slate-950 transition ${
                            state.isPlaying
                              ? "bg-rose-400 hover:bg-rose-300"
                              : "bg-cyan-300 hover:bg-cyan-200"
                          }`}
                        >
                          {state.isPlaying ? "Aktivität stoppen" : "Ton abspielen"}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl border border-white/5 bg-slate-900/30 p-3 text-[11px] text-slate-400">
                    <p className="font-semibold text-slate-300 mb-1">Wozu dient der Signalgenerator?</p>
                    Damit lassen sich Frequenzgänge, Filtersteigungen (z.B. Cutoff) und Raumakustik auswerten. Sinuswellen sind perfekt für harmonische Analysen, während weißes Rauschen das gesamte Spektrum gleichmäßig anregt.
                  </div>
                </div>
              )}
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
