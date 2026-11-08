"""Fill a Word template that contains explicit marker pairs.

In the template, wrap the sample text of each part of each section:

    ENTRÉE : [[START_ENTREE_TITLE]]TITRE[[END_ENTREE_TITLE]]      <- inline: inside one paragraph
    [[START_ENTREE_REFRAIN]]                                       <- block: markers on their own lines
    Refrain d'exemple                                              (the sample paragraph(s) in between
    [[END_ENTREE_REFRAIN]]                                          give the formatting that is reused)
    [[START_ENTREE_VERSES]]
    1. Couplet d'exemple
    [[END_ENTREE_VERSES]]

Marker names:  <SECTION>_<PART>  or  <SECTION>_<n>_<PART>  (n = 2 for a second Offertoire, ...)
  SECTION: ENTREE KYRIE GLORIA PSAUME ACCLAMATION PRIERE_UNIVERSELLE OFFERTOIRE SANCTUS AGNUS_DEI
           COMMUNION ACTION_DE_GRACE SORTIE        PART: TITLE REFRAIN VERSES
Single tokens: [[DATE]] and [[COMMUNITY]].

Rules
  * The template file is never modified; the filled copy has every marker removed.
  * New text takes the formatting (font, italic, spacing) of the sample text between the markers.
  * A song with no refrain / no verses removes that whole part, so no empty line is left.
  * Markers split across several Word runs (autocorrect, spell-check) are handled.
"""
import copy, datetime, io, re, unicodedata
from docx import Document
from docx.oxml.ns import qn
from docx.text.paragraph import Paragraph

TOKEN = re.compile(r"\[\[(START|END)_([A-Z0-9_]+)\]\]")
PART = re.compile(r"^(.+?)(?:_(\d+))?_(TITLE|REFRAIN|VERSES)$")
FR_DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
FR_MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
             "septembre", "octobre", "novembre", "décembre"]


def french_date(iso):
    d = datetime.date.fromisoformat(iso)
    return f"{FR_DAYS[d.weekday()]}, {d.day:02d} {FR_MONTHS[d.month - 1].capitalize()} {d.year}"


def section_key(name):
    s = unicodedata.normalize("NFD", name.upper())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^A-Z0-9]+", "_", s).strip("_")


W14 = "http://schemas.microsoft.com/office/word/2010/wordml"


def _fresh(p_el):
    """Deep copy of a paragraph element without section breaks or duplicated Word paragraph ids."""
    node = copy.deepcopy(p_el)
    for el in node.iter():
        for att in ("{%s}paraId" % W14, "{%s}textId" % W14):
            el.attrib.pop(att, None)
    for sp in node.xpath(".//w:sectPr"):
        sp.getparent().remove(sp)
    return node


# ------------------------------------------------------------------ text splicing
def _splice(par, a, b, new):
    """Replace characters [a, b) of the paragraph text with `new`. Untouched runs are not rewritten;
    `new` takes the formatting of the run in which position `a` falls."""
    runs = par.runs
    if not runs:
        par.add_run(new)
        return
    spans, pos = [], 0
    for r in runs:
        t = r.text
        spans.append((pos, pos + len(t)))
        pos += len(t)
    target = next((i for i, (s, e) in enumerate(spans) if s <= a < e), len(runs) - 1)
    for i, r in enumerate(runs):
        s, e = spans[i]
        t = r.text
        left = t[: max(0, min(len(t), a - s))]
        right = t[max(0, min(len(t), b - s)):]
        out = left + (new if i == target else "") + right
        if out != t:
            r.text = out


def _tokens(par):
    return [(m.group(1), m.group(2), m.start(), m.end()) for m in TOKEN.finditer(par.text)]


def _remove_if_empty(par):
    if not par.text.strip() and not par._p.xpath(".//w:drawing | .//w:pict | .//w:sectPr"):
        par._p.getparent().remove(par._p)


# ------------------------------------------------------------------ data
def _data(entries):
    """{(SECTION_KEY, n, PART): value} from the app's entries."""
    out, seen = {}, {}
    for e in entries:
        k = section_key(e["section"])
        seen[k] = seen.get(k, 0) + 1
        n = seen[k]
        vs = e["verses"]
        refrain = "\n".join(v["text"] for v in vs if v["kind"] == "refrain") or None
        body = [v for v in vs if v["kind"] != "refrain"]
        numbered = sum(1 for v in body if v["kind"] == "verse") > 1
        verses = []
        for v in body:
            if v["kind"] == "coda":
                verses.append({"text": f"Coda : {v['text']}", "no": None})
            else:
                no = v.get("verseNo")
                text = re.sub(r"^\s*\d{1,2}\s*[.\-)]\s*", "", v["text"])   # text may already start with "1."
                verses.append({"text": text, "no": no if numbered and no else None})
        title = e["title"].upper()
        if k == "PSAUME":                          # the heading already says PSAUME: keep just the number
            num = e.get("psalmNumber")
            m = re.match(r"^PSAUME\s*[:\-]?\s*(\d+(?:\s*\(\d+\))?)", title)
            title = str(num) if num else (m.group(1) if m else re.sub(r"^PSAUME\s*[:\-]?\s*", "", title) or title)
        out[(k, n, "TITLE")] = title
        out[(k, n, "REFRAIN")] = refrain
        out[(k, n, "VERSES")] = verses or None
    return out


# ------------------------------------------------------------------ filling
def _keep_dominant_run(para, text):
    """Keep only the run holding most of the text (its font/size/italic) and give it `text`."""
    runs = para.runs
    best = max(runs, key=lambda r: len(r.text.strip()), default=None)
    if best is None:
        para.add_run(text)
        return
    for r in runs:
        if r is not best:
            r._r.getparent().remove(r._r)
    best.text = text


def _item_text(item, prefix_number=True):
    if isinstance(item, dict):
        return f"{item['no']}. {item['text']}" if prefix_number and item["no"] else item["text"]
    return item


def _auto_numbered(par):
    """True if the paragraph is a Word automatic list item (Word itself writes '1.', '2.', ...)."""
    num = par._p.find(qn("w:pPr") + "/" + qn("w:numPr"))
    if num is None:
        return False
    nid = num.find(qn("w:numId"))
    return nid is not None and nid.get(qn("w:val")) != "0"


def _strip_numbering(node):
    ppr = node.find(qn("w:pPr"))
    if ppr is not None:
        for n in ppr.findall(qn("w:numPr")):
            ppr.remove(n)


def _prune_empty_runs(par):
    for r in par._p.findall(qn("w:r")):
        kids = [c for c in r if c.tag != qn("w:rPr")]
        if all(c.tag == qn("w:t") and not (c.text or "") for c in kids):
            par._p.remove(r)


def _fill_inline(par, s0, s1, e0, e1, value, keep_sample):
    text = "" if value is None else ("\n".join(_item_text(i) for i in value) if isinstance(value, list) else value)
    _splice(par, e0, e1, "")                       # right to left keeps the offsets valid
    if not keep_sample:
        _splice(par, s1, e0, text)
    _splice(par, s0, s1, "")
    _prune_empty_runs(par)


def _fill_block(start_p, end_p, value, keep_sample, s0, s1, e0, e1):
    # strip the markers themselves first (a paragraph that only held a marker disappears)
    between, el = [], start_p._p.getnext()
    while el is not None and el is not end_p._p:
        between.append(el)
        el = el.getnext()
    paras = [Paragraph(e, start_p._parent) for e in between if e.tag == qn("w:p")]
    filled = [p for p in paras if p.text.strip()]
    proto = filled[0] if filled else None
    sep = next((p for p in paras if not p.text.strip() and filled
                and paras.index(p) > paras.index(filled[0]) and paras.index(p) < paras.index(filled[-1])), None)

    if not keep_sample:
        items = [] if value is None else (value if isinstance(value, list) else [value])
        last_filled = paras.index(filled[-1]) if filled else -1
        tail_blank = next((p for p in paras[last_filled + 1:] if not p.text.strip()), None)
        new_nodes = []
        auto = proto is not None and _auto_numbered(proto)    # Word numbers these paragraphs itself
        for i, item in enumerate(items):
            base = proto if proto is not None else start_p
            node = _fresh(base._p)
            para = Paragraph(node, base._parent)
            runs = para.runs
            text_i = _item_text(item, prefix_number=not auto)
            if auto and not (isinstance(item, dict) and item["no"]):
                _strip_numbering(node)             # unnumbered verse / coda: no automatic number either
            if proto is None:                      # no sample text: reuse the marker paragraph's formatting
                for r in runs:
                    r._r.getparent().remove(r._r)
                para.add_run(text_i)
            else:
                _keep_dominant_run(para, text_i)
            new_nodes.append(node)
            if sep is not None and i < len(items) - 1:
                new_nodes.append(_fresh(sep._p))
        if items and tail_blank is not None:       # keep the blank line that followed the sample
            new_nodes.append(_fresh(tail_blank._p))
        for e in between:
            e.getparent().remove(e)
        for node in new_nodes:
            end_p._p.addprevious(node)
    if keep_sample and not filled:                 # slot made only of blank lines: nothing to keep
        for e in between:
            e.getparent().remove(e)
    _splice(end_p, e0, e1, "")
    _splice(start_p, s0, s1, "")
    _remove_if_empty(end_p)
    _remove_if_empty(start_p)


def fill_markers(template, entries, date=None, community=None, missing="keep"):
    """template: path or file-like (never modified). Returns (docx_bytes, report).
    missing='keep'   -> a marked part with no data keeps its sample text (markers removed)
    missing='remove' -> a marked part with no data is removed"""
    doc = Document(template)
    data = _data(entries)
    report = []

    # 1. single tokens
    for par in list(doc.paragraphs):
        for token, value in (("[[DATE]]", french_date(date) if date else None), ("[[COMMUNITY]]", community)):
            while token in par.text:
                i = par.text.index(token)
                _splice(par, i, i + len(token), value if value is not None else "")

    # 2. marker pairs - collect first, then fill (the paragraph list changes while editing)
    pairs = {}
    for par in doc.paragraphs:
        for kind, name, a, b in _tokens(par):
            d = pairs.setdefault(name, {})
            if kind in d:
                report.append((name, f"duplicate {kind} marker"))
            d[kind] = (par, a, b)
    for name, d in pairs.items():
        m = PART.match(name)
        if "START" not in d or "END" not in d:
            report.append((name, "needs both a START and an END marker - left as is"))
            continue
        if not m:
            report.append((name, "unknown marker name (use <SECTION>_TITLE|REFRAIN|VERSES)"))
            continue
        sec, n, part = m.group(1), int(m.group(2) or 1), m.group(3)
        key = (sec, n, part)
        has = key in data
        value = data.get(key)
        keep_sample = (not has) and missing == "keep"
        (sp, s0, s1), (ep, e0, e1) = d["START"], d["END"]
        if sp._p is ep._p:
            _fill_inline(sp, s0, s1, e0, e1, value, keep_sample)
        else:
            # offsets belong to the paragraph text at scan time; unchanged until now for these paragraphs
            _fill_block(sp, ep, value, keep_sample, s0, s1, e0, e1)
        report.append((name, "kept sample" if keep_sample else ("removed" if value is None else "filled")))

    out = io.BytesIO()
    doc.save(out)
    return out.getvalue(), report


def check_template(template):
    """List the markers a template contains and any problems (missing END, duplicates, bad names)."""
    doc = Document(template)
    seen, problems = {}, []
    for par in doc.paragraphs:
        for kind, name, _, _ in _tokens(par):
            seen.setdefault(name, []).append(kind)
    for name, kinds in sorted(seen.items()):
        if sorted(kinds) != ["END", "START"]:
            problems.append(f"{name}: {kinds}")
        if not PART.match(name):
            problems.append(f"{name}: unknown marker name")
    return sorted(seen), problems
