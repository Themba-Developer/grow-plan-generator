export type BrandLogo = {
  dataUrl: string;
  /** natural pixel width */
  width: number;
  /** natural pixel height */
  height: number;
  /** dominant non-neutral logo colour, without a leading # */
  dominantColor?: string;
};

export type Branding = {
  companyName: string;
  contact: string;
  logo: BrandLogo | null;
};

export const EMPTY_BRANDING: Branding = { companyName: "", contact: "", logo: null };

/** Reads an image file into a data URL plus its natural dimensions. */
export function readLogoFile(file: File): Promise<BrandLogo> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that image"));
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const image = new Image();
      image.onerror = () => reject(new Error("That file is not a valid image"));
      image.onload = () => {
        let dominantColor: string | undefined;
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 48;
          canvas.height = 48;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          context?.drawImage(image, 0, 0, canvas.width, canvas.height);
          const pixels = context?.getImageData(0, 0, canvas.width, canvas.height).data;
          if (pixels) {
            const buckets = new Map<string, number>();
            for (let index = 0; index < pixels.length; index += 16) {
              const red = pixels[index] ?? 0;
              const green = pixels[index + 1] ?? 0;
              const blue = pixels[index + 2] ?? 0;
              const alpha = pixels[index + 3] ?? 0;
              const max = Math.max(red, green, blue);
              const min = Math.min(red, green, blue);
              if (alpha < 160 || max > 242 || max - min < 24) continue;
              const key = [red, green, blue]
                .map((channel) => Math.round(channel / 32) * 32)
                .map((channel) => Math.min(255, channel).toString(16).padStart(2, "0"))
                .join("")
                .toUpperCase();
              buckets.set(key, (buckets.get(key) ?? 0) + 1);
            }
            dominantColor = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
          }
        } catch {
          // A logo is still usable when colour sampling is unavailable.
        }
        resolve({
          dataUrl,
          width: image.naturalWidth || 300,
          height: image.naturalHeight || 300,
          ...(dominantColor ? { dominantColor } : {}),
        });
      };
      image.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export function logoMime(dataUrl: string) {
  return /^data:([^;]+);/.exec(dataUrl)?.[1] ?? "image/png";
}

export type DocxImageType = "png" | "jpg" | "gif" | "bmp";

export function docxImageType(dataUrl: string): DocxImageType {
  const mime = logoMime(dataUrl);
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("bmp")) return "bmp";
  return "png";
}

export function pdfImageFormat(dataUrl: string) {
  const type = docxImageType(dataUrl);
  if (type === "jpg") return "JPEG";
  if (type === "gif") return "GIF";
  if (type === "bmp") return "BMP";
  return "PNG";
}

export function dataUrlToUint8Array(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Fits a logo inside a box, preserving aspect ratio. Returns points/px units given. */
export function fitLogo(logo: BrandLogo, maxWidth: number, maxHeight: number) {
  const ratio = Math.min(maxWidth / logo.width, maxHeight / logo.height, 1);
  const scale = ratio > 0 ? ratio : 1;
  return { width: Math.round(logo.width * scale), height: Math.round(logo.height * scale) };
}
