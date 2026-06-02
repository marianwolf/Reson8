import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";

export type AudioInputMode = "microphone" | "file";

export type FilterMode = "lowpass" | "highpass";

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
  levelDb: number;
  peakDb: number;
  gain: number;
  filterType: FilterMode;
  filterFrequency: number;
  duration: number;
  currentTime: number;
  fileName: string | null;
  error: string | null;
}

export interface AudioProcessorRefs {
  frequencyCanvasRef: RefObject<HTMLCanvasElement | null>;
  waveformCanvasRef: RefObject<HTMLCanvasElement | null>;
}

export interface AudioProcessorControls {
  initialize: () => Promise<void>;
  startMicrophone: () => Promise<void>;
  loadAudioFile: (file: File) => Promise<void>;
  playFile: () => Promise<void>;
  pauseFile: () => void;
  stop: () => void;
  setInputMode: (mode: AudioInputMode) => void;
  setGain: (gain: number) => void;
  setFilterType: (filterType: FilterMode) => void;
  setFilterFrequency: (frequency: number) => void;
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
  const step = Math.floor(frequencyData.length / barCount);
  const gap = Math.max(2, width * 0.004);
  const barWidth = width / barCount - gap;

  for (let index = 0; index < barCount; index += 1) {
    const value = frequencyData[index * step] / 255;
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

function calculateRmsDb(waveformData: AudioByteData) {
  let sumSquares = 0;

  for (let index = 0; index < waveformData.length; index += 1) {
    const centeredSample = (waveformData[index] - 128) / 128;
    sumSquares += centeredSample * centeredSample;
  }

  const rms = Math.sqrt(sumSquares / waveformData.length);
  return rms > 0 ? Math.max(METER_FLOOR_DB, 20 * Math.log10(rms)) : METER_FLOOR_DB;
}

export function useAudioProcessor(
  options: AudioProcessorOptions = {},
): UseAudioProcessorResult {
  const frequencyCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const graphRef = useRef<AudioGraphNodes | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<AudioNode | null>(null);
  const fileSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const loadedFileRef = useRef<LoadedAudioFile | null>(null);
  const frequencyDataRef = useRef<AudioByteData | null>(null);
  const waveformDataRef = useRef<AudioByteData | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastStateUpdateRef = useRef(0);
  const startedAtRef = useRef(0);
  const playbackOffsetRef = useRef(0);
  const modeRef = useRef<AudioInputMode>("microphone");
  const isPlayingRef = useRef(false);

  const [state, setState] = useState<AudioProcessorState>({
    inputMode: "microphone",
    isInitialized: false,
    isPlaying: false,
    isLoading: false,
    levelDb: METER_FLOOR_DB,
    peakDb: METER_FLOOR_DB,
    gain: INITIAL_GAIN,
    filterType: "lowpass",
    filterFrequency: INITIAL_FILTER_FREQUENCY,
    duration: 0,
    currentTime: 0,
    fileName: null,
    error: null,
  });

  const normalizedOptions = useMemo(
    () => ({
      fftSize: options.fftSize ?? DEFAULT_FFT_SIZE,
      smoothingTimeConstant: options.smoothingTimeConstant ?? DEFAULT_SMOOTHING,
      minDecibels: options.minDecibels ?? MIN_DECIBELS,
      maxDecibels: options.maxDecibels ?? MAX_DECIBELS,
    }),
    [
      options.fftSize,
      options.maxDecibels,
      options.minDecibels,
      options.smoothingTimeConstant,
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
        undefined;
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

    const now = performance.now();

    if (now - lastStateUpdateRef.current > 33) {
      lastStateUpdateRef.current = now;
      const levelDb = calculateRmsDb(waveformData);

      setState((previousState) => {
        const currentTime =
          modeRef.current === "file" && isPlayingRef.current
            ? Math.min(
                graph.context.currentTime - startedAtRef.current,
                loadedFile?.buffer.duration ?? previousState.duration,
              )
            : playbackOffsetRef.current;

        return {
          ...previousState,
          currentTime,
          levelDb,
          peakDb: Math.max(levelDb, previousState.peakDb - 0.18),
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

    analyser.fftSize = normalizedOptions.fftSize;
    analyser.smoothingTimeConstant = normalizedOptions.smoothingTimeConstant;
    analyser.minDecibels = normalizedOptions.minDecibels;
    analyser.maxDecibels = normalizedOptions.maxDecibels;
    gainNode.gain.value = state.gain;
    filterNode.type = state.filterType;
    filterNode.frequency.value = state.filterFrequency;
    filterNode.Q.value = 0.72;

    graphRef.current = {
      context,
      analyser,
      gainNode,
      filterNode,
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
    state.gain,
  ]);

  const wireSource = useCallback((sourceNode: AudioNode, routeToSpeakers: boolean) => {
    const graph = graphRef.current;
    if (!graph) {
      return;
    }

    disconnectSource();
    sourceNode.connect(graph.gainNode);
    graph.gainNode.connect(graph.filterNode);
    graph.filterNode.connect(graph.analyser);

    if (routeToSpeakers) {
      graph.analyser.connect(graph.context.destination);
    } else {
      graph.analyser.disconnect();
    }

    sourceNodeRef.current = sourceNode;
  }, [disconnectSource]);

  const startMicrophone = useCallback(async () => {
    await initialize();

    const graph = graphRef.current;
    if (!graph) {
      return;
    }

    stopMicrophone();
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
      wireSource(microphoneSource, false);
      updatePlayingState(true);
      setState((previousState) => ({
        ...previousState,
        inputMode: "microphone",
        currentTime: 0,
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
  }, [initialize, startAnimation, stopMicrophone, updatePlayingState, wireSource]);

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
          duration: audioBuffer.duration,
          currentTime: 0,
          fileName: file.name,
          peakDb: METER_FLOOR_DB,
          error: null,
        }));
      } catch {
        setState((previousState) => ({
          ...previousState,
          isLoading: false,
          error: "Die Audiodatei konnte nicht dekodiert werden.",
        }));
      }
    },
    [disconnectSource, initialize, stopMicrophone, updatePlayingState],
  );

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
  }, [disconnectSource, initialize, startAnimation, stopMicrophone, updatePlayingState, wireSource]);

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
    setState((previousState) => ({
      ...previousState,
      currentTime: 0,
      levelDb: METER_FLOOR_DB,
      peakDb: METER_FLOOR_DB,
    }));
  }, [disconnectSource, stopMicrophone, updatePlayingState]);

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
      } else {
        stop();
      }
    },
    [startMicrophone, stop],
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

  useEffect(() => {
    return () => {
      stopAnimation();
      disconnectSource();
      stopMicrophone();

      if (graphRef.current) {
        void graphRef.current.context.close();
      }
    };
  }, [disconnectSource, stopAnimation, stopMicrophone]);

  const refs = useMemo<AudioProcessorRefs>(
    () => ({
      frequencyCanvasRef,
      waveformCanvasRef,
    }),
    [],
  );

  const controls = useMemo<AudioProcessorControls>(
    () => ({
      initialize,
      startMicrophone,
      loadAudioFile,
      playFile,
      pauseFile,
      stop,
      setInputMode,
      setGain,
      setFilterType,
      setFilterFrequency,
    }),
    [
      initialize,
      loadAudioFile,
      pauseFile,
      playFile,
      setFilterFrequency,
      setFilterType,
      setGain,
      setInputMode,
      startMicrophone,
      stop,
    ],
  );

  return {
    state,
    refs,
    controls,
  };
}
