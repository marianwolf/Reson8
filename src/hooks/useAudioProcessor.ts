import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";

export type AudioInputMode = "microphone" | "file" | "generator";

export type FilterMode =
  | "lowpass"
  | "highpass"
  | "bandpass"
  | "notch"
  | "peaking"
  | "lowshelf"
  | "highshelf";

export type GeneratorType = "sine" | "square" | "sawtooth" | "triangle" | "white_noise";

export interface AudioProcessorOptions {
  fftSize?: number;
  smoothingTimeConstant?: number;
  minDecibels?: number;
  maxDecibels?: number;
}

export interface AudioProcessorState {
  inputMode: AudioInputMode;
  isInitialized: boolean;
  isPlaying: boolean;
  isLoading: boolean;
  isExporting: boolean;
  levelDb: number;
  peakDb: number;
  gain: number;
  filterType: FilterMode;
  filterFrequency: number;
  filterQ: number;
  duration: number;
  currentTime: number;
  fileName: string | null;
  hasLoadedFile: boolean;
  fileSizeBytes: number | null;
  fileType: string | null;
  channelCount: number | null;
  sampleRate: number | null;
  dominantFrequency: number;
  spectralCentroid: number;
  spectralRolloff: number;
  zeroCrossingRate: number;
  crestDb: number;
  rmsMinDb: number;
  rmsAverageDb: number;
  rmsMaxDb: number;
  rmsSampleCount: number;
  error: string | null;

  // Equalizer (3-Band)
  eqLow: number;  // gain in dB, -12 to +12
  eqMid: number;  // gain in dB, -12 to +12
  eqHigh: number; // gain in dB, -12 to +12

  // Compressor
  compressorEnabled: boolean;
  compressorThreshold: number; // dB, -60 to 0
  compressorKnee: number;      // dB, 0 to 40
  compressorRatio: number;     // 1 to 20
  compressorAttack: number;    // seconds, 0.001 to 1.0
  compressorRelease: number;   // seconds, 0.01 to 3.0

  // Delay / Echo
  delayEnabled: boolean;
  delayTime: number;      // seconds, 0.0 to 2.0
  delayFeedback: number;  // 0.0 to 0.95
  delayMix: number;       // 0.0 to 1.0 (dry/wet)

  // Signal Generator
  generatorEnabled: boolean;
  generatorType: GeneratorType;
  generatorFrequency: number;   // Hz, 40 to 20,000
  generatorVolume: number;      // 0.0 to 1.0

  // Analyzer Configuration
  fftSize: number;
  smoothing: number;
}

export interface AudioProcessorRefs {
  frequencyCanvasRef: RefObject<HTMLCanvasElement | null>;
  waveformCanvasRef: RefObject<HTMLCanvasElement | null>;
  circularOscillatorCanvasRef: RefObject<HTMLCanvasElement | null>;
}

export interface AudioProcessorControls {
  initialize: () => Promise<void>;
  startMicrophone: () => Promise<void>;
  loadAudioFile: (file: File) => Promise<void>;
  downloadFilteredFile: () => Promise<void>;
  playFile: () => Promise<void>;
  pauseFile: () => void;
  stop: () => void;
  setInputMode: (mode: AudioInputMode) => void;
  setGain: (gain: number) => void;
  setFilterType: (filterType: FilterMode) => void;
  setFilterFrequency: (frequency: number) => void;
  setFilterQ: (q: number) => void;
  setEqLow: (gain: number) => void;
  setEqMid: (gain: number) => void;
  setEqHigh: (gain: number) => void;
  setCompressorEnabled: (enabled: boolean) => void;
  setCompressorThreshold: (threshold: number) => void;
  setCompressorKnee: (knee: number) => void;
  setCompressorRatio: (ratio: number) => void;
  setCompressorAttack: (attack: number) => void;
  setCompressorRelease: (release: number) => void;
  setDelayEnabled: (enabled: boolean) => void;
  setDelayTime: (time: number) => void;
  setDelayFeedback: (feedback: number) => void;
  setDelayMix: (mix: number) => void;
  setGeneratorEnabled: (enabled: boolean) => void;
  setGeneratorType: (type: GeneratorType) => void;
  setGeneratorFrequency: (frequency: number) => void;
  setGeneratorVolume: (volume: number) => void;
  setFftSize: (size: number) => void;
  setSmoothing: (smoothing: number) => void;
}

export interface UseAudioProcessorResult {
  state: AudioProcessorState;
  refs: AudioProcessorRefs;
  controls: AudioProcessorControls;
}

interface AudioGraphNodes {
  context: AudioContext;
  analyser: AnalyserNode;
  gainNode: GainNode;
  filterNode: BiquadFilterNode;
  lowEQ: BiquadFilterNode;
  midEQ: BiquadFilterNode;
  highEQ: BiquadFilterNode;
  compressorNode: DynamicsCompressorNode;
  delayNode: DelayNode;
  feedbackGainNode: GainNode;
  wetGainNode: GainNode;
  dryGainNode: GainNode;
}

interface LoadedAudioFile {
  buffer: AudioBuffer;
  name: string;
}

type AudioByteData = Uint8Array<ArrayBuffer>;

const DEFAULT_FFT_SIZE = 2048;
const DEFAULT_SMOOTHING = 0.82;
const MIN_DECIBELS = -96;
const MAX_DECIBELS = -12;
const INITIAL_FILTER_FREQUENCY = 12_000;
const INITIAL_GAIN = 0.85;
const METER_FLOOR_DB = -96;
const SETTINGS_STORAGE_KEY = "reson8.audio-settings";

interface StoredAudioSettings {
  inputMode?: AudioInputMode;
  gain?: number;
  filterType?: FilterMode;
  filterFrequency?: number;
  fileName?: string | null;
  fileSizeBytes?: number | null;
  fileType?: string | null;
  filterQ?: number;
  eqLow?: number;
  eqMid?: number;
  eqHigh?: number;
  compressorEnabled?: boolean;
  compressorThreshold?: number;
  compressorKnee?: number;
  compressorRatio?: number;
  compressorAttack?: number;
  compressorRelease?: number;
  delayEnabled?: boolean;
  delayTime?: number;
  delayFeedback?: number;
  delayMix?: number;
  generatorType?: GeneratorType;
  generatorFrequency?: number;
  generatorVolume?: number;
  fftSize?: number;
  smoothing?: number;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function resizeCanvas(canvas: HTMLCanvasElement) {
  const pixelRatio = window.devicePixelRatio || 1;
  const displayWidth = Math.floor(canvas.clientWidth * pixelRatio);
  const displayHeight = Math.floor(canvas.clientHeight * pixelRatio);

  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
  }

  return { width: displayWidth, height: displayHeight };
}

function drawFrequencyBars(canvas: HTMLCanvasElement, frequencyData: AudioByteData) {
  const canvasContext = canvas.getContext("2d");
  if (!canvasContext) {
    return;
  }

  const { width, height } = resizeCanvas(canvas);
  const gradient = canvasContext.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#67e8f9");
  gradient.addColorStop(0.5, "#38bdf8");
  gradient.addColorStop(1, "#7c3aed");

  canvasContext.clearRect(0, 0, width, height);
  canvasContext.fillStyle = "rgba(15, 23, 42, 0.58)";
  canvasContext.fillRect(0, 0, width, height);

  const barCount = Math.min(160, frequencyData.length);
  const step = Math.floor(frequencyData.length / barCount) || 1;
  const gap = Math.max(2, width * 0.004);
  const barWidth = width / barCount - gap;

  for (let index = 0; index < barCount; index += 1) {
    const dataIndex = Math.min(index * step, frequencyData.length - 1);
    const value = frequencyData[dataIndex] / 255;
    const easedValue = Math.pow(value, 1.45);
    const barHeight = Math.max(3, easedValue * height * 0.92);
    const xPosition = index * (barWidth + gap);
    const yPosition = height - barHeight;

    canvasContext.shadowBlur = 18;
    canvasContext.shadowColor = "rgba(56, 189, 248, 0.36)";
    canvasContext.fillStyle = gradient;
    canvasContext.beginPath();
    canvasContext.roundRect(xPosition, yPosition, barWidth, barHeight, 8);
    canvasContext.fill();
  }

  canvasContext.shadowBlur = 0;
  canvasContext.strokeStyle = "rgba(148, 163, 184, 0.14)";
  canvasContext.lineWidth = 1;

  for (let gridIndex = 1; gridIndex < 4; gridIndex += 1) {
    const yPosition = (height / 4) * gridIndex;
    canvasContext.beginPath();
    canvasContext.moveTo(0, yPosition);
    canvasContext.lineTo(width, yPosition);
    canvasContext.stroke();
  }
}

function drawWaveform(canvas: HTMLCanvasElement, waveformData: AudioByteData) {
  const canvasContext = canvas.getContext("2d");
  if (!canvasContext) {
    return;
  }

  const { width, height } = resizeCanvas(canvas);
  const centerY = height / 2;

  canvasContext.clearRect(0, 0, width, height);
  canvasContext.fillStyle = "rgba(15, 23, 42, 0.58)";
  canvasContext.fillRect(0, 0, width, height);

  const fillGradient = canvasContext.createLinearGradient(0, 0, width, 0);
  fillGradient.addColorStop(0, "rgba(34, 211, 238, 0.12)");
  fillGradient.addColorStop(0.5, "rgba(129, 140, 248, 0.20)");
  fillGradient.addColorStop(1, "rgba(217, 70, 239, 0.12)");

  canvasContext.beginPath();
  canvasContext.moveTo(0, centerY);

  const sliceWidth = width / waveformData.length;

  for (let index = 0; index < waveformData.length; index += 1) {
    const normalized = waveformData[index] / 128 - 1;
    const xPosition = index * sliceWidth;
    const yPosition = centerY + normalized * height * 0.42;
    canvasContext.lineTo(xPosition, yPosition);
  }

  canvasContext.lineTo(width, centerY);
  canvasContext.closePath();
  canvasContext.fillStyle = fillGradient;
  canvasContext.fill();

  canvasContext.beginPath();

  for (let index = 0; index < waveformData.length; index += 1) {
    const normalized = waveformData[index] / 128 - 1;
    const xPosition = index * sliceWidth;
    const yPosition = centerY + normalized * height * 0.42;

    if (index === 0) {
      canvasContext.moveTo(xPosition, yPosition);
    } else {
      canvasContext.lineTo(xPosition, yPosition);
    }
  }

  canvasContext.strokeStyle = "#67e8f9";
  canvasContext.lineWidth = Math.max(2, width * 0.003);
  canvasContext.shadowBlur = 22;
  canvasContext.shadowColor = "rgba(34, 211, 238, 0.52)";
  canvasContext.stroke();
  canvasContext.shadowBlur = 0;

  canvasContext.strokeStyle = "rgba(148, 163, 184, 0.18)";
  canvasContext.lineWidth = 1;
  canvasContext.beginPath();
  canvasContext.moveTo(0, centerY);
  canvasContext.lineTo(width, centerY);
  canvasContext.stroke();
}

function drawCircularOscillator(canvas: HTMLCanvasElement, waveformData: AudioByteData) {
  const canvasContext = canvas.getContext("2d");
  if (!canvasContext) {
    return;
  }

  const { width, height } = resizeCanvas(canvas);
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.34;
  const modulationRadius = Math.min(width, height) * 0.16;

  canvasContext.clearRect(0, 0, width, height);
  canvasContext.fillStyle = "rgba(15, 23, 42, 0.58)";
  canvasContext.fillRect(0, 0, width, height);

  canvasContext.strokeStyle = "rgba(148, 163, 184, 0.14)";
  canvasContext.lineWidth = 1;

  for (let ringIndex = 1; ringIndex <= 3; ringIndex += 1) {
    canvasContext.beginPath();
    canvasContext.arc(centerX, centerY, (radius / 3) * ringIndex, 0, Math.PI * 2);
    canvasContext.stroke();
  }

  canvasContext.beginPath();

  for (let index = 0; index < waveformData.length; index += 1) {
    const normalized = waveformData[index] / 128 - 1;
    const angle = (index / waveformData.length) * Math.PI * 2 - Math.PI / 2;
    const dynamicRadius = radius + normalized * modulationRadius;
    const xPosition = centerX + Math.cos(angle) * dynamicRadius;
    const yPosition = centerY + Math.sin(angle) * dynamicRadius;

    if (index === 0) {
      canvasContext.moveTo(xPosition, yPosition);
    } else {
      canvasContext.lineTo(xPosition, yPosition);
    }
  }

  canvasContext.closePath();
  canvasContext.strokeStyle = "#67e8f9";
  canvasContext.lineWidth = Math.max(2, width * 0.006);
  canvasContext.shadowBlur = 28;
  canvasContext.shadowColor = "rgba(34, 211, 238, 0.58)";
  canvasContext.stroke();
  canvasContext.shadowBlur = 0;

  canvasContext.beginPath();
  canvasContext.arc(centerX, centerY, Math.max(4, width * 0.014), 0, Math.PI * 2);
  canvasContext.fillStyle = "#a78bfa";
  canvasContext.fill();
}

function calculateWaveformMetrics(waveformData: AudioByteData) {
  let sumSquares = 0;
  let peak = 0;
  let crossings = 0;
  let previousSample = waveformData[0] - 128;

  for (let index = 0; index < waveformData.length; index += 1) {
    const rawSample = waveformData[index] - 128;
    const centeredSample = Math.abs(rawSample) / 128;

    peak = Math.max(peak, centeredSample);
    sumSquares += centeredSample * centeredSample;

    if (index > 0) {
      if ((previousSample < 0 && rawSample >= 0) || (previousSample >= 0 && rawSample < 0)) {
        crossings += 1;
      }
      previousSample = rawSample;
    }
  }

  const rms = Math.sqrt(sumSquares / waveformData.length);
  const rmsDb = rms > 0 ? Math.max(METER_FLOOR_DB, 20 * Math.log10(rms)) : METER_FLOOR_DB;
  const crestDb = (rms === 0 || peak === 0) ? 0 : 20 * Math.log10(peak / rms);
  const zeroCrossingRate = waveformData.length > 1 ? crossings / (waveformData.length - 1) : 0;

  return { rmsDb, crestDb, zeroCrossingRate };
}

function calculateFrequencyMetrics(frequencyData: AudioByteData, sampleRate: number) {
  const binWidth = sampleRate / 2 / frequencyData.length;
  let totalMagnitude = 0;
  let weightedFrequency = 0;
  let strongestMagnitude = 0;
  let strongestIndex = 0;

  for (let index = 1; index < frequencyData.length; index += 1) {
    const magnitude = frequencyData[index];
    const frequency = index * binWidth;

    totalMagnitude += magnitude;
    weightedFrequency += magnitude * frequency;

    if (magnitude > strongestMagnitude) {
      strongestMagnitude = magnitude;
      strongestIndex = index;
    }
  }

  if (totalMagnitude === 0) {
    return {
      dominantFrequency: 0,
      spectralCentroid: 0,
      spectralRolloff: 0,
    };
  }

  let cumulativeMagnitude = 0;
  let rolloffFrequency = 0;
  const rolloffThreshold = totalMagnitude * 0.85;

  for (let index = 1; index < frequencyData.length; index += 1) {
    cumulativeMagnitude += frequencyData[index];

    if (cumulativeMagnitude >= rolloffThreshold) {
      rolloffFrequency = index * binWidth;
      break;
    }
  }

  return {
    dominantFrequency: strongestIndex * binWidth,
    spectralCentroid: totalMagnitude > 0 ? weightedFrequency / totalMagnitude : 0,
    spectralRolloff: rolloffFrequency,
  };
}

function createWhiteNoiseBuffer(context: AudioContext) {
  const bufferSize = context.sampleRate * 2; // 2 seconds of noise
  const noiseBuffer = context.createBuffer(1, bufferSize, context.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function readStoredAudioSettings(): StoredAudioSettings {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const storedSettings = window.localStorage.getItem(SETTINGS_STORAGE_KEY);

    if (!storedSettings) {
      return {};
    }

    const parsedSettings = JSON.parse(storedSettings) as StoredAudioSettings;

    return {
      inputMode:
        parsedSettings.inputMode === "file" ||
        parsedSettings.inputMode === "microphone" ||
        parsedSettings.inputMode === "generator"
          ? parsedSettings.inputMode
          : undefined,
      gain:
        typeof parsedSettings.gain === "number"
          ? clamp(parsedSettings.gain, 0, 2)
          : undefined,
      filterType: parsedSettings.filterType,
      filterFrequency:
        typeof parsedSettings.filterFrequency === "number"
          ? clamp(parsedSettings.filterFrequency, 40, 18_000)
          : undefined,
      filterQ:
        typeof parsedSettings.filterQ === "number"
          ? clamp(parsedSettings.filterQ, 0.1, 18)
          : undefined,
      fileName:
        typeof parsedSettings.fileName === "string" ? parsedSettings.fileName : null,
      fileSizeBytes:
        typeof parsedSettings.fileSizeBytes === "number" ? parsedSettings.fileSizeBytes : null,
      fileType:
        typeof parsedSettings.fileType === "string" ? parsedSettings.fileType : null,
      eqLow: typeof parsedSettings.eqLow === "number" ? clamp(parsedSettings.eqLow, -12, 12) : undefined,
      eqMid: typeof parsedSettings.eqMid === "number" ? clamp(parsedSettings.eqMid, -12, 12) : undefined,
      eqHigh: typeof parsedSettings.eqHigh === "number" ? clamp(parsedSettings.eqHigh, -12, 12) : undefined,
      compressorEnabled: parsedSettings.compressorEnabled,
      compressorThreshold: parsedSettings.compressorThreshold,
      compressorKnee: parsedSettings.compressorKnee,
      compressorRatio: parsedSettings.compressorRatio,
      compressorAttack: parsedSettings.compressorAttack,
      compressorRelease: parsedSettings.compressorRelease,
      delayEnabled: parsedSettings.delayEnabled,
      delayTime: parsedSettings.delayTime,
      delayFeedback: parsedSettings.delayFeedback,
      delayMix: parsedSettings.delayMix,
      generatorType: parsedSettings.generatorType,
      generatorFrequency: parsedSettings.generatorFrequency,
      generatorVolume: parsedSettings.generatorVolume,
      fftSize: parsedSettings.fftSize,
      smoothing: parsedSettings.smoothing,
    };
  } catch {
    return {};
  }
}

function createInitialState(): AudioProcessorState {
  const storedSettings = readStoredAudioSettings();

  return {
    inputMode: storedSettings.inputMode ?? "microphone",
    isInitialized: false,
    isPlaying: false,
    isLoading: false,
    isExporting: false,
    levelDb: METER_FLOOR_DB,
    peakDb: METER_FLOOR_DB,
    gain: storedSettings.gain ?? INITIAL_GAIN,
    filterType: storedSettings.filterType ?? "lowpass",
    filterFrequency: storedSettings.filterFrequency ?? INITIAL_FILTER_FREQUENCY,
    filterQ: storedSettings.filterQ ?? 0.72,
    duration: 0,
    currentTime: 0,
    fileName: storedSettings.fileName ?? null,
    hasLoadedFile: false,
    fileSizeBytes: storedSettings.fileSizeBytes ?? null,
    fileType: storedSettings.fileType ?? null,
    channelCount: null,
    sampleRate: null,
    dominantFrequency: 0,
    spectralCentroid: 0,
    spectralRolloff: 0,
    zeroCrossingRate: 0,
    crestDb: 0,
    rmsMinDb: METER_FLOOR_DB,
    rmsAverageDb: METER_FLOOR_DB,
    rmsMaxDb: METER_FLOOR_DB,
    rmsSampleCount: 0,
    error: null,

    // New FX states
    eqLow: storedSettings.eqLow ?? 0,
    eqMid: storedSettings.eqMid ?? 0,
    eqHigh: storedSettings.eqHigh ?? 0,
    compressorEnabled: storedSettings.compressorEnabled ?? false,
    compressorThreshold: storedSettings.compressorThreshold ?? -24,
    compressorKnee: storedSettings.compressorKnee ?? 30,
    compressorRatio: storedSettings.compressorRatio ?? 12,
    compressorAttack: storedSettings.compressorAttack ?? 0.003,
    compressorRelease: storedSettings.compressorRelease ?? 0.25,
    delayEnabled: storedSettings.delayEnabled ?? false,
    delayTime: storedSettings.delayTime ?? 0.3,
    delayFeedback: storedSettings.delayFeedback ?? 0.5,
    delayMix: storedSettings.delayMix ?? 0.3,
    generatorEnabled: false,
    generatorType: storedSettings.generatorType ?? "sine",
    generatorFrequency: storedSettings.generatorFrequency ?? 440,
    generatorVolume: storedSettings.generatorVolume ?? 0.2,
    fftSize: storedSettings.fftSize ?? 2048,
    smoothing: storedSettings.smoothing ?? 0.82,
  };
}

function writeStoredAudioSettings(state: AudioProcessorState) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        inputMode: state.inputMode,
        gain: state.gain,
        filterType: state.filterType,
        filterFrequency: state.filterFrequency,
        filterQ: state.filterQ,
        fileName: state.fileName,
        fileSizeBytes: state.fileSizeBytes,
        fileType: state.fileType,
        eqLow: state.eqLow,
        eqMid: state.eqMid,
        eqHigh: state.eqHigh,
        compressorEnabled: state.compressorEnabled,
        compressorThreshold: state.compressorThreshold,
        compressorKnee: state.compressorKnee,
        compressorRatio: state.compressorRatio,
        compressorAttack: state.compressorAttack,
        compressorRelease: state.compressorRelease,
        delayEnabled: state.delayEnabled,
        delayTime: state.delayTime,
        delayFeedback: state.delayFeedback,
        delayMix: state.delayMix,
        generatorType: state.generatorType,
        generatorFrequency: state.generatorFrequency,
        generatorVolume: state.generatorVolume,
        fftSize: state.fftSize,
        smoothing: state.smoothing,
      } satisfies StoredAudioSettings),
    );
  } catch {
    undefined;
  }
}

function writeString(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function encodeAudioBufferToWav(audioBuffer: AudioBuffer) {
  const bytesPerSample = 2;
  const channelCount = audioBuffer.numberOfChannels;
  const sampleCount = audioBuffer.length;
  const dataSize = sampleCount * channelCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, audioBuffer.sampleRate, true);
  view.setUint32(28, audioBuffer.sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  const channelData = Array.from(
    { length: channelCount },
    (_, channelIndex) => audioBuffer.getChannelData(channelIndex),
  );

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sample = clamp(channelData[channelIndex][sampleIndex], -1, 1);
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }

  return buffer;
}

function createDownloadFileName(fileName: string, filterFrequency: number) {
  const extensionIndex = fileName.lastIndexOf(".");
  const baseName = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
  const safeBaseName = baseName.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "");

  return `${safeBaseName || "reson8"}-cutoff-${Math.round(filterFrequency)}hz.wav`;
}

export function useAudioProcessor(
  options: AudioProcessorOptions = {},
): UseAudioProcessorResult {
  const frequencyCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const circularOscillatorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const graphRef = useRef<AudioGraphNodes | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<AudioNode | null>(null);
  const fileSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const generatorSourceRef = useRef<AudioNode | null>(null);
  const generatorGainNodeRef = useRef<GainNode | null>(null);
  const loadedFileRef = useRef<LoadedAudioFile | null>(null);
  const frequencyDataRef = useRef<AudioByteData | null>(null);
  const waveformDataRef = useRef<AudioByteData | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastStateUpdateRef = useRef(0);
  const startedAtRef = useRef(0);
  const playbackOffsetRef = useRef(0);
  const initialStateRef = useRef<AudioProcessorState | null>(null);

  if (!initialStateRef.current) {
    initialStateRef.current = createInitialState();
  }

  const modeRef = useRef<AudioInputMode>(initialStateRef.current.inputMode);
  const isPlayingRef = useRef(false);

  const [state, setState] = useState<AudioProcessorState>(() => initialStateRef.current!);

  const normalizedOptions = useMemo(
    () => ({
      fftSize: options.fftSize ?? state.fftSize,
      smoothingTimeConstant: options.smoothingTimeConstant ?? state.smoothing,
      minDecibels: options.minDecibels ?? MIN_DECIBELS,
      maxDecibels: options.maxDecibels ?? MAX_DECIBELS,
    }),
    [
      options.fftSize,
      options.maxDecibels,
      options.minDecibels,
      options.smoothingTimeConstant,
      state.fftSize,
      state.smoothing,
    ],
  );

  const stopAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const disconnectSource = useCallback(() => {
    if (fileSourceRef.current) {
      try {
        fileSourceRef.current.stop();
      } catch {
        // ignore
      }
      fileSourceRef.current.disconnect();
      fileSourceRef.current = null;
    }

    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
  }, []);

  const stopMicrophone = useCallback(() => {
    if (microphoneStreamRef.current) {
      microphoneStreamRef.current.getTracks().forEach((track) => track.stop());
      microphoneStreamRef.current = null;
    }
  }, []);

  const stopGenerator = useCallback(() => {
    if (generatorSourceRef.current) {
      try {
        (generatorSourceRef.current as any).stop();
      } catch {
        // ignore
      }
      try {
        generatorSourceRef.current.disconnect();
      } catch {
        // ignore
      }
      generatorSourceRef.current = null;
    }
    if (generatorGainNodeRef.current) {
      try {
        generatorGainNodeRef.current.disconnect();
      } catch {
        // ignore
      }
      generatorGainNodeRef.current = null;
    }
  }, []);

  const updatePlayingState = useCallback((isPlaying: boolean) => {
    isPlayingRef.current = isPlaying;
    setState((previousState) => ({
      ...previousState,
      isPlaying,
    }));
  }, []);

  const drawFrame = useCallback(() => {
    const graph = graphRef.current;
    const frequencyCanvas = frequencyCanvasRef.current;
    const waveformCanvas = waveformCanvasRef.current;
    const circularOscillatorCanvas = circularOscillatorCanvasRef.current;
    const loadedFile = loadedFileRef.current;

    if (!graph || !frequencyCanvas || !waveformCanvas) {
      animationFrameRef.current = requestAnimationFrame(drawFrame);
      return;
    }

    if (
      !frequencyDataRef.current ||
      frequencyDataRef.current.length !== graph.analyser.frequencyBinCount
    ) {
      frequencyDataRef.current = new Uint8Array(graph.analyser.frequencyBinCount);
    }

    if (!waveformDataRef.current || waveformDataRef.current.length !== graph.analyser.fftSize) {
      waveformDataRef.current = new Uint8Array(graph.analyser.fftSize);
    }

    const frequencyData = frequencyDataRef.current;
    const waveformData = waveformDataRef.current;

    graph.analyser.getByteFrequencyData(frequencyData);
    graph.analyser.getByteTimeDomainData(waveformData);

    drawFrequencyBars(frequencyCanvas, frequencyData);
    drawWaveform(waveformCanvas, waveformData);

    if (circularOscillatorCanvas) {
      drawCircularOscillator(circularOscillatorCanvas, waveformData);
    }

    const now = performance.now();

    if (now - lastStateUpdateRef.current > 33) {
      lastStateUpdateRef.current = now;
      const { rmsDb: levelDb, crestDb, zeroCrossingRate } = calculateWaveformMetrics(waveformData);
      const frequencyMetrics = calculateFrequencyMetrics(
        frequencyData,
        graph.context.sampleRate,
      );

      setState((previousState) => {
        const currentTime =
          modeRef.current === "file" && isPlayingRef.current
            ? Math.min(
                graph.context.currentTime - startedAtRef.current,
                loadedFile?.buffer.duration ?? previousState.duration,
              )
            : playbackOffsetRef.current;
        const shouldSampleRms = isPlayingRef.current;
        const rmsSampleCount = shouldSampleRms
          ? previousState.rmsSampleCount + 1
          : previousState.rmsSampleCount;
        const rmsMinDb =
          !shouldSampleRms
            ? previousState.rmsMinDb
            : previousState.rmsSampleCount === 0
            ? levelDb
            : Math.min(previousState.rmsMinDb, levelDb);
        const rmsMaxDb =
          !shouldSampleRms
            ? previousState.rmsMaxDb
            : previousState.rmsSampleCount === 0
            ? levelDb
            : Math.max(previousState.rmsMaxDb, levelDb);
        const rmsAverageDb =
          !shouldSampleRms
            ? previousState.rmsAverageDb
            : previousState.rmsSampleCount === 0
            ? levelDb
            : (previousState.rmsAverageDb * previousState.rmsSampleCount + levelDb) /
              rmsSampleCount;

        return {
          ...previousState,
          currentTime,
          levelDb,
          peakDb: Math.max(levelDb, previousState.peakDb - 0.18),
          sampleRate: graph.context.sampleRate,
          dominantFrequency: frequencyMetrics.dominantFrequency,
          spectralCentroid: frequencyMetrics.spectralCentroid,
          spectralRolloff: frequencyMetrics.spectralRolloff,
          zeroCrossingRate,
          crestDb,
          rmsMinDb,
          rmsAverageDb,
          rmsMaxDb,
          rmsSampleCount,
        };
      });
    }

    animationFrameRef.current = requestAnimationFrame(drawFrame);
  }, []);

  const startAnimation = useCallback(() => {
    if (animationFrameRef.current === null) {
      animationFrameRef.current = requestAnimationFrame(drawFrame);
    }
  }, [drawFrame]);

  const initialize = useCallback(async () => {
    if (graphRef.current) {
      if (graphRef.current.context.state === "suspended") {
        await graphRef.current.context.resume();
      }
      setState((previousState) => ({
        ...previousState,
        isInitialized: true,
        error: null,
      }));
      startAnimation();
      return;
    }

    const AudioContextConstructor =
      window.AudioContext ||
      (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextConstructor) {
      setState((previousState) => ({
        ...previousState,
        error: "Dieser Browser unterstützt die Web Audio API nicht.",
      }));
      return;
    }

    const context = new AudioContextConstructor();
    const analyser = context.createAnalyser();
    const gainNode = context.createGain();
    const filterNode = context.createBiquadFilter();

    // 3-Band EQ Biquad Filter Nodes
    const lowEQ = context.createBiquadFilter();
    lowEQ.type = "lowshelf";
    lowEQ.frequency.value = 200;
    lowEQ.gain.value = state.eqLow;

    const midEQ = context.createBiquadFilter();
    midEQ.type = "peaking";
    midEQ.frequency.value = 1000;
    midEQ.Q.value = 1.0;
    midEQ.gain.value = state.eqMid;

    const highEQ = context.createBiquadFilter();
    highEQ.type = "highshelf";
    highEQ.frequency.value = 5000;
    highEQ.gain.value = state.eqHigh;

    // Compressor
    const compressorNode = context.createDynamicsCompressor();
    if (state.compressorEnabled) {
      compressorNode.threshold.value = state.compressorThreshold;
      compressorNode.knee.value = state.compressorKnee;
      compressorNode.ratio.value = state.compressorRatio;
      compressorNode.attack.value = state.compressorAttack;
      compressorNode.release.value = state.compressorRelease;
    } else {
      compressorNode.threshold.value = 0;
      compressorNode.ratio.value = 1;
    }

    // Delay nodes
    const delayNode = context.createDelay(2.0);
    delayNode.delayTime.value = state.delayTime;

    const feedbackGainNode = context.createGain();
    feedbackGainNode.gain.value = state.delayFeedback;

    const wetGainNode = context.createGain();
    wetGainNode.gain.value = state.delayEnabled ? state.delayMix : 0.0;

    const dryGainNode = context.createGain();
    dryGainNode.gain.value = state.delayEnabled ? 1.0 - state.delayMix : 1.0;

    analyser.fftSize = normalizedOptions.fftSize;
    analyser.smoothingTimeConstant = normalizedOptions.smoothingTimeConstant;
    analyser.minDecibels = normalizedOptions.minDecibels;
    analyser.maxDecibels = normalizedOptions.maxDecibels;
    gainNode.gain.value = state.gain;
    filterNode.type = state.filterType;
    filterNode.frequency.value = state.filterFrequency;
    filterNode.Q.value = state.filterQ;

    // Series connections for the main path
    gainNode.connect(filterNode);
    filterNode.connect(lowEQ);
    lowEQ.connect(midEQ);
    midEQ.connect(highEQ);
    highEQ.connect(compressorNode);

    // Dry/Wet split for Delay
    compressorNode.connect(dryGainNode);
    compressorNode.connect(delayNode);

    // Delay Feedback Loop
    delayNode.connect(feedbackGainNode);
    feedbackGainNode.connect(delayNode);

    // Wet path connection
    delayNode.connect(wetGainNode);

    // Combine back to Analyser
    dryGainNode.connect(analyser);
    wetGainNode.connect(analyser);

    graphRef.current = {
      context,
      analyser,
      gainNode,
      filterNode,
      lowEQ,
      midEQ,
      highEQ,
      compressorNode,
      delayNode,
      feedbackGainNode,
      wetGainNode,
      dryGainNode,
    };

    setState((previousState) => ({
      ...previousState,
      isInitialized: true,
      error: null,
    }));

    startAnimation();
  }, [
    normalizedOptions.fftSize,
    normalizedOptions.maxDecibels,
    normalizedOptions.minDecibels,
    normalizedOptions.smoothingTimeConstant,
    startAnimation,
    state.filterFrequency,
    state.filterType,
    state.filterQ,
    state.gain,
    state.eqLow,
    state.eqMid,
    state.eqHigh,
    state.compressorEnabled,
    state.compressorThreshold,
    state.compressorKnee,
    state.compressorRatio,
    state.compressorAttack,
    state.compressorRelease,
    state.delayEnabled,
    state.delayTime,
    state.delayFeedback,
    state.delayMix,
  ]);

  const wireSource = useCallback((sourceNode: AudioNode, routeToSpeakers: boolean) => {
    const graph = graphRef.current;
    if (!graph) {
      return;
    }

    disconnectSource();
    stopGenerator();

    sourceNode.connect(graph.gainNode);

    if (routeToSpeakers) {
      graph.analyser.connect(graph.context.destination);
    } else {
      graph.analyser.disconnect();
    }

    sourceNodeRef.current = sourceNode;
  }, [disconnectSource, stopGenerator]);

  const startMicrophone = useCallback(async () => {
    await initialize();

    const graph = graphRef.current;
    if (!graph) {
      return;
    }

    stopMicrophone();
    stopGenerator();
    playbackOffsetRef.current = 0;
    modeRef.current = "microphone";

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      const microphoneSource = graph.context.createMediaStreamSource(stream);

      microphoneStreamRef.current = stream;
      wireSource(microphoneSource, true);
      updatePlayingState(true);
      setState((previousState) => ({
        ...previousState,
        inputMode: "microphone",
        currentTime: 0,
        rmsMinDb: METER_FLOOR_DB,
        rmsAverageDb: METER_FLOOR_DB,
        rmsMaxDb: METER_FLOOR_DB,
        rmsSampleCount: 0,
        error: null,
      }));
      startAnimation();
    } catch {
      setState((previousState) => ({
        ...previousState,
        error: "Mikrofonzugriff wurde blockiert oder ist nicht verfügbar.",
      }));
      updatePlayingState(false);
    }
  }, [initialize, startAnimation, stopMicrophone, stopGenerator, updatePlayingState, wireSource]);

  const startGenerator = useCallback(async () => {
    await initialize();

    const graph = graphRef.current;
    if (!graph) {
      return;
    }

    stopMicrophone();
    stopGenerator();
    disconnectSource();
    playbackOffsetRef.current = 0;
    modeRef.current = "generator";

    try {
      const generatorGain = graph.context.createGain();
      generatorGain.gain.value = state.generatorVolume;
      generatorGainNodeRef.current = generatorGain;

      let sourceNode: AudioNode;

      if (state.generatorType === "white_noise") {
        const buffer = createWhiteNoiseBuffer(graph.context);
        const bufferSource = graph.context.createBufferSource();
        bufferSource.buffer = buffer;
        bufferSource.loop = true;
        bufferSource.connect(generatorGain);
        sourceNode = bufferSource;
        generatorSourceRef.current = bufferSource;
        bufferSource.start(0);
      } else {
        const osc = graph.context.createOscillator();
        osc.type = state.generatorType as OscillatorType;
        osc.frequency.value = state.generatorFrequency;
        osc.connect(generatorGain);
        sourceNode = osc;
        generatorSourceRef.current = osc;
        osc.start(0);
      }

      // Route the generator output through input gain node
      wireSource(generatorGain, true);
      updatePlayingState(true);
      setState((previousState) => ({
        ...previousState,
        inputMode: "generator",
        generatorEnabled: true,
        currentTime: 0,
        rmsMinDb: METER_FLOOR_DB,
        rmsAverageDb: METER_FLOOR_DB,
        rmsMaxDb: METER_FLOOR_DB,
        rmsSampleCount: 0,
        error: null,
      }));
      startAnimation();
    } catch {
      setState((previousState) => ({
        ...previousState,
        error: "Fehler beim Starten des Signalgenerators.",
      }));
      updatePlayingState(false);
    }
  }, [
    initialize,
    startAnimation,
    stopMicrophone,
    stopGenerator,
    disconnectSource,
    state.generatorType,
    state.generatorFrequency,
    state.generatorVolume,
    updatePlayingState,
    wireSource,
  ]);

  const loadAudioFile = useCallback(
    async (file: File) => {
      await initialize();

      const graph = graphRef.current;
      if (!graph) {
        return;
      }

      setState((previousState) => ({
        ...previousState,
        isLoading: true,
        error: null,
      }));

      try {
        disconnectSource();
        stopMicrophone();
        stopGenerator();
        loadedFileRef.current = null;

        const audioData = await file.arrayBuffer();
        const audioBuffer = await graph.context.decodeAudioData(audioData);

        loadedFileRef.current = {
          buffer: audioBuffer,
          name: file.name,
        };
        playbackOffsetRef.current = 0;
        modeRef.current = "file";
        updatePlayingState(false);

        setState((previousState) => ({
          ...previousState,
          inputMode: "file",
          isLoading: false,
          isExporting: false,
          duration: audioBuffer.duration,
          currentTime: 0,
          fileName: file.name,
          hasLoadedFile: true,
          fileSizeBytes: file.size,
          fileType: file.type || "audio",
          channelCount: audioBuffer.numberOfChannels,
          sampleRate: audioBuffer.sampleRate,
          peakDb: METER_FLOOR_DB,
          dominantFrequency: 0,
          spectralCentroid: 0,
          spectralRolloff: 0,
          zeroCrossingRate: 0,
          crestDb: 0,
          rmsMinDb: METER_FLOOR_DB,
          rmsAverageDb: METER_FLOOR_DB,
          rmsMaxDb: METER_FLOOR_DB,
          rmsSampleCount: 0,
          error: null,
        }));
      } catch {
        setState((previousState) => ({
          ...previousState,
          isLoading: false,
          hasLoadedFile: false,
          error: "Die Audiodatei konnte nicht dekodiert werden.",
        }));
      }
    },
    [disconnectSource, initialize, stopMicrophone, stopGenerator, updatePlayingState],
  );

  const downloadFilteredFile = useCallback(async () => {
    const loadedFile = loadedFileRef.current;

    if (!loadedFile) {
      setState((previousState) => ({
        ...previousState,
        error: "Bitte lade zuerst eine Audiodatei.",
      }));
      return;
    }

    setState((previousState) => ({
      ...previousState,
      isExporting: true,
      error: null,
    }));

    try {
      const offlineContext = new OfflineAudioContext(
        loadedFile.buffer.numberOfChannels,
        loadedFile.buffer.length,
        loadedFile.buffer.sampleRate,
      );
      const sourceNode = offlineContext.createBufferSource();
      const gainNode = offlineContext.createGain();
      const filterNode = offlineContext.createBiquadFilter();

      // Offline EQ Filter Nodes
      const lowEQ = offlineContext.createBiquadFilter();
      lowEQ.type = "lowshelf";
      lowEQ.frequency.value = 200;
      lowEQ.gain.value = state.eqLow;

      const midEQ = offlineContext.createBiquadFilter();
      midEQ.type = "peaking";
      midEQ.frequency.value = 1000;
      midEQ.Q.value = 1.0;
      midEQ.gain.value = state.eqMid;

      const highEQ = offlineContext.createBiquadFilter();
      highEQ.type = "highshelf";
      highEQ.frequency.value = 5000;
      highEQ.gain.value = state.eqHigh;

      // Offline Compressor
      const compressorNode = offlineContext.createDynamicsCompressor();
      if (state.compressorEnabled) {
        compressorNode.threshold.value = state.compressorThreshold;
        compressorNode.knee.value = state.compressorKnee;
        compressorNode.ratio.value = state.compressorRatio;
        compressorNode.attack.value = state.compressorAttack;
        compressorNode.release.value = state.compressorRelease;
      } else {
        compressorNode.threshold.value = 0;
        compressorNode.ratio.value = 1;
      }

      // Offline Delay
      const delayNode = offlineContext.createDelay(2.0);
      delayNode.delayTime.value = state.delayTime;

      const feedbackGainNode = offlineContext.createGain();
      feedbackGainNode.gain.value = state.delayFeedback;

      const wetGainNode = offlineContext.createGain();
      wetGainNode.gain.value = state.delayEnabled ? state.delayMix : 0.0;

      const dryGainNode = offlineContext.createGain();
      dryGainNode.gain.value = state.delayEnabled ? 1.0 - state.delayMix : 1.0;

      sourceNode.buffer = loadedFile.buffer;
      gainNode.gain.value = state.gain;
      filterNode.type = state.filterType;
      filterNode.frequency.value = state.filterFrequency;
      filterNode.Q.value = state.filterQ;

      sourceNode.connect(gainNode);
      gainNode.connect(filterNode);
      filterNode.connect(lowEQ);
      lowEQ.connect(midEQ);
      midEQ.connect(highEQ);
      highEQ.connect(compressorNode);

      compressorNode.connect(dryGainNode);
      compressorNode.connect(delayNode);

      delayNode.connect(feedbackGainNode);
      feedbackGainNode.connect(delayNode);
      delayNode.connect(wetGainNode);

      dryGainNode.connect(offlineContext.destination);
      wetGainNode.connect(offlineContext.destination);

      sourceNode.start(0);

      const renderedBuffer = await offlineContext.startRendering();
      const wavBuffer = encodeAudioBufferToWav(renderedBuffer);
      const wavBlob = new Blob([wavBuffer], { type: "audio/wav" });
      const downloadUrl = URL.createObjectURL(wavBlob);
      const downloadLink = document.createElement("a");

      downloadLink.href = downloadUrl;
      downloadLink.download = createDownloadFileName(
        loadedFile.name,
        state.filterFrequency,
      );
      document.body.append(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      URL.revokeObjectURL(downloadUrl);

      setState((previousState) => ({
        ...previousState,
        isExporting: false,
        error: null,
      }));
    } catch {
      setState((previousState) => ({
        ...previousState,
        isExporting: false,
        error: "Der gefilterte Datei-Export konnte nicht erstellt werden.",
      }));
    }
  }, [
    state.filterFrequency,
    state.filterType,
    state.filterQ,
    state.gain,
    state.eqLow,
    state.eqMid,
    state.eqHigh,
    state.compressorEnabled,
    state.compressorThreshold,
    state.compressorKnee,
    state.compressorRatio,
    state.compressorAttack,
    state.compressorRelease,
    state.delayEnabled,
    state.delayTime,
    state.delayFeedback,
    state.delayMix,
  ]);

  const playFile = useCallback(async () => {
    await initialize();

    const graph = graphRef.current;
    const loadedFile = loadedFileRef.current;

    if (!graph || !loadedFile) {
      setState((previousState) => ({
        ...previousState,
        error: "Bitte lade zuerst eine Audiodatei.",
      }));
      return;
    }

    disconnectSource();
    stopMicrophone();
    stopGenerator();

    const sourceNode = graph.context.createBufferSource();
    sourceNode.buffer = loadedFile.buffer;
    sourceNode.onended = () => {
      if (!isPlayingRef.current) {
        return;
      }

      playbackOffsetRef.current = 0;
      updatePlayingState(false);
      setState((previousState) => ({
        ...previousState,
        currentTime: 0,
      }));
    };

    const safeOffset = clamp(playbackOffsetRef.current, 0, loadedFile.buffer.duration);
    startedAtRef.current = graph.context.currentTime - safeOffset;
    modeRef.current = "file";
    wireSource(sourceNode, true);
    fileSourceRef.current = sourceNode;
    sourceNode.start(0, safeOffset);
    updatePlayingState(true);
    startAnimation();
  }, [
    disconnectSource,
    initialize,
    startAnimation,
    stopMicrophone,
    stopGenerator,
    updatePlayingState,
    wireSource,
  ]);

  const pauseFile = useCallback(() => {
    const graph = graphRef.current;
    const loadedFile = loadedFileRef.current;

    if (!graph || !loadedFile || modeRef.current !== "file") {
      return;
    }

    playbackOffsetRef.current = clamp(
      graph.context.currentTime - startedAtRef.current,
      0,
      loadedFile.buffer.duration,
    );
    updatePlayingState(false);
    disconnectSource();
  }, [disconnectSource, updatePlayingState]);

  const stop = useCallback(() => {
    playbackOffsetRef.current = 0;
    updatePlayingState(false);
    disconnectSource();
    stopMicrophone();
    stopGenerator();
    setState((previousState) => ({
      ...previousState,
      currentTime: 0,
      levelDb: METER_FLOOR_DB,
      peakDb: METER_FLOOR_DB,
      dominantFrequency: 0,
      spectralCentroid: 0,
      spectralRolloff: 0,
      zeroCrossingRate: 0,
      crestDb: 0,
      rmsMinDb: METER_FLOOR_DB,
      rmsAverageDb: METER_FLOOR_DB,
      rmsMaxDb: METER_FLOOR_DB,
      rmsSampleCount: 0,
    }));
  }, [disconnectSource, stopMicrophone, stopGenerator, updatePlayingState]);

  const setInputMode = useCallback(
    (inputMode: AudioInputMode) => {
      modeRef.current = inputMode;
      setState((previousState) => ({
        ...previousState,
        inputMode,
        error: null,
      }));

      if (inputMode === "microphone") {
        void startMicrophone();
      } else if (inputMode === "generator") {
        void startGenerator();
      } else {
        stop();
      }
    },
    [startMicrophone, startGenerator, stop],
  );

  const setGain = useCallback((gain: number) => {
    const normalizedGain = clamp(gain, 0, 2);
    const graph = graphRef.current;

    if (graph) {
      graph.gainNode.gain.setTargetAtTime(
        normalizedGain,
        graph.context.currentTime,
        0.015,
      );
    }

    setState((previousState) => ({
      ...previousState,
      gain: normalizedGain,
    }));
  }, []);

  const setFilterType = useCallback((filterType: FilterMode) => {
    const graph = graphRef.current;

    if (graph) {
      graph.filterNode.type = filterType;
    }

    setState((previousState) => ({
      ...previousState,
      filterType,
    }));
  }, []);

  const setFilterFrequency = useCallback((frequency: number) => {
    const normalizedFrequency = clamp(frequency, 40, 18_000);
    const graph = graphRef.current;

    if (graph) {
      graph.filterNode.frequency.setTargetAtTime(
        normalizedFrequency,
        graph.context.currentTime,
        0.025,
      );
    }

    setState((previousState) => ({
      ...previousState,
      filterFrequency: normalizedFrequency,
    }));
  }, []);

  const setFilterQ = useCallback((q: number) => {
    const normalizedQ = clamp(q, 0.1, 18);
    const graph = graphRef.current;

    if (graph) {
      graph.filterNode.Q.setTargetAtTime(
        normalizedQ,
        graph.context.currentTime,
        0.015,
      );
    }

    setState((previousState) => ({
      ...previousState,
      filterQ: normalizedQ,
    }));
  }, []);

  const setEqLow = useCallback((gain: number) => {
    const normalizedGain = clamp(gain, -12, 12);
    const graph = graphRef.current;

    if (graph) {
      graph.lowEQ.gain.setTargetAtTime(
        normalizedGain,
        graph.context.currentTime,
        0.015,
      );
    }

    setState((previousState) => ({
      ...previousState,
      eqLow: normalizedGain,
    }));
  }, []);

  const setEqMid = useCallback((gain: number) => {
    const normalizedGain = clamp(gain, -12, 12);
    const graph = graphRef.current;

    if (graph) {
      graph.midEQ.gain.setTargetAtTime(
        normalizedGain,
        graph.context.currentTime,
        0.015,
      );
    }

    setState((previousState) => ({
      ...previousState,
      eqMid: normalizedGain,
    }));
  }, []);

  const setEqHigh = useCallback((gain: number) => {
    const normalizedGain = clamp(gain, -12, 12);
    const graph = graphRef.current;

    if (graph) {
      graph.highEQ.gain.setTargetAtTime(
        normalizedGain,
        graph.context.currentTime,
        0.015,
      );
    }

    setState((previousState) => ({
      ...previousState,
      eqHigh: normalizedGain,
    }));
  }, []);

  const setCompressorEnabled = useCallback((enabled: boolean) => {
    setState((previousState) => {
      const graph = graphRef.current;
      if (graph) {
        if (enabled) {
          graph.compressorNode.threshold.setTargetAtTime(
            previousState.compressorThreshold,
            graph.context.currentTime,
            0.015,
          );
          graph.compressorNode.knee.setTargetAtTime(
            previousState.compressorKnee,
            graph.context.currentTime,
            0.015,
          );
          graph.compressorNode.ratio.setTargetAtTime(
            previousState.compressorRatio,
            graph.context.currentTime,
            0.015,
          );
          graph.compressorNode.attack.setTargetAtTime(
            previousState.compressorAttack,
            graph.context.currentTime,
            0.015,
          );
          graph.compressorNode.release.setTargetAtTime(
            previousState.compressorRelease,
            graph.context.currentTime,
            0.015,
          );
        } else {
          graph.compressorNode.threshold.setTargetAtTime(0, graph.context.currentTime, 0.015);
          graph.compressorNode.ratio.setTargetAtTime(1, graph.context.currentTime, 0.015);
        }
      }
      return {
        ...previousState,
        compressorEnabled: enabled,
      };
    });
  }, []);

  const setCompressorThreshold = useCallback((threshold: number) => {
    const val = clamp(threshold, -60, 0);
    const graph = graphRef.current;

    if (graph && state.compressorEnabled) {
      graph.compressorNode.threshold.setTargetAtTime(
        val,
        graph.context.currentTime,
        0.015,
      );
    }

    setState((previousState) => ({
      ...previousState,
      compressorThreshold: val,
    }));
  }, [state.compressorEnabled]);

  const setCompressorKnee = useCallback((knee: number) => {
    const val = clamp(knee, 0, 40);
    const graph = graphRef.current;

    if (graph && state.compressorEnabled) {
      graph.compressorNode.knee.setTargetAtTime(
        val,
        graph.context.currentTime,
        0.015,
      );
    }

    setState((previousState) => ({
      ...previousState,
      compressorKnee: val,
    }));
  }, [state.compressorEnabled]);

  const setCompressorRatio = useCallback((ratio: number) => {
    const val = clamp(ratio, 1, 20);
    const graph = graphRef.current;

    if (graph && state.compressorEnabled) {
      graph.compressorNode.ratio.setTargetAtTime(
        val,
        graph.context.currentTime,
        0.015,
      );
    }

    setState((previousState) => ({
      ...previousState,
      compressorRatio: val,
    }));
  }, [state.compressorEnabled]);

  const setCompressorAttack = useCallback((attack: number) => {
    const val = clamp(attack, 0.001, 1.0);
    const graph = graphRef.current;

    if (graph && state.compressorEnabled) {
      graph.compressorNode.attack.setTargetAtTime(
        val,
        graph.context.currentTime,
        0.015,
      );
    }

    setState((previousState) => ({
      ...previousState,
      compressorAttack: val,
    }));
  }, [state.compressorEnabled]);

  const setCompressorRelease = useCallback((release: number) => {
    const val = clamp(release, 0.01, 3.0);
    const graph = graphRef.current;

    if (graph && state.compressorEnabled) {
      graph.compressorNode.release.setTargetAtTime(
        val,
        graph.context.currentTime,
        0.015,
      );
    }

    setState((previousState) => ({
      ...previousState,
      compressorRelease: val,
    }));
  }, [state.compressorEnabled]);

  const setDelayEnabled = useCallback((enabled: boolean) => {
    setState((previousState) => {
      const graph = graphRef.current;
      if (graph) {
        if (enabled) {
          graph.dryGainNode.gain.setTargetAtTime(
            1.0 - previousState.delayMix,
            graph.context.currentTime,
            0.015,
          );
          graph.wetGainNode.gain.setTargetAtTime(
            previousState.delayMix,
            graph.context.currentTime,
            0.015,
          );
        } else {
          graph.dryGainNode.gain.setTargetAtTime(1.0, graph.context.currentTime, 0.015);
          graph.wetGainNode.gain.setTargetAtTime(0.0, graph.context.currentTime, 0.015);
        }
      }
      return {
        ...previousState,
        delayEnabled: enabled,
      };
    });
  }, []);

  const setDelayTime = useCallback((time: number) => {
    const val = clamp(time, 0.0, 2.0);
    const graph = graphRef.current;

    if (graph) {
      graph.delayNode.delayTime.setTargetAtTime(
        val,
        graph.context.currentTime,
        0.015,
      );
    }

    setState((previousState) => ({
      ...previousState,
      delayTime: val,
    }));
  }, []);

  const setDelayFeedback = useCallback((feedback: number) => {
    const val = clamp(feedback, 0.0, 0.95);
    const graph = graphRef.current;

    if (graph) {
      graph.feedbackGainNode.gain.setTargetAtTime(
        val,
        graph.context.currentTime,
        0.015,
      );
    }

    setState((previousState) => ({
      ...previousState,
      delayFeedback: val,
    }));
  }, []);

  const setDelayMix = useCallback((mix: number) => {
    const val = clamp(mix, 0.0, 1.0);
    setState((previousState) => {
      const graph = graphRef.current;
      if (graph && previousState.delayEnabled) {
        graph.dryGainNode.gain.setTargetAtTime(
          1.0 - val,
          graph.context.currentTime,
          0.015,
        );
        graph.wetGainNode.gain.setTargetAtTime(
          val,
          graph.context.currentTime,
          0.015,
        );
      }
      return {
        ...previousState,
        delayMix: val,
      };
    });
  }, []);

  const setGeneratorEnabled = useCallback((enabled: boolean) => {
    if (enabled) {
      void startGenerator();
    } else {
      stopGenerator();
      updatePlayingState(false);
      setState((prev) => ({ ...prev, generatorEnabled: false }));
    }
  }, [startGenerator, stopGenerator, updatePlayingState]);

  const setGeneratorType = useCallback((type: GeneratorType) => {
    setState((previousState) => {
      const newState = {
        ...previousState,
        generatorType: type,
      };

      if (previousState.inputMode === "generator" && isPlayingRef.current) {
        setTimeout(() => {
          void startGenerator();
        }, 0);
      }

      return newState;
    });
  }, [startGenerator]);

  const setGeneratorFrequency = useCallback((frequency: number) => {
    const val = clamp(frequency, 40, 20_000);
    const graph = graphRef.current;

    if (graph && generatorSourceRef.current && state.generatorType !== "white_noise") {
      const osc = generatorSourceRef.current as OscillatorNode;
      osc.frequency.setTargetAtTime(val, graph.context.currentTime, 0.01);
    }

    setState((previousState) => ({
      ...previousState,
      generatorFrequency: val,
    }));
  }, [state.generatorType]);

  const setGeneratorVolume = useCallback((volume: number) => {
    const val = clamp(volume, 0.0, 1.0);
    const graph = graphRef.current;
    if (graph && generatorGainNodeRef.current) {
      generatorGainNodeRef.current.gain.setTargetAtTime(val, graph.context.currentTime, 0.015);
    }
    setState((previousState) => ({
      ...previousState,
      generatorVolume: val,
    }));
  }, []);

  const setFftSize = useCallback((size: number) => {
    const graph = graphRef.current;
    if (graph) {
      graph.analyser.fftSize = size;
    }
    setState((previousState) => ({
      ...previousState,
      fftSize: size,
    }));
  }, []);

  const setSmoothing = useCallback((smoothing: number) => {
    const val = clamp(smoothing, 0, 0.95);
    const graph = graphRef.current;
    if (graph) {
      graph.analyser.smoothingTimeConstant = val;
    }
    setState((previousState) => ({
      ...previousState,
      smoothing: val,
    }));
  }, []);

  useEffect(() => {
    writeStoredAudioSettings(state);
  }, [
    state.fileName,
    state.fileSizeBytes,
    state.fileType,
    state.filterFrequency,
    state.filterType,
    state.filterQ,
    state.gain,
    state.inputMode,
    state.eqLow,
    state.eqMid,
    state.eqHigh,
    state.compressorEnabled,
    state.compressorThreshold,
    state.compressorKnee,
    state.compressorRatio,
    state.compressorAttack,
    state.compressorRelease,
    state.delayEnabled,
    state.delayTime,
    state.delayFeedback,
    state.delayMix,
    state.generatorType,
    state.generatorFrequency,
    state.generatorVolume,
    state.fftSize,
    state.smoothing,
  ]);

  useEffect(() => {
    return () => {
      stopAnimation();
      disconnectSource();
      stopMicrophone();
      stopGenerator();

      if (graphRef.current) {
        void graphRef.current.context.close();
      }
    };
  }, [disconnectSource, stopAnimation, stopMicrophone, stopGenerator]);

  const refs = useMemo<AudioProcessorRefs>(
    () => ({
      frequencyCanvasRef,
      waveformCanvasRef,
      circularOscillatorCanvasRef,
    }),
    [],
  );

  const controls = useMemo<AudioProcessorControls>(
    () => ({
      initialize,
      startMicrophone,
      loadAudioFile,
      downloadFilteredFile,
      playFile,
      pauseFile,
      stop,
      setInputMode,
      setGain,
      setFilterType,
      setFilterFrequency,
      setFilterQ,
      setEqLow,
      setEqMid,
      setEqHigh,
      setCompressorEnabled,
      setCompressorThreshold,
      setCompressorKnee,
      setCompressorRatio,
      setCompressorAttack,
      setCompressorRelease,
      setDelayEnabled,
      setDelayTime,
      setDelayFeedback,
      setDelayMix,
      setGeneratorEnabled,
      setGeneratorType,
      setGeneratorFrequency,
      setGeneratorVolume,
      setFftSize,
      setSmoothing,
    }),
    [
      downloadFilteredFile,
      initialize,
      loadAudioFile,
      pauseFile,
      playFile,
      setFilterFrequency,
      setFilterType,
      setFilterQ,
      setGain,
      setInputMode,
      startMicrophone,
      stop,
      setEqLow,
      setEqMid,
      setEqHigh,
      setCompressorEnabled,
      setCompressorThreshold,
      setCompressorKnee,
      setCompressorRatio,
      setCompressorAttack,
      setCompressorRelease,
      setDelayEnabled,
      setDelayTime,
      setDelayFeedback,
      setDelayMix,
      setGeneratorEnabled,
      setGeneratorType,
      setGeneratorFrequency,
      setGeneratorVolume,
      setFftSize,
      setSmoothing,
    ],
  );

  return {
    state,
    refs,
    controls,
  };
}
