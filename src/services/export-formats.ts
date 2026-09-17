/** Dependency-free, deterministic Open XML and PDF writers for authorised report projections. */
export type ExportCell = string | number | null;
export interface ExportSheet { name: string; rows: ExportCell[][]; formats?: Array<'text' | 'money' | 'number' | 'percent' | 'date'> }
const utf8 = new TextEncoder();
const xml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);
export function csvCell(value: ExportCell) {
  const text = value === null ? '' : String(value);
  const safe = typeof value === 'string' && /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}
export function csvBytes(rows: ExportCell[][]): Uint8Array<ArrayBuffer> {
  return utf8.encode(rows.map((row) => row.map(csvCell).join(',')).join('\r\n'));
}
function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function record(length: number) {
  const bytes = new Uint8Array(length); return { bytes, view: new DataView(bytes.buffer) };
}
/** Stored ZIP entries avoid browser compression dependencies and retain deterministic bytes. */
function zip(entries: Array<[string, string]>) {
  const locals: Uint8Array[] = []; const centrals: Uint8Array[] = []; let offset = 0;
  for (const [fileName, content] of entries) {
    const name = utf8.encode(fileName), data = utf8.encode(content), crc = crc32(data);
    const local = record(30);
    local.view.setUint32(0, 0x04034b50, true); local.view.setUint16(4, 20, true); local.view.setUint16(6, 0x800, true);
    local.view.setUint16(12, 33, true); local.view.setUint32(14, crc, true);
    local.view.setUint32(18, data.length, true); local.view.setUint32(22, data.length, true); local.view.setUint16(26, name.length, true);
    locals.push(local.bytes, name, data);
    const central = record(46);
    central.view.setUint32(0, 0x02014b50, true); central.view.setUint16(4, 20, true); central.view.setUint16(6, 20, true);
    central.view.setUint16(8, 0x800, true); central.view.setUint16(14, 33, true); central.view.setUint32(16, crc, true);
    central.view.setUint32(20, data.length, true); central.view.setUint32(24, data.length, true);
    central.view.setUint16(28, name.length, true); central.view.setUint32(42, offset, true);
    centrals.push(central.bytes, name); offset += local.bytes.length + name.length + data.length;
  }
  const end = record(22); const centralSize = centrals.reduce((length, entry) => length + entry.length, 0);
  end.view.setUint32(0, 0x06054b50, true); end.view.setUint16(8, entries.length, true); end.view.setUint16(10, entries.length, true);
  end.view.setUint32(12, centralSize, true); end.view.setUint32(16, offset, true);
  return concat([...locals, ...centrals, end.bytes]);
}
function columnName(index: number) {
  let label = ''; for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) label = String.fromCharCode(65 + (n - 1) % 26) + label;
  return label;
}
export function xlsxBytes(sheets: ExportSheet[]): Uint8Array<ArrayBuffer> {
  const prefix = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const spreadsheetNs = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const entries: Array<[string, string]> = [
    ['[Content_Types].xml', prefix + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map((_, index) => '<Override PartName="/xl/worksheets/sheet' + (index + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>'],
    ['_rels/.rels', prefix + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', prefix + '<workbook xmlns="' + spreadsheetNs + '" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets.map((sheet, index) => '<sheet name="' + xml(sheet.name.slice(0, 31)) + '" sheetId="' + (index + 1) + '" r:id="rId' + (index + 1) + '"/>').join('') + '</sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', prefix + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((_, index) => '<Relationship Id="rId' + (index + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (index + 1) + '.xml"/>').join('') + '<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', prefix + '<styleSheet xmlns="' + spreadsheetNs + '"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;£&quot;#,##0.00;[Red]-&quot;£&quot;#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
  ];
  sheets.forEach((sheet, index) => {
    const rows = sheet.rows.map((row, rowIndex) => '<row r="' + (rowIndex + 1) + '">' + row.map((value, column) => {
      const ref = columnName(column) + (rowIndex + 1);
      const format = sheet.formats?.[column];
      const style = rowIndex === 0 ? 1 : format === 'money' ? 2 : format === 'percent' ? 3 : 0;
      if (value === null) return '<c r="' + ref + '" s="' + style + '"/>';
      if (typeof value === 'number' && Number.isFinite(value)) return '<c r="' + ref + '" s="' + style + '"><v>' + (rowIndex > 0 && format === 'money' ? value / 100 : rowIndex > 0 && format === 'percent' ? value / 10000 : value) + '</v></c>';
      return '<c r="' + ref + '" s="' + style + '" t="inlineStr"><is><t xml:space="preserve">' + xml(value) + '</t></is></c>';
    }).join('') + '</row>').join('');
    entries.push(['xl/worksheets/sheet' + (index + 1) + '.xml', prefix + '<worksheet xmlns="' + spreadsheetNs + '"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' + Array.from({ length: sheet.rows[0]?.length ?? 1 }, (_, column) => '<col min="' + (column + 1) + '" max="' + (column + 1) + '" width="' + (column === 0 ? 42 : 24) + '" customWidth="1"/>').join('') + '</cols><sheetData>' + rows + '</sheetData></worksheet>']);
  });
  return zip(entries);
}
export interface PdfLine { label: string; value?: string; emphasis?: boolean }
function pdfText(value: string) {
  return value.replace(/[–—]/g, '-').replace(/[^\x20-\xff]/g, '?').replace(/[\\()]/g, '\\$&');
}
/** A4 text-based PDF: selectable statement text, repeated title and page footer. */
export function pdfBytes(title: string, lines: PdfLine[]): Uint8Array<ArrayBuffer> {
  const chunks: PdfLine[][] = []; let page: PdfLine[] = [];
  for (const line of lines) {
    const words = line.label.split(/\s+/); const labels: string[] = []; let current = '';
    for (const word of words) { if ((current + ' ' + word).length > (line.value ? 57 : 91)) { labels.push(current); current = word; } else current += (current ? ' ' : '') + word; }
    labels.push(current);
    labels.forEach((label, index) => { if (page.length === 40) { chunks.push(page); page = []; } page.push({ ...line, label, value: index === 0 ? line.value : undefined }); });
  }
  if (page.length || !chunks.length) chunks.push(page);
  const objects: string[] = ['', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
  const pageIds: number[] = [];
  chunks.forEach((chunk, index) => {
    const pageId = objects.length + 1, contentId = pageId + 1; pageIds.push(pageId);
    const draw = (x: number, y: number, text: string, bold = false, size = 10) => 'BT /F' + (bold ? '2' : '1') + ' ' + size + ' Tf 1 0 0 1 ' + x + ' ' + y + ' Tm (' + pdfText(text) + ') Tj ET\n';
    let stream = '0.12 0.18 0.24 rg\n' + draw(44, 786, title, true, 17) + '0.8 G 44 770 m 551 770 l S\n';
    chunk.forEach((line, row) => { const y = 747 - row * 16; stream += draw(44, y, line.label, line.emphasis); if (line.value) stream += draw(Math.max(395, 551 - line.value.length * 5.5), y, line.value, line.emphasis); });
    stream += draw(44, 38, 'Stock Supplies | Operational profitability | Page ' + (index + 1) + ' of ' + chunks.length, false, 9);
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + contentId + ' 0 R >>');
    objects.push('<< /Length ' + stream.length + ' >>\nstream\n' + stream + 'endstream');
  });
  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = '<< /Type /Pages /Kids [' + pageIds.map((id) => id + ' 0 R').join(' ') + '] /Count ' + chunks.length + ' >>';
  let document = '%PDF-1.4\n'; const offsets: number[] = [0];
  objects.forEach((object, index) => { offsets.push(document.length); document += (index + 1) + ' 0 obj\n' + object + '\nendobj\n'; });
  const xref = document.length;
  document += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n' + offsets.slice(1).map((offset) => String(offset).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Uint8Array.from(document, (char) => char.charCodeAt(0));
}

