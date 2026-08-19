// libheif-js ships no type declarations. This covers only the surface we use:
// decoding a HEIC/HEIF byte stream into RGBA pixel data via the wasm bundle.
declare module 'libheif-js/wasm-bundle' {
  interface HeifImage {
    get_width(): number;
    get_height(): number;
    display(
      target: { data: Uint8ClampedArray; width: number; height: number },
      callback: (result: unknown) => void,
    ): void;
  }

  class HeifDecoder {
    decode(bytes: Uint8Array): HeifImage[];
  }

  const libheif: { HeifDecoder: typeof HeifDecoder };
  export { HeifDecoder };
  export default libheif;
}
