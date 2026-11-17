"""
Extract the legal passages the 20 cases need from the page-marked text in
../../_build (Act.txt, Regs.txt) into corpus/legal/*.md, one passage per
section, regulation or by-law, each keeping its PDF page.

Cleaning: page headers dropped, lines joined, PDF split words rejoined
("dev eloper" -> "developer") only when the joined form is a word found
elsewhere in the same text and one half is not. The statutory words are
otherwise kept as printed.

    python build/extract_legal.py
"""
import json
import re
from collections import Counter
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
SRC = BASE.parents[1] / "_build"
OUT = BASE / "corpus" / "legal"

ACT_SECTIONS = {59: "Duties and powers of management corporation",
                60: "Maintenance account of the management corporation",
                61: "Sinking fund account of the management corporation",
                70: "By-laws for regulation of subdivided building or land",
                105: "Jurisdiction of Tribunal"}
REGS = range(55, 65)
# split words the frequency rule leaves alone (both halves are common words), found by reading the output
FIXES = {"pa int": "paint", "scr een": "screen", "dis posed": "disposed", "junctio n": "junction",
         "ma y": "may", "pro perty": "property", "pla nt": "plant", "prepar e": "prepare", "sha ll": "shall",
         "c ollection": "collection", "questio n": "question", "compl y": "comply", "contai ned": "contained",
         "rec tify": "rectify", "affec ted": "affected", "part y wall": "party wall", "i n writing": "in writing", "ext ent": "extent", "wir es": "wires", "chem ical": "chemical", "cont ravenes": "contravenes", "pla ying": "playing"}
BYLAWS = range(1, 31)


def pages(path):
    """[(page, line)] with headers removed."""
    out, page = [], 0
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"=== PAGE (\d+)", line)
        if m:
            page = int(m.group(1))
            continue
        s = line.strip()
        if re.match(r"^(Laws of Malaysia\s*\d+\s*Ac\s*t 757|Strata Management\s*\d+|P\.U\. \(A\) 107|\d{1,3})$", s):
            continue
        out.append((page, line.rstrip()))
    return out


def vocab(lines):
    return Counter(w.lower() for _, l in lines for w in re.findall(r"[A-Za-z]+", l))


def clean(text, V):
    t = re.sub(r"\s+", " ", text).strip()
    t = re.sub(r"(\w) -(\w)", r"\1-\2", t)          # "by -laws"
    t = re.sub(r" ([,;:.)])", r"\1", t)
    t = re.sub(r"\( ", "(", t)
    toks = t.split(" ")
    out, i = [], 0
    while i < len(toks):
        a = toks[i]
        if i + 1 < len(toks):
            b = toks[i + 1]
            ma, mb = re.match(r"^([\W]*)([A-Za-z]+)$", a), re.match(r"^([A-Za-z]+)([\W]*)$", b)
            if ma and mb:
                j = (ma.group(2) + mb.group(1)).lower()
                ia, ib = V.get(ma.group(2).lower(), 0), V.get(mb.group(1).lower(), 0)
                vj = V.get(j, 0)
                if (vj >= 10 and vj > min(ia, ib)) or (vj >= 2 and min(ia, ib) < 2):
                    out.append(ma.group(1) + ma.group(2) + mb.group(1) + mb.group(2))
                    i += 2
                    continue
        out.append(a)
        i += 1
    t = " ".join(out)
    t = re.sub(r"\bi f\b", "If", t)
    t = re.sub(r"(\w) - (\w)", r"\1-\2", t)          # "by - laws", "air - conditioning"
    for a, b in FIXES.items():
        t = t.replace(a, b)
    return t


def body(lines, start_pat, end_pat, after=0):
    """Lines from the first match of start_pat (at index >= after) up to end_pat."""
    s = next(i for i in range(after, len(lines)) if re.match(start_pat, lines[i][1].strip()))
    e = next((i for i in range(s + 1, len(lines)) if re.match(end_pat, lines[i][1].strip())), len(lines))
    return lines[s:e]


def fmt(seg, V, drop_tail_title=True):
    pg = sorted({p for p, _ in seg})
    txt = "\n".join(l for _, l in seg)
    # a marginal heading of the next section sits on the line before it: drop a trailing lowercase title line
    paras = re.split(r"\n(?=\s*\((?:\d+|[a-z]{1,4})\)\s)", txt)
    return pg, [clean(p, V) for p in paras if p.strip()]


def write(name, meta, paras):
    # a marginal heading of the next item (or the signature block) can trail the last paragraph: cut it
    if paras:
        last = re.sub(r"\s+(PART [XVI]+ .*|Made \d.*|\[KPKT.*|Inter-floor leakage caused by defective workmanship, etc\. within the defect liability period)$", "", paras[-1])
        m = re.search(r"^(.*[.;])\s+[A-Z][^.;]*$", last)
        if m and not re.search(r"\.\s+[A-Z][^.;]*\.\s*$", last):
            last = m.group(1)
        paras[-1] = last
    head ="\n".join(f"{k}: {v}" for k, v in meta.items())
    (OUT / name).write_text(f"---\n{head}\n---\n\n" + "\n\n".join(paras) + "\n", encoding="utf-8")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    act = pages(SRC / "Act.txt")
    regs = pages(SRC / "Regs.txt")
    VA, VR = vocab(act), vocab(regs)
    start_body = next(i for i, (p, l) in enumerate(act) if re.match(r"^1\. \(1\)|^1\.\s+\(1\)|^Short title", l.strip()) and p > 10)
    made = []
    for n, title in ACT_SECTIONS.items():
        seg = body(act, rf"^{n}\.\s+\(1\)", rf"^{n + 1}\.\s", after=start_body)
        # drop the marginal heading of the next section (last line, no full stop, lowercase start)
        while seg and re.match(r"^[a-z][^.;]*$", seg[-1][1].strip()) and not seg[-1][1].strip().endswith((",", "—", "and", "or")):
            seg = seg[:-1]
        pg, paras = fmt(seg, VA)
        write(f"act-s{n}.md", {"code": f"ACT-s{n}", "tier": "act", "document": "Strata Management Act 2013 (Act 757)",
                               "number": f"section {n}", "title": title, "page": "-".join(map(str, [pg[0], pg[-1]])) if len(pg) > 1 else pg[0],
                               "approval_status": "in force", "effective_date": "2015-06-01"}, paras)
        made.append(f"ACT-s{n}")
    reg_start = next(i for i, (p, l) in enumerate(regs) if p >= 160 and re.match(r"^55\.\s+\(1\)", l.strip()))
    for n in REGS:
        seg = body(regs, rf"^{n}\.\s", rf"^{n + 1}\.\s", after=reg_start)
        while seg and re.match(r"^(?:[A-Z][a-z ,\-]+|PART [IVX]+|[A-Z ,\-]+)$", seg[-1][1].strip()) and len(seg) > 2:
            seg = seg[:-1]
        pg, paras = fmt(seg, VR)
        title = re.search(rf"^\s*{n}\. (.*?)\s*$", next((l for p, l in regs if re.match(rf"^\s*{n}\. [A-Z]", l)), ""), re.M)
        write(f"reg-{n}.md", {"code": f"REG-{n}", "tier": "regulations",
                              "document": "Strata Management (Maintenance and Management) Regulations 2015",
                              "number": f"regulation {n}", "title": title.group(1) if title else f"Regulation {n}",
                              "page": "-".join(map(str, [pg[0], pg[-1]])) if len(pg) > 1 else pg[0],
                              "approval_status": "in force", "effective_date": "2015-06-01"}, paras)
        made.append(f"REG-{n}")
    ts = next(i for i, (p, l) in enumerate(regs) if p == 238 and "THIRD SCHEDULE" in l)
    for n in BYLAWS:
        seg = body(regs, rf"^{n}\.\s+[A-Z]", rf"^({n + 1}\.\s+[A-Z]|PART \d+)", after=ts)
        while seg and re.match(r"^(PART \d+|[A-Z][A-Z ,\-]+)$", seg[-1][1].strip()):
            seg = seg[:-1]
        title = re.match(rf"^\s*{n}\.\s+(.*?)\s*$", seg[0][1]).group(1)
        pg, paras = fmt(seg[1:], VR)
        write(f"bylaw-{n:02d}.md", {"code": f"BL-{n}", "tier": "third_schedule",
                                    "document": "Third Schedule By-laws, Strata Management (Maintenance and Management) Regulations 2015",
                                    "number": f"by-law {n}", "title": clean(title, VR),
                                    "page": "-".join(map(str, [pg[0], pg[-1]])) if len(pg) > 1 else pg[0],
                                    "approval_status": "in force", "effective_date": "2015-06-01"}, paras)
        made.append(f"BL-{n}")
    print(len(made), "passages:", ", ".join(made))


if __name__ == "__main__":
    main()
