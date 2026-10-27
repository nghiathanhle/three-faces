/** Classic terminal phosphor green */
export const TERM_GREEN = "#00ff41";

export type AudioLine = {
  start: () => Promise<void>;
  stop: () => void;
  /** Latest normalized level 0..1 */
  level: () => number;
  /** Copy time-domain samples into `out` (-1..1). False if not capturing. */
  waveform: (out: Float32Array) => boolean;
};

/**
 * Capture system audio via display-media + Web Audio analysis.
 *
 * Web pages cannot silently tap the speaker loopback. The closest option is
 * getDisplayMedia with systemAudio: "include" — pick **Entire screen** and
 * enable system audio in the browser picker (Chrome/Edge on Windows).
 */
export function createAudioCapture(
  onStatus: (msg: string) => void,
): AudioLine {
  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let stream: MediaStream | null = null;
  let data: Uint8Array<ArrayBuffer> | null = null;
  let smooth = 0;

  const start = async () => {
    onStatus("Pick Entire screen and enable system audio…");

    try {
      // systemAudio / monitor hint: Chromium; ignored where unsupported
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "monitor",
        } as MediaTrackConstraints,
        audio: true,
        systemAudio: "include",
        preferCurrentTab: false,
      } as DisplayMediaStreamOptions);
    } catch {
      onStatus("Capture cancelled — click again to retry");
      throw new Error("display-media denied");
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
      onStatus(
        "No system audio — choose Entire screen and check “Share system audio”",
      );
      throw new Error("no audio track");
    }

    stream.getVideoTracks().forEach((t) => {
      t.stop();
      stream?.removeTrack(t);
    });

    audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.75;
    source.connect(analyser);

    data = new Uint8Array(new ArrayBuffer(analyser.fftSize));

    audioTracks[0].addEventListener("ended", () => {
      onStatus("Audio share ended — click to capture again");
      stop();
    });

    onStatus("");
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

  return { start, stop, level, waveform };
}
