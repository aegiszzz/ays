import { Platform } from 'react-native';

/**
 * Captures the first frame of a video and returns it as a JPEG data URL.
 * Web only — uses HTMLVideoElement and canvas. Returns null on native or on failure.
 */
export const captureVideoThumbnail = async (
  videoUri: string,
  options: { width?: number; height?: number; seekSeconds?: number; quality?: number } = {}
): Promise<string | null> => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return null;
  }

  const { width = 600, height = 600, seekSeconds = 0.1, quality = 0.85 } = options;

  return new Promise(resolve => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = videoUri;

    let settled = false;
    const finish = (val: string | null) => {
      if (settled) return;
      settled = true;
      try { video.src = ''; } catch {}
      resolve(val);
    };

    const timeout = setTimeout(() => finish(null), 8000);

    video.addEventListener('loadeddata', () => {
      try {
        video.currentTime = Math.min(seekSeconds, video.duration || seekSeconds);
      } catch {
        clearTimeout(timeout);
        finish(null);
      }
    });

    video.addEventListener('seeked', () => {
      try {
        const canvas = document.createElement('canvas');
        const aspect = video.videoWidth / video.videoHeight || 1;
        canvas.width = width;
        canvas.height = aspect >= 1 ? Math.round(width / aspect) : height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          clearTimeout(timeout);
          finish(null);
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        clearTimeout(timeout);
        finish(dataUrl);
      } catch {
        clearTimeout(timeout);
        finish(null);
      }
    });

    video.addEventListener('error', () => {
      clearTimeout(timeout);
      finish(null);
    });
  });
};
