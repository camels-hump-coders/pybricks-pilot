interface Point {
  x: number;
  y: number;
}

interface Transform {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  g: number;
  h: number;
}

/**
 * Calculate perspective transform matrix from four corner points
 * Maps from normalized coordinates (0-1) to actual coordinates
 */
function getPerspectiveTransform(
  srcCorners: {
    topLeft: Point;
    topRight: Point;
    bottomLeft: Point;
    bottomRight: Point;
  },
  width: number,
  height: number,
): Transform {
  // Source points (normalized 0-1)
  const src = [
    [0, 0], // top-left
    [1, 0], // top-right
    [1, 1], // bottom-right
    [0, 1], // bottom-left
  ];

  // Destination points (actual image coordinates)
  const dst = [
    [srcCorners.topLeft.x * width, srcCorners.topLeft.y * height],
    [srcCorners.topRight.x * width, srcCorners.topRight.y * height],
    [srcCorners.bottomRight.x * width, srcCorners.bottomRight.y * height],
    [srcCorners.bottomLeft.x * width, srcCorners.bottomLeft.y * height],
  ];

  // Calculate transform matrix using homography
  return calculateHomography(src, dst);
}

/**
 * Apply perspective transform to a point
 */
function transformPoint(point: Point, transform: Transform): Point {
  const w = transform.g * point.x + transform.h * point.y + 1;
  return {
    x: (transform.a * point.x + transform.b * point.y + transform.c) / w,
    y: (transform.d * point.x + transform.e * point.y + transform.f) / w,
  };
}

/**
 * Calculate homography matrix from 4 point correspondences
 */
function calculateHomography(src: number[][], dst: number[][]): Transform {
  // Build the system of equations
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];

    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(u);
    b.push(v);
  }

  // Solve using Gaussian elimination
  const h = solveLinearSystem(A, b);

  return {
    a: h[0],
    b: h[1],
    c: h[2],
    d: h[3],
    e: h[4],
    f: h[5],
    g: h[6],
    h: h[7],
  };
}

/**
 * Invert a perspective transform matrix
 */
function invertTransform(t: Transform): Transform {
  const det =
    t.a * (t.e - t.f * t.h) -
    t.b * (t.d - t.f * t.g) +
    t.c * (t.d * t.h - t.e * t.g);

  return {
    a: (t.e - t.f * t.h) / det,
    b: (t.c * t.h - t.b) / det,
    c: (t.b * t.f - t.c * t.e) / det,
    d: (t.f * t.g - t.d) / det,
    e: (t.a - t.c * t.g) / det,
    f: (t.c * t.d - t.a * t.f) / det,
    g: (t.d * t.h - t.e * t.g) / det,
    h: (t.b * t.g - t.a * t.h) / det,
  };
}

/**
 * Solve linear system Ax = b using Gaussian elimination
 */
function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  const augmented = A.map((row, i) => [...row, b[i]]);

  // Forward elimination
  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
        maxRow = k;
      }
    }

    // Swap rows
    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

    // Make all rows below this one 0 in current column
    for (let k = i + 1; k < n; k++) {
      const factor = augmented[k][i] / augmented[i][i];
      for (let j = i; j <= n; j++) {
        augmented[k][j] -= factor * augmented[i][j];
      }
    }
  }

  // Back substitution
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = augmented[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= augmented[i][j] * x[j];
    }
    x[i] /= augmented[i][i];
  }

  return x;
}

/**
 * De-skew an image using perspective transform
 * Returns a canvas with the de-skewed image
 */
export function deSkewImage(
  image: HTMLImageElement | HTMLCanvasElement,
  corners: {
    topLeft: Point;
    topRight: Point;
    bottomLeft: Point;
    bottomRight: Point;
  },
  outputWidth: number,
  outputHeight: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext("2d");

  if (!ctx) return canvas;

  // Get the transform from corners to normalized space
  const transform = getPerspectiveTransform(corners, image.width, image.height);

  // For each pixel in the output, find corresponding pixel in input
  const imageData = ctx.createImageData(outputWidth, outputHeight);
  const data = imageData.data;

  // Create a temporary canvas to get source image data
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = image.width;
  tempCanvas.height = image.height;
  const tempCtx = tempCanvas.getContext("2d");
  if (!tempCtx) return canvas;

  tempCtx.drawImage(image, 0, 0);
  const srcImageData = tempCtx.getImageData(0, 0, image.width, image.height);
  const srcData = srcImageData.data;

  for (let y = 0; y < outputHeight; y++) {
    for (let x = 0; x < outputWidth; x++) {
      // Convert output coordinates to normalized (0-1)
      const normalizedPoint = {
        x: x / outputWidth,
        y: y / outputHeight,
      };

      // Transform to source image coordinates
      const srcPoint = transformPoint(normalizedPoint, transform);

      // Bilinear interpolation for smooth result
      const sx = Math.max(0, Math.min(image.width - 1, srcPoint.x));
      const sy = Math.max(0, Math.min(image.height - 1, srcPoint.y));

      const x0 = Math.floor(sx);
      const x1 = Math.min(x0 + 1, image.width - 1);
      const y0 = Math.floor(sy);
      const y1 = Math.min(y0 + 1, image.height - 1);

      const fx = sx - x0;
      const fy = sy - y0;

      // Get pixel values at four corners
      const idx00 = (y0 * image.width + x0) * 4;
      const idx01 = (y0 * image.width + x1) * 4;
      const idx10 = (y1 * image.width + x0) * 4;
      const idx11 = (y1 * image.width + x1) * 4;

      const dstIdx = (y * outputWidth + x) * 4;

      // Interpolate each channel
      for (let c = 0; c < 4; c++) {
        const v00 = srcData[idx00 + c];
        const v01 = srcData[idx01 + c];
        const v10 = srcData[idx10 + c];
        const v11 = srcData[idx11 + c];

        const v0 = v00 * (1 - fx) + v01 * fx;
        const v1 = v10 * (1 - fx) + v11 * fx;
        const v = v0 * (1 - fy) + v1 * fy;

        data[dstIdx + c] = Math.round(v);
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}
