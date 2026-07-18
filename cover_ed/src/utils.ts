import { Mp3File } from "./types";

export const RENDER_SIZE = 300;
export const RENDER_SIZE_CSS = '300px';

export interface ImageSetter {
    (url: string): void
}

export interface BlobSetter {
    (blob: Blob): void
}

export const imageToRenderBlob = async (originalImage: string, setBlob: BlobSetter, size: number) => {
    if (!originalImage) return undefined;

    const image = document.createElement('img');
    image.src = originalImage;

    image.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) return;

        const scale = image.width <= size && image.height <= size
            ? 1
            : image.width > image.height
                ? size / image.width
                : size / image.height;

        const width = image.width * scale;
        const height = image.height * scale;

        canvas.width = width;
        canvas.height = height;

        ctx.drawImage(
            image,
            0,
            0,
            image.width,
            image.height,
            0,
            0,
            width,
            height
        );

        canvas.toBlob((blob) => {
            if (blob) {
                setBlob(blob);
            }
        }, 'image/jpeg', 0.95);
    };
}

export const imageToRenderUrl = async (originalImage: string, setImageUrl: ImageSetter) => {
    const delegate = (blob: Blob) => {
        if (blob) {
            const url = URL.createObjectURL(blob);
            setImageUrl(url);
        }
    }

    imageToRenderBlob(originalImage, delegate, RENDER_SIZE);
}

export function toImageUrl(file: Mp3File) : string {
    if (file.cover_art) {
      try {
        let image = file.cover_art.map(c=> String.fromCharCode(c)).join("");
  
        return `data:image/jpeg;base64,${btoa(image)}`;
      } catch (e) {
        console.error("oops error for ", file.path, e);
  
        return "default_cover.svg";
      }
    } else {
      return "default_cover.svg";
    }
  
  }