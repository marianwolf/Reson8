import type { ChangeEvent } from "react";
import {
  type AudioInputMode,
  type FilterMode,
  useAudioProcessor,
} from "../hooks/useAudioProcessor";

const MIN_FILTER_FREQUENCY = 40;
const MAX_FILTER_FREQUENCY = 18_000;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function frequencyToSliderValue(frequency: number) {
  const minimumLog = Math.log10(MIN_FILTER_FREQUENCY);
  const maximumLog = Math.log10(MAX_FILTER_FREQUENCY);
  const frequencyLog = Math.log10(clamp(frequency, MIN_FILTER_FREQUENCY, MAX_FILTER_FREQUENCY));

  return ((frequencyLog - minimumLog) / (maximumLog - minimumLog)) * 100;
}

function sliderValueToFrequency(value: number) {
  const minimumLog = Math.log10(MIN_FILTER_FREQUENCY);
  const maximumLog = Math.log10(MAX_FILTER_FREQUENCY);
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
  if (frequency >= 1_000) {
    return `${(frequency / 1_000).toFixed(frequency >= 10_000 ? 1 : 2)} kHz`;
  }

  return `${Math.round(frequency)} Hz`;
}

function modeLabel(mode: AudioInputMode) {
  return mode === "microphone" ? "Mikrofon" : "Datei";
}

function filterLabel(filterType: FilterMode) {
  return filterType === "lowpass" ? "Lowpass" : "Highpass";
}

export default function AudioVisualizerDashboard() {
  const { state, refs, controls } = useAudioProcessor({
    fftSize: 2048,
    smoothingTimeConstant: 0.82,
  });

  const levelPercent = clamp(((state.levelDb + 96) / 84) * 100, 0, 100);
  const peakPercent = clamp(((state.peakDb + 96) / 84) * 100, 0, 100);
  const progressPercent =
    state.duration > 0 ? clamp((state.currentTime / state.duration) * 100, 0, 100) : 0;
  const filterSliderValue = frequencyToSliderValue(state.filterFrequency);

  const handleModeChange = (mode: AudioInputMode) => {
    controls.setInputMode(mode);
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      await controls.loadAudioFile(file);
    }
  };

  const handleFilterSliderChange = (event: ChangeEvent<HTMLInputElement>) => {
    controls.setFilterFrequency(sliderValueToFrequency(Number(event.target.value)));
  };

  const handleGainChange = (event: ChangeEvent<HTMLInputElement>) => {
    controls.setGain(Number(event.target.value));
  };

  return (
    <main className="min-h-screen overflow-hidden px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <section className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col justify-between gap-5 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-glow backdrop-blur-xl lg:flex-row lg:items-center">
          <div>
            <p className="mb-3 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.32em] text-cyan-200">
              Reson8 Studio
            </p>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-5xl">
              Web Audio Analyzer
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Echtzeit-Frequenzanalyse, Oszilloskop, dB-Meter und Filtersteuerung
              für Mikrofon-Input oder lokale MP3-Wiedergabe.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={controls.initialize}
              className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:ring-offset-2 focus:ring-offset-slate-950"
            >
              {state.isInitialized ? "Audio Engine aktiv" : "Audio Engine starten"}
            </button>
            <button
              type="button"
              onClick={controls.stop}
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-slate-200 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 focus:ring-offset-slate-950"
            >
              Stop
            </button>
          </div>
        </header>

        {state.error && (
          <div className="rounded-3xl border border-rose-400/30 bg-rose-500/10 px-5 py-4 text-sm font-medium text-rose-100">
            {state.error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_23rem]">
          <section className="grid gap-6">
            <article className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-white">Frequency Spectrum</h2>
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                    FFT Bar Chart · {state.isPlaying ? "Live" : "Idle"}
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
                  {formatFrequency(state.filterFrequency)}
                </span>
              </div>
              <canvas
                ref={refs.waveformCanvasRef}
                className="h-56 w-full rounded-3xl border border-white/5 bg-slate-900/80"
              />
            </article>
          </section>

          <aside className="grid gap-6">
            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
              <h2 className="text-lg font-bold text-white">Input Management</h2>
              <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-slate-950/70 p-1">
                {(["microphone", "file"] as AudioInputMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleModeChange(mode)}
                    className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                      state.inputMode === mode
                        ? "bg-cyan-300 text-slate-950"
                        : "text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    {modeLabel(mode)}
                  </button>
                ))}
              </div>

              {state.inputMode === "microphone" ? (
                <button
                  type="button"
                  onClick={controls.startMicrophone}
                  className="mt-4 w-full rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/20"
                >
                  Mikrofon aktivieren
                </button>
              ) : (
                <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-500/60 bg-slate-950/60 px-4 py-6 text-center transition hover:border-cyan-300/60 hover:bg-cyan-300/5">
                  <span className="text-sm font-bold text-white">
                    MP3 oder Audiodatei hochladen
                  </span>
                  <span className="mt-1 text-xs text-slate-400">
                    {state.fileName ?? "Lokale Datei auswählen"}
                  </span>
                  <input
                    type="file"
                    accept="audio/mpeg,audio/mp3,audio/*"
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                </label>
              )}

              {state.inputMode === "file" && (
                <div className="mt-4">
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
                    disabled={!state.fileName || state.isLoading}
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
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Volume Meter</h2>
                <span className="font-mono text-sm font-bold text-cyan-200">
                  {state.levelDb.toFixed(1)} dB
                </span>
              </div>
              <div className="mt-4 h-5 overflow-hidden rounded-full bg-slate-950 ring-1 ring-white/10">
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
              <div className="mt-2 flex justify-between text-[0.68rem] uppercase tracking-[0.18em] text-slate-500">
                <span>-96</span>
                <span>-48</span>
                <span>-12 dB</span>
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Audio Tools</h2>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-200">
                  {filterLabel(state.filterType)}
                </span>
              </div>

              <div className="mt-5 space-y-5">
                <label className="block">
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="font-semibold text-slate-200">Gain</span>
                    <span className="font-mono text-slate-400">
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
                </label>

                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-200">Filtertyp</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["lowpass", "highpass"] as FilterMode[]).map((filterType) => (
                      <button
                        key={filterType}
                        type="button"
                        onClick={() => controls.setFilterType(filterType)}
                        className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                          state.filterType === filterType
                            ? "bg-violet-300 text-slate-950"
                            : "bg-slate-950/70 text-slate-300 hover:bg-white/10"
                        }`}
                      >
                        {filterLabel(filterType)}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="block">
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="font-semibold text-slate-200">Cutoff Frequency</span>
                    <span className="font-mono text-slate-400">
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
                    className="h-2 w-full cursor-pointer accent-violet-300"
                  />
                </label>
              </div>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
