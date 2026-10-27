export type AudioSourceMode = "system" | "mic";

export type AudioLine = {
  /** Prefer system/display audio; falls back messaging if insecure / unsupported */
  startSystem: () => Promise<void>;
  /** Microphone — works on phones over HTTPS when system capture isn't available */
  startMic: () => Promise<void>;
  stop: () => void;
  level: () => number;
  waveform: (out: Float32Array) => boolean;
};

function isSecureForCapture(): boolean {
  return window.isSecureContext;
}

/**
 * Capture audio for the reactive line.
 * - System: getDisplayMedia (needs HTTPS + desktop browser; Entire screen + system audio)
 * - Mic: getUserMedia (works on most devices over HTTPS)
 */
export function createAudioCapture(
  onStatus: (msg: string) => void,
): AudioLine {
  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let stream: MediaStream | null = null;
  let data: Uint8Array<ArrayBuffer> | null = null;
  let smooth = 0;

  const wireStream = async (media: MediaStream, label: string) => {
    stream = media;
    audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") await audioCtx.resume();

    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.75;
    source.connect(analyser);
    data = new Uint8Array(new ArrayBuffer(analyser.fftSize));

    stream.getAudioTracks()[0]?.addEventListener("ended", () => {
      onStatus(`${label} ended — tap a capture button to retry`);
      stop();
    });

    onStatus("");
  };

  const startSystem = async () => {
    if (!isSecureForCapture()) {
      onStatus(
        "Needs HTTPS — restart with npm run dev and open the https:// Network URL",
      );
      throw new Error("insecure context");
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      onStatus("System capture unsupported here — try Use microphone");
      throw new Error("getDisplayMedia missing");
    }

    onStatus("Pick Entire screen and enable system audio…");

    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "monitor",
        } as MediaTrackConstraints,
        audio: true,
        systemAudio: "include",
        preferCurrentTab: false,
      } as DisplayMediaStreamOptions);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError") {
        onStatus("Permission denied or cancelled — try again or Use microphone");
      } else {
        onStatus("System capture failed — try Use microphone");
      }
      throw err;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
      onStatus(
        "No system audio — choose Entire screen + Share system audio, or Use microphone",
      );
      throw new Error("no audio track");
    }

    stream.getVideoTracks().forEach((t) => {
      t.stop();
      stream?.removeTrack(t);
    });

    await wireStream(stream, "Audio share");
  };

  const startMic = async () => {
    if (!isSecureForCapture()) {
      onStatus(
        "Needs HTTPS — open the https:// Network URL (accept the certificate warning)",
      );
      throw new Error("insecure context");
    }

    onStatus("Requesting microphone…");
    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      await wireStream(mic, "Microphone");
    } catch {
      onStatus("Microphone denied — check browser permissions");
      throw new Error("mic denied");
    }
  };

  const stop = () => {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    void audioCtx?.close();
    audioCtx = null;
    analyser = null;
    data = null;
    smooth = 0;
  };

  const level = () => {
    if (!analyser || !data) return 0;
    analyser.getByteTimeDomainData(data);

    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i]! - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    const boosted = Math.min(1, Math.pow(rms * 4.2, 0.9));
    smooth = smooth * 0.6 + boosted * 0.4;
    return smooth;
  };

  const waveform = (out: Float32Array): boolean => {
    if (!analyser || !data) {
      out.fill(0);
      return false;
    }
    analyser.getByteTimeDomainData(data);
    const n = Math.min(out.length, data.length);
    for (let i = 0; i < n; i++) {
      out[i] = (data[i]! - 128) / 128;
    }
    for (let i = n; i < out.length; i++) out[i] = 0;
    return true;
  };

  return { startSystem, startMic, stop, level, waveform };
}
