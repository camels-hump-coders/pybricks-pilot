import { useEffect, useRef, useState } from "react";
import type { GameMatConfig } from "../schemas/GameMatConfig";

interface UseMatImageLoaderReturn {
  matImageRef: React.MutableRefObject<HTMLCanvasElement | HTMLImageElement | null>;
  loadedImage: string | null;
}

/**
 * Custom hook to handle loading and processing of mat background images
 */
export function useMatImageLoader(
  customMatConfig: GameMatConfig | null,
  onImageLoad?: () => void
): UseMatImageLoaderReturn {
  const matImageRef = useRef<HTMLCanvasElement | HTMLImageElement | null>(null);
  const [loadedImage, setLoadedImage] = useState<string | null>(null);

  useEffect(() => {
    if (customMatConfig) {
      const imageUrl = customMatConfig.imageUrl;
      if (!imageUrl) {
        console.warn(
          "No image URL provided for mat config:",
          customMatConfig.name
        );
        return;
      }

      const img = new Image();
      img.onload = () => {
        matImageRef.current = img;
        setLoadedImage(imageUrl);
        // Call optional callback when image loads (e.g., to trigger canvas redraw)
        if (onImageLoad) {
          onImageLoad();
        }
      };

      img.onerror = () => {
        console.error("Failed to load mat image:", imageUrl);
        matImageRef.current = null;
        setLoadedImage(null);
      };

      // Load image from URL (either from Vite import or custom path)
      img.src = imageUrl;
    } else {
      // No custom mat config, clear loaded image
      matImageRef.current = null;
      setLoadedImage(null);
    }
  }, [customMatConfig, onImageLoad]);

  return {
    matImageRef,
    loadedImage,
  };
}