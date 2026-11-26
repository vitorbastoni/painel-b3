/* Leitor mínimo de .xlsx (planilha OOXML, um zip de XML).
   Só lê células usadas. Não grava arquivo e não baixa nada da rede.
   Infla com DecompressionStream, disponível no Chrome e no Safari atuais. */
'use strict';

(function (root) {
  function fail(msg) { throw new Error(msg); }

  function findEocd(view) {
    const len = view.byteLength;
    const start = Math.max(0, len - 22 - 65535);
    for (let i = len - 22; i >= start; i--) {
      if (view.getUint32(i, true) === 0x06054b50) return i;
    }
    return -1;
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream !== 'function') fail('Este navegador não consegue abrir .xlsx.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unzip(buffer) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    if (bytes.length < 22 || view.getUint32(0, true) !== 0x04034b50) fail('O arquivo não é uma planilha .xlsx.');
    const eocd = findEocd(view);
    if (eocd < 0) fail('O arquivo .xlsx está incompleto.');
    const count = view.getUint16(eocd + 10, true);
    let off = view.getUint32(eocd + 16, true);
    const files = Object.create(null);
    for (let n = 0; n < count; n++) {
      if (off + 46 > bytes.length || view.getUint32(off, true) !== 0x02014b50) fail('O arquivo .xlsx está incompleto.');
      const method = view.getUint16(off + 10, true);
      const compSize = view.getUint32(off + 20, true);
      const nameLen = view.getUint16(off + 28, true);
      const extraLen = view.getUint16(off + 30, true);
      const commentLen = view.getUint16(off + 32, true);
      const localOff = view.getUint32(off + 42, true);
      const name = new TextDecoder('utf-8').decode(bytes.subarray(off + 46, off + 46 + nameLen));
      if (localOff + 30 > bytes.length || view.getUint32(localOff, true) !== 0x04034b50) fail('O arquivo .xlsx está incompleto.');
      const localName = view.getUint16(localOff + 26, true);
      const localExtra = view.getUint16(localOff + 28, true);
      const dataStart = localOff + 30 + localName + localExtra;
      const comp = bytes.subarray(dataStart, dataStart + compSize);
      let data;
      if (method === 0) data = comp;
      else if (method === 8) data = await inflateRaw(comp);
      else fail('A planilha usa uma compressão não suportada.');
      files[name] = data;
      off += 46 + nameLen + extraLen + commentLen;
    }
    return files;
  }

  function xmlDoc(bytes) {
    const text = new TextDecoder('utf-8').decode(bytes);
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) fail('Não foi possível ler o XML da planilha.');
    return doc;
  }

  function byLocal(root, name) {
    const out = [];
    if (!root) return out;
    const all = root.getElementsByTagName('*');
    for (let i = 0; i < all.length; i++) {
      if (all[i].localName === name) out.push(all[i]);
    }
    return out;
  }

  function attr(el, name) {
    if (!el || !el.attributes) return null;
    for (let i = 0; i < el.attributes.length; i++) {
      if (el.attributes[i].localName === name) return el.attributes[i].value;
    }
    return null;
  }

  function textOf(el) {
    const parts = byLocal(el, 't');
    if (!parts.length) return el.textContent || '';
    return parts.map(function (t) { return t.textContent || ''; }).join('');
  }

  function sharedStrings(files) {
    const raw = files['xl/sharedStrings.xml'];
    if (!raw) return [];
    return byLocal(xmlDoc(raw), 'si').map(textOf);
  }

  function resolveTarget(target) {
    if (!target) return '';
    if (target.charAt(0) === '/') return target.replace(/^\/+/, '');
    const parts = ['xl'];
    target.split('/').forEach(function (p) {
      if (p === '..') parts.pop();
      else if (p && p !== '.') parts.push(p);
    });
    return parts.join('/');
  }

  function sheetPath(files, sheetName) {
    const book = files['xl/workbook.xml'];
    const rels = files['xl/_rels/workbook.xml.rels'];
    if (!book || !rels) fail('A planilha não tem a estrutura esperada de um .xlsx.');
    const sheet = byLocal(xmlDoc(book), 'sheet').find(function (el) { return attr(el, 'name') === sheetName; });
    if (!sheet) fail('A aba “' + sheetName + '” não está neste arquivo.');
    const rid = attr(sheet, 'id');
    const rel = byLocal(xmlDoc(rels), 'Relationship').find(function (el) { return attr(el, 'Id') === rid; });
    if (!rel) fail('Não foi possível localizar a aba “' + sheetName + '”.');
    const path = resolveTarget(attr(rel, 'Target'));
    if (!files[path]) fail('Não foi possível localizar a aba “' + sheetName + '”.');
    return path;
  }

  function colIndex(ref) {
    const letters = String(ref || '').replace(/[0-9]/g, '');
    let n = 0;
    for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
    return n - 1;
  }

  function cellValue(cell, strings) {
    const kind = attr(cell, 't') || '';
    if (kind === 'inlineStr') return textOf(cell);
    const v = byLocal(cell, 'v')[0];
    const raw = v ? (v.textContent || '') : '';
    if (kind === 's') {
      const idx = parseInt(raw, 10);
      return strings[idx] != null ? strings[idx] : '';
    }
    if (kind === 'str') return raw;
    if (kind === 'b') return raw === '1' ? 1 : 0;
    if (!raw) return null;
    const num = Number(raw);
    return isFinite(num) ? num : raw;
  }

  function sheetRows(doc, strings) {
    const rows = [];
    byLocal(doc, 'c').forEach(function (cell) {
      const ref = attr(cell, 'r') || '';
      const rowMatch = ref.match(/(\d+)$/);
      if (!rowMatch) return;
      const r = parseInt(rowMatch[1], 10) - 1;
      const c = colIndex(ref);
      if (r < 0 || c < 0) return;
      if (!rows[r]) rows[r] = [];
      rows[r][c] = cellValue(cell, strings);
    });
    return rows;
  }

  async function sheet(arrayBuffer, sheetName) {
    const files = await unzip(arrayBuffer);
    const path = sheetPath(files, sheetName);
    return sheetRows(xmlDoc(files[path]), sharedStrings(files));
  }

  root.XlsxLite = { sheet: sheet };
})(window);
