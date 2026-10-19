/* Chinese Translation Quality Check: the Word writer core, written once.
 *
 * Opens a .docx, finds a paragraph by its accepted-view text, and writes tracked changes
 * (w:del + w:ins) and comments with the editor's author name (config/document.json editor_author).
 * Text positions are counted in the accepted view: deleted text is left out, inserted text is
 * included, so a change can sit on top of an earlier tracked change (the glossary stage). The
 * file's own document properties are kept; only lastModifiedBy and the modified time change.
 * Used by the glossary stage, build_document.js, write_docx.mjs and the writer check.
 */
"use strict";
const JSZip = require("jszip");
const { DOMParser, XMLSerializer } = require("@xmldom/xmldom");

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const XML_NS = "http://www.w3.org/XML/1998/namespace";
const REL_COMMENTS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments";
const CT_COMMENTS = "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml";

const kids = (el) => Array.from(el.childNodes).filter((n) => n.nodeType === 1);
const isW = (el, name) => el && el.nodeType === 1 && el.namespaceURI === W && el.localName === name;
function within(el, name, stop) {
  for (let a = el.parentNode; a && a !== stop; a = a.parentNode) if (isW(a, name)) return true;
  return false;
}
function wEl(doc, name, attrs) {
  const e = doc.createElementNS(W, "w:" + name);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttributeNS(W, "w:" + k, v);
  return e;
}

class Docx {
  static async open(buffer, author = "Editor") {
    const d = new Docx();
    d.author = author;
    d.zip = await JSZip.loadAsync(buffer);
    d.doc = new DOMParser().parseFromString(await d.zip.file("word/document.xml").async("string"), "text/xml");
    const c = d.zip.file("word/comments.xml");
    d.comments = c ? new DOMParser().parseFromString(await c.async("string"), "text/xml") : null;
    d.date = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    d.nextId = 1 + Math.max(900000, ...d._allIds());
    d.log = [];
    return d;
  }

  _allIds() {
    const ids = [];
    for (const src of [this.doc, this.comments].filter(Boolean))
      for (const el of Array.from(src.getElementsByTagNameNS(W, "*"))) {
        const v = el.getAttributeNS(W, "id");
        if (/^\d+$/.test(v || "")) ids.push(Number(v));
      }
    return ids;
  }
  _id() { return String(this.nextId++); }

  paragraphs() { return Array.from(this.doc.getElementsByTagNameNS(W, "p")); }

  /** Accepted-view text of a paragraph and the w:t nodes behind it. */
  textMap(p) {
    const map = []; let pos = 0;
    for (const t of Array.from(p.getElementsByTagNameNS(W, "t"))) {
      if (within(t, "del", p)) continue;
      const s = t.textContent || "";
      map.push({ t, start: pos, end: pos + s.length }); pos += s.length;
    }
    return { text: map.map((m) => m.t.textContent || "").join(""), map };
  }

  /** Original-view text: what the paragraph read before any tracked change. */
  originalText(p) {
    let out = "";
    for (const el of Array.from(p.getElementsByTagNameNS(W, "*"))) {
      // Text inserted by a tracked change was never in the original, even if later deleted.
      if ((isW(el, "delText") || isW(el, "t")) && !within(el, "ins", p)) out += el.textContent || "";
    }
    return out;
  }

  findParagraph(acceptedText) {
    const hits = this.paragraphs().filter((p) => this.textMap(p).text === acceptedText);
    if (hits.length !== 1) throw new Error(`paragraph_match_count_${hits.length}`);
    return hits[0];
  }

  /** Make sure a run boundary falls at accepted-view offset k. */
  _splitAt(p, k) {
    const { map } = this.textMap(p);
    const hit = map.find((m) => m.start < k && k < m.end);
    if (!hit) return;
    const run = hit.t.parentNode;
    if (!isW(run, "r") || kids(run).filter((c) => isW(c, "t")).length !== 1) throw new Error("run_with_several_text_nodes");
    const copy = run.cloneNode(true);
    const t2 = kids(copy).find((c) => isW(c, "t"));
    const full = hit.t.textContent, cut = k - hit.start;
    hit.t.textContent = full.slice(0, cut); t2.textContent = full.slice(cut);
    for (const t of [hit.t, t2]) t.setAttributeNS(XML_NS, "xml:space", "preserve");
    run.parentNode.insertBefore(copy, run.nextSibling);
  }

  _targetRuns(p, start, end, expected) {
    const { text } = this.textMap(p);
    if (expected != null && text.slice(start, end) !== expected) throw new Error("span_text_differs");
    this._splitAt(p, start); this._splitAt(p, end);
    return this.textMap(p).map.filter((m) => m.start >= start && m.end <= end && m.end > m.start).map((m) => m.t.parentNode);
  }

  /** Tracked replacement of [start, end) with newText (empty newText = deletion only). */
  replace(p, start, end, newText, expected) {
    const runs = this._targetRuns(p, start, end, expected);
    if (!runs.length) throw new Error("empty_span");
    const rPr = kids(runs[0]).find((c) => isW(c, "rPr"));
    for (const run of runs) {
      const del = wEl(this.doc, "del", { id: this._id(), author: this.author, date: this.date });
      run.parentNode.insertBefore(del, run); del.appendChild(run);
      for (const t of kids(run).filter((c) => isW(c, "t"))) {
        const dt = wEl(this.doc, "delText"); dt.setAttributeNS(XML_NS, "xml:space", "preserve");
        dt.textContent = t.textContent; run.replaceChild(dt, t);
      }
    }
    if (newText) {
      const ins = wEl(this.doc, "ins", { id: this._id(), author: this.author, date: this.date });
      const r = wEl(this.doc, "r");
      if (rPr) r.appendChild(rPr.cloneNode(true));
      const t = wEl(this.doc, "t"); t.setAttributeNS(XML_NS, "xml:space", "preserve"); t.textContent = newText;
      r.appendChild(t); ins.appendChild(r);
      let after = runs[runs.length - 1].parentNode;   // the w:del just written
      // Never nest an insertion inside an earlier one (Word cannot reject it cleanly):
      // split the earlier w:ins at this point and place the new one between the halves.
      while (isW(after.parentNode, "ins")) {
        const outer = after.parentNode;
        const tail = outer.cloneNode(false);
        tail.setAttributeNS(W, "w:id", this._id());
        while (after.nextSibling) tail.appendChild(after.nextSibling);
        outer.parentNode.insertBefore(tail, outer.nextSibling);
        if (!kids(tail).length) outer.parentNode.removeChild(tail);
        after = outer;
      }
      after.parentNode.insertBefore(ins, after.nextSibling);
    }
    this.log.push({ kind: "change", start, end, newText });
  }

  /** Comment anchored on [start, end); markers sit at paragraph level so they stay valid. */
  comment(p, start, end, text, expected) {
    const runs = this._targetRuns(p, start, end, expected);
    if (!runs.length) throw new Error("empty_span");
    const top = (n) => { while (n.parentNode !== p) n = n.parentNode; return n; };
    const first = top(runs[0]), last = top(runs[runs.length - 1]);
    const id = this._id();
    p.insertBefore(wEl(this.doc, "commentRangeStart", { id }), first);
    const endMark = wEl(this.doc, "commentRangeEnd", { id });
    p.insertBefore(endMark, last.nextSibling);
    const refRun = wEl(this.doc, "r");
    const rPr = wEl(this.doc, "rPr"); rPr.appendChild(wEl(this.doc, "rStyle", { val: "CommentReference" }));
    refRun.appendChild(rPr); refRun.appendChild(wEl(this.doc, "commentReference", { id }));
    p.insertBefore(refRun, endMark.nextSibling);
    this._commentPart().documentElement.appendChild(this._commentEl(id, text));
    this.log.push({ kind: "comment", start, end, text });
  }

  _commentPart() {
    if (!this.comments) {
      this.comments = new DOMParser().parseFromString(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments xmlns:w="${W}"></w:comments>`, "text/xml");
      this._newCommentPart = true;
    }
    return this.comments;
  }

  _commentEl(id, text) {
    const c = this.comments;
    const el = wEl(c, "comment", { id, author: this.author, date: this.date, initials: this.author.slice(0, 2) });
    for (const line of String(text).split("\n")) {
      const p = wEl(c, "p"); const r = wEl(c, "r"); const t = wEl(c, "t");
      t.setAttributeNS(XML_NS, "xml:space", "preserve"); t.textContent = line;
      r.appendChild(t); p.appendChild(r); el.appendChild(p);
    }
    return el;
  }

  async save() {
    const ser = new XMLSerializer();
    this.zip.file("word/document.xml", ser.serializeToString(this.doc));
    if (this.comments) {
      this.zip.file("word/comments.xml", ser.serializeToString(this.comments));
      if (this._newCommentPart) await this._registerComments();
    }
    let core = await this.zip.file("docProps/core.xml").async("string");
    core = core.replace(/<cp:lastModifiedBy>[\s\S]*?<\/cp:lastModifiedBy>/, `<cp:lastModifiedBy>${this.author}</cp:lastModifiedBy>`)
               .replace(/(<dcterms:modified[^>]*>)[\s\S]*?(<\/dcterms:modified>)/, `$1${this.date}$2`);
    this.zip.file("docProps/core.xml", core);
    return this.zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  }

  async _registerComments() {
    const relPath = "word/_rels/document.xml.rels";
    let rels = await this.zip.file(relPath).async("string");
    if (!rels.includes(REL_COMMENTS)) {
      const ids = [...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
      const rid = "rId" + (Math.max(0, ...ids) + 1);
      rels = rels.replace("</Relationships>", `<Relationship Id="${rid}" Type="${REL_COMMENTS}" Target="comments.xml"/></Relationships>`);
      this.zip.file(relPath, rels);
    }
    let ct = await this.zip.file("[Content_Types].xml").async("string");
    if (!ct.includes('PartName="/word/comments.xml"')) {
      ct = ct.replace("</Types>", `<Override PartName="/word/comments.xml" ContentType="${CT_COMMENTS}"/></Types>`);
      this.zip.file("[Content_Types].xml", ct);
    }
  }
}

module.exports = { Docx, W };
