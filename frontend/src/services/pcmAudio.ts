export function encodePcm(input: Float32Array, inputRate: number): string {
  const ratio = inputRate / 16000;
  const outputLength = Math.floor(input.length / ratio);
  const buffer = new ArrayBuffer(outputLength * 2);
  const pcm = new DataView(buffer);

  for (let i = 0; i < outputLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let total = 0;
    for (let j = start; j < end; j++) total += input[j];
    const value = end > start ? total / (end - start) : input[start] || 0;
    const sample = Math.max(-1, Math.min(1, value));
    pcm.setInt16(i * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
  }

  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}
