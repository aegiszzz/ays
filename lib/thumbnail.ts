import * as ImageManipulator from 'expo-image-manipulator';
import { Platform } from 'react-native';

export interface ThumbnailResult {
  uri: string;
  width: number;
  height: number;
  base64?: string;
}

export interface ThumbnailOptions {
  size: number;
  quality?: number;
  format?: 'jpeg' | 'png';
}

export async function generateImageThumbnail(
  uri: string,
  options: ThumbnailOptions = { size: 300, quality: 0.75, format: 'jpeg' }
): Promise<ThumbnailResult> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [
        {
          resize: {
            width: options.size,
            height: options.size,
          },
        },
      ],
      {
        compress: options.quality || 0.75,
        format: ImageManipulator.SaveFormat[options.format?.toUpperCase() as keyof typeof ImageManipulator.SaveFormat] || ImageManipulator.SaveFormat.JPEG,
      }
    );

    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
    };
  } catch (error) {
    console.error('Thumbnail generation failed:', error);
    throw new Error('Failed to generate thumbnail');
  }
}

export async function generateVideoThumbnail(
  videoUri: string,
  timeMs: number = 0
): Promise<ThumbnailResult> {
  if (Platform.OS === 'web') {
    return generateVideoThumbnailWeb(videoUri, timeMs);
  }

  try {
    const { getVideoMetaData, getThumbnailAsync } = await import('expo-video-thumbnails');

    const thumbnail = await getThumbnailAsync(videoUri, {
      time: timeMs,
      quality: 0.75,
    });

    const resized = await ImageManipulator.manipulateAsync(
      thumbnail.uri,
      [
        {
          resize: {
            width: 300,
            height: 300,
          },
        },
      ],
      {
        compress: 0.75,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    return {
      uri: resized.uri,
      width: resized.width,
      height: resized.height,
    };
  } catch (error) {
    console.error('Video thumbnail generation failed:', error);
    throw new Error('Failed to generate video thumbnail');
  }
}

function generateVideoThumbnailWeb(
  videoUri: string,
  timeMs: number = 0
): Promise<ThumbnailResult> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Canvas context not available'));
      return;
    }

    video.crossOrigin = 'anonymous';
    video.src = videoUri;

    video.addEventListener('loadedmetadata', () => {
      video.currentTime = timeMs / 1000;
    });

    video.addEventListener('seeked', () => {
      canvas.width = 300;
      canvas.height = 300;

      const scale = Math.max(300 / video.videoWidth, 300 / video.videoHeight);
      const w = video.videoWidth * scale;
      const h = video.videoHeight * scale;
      const x = (300 - w) / 2;
      const y = (300 - h) / 2;

      ctx.drawImage(video, x, y, w, h);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const uri = URL.createObjectURL(blob);
            resolve({
              uri,
              width: 300,
              height: 300,
            });
          } else {
            reject(new Error('Failed to create blob'));
          }
        },
        'image/jpeg',
        0.75
      );
    });

    video.addEventListener('error', () => {
      reject(new Error('Video loading failed'));
    });
  });
}

export interface ThumbnailSet {
  thumbnail: ThumbnailResult;
  preview?: ThumbnailResult;
}

export async function generateThumbnailSet(
  uri: string,
  mediaType: 'image' | 'video'
): Promise<ThumbnailSet> {
  if (mediaType === 'image') {
    const [thumbnail, preview] = await Promise.all([
      generateImageThumbnail(uri, { size: 300, quality: 0.75 }),
      generateImageThumbnail(uri, { size: 600, quality: 0.8 }),
    ]);

    return { thumbnail, preview };
  } else {
    const thumbnail = await generateVideoThumbnail(uri);
    return { thumbnail };
  }
}
