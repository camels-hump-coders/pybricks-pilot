import { useRef } from "react";

interface UploadInterfaceProps {
  originalImageData: string;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onImportConfig: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onKeepCurrentImage: () => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export function UploadInterface({
  originalImageData,
  onFileUpload,
  onImportConfig,
  onKeepCurrentImage,
  canvasRef,
}: UploadInterfaceProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (originalImageData) {
    // Show existing image with option to replace
    return (
      <div className="h-full flex flex-col">
        <div className="mb-4 text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-2">
            Current mat image - You can keep this or upload a new one
          </p>
          <div className="flex justify-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Replace Image
            </button>
            <button
              onClick={onKeepCurrentImage}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            >
              Keep Current Image
            </button>
          </div>
        </div>
        <div className="flex-1 relative">
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            className="w-full h-full object-contain"
          />
        </div>
      </div>
    );
  }

  // No image - show upload interface
  return (
    <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
      <div className="text-center">
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Upload an image of your game mat
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={onFileUpload}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 mr-2"
        >
          Choose Image
        </button>
        <label className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 cursor-pointer">
          Import Config
          <input
            type="file"
            accept="application/json"
            onChange={onImportConfig}
            className="hidden"
          />
        </label>
      </div>
    </div>
  );
}