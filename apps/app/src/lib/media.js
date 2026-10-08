// Photos and voice notes used as proof.

async function decode(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* fall back to an <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function draw(source, maxSide) {
  const w = source.width;
  const h = source.height;
  const k = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * k));
  canvas.height = Math.max(1, Math.round(h * k));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Resizes a picked photo to a JPEG for storage and AI review, plus a small thumbnail. */
export async function preparePhoto(file) {
  const bitmap = await decode(file);
  const big = draw(bitmap, 1600);
  const blob = await new Promise((resolve) => big.toBlob(resolve, "image/jpeg", 0.85));
  const thumb = draw(bitmap, 220).toDataURL("image/jpeg", 0.7);
  if (bitmap.close) bitmap.close();
  return { blob: blob || file, thumb };
}

// Voice notes: the asset store keeps WebM and MP4 containers, so audio
// recorded in those containers is stored under the video type.
export function storableAudioType(blob, name = "") {
  const t = (blob.type || "").split(";")[0];
  if (t === "audio/webm" || t === "video/webm") return "video/webm";
  if (t === "audio/mp4" || t === "audio/x-m4a" || t === "audio/m4a" || t === "video/mp4" || /\.m4a$/i.test(name)) return "video/mp4";
  return null;
}

export const canRecord = () =>
  typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof window.MediaRecorder === "function";

export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  const mimeType = types.find((t) => window.MediaRecorder.isTypeSupported?.(t));
  const rec = new window.MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  const started = Date.now();
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start();
  const stopTracks = () => stream.getTracks().forEach((t) => t.stop());
  return {
    stop: () =>
      new Promise((resolve) => {
        rec.onstop = () => {
          stopTracks();
          resolve({ blob: new Blob(chunks, { type: rec.mimeType || "audio/webm" }), seconds: Math.round((Date.now() - started) / 1000) });
        };
        rec.stop();
      }),
    cancel: () => {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
      stopTracks();
    },
  };
}

export function audioDuration(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => {
      const d = Number.isFinite(a.duration) ? Math.round(a.duration) : null;
      URL.revokeObjectURL(url);
      resolve(d);
    };
    a.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    a.src = url;
  });
}
