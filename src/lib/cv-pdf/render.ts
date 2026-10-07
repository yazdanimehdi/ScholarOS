import path from 'node:path';
import pdfmake from 'pdfmake';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';

/** Read at runtime from the function's working directory; astro.config.mjs ships them with the Vercel function. */
const FONTS = path.resolve(process.cwd(), 'src/lib/cv-pdf/fonts');
const font = (file: string) => path.join(FONTS, file);
let ready = false;

/** pdfmake is a configured singleton: fonts are file paths (it rejects Buffers), and nothing else may be read. */
function setUp(): void {
  if (ready) return;
  pdfmake.setFonts({
    Serif: {
      normal: font('SourceSerif4-Regular.ttf'),
      bold: font('SourceSerif4-Semibold.ttf'),
      italics: font('SourceSerif4-It.ttf'),
      bolditalics: font('SourceSerif4-Semibold.ttf'),
    },
    Sans: {
      normal: font('IBMPlexSans-Regular.ttf'),
      bold: font('IBMPlexSans-SemiBold.ttf'),
      italics: font('IBMPlexSans-Regular.ttf'),
      bolditalics: font('IBMPlexSans-SemiBold.ttf'),
    },
    SansMedium: {
      normal: font('IBMPlexSans-Medium.ttf'),
      bold: font('IBMPlexSans-SemiBold.ttf'),
      italics: font('IBMPlexSans-Medium.ttf'),
      bolditalics: font('IBMPlexSans-SemiBold.ttf'),
    },
  });
  pdfmake.setLocalAccessPolicy((p) => p.startsWith(FONTS + path.sep));
  pdfmake.setUrlAccessPolicy(() => false);
  ready = true;
}

export async function renderCvPdf(definition: TDocumentDefinitions): Promise<Uint8Array> {
  setUp();
  return new Uint8Array(await pdfmake.createPdf(definition).getBuffer());
}

/** Pages in a PDF pdfmake wrote (page objects are uncompressed dictionaries). */
export const pageCount = (pdf: Uint8Array) =>
  (
    Buffer.from(pdf)
      .toString('latin1')
      .match(/\/Type \/Page\b/g) ?? []
  ).length;
