export type BrandLogo = {
  dataUrl: string;
  /** natural pixel width */
  width: number;
  /** natural pixel height */
  height: number;
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
      image.onload = () =>
        resolve({ dataUrl, width: image.naturalWidth || 300, height: image.naturalHeight || 300 });
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
