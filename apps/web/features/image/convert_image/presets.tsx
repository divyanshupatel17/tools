// Implementation: points to the shared Convert Image tool.
// See: /tools/convert-image
// Shared processing/component files: use the existing Convert Image implementation.

import { ConvertImageWorkspace } from './workspace';

export function JpgToPngWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'jpeg', to: 'png' }} />;
}

export function PngToJpgWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'png', to: 'jpeg' }} />;
}

export function JpgToWebpWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'jpeg', to: 'webp' }} />;
}

export function WebpToJpgWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'webp', to: 'jpeg' }} />;
}

export function PngToWebpWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'png', to: 'webp' }} />;
}

export function WebpToPngWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'webp', to: 'png' }} />;
}

export function JpgToAvifWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'jpeg', to: 'avif' }} />;
}

export function PngToAvifWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'png', to: 'avif' }} />;
}

export function WebpToAvifWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'webp', to: 'avif' }} />;
}

export function AvifToJpgWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'avif', to: 'jpeg' }} />;
}

export function AvifToPngWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'avif', to: 'png' }} />;
}

export function SvgToPngWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'svg', to: 'png' }} />;
}

export function HeicToJpgWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'heic', to: 'jpeg' }} />;
}

export function HeicToPngWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'heic', to: 'png' }} />;
}

export function TiffToJpgWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'tiff', to: 'jpeg' }} />;
}

export function JpgToGifWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'jpeg', to: 'gif' }} />;
}

export function JpgToBmpWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'jpeg', to: 'bmp' }} />;
}

export function JpgToTiffWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'jpeg', to: 'tiff' }} />;
}

export function JpgToIcoWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'jpeg', to: 'ico' }} />;
}

export function PngToGifWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'png', to: 'gif' }} />;
}

export function PngToBmpWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'png', to: 'bmp' }} />;
}

export function PngToTiffWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'png', to: 'tiff' }} />;
}

export function PngToIcoWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'png', to: 'ico' }} />;
}

export function WebpToGifWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'webp', to: 'gif' }} />;
}

export function WebpToBmpWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'webp', to: 'bmp' }} />;
}

export function WebpToTiffWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'webp', to: 'tiff' }} />;
}

export function AvifToWebpWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'avif', to: 'webp' }} />;
}

export function AvifToGifWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'avif', to: 'gif' }} />;
}

export function AvifToBmpWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'avif', to: 'bmp' }} />;
}

export function AvifToTiffWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'avif', to: 'tiff' }} />;
}

export function HeicToWebpWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'heic', to: 'webp' }} />;
}

export function HeicToAvifWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'heic', to: 'avif' }} />;
}

export function TiffToPngWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'tiff', to: 'png' }} />;
}

export function TiffToWebpWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'tiff', to: 'webp' }} />;
}

export function TiffToAvifWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'tiff', to: 'avif' }} />;
}

export function BmpToJpgWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'bmp', to: 'jpeg' }} />;
}

export function BmpToPngWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'bmp', to: 'png' }} />;
}

export function BmpToWebpWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'bmp', to: 'webp' }} />;
}

export function BmpToAvifWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'bmp', to: 'avif' }} />;
}

export function GifToJpgWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'gif', to: 'jpeg' }} />;
}

export function GifToPngWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'gif', to: 'png' }} />;
}

export function GifToWebpWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'gif', to: 'webp' }} />;
}

export function GifToAvifWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'gif', to: 'avif' }} />;
}

export function SvgToJpgWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'svg', to: 'jpeg' }} />;
}

export function SvgToWebpWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'svg', to: 'webp' }} />;
}

export function SvgToAvifWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'svg', to: 'avif' }} />;
}

export function IcoToPngWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'ico', to: 'png' }} />;
}

export function IcoToJpgWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'ico', to: 'jpeg' }} />;
}

export function IcoToWebpWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'ico', to: 'webp' }} />;
}

export function IcoToAvifWorkspace() {
  return <ConvertImageWorkspace preset={{ from: 'ico', to: 'avif' }} />;
}
