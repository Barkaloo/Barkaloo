export type TheoryMaterial = {
  id: string; owner_id: string; section_id: string; title: string;
  description: string; path: string | null; filename: string | null;
  mime_type: string | null; video_url: string | null; archived: boolean; created_at: string;
};
const formats: Record<string, string> = {
  pdf: 'application/pdf', txt: 'text/plain', py: 'text/plain', csv: 'text/csv', zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
};
export const theoryAccept = Object.keys(formats).map((ext) => '.' + ext).join(',');
export async function theoryFile(file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mime = formats[ext];
  if (!mime) throw Error('Этот формат не поддерживается. Выберите документ, изображение, видео или аудио.');
  if (!file.size || file.size > 50 * 1024 * 1024) throw Error('Размер файла должен быть от 1 байта до 50 МБ.');
  const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = (start: number, end: number) => String.fromCharCode(...b.slice(start, end));
  const valid = ['txt','csv','py'].includes(ext) ||
    (ext === 'pdf' && ascii(0,5) === '%PDF-') ||
    (['zip','docx','xlsx','pptx'].includes(ext) && b[0] === 80 && b[1] === 75) ||
    (ext === 'png' && b[0] === 137 && ascii(1,4) === 'PNG') ||
    (['jpg','jpeg'].includes(ext) && b[0] === 255 && b[1] === 216) ||
    (ext === 'gif' && ascii(0,3) === 'GIF') ||
    (ext === 'webp' && ascii(0,4) === 'RIFF' && ascii(8,12) === 'WEBP') ||
    (ext === 'mp4' && ascii(4,8) === 'ftyp') ||
    (ext === 'webm' && b[0] === 26 && b[1] === 69 && b[2] === 223 && b[3] === 163) ||
    (ext === 'mp3' && (ascii(0,3) === 'ID3' || (b[0] === 255 && (b[1] & 224) === 224))) ||
    (ext === 'wav' && ascii(0,4) === 'RIFF' && ascii(8,12) === 'WAVE') ||
    (ext === 'ogg' && ascii(0,4) === 'OggS');
  if (!valid) throw Error('Содержимое файла не соответствует его расширению.');
  return { ext, mime };
}
