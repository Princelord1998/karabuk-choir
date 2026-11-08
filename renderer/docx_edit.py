"""Edit YOUR Word program in place.

Opens an existing program .docx, finds each section heading (ENTRÉE, KYRIE, GLORIA, PSAUME, ...),
and replaces only the song under the sections you ask for. Every other paragraph is left untouched
(same XML), and the new text reuses the fonts/italics/spacing of the paragraphs it replaces.
No markers, no template needed.
"""
import copy, datetime, difflib, io, re, unicodedata
from docx import Document
from docx.text.paragraph import Paragraph

FR_DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
FR_MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
             "septembre", "octobre", "novembre", "décembre"]

SECTIONS = [  # (heading regex, canonical section name; None = recognised but not managed)
    (r"ENTR[ÉE]E|ACCUEIL", "Entrée"), (r"KYRI[EÉ]", "Kyrie"), (r"GLORIA", "Gloria"),
    (r"PSAUME", "Psaume"), (r"ACCLAMATION", "Acclamation"), (r"CREDO", None),
    (r"PRI[ÈE]RE UNIVERSELLE", "Prière universelle"), (r"OFFRANDE|OFFERTOIRE", "Offertoire"),
    (r"SANCTUS|SANTUS", "Sanctus"), (r"PATER", None), (r"AGNUS DE[IU]", "Agnus Dei"),
    (r"COMMUNION", "Communion"), (r"ACTION DE GR[ÂA]CE|M[ÉE]DITATION", "Action de grâce"),
    (r"SORTIE", "Sortie"),
]
HEAD = re.compile(r"^\s*(" + "|".join(f"(?:{k})" for k, _ in SECTIONS) + r")\s*(?:\d+\s*(?:\(\d+\))?\s*|I{1,2}\s*)?:", re.I)
DATE_LINE = re.compile(r"^\s*(?:(?:Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche)\s*,|\d{2}\.\d{2}\.\d{4}\s*$)", re.I)


def french_date(iso):
    d = datetime.date.fromisoformat(iso)
    return f"{FR_DAYS[d.weekday()]}, {d.day:02d} {FR_MONTHS[d.month - 1].capitalize()} {d.year}"


def _fix(t):            # 'KYRİÉ' (dotted İ) -> 'KYRIÉ' so the regex sees it; same length
    return t.replace("İ", "I").replace("ı", "i")


def _canon(keyword):
    for rx, name in SECTIONS:
        if re.fullmatch(rx, keyword.strip(), re.I):
            return name
    return None


def _norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z]+", "", s)       # letters only: ignores numbering, punctuation, spaces


def _italic(p):
    return any(r.italic for r in p.runs if r.text.strip())


def _set_text(paragraph, text):
    """Keep the first run's formatting, drop other runs, set the text ('\\n' -> Word line break)."""
    runs = paragraph.runs
    if not runs:
        paragraph.add_run(text)
        return
    for r in runs[1:]:
        r._r.getparent().remove(r._r)
    runs[0].text = text


def find_blocks(doc):
    """Return (paragraphs, [{'name','head','end'}]); body of a block = paragraphs[head+1:end]."""
    paras = doc.paragraphs
    marks = []
    for i, p in enumerate(paras):
        t = _fix(p.text)
        m = HEAD.match(t)
        if m:
            marks.append((i, _canon(m.group(1)), True))
        elif DATE_LINE.match(t):
            marks.append((i, None, False))          # a date line ends the previous block
    blocks = []
    for n, (i, name, is_head) in enumerate(marks):
        if not is_head:
            continue
        end = marks[n + 1][0] if n + 1 < len(marks) else len(paras)
        blocks.append(dict(name=name, head=i, end=end))
    return paras, blocks


def _replace_heading_title(head, title):
    """Keep the keyword run (e.g. Algerian 'ENTRÉE :') and only swap the song title after the colon."""
    full = _fix(head.text)
    m = HEAD.match(full)
    cut = m.end()                                  # index just after the colon in head.text
    pos = 0
    runs = head.runs
    for idx, r in enumerate(runs):
        end = pos + len(r.text)
        if end >= cut:
            k = cut - pos
            if k < len(r.text) or idx == len(runs) - 1:
                r.text = r.text[:k] + (" " + title if title else "")
                for later in runs[idx + 1:]:
                    later._r.getparent().remove(later._r)
            else:                                   # colon ends this run: title lives in the next run
                nxt = runs[idx + 1]
                nxt.text = (" " + title) if title else ""
                for later in runs[idx + 2:]:
                    later._r.getparent().remove(later._r)
            return
        pos = end


def _same_song(paras, head, body, song):
    title_old = _norm(_fix(head.text)[HEAD.match(_fix(head.text)).end():])
    if _norm(song["title"]) != title_old and not (not title_old and not song["title"]):
        return False
    old = _norm(" ".join(p.text for p in body))
    new = _norm(" ".join(v["text"] for v in song["verses"]))
    return difflib.SequenceMatcher(None, old, new).ratio() >= 0.9 if (old or new) else True


def _update_block(paras, blk, song, fallback_protos):
    head = paras[blk["head"]]
    body = paras[blk["head"] + 1: blk["end"]]
    if _same_song(paras, head, body, song):
        return "unchanged"
    if len(head.text) > 100:
        return "skipped: heading and lyrics are in one paragraph"

    n_tail = 0                                      # keep blank paragraphs at the end of the block
    while n_tail < len(body) and not body[len(body) - 1 - n_tail].text.strip():
        n_tail += 1
    content = body[: len(body) - n_tail] if n_tail else body
    tail = body[len(body) - n_tail:] if n_tail else []

    refrain_p = next((p for p in content if _italic(p)), None) or fallback_protos[0]
    verse_p = next((p for p in content if not _italic(p) and p.text.strip()), None) or fallback_protos[1]
    blank_between = [p for p in content if not p.text.strip()]
    sep = blank_between[0]._p if blank_between else None
    sep_style = ". "
    for p in content:
        m = re.match(r"^\s*\d+(\s*[.\-)]\s*)", p.text)
        if m:
            sep_style = m.group(1)
            break

    _replace_heading_title(head, song["title"].upper())

    anchor = tail[0]._p if tail else (content[-1]._p.getnext() if content else head._p.getnext())
    for p in content:
        p._p.getparent().remove(p._p)

    vs = song["verses"]
    numbered = sum(1 for v in vs if v["kind"] == "verse") > 1
    for i, v in enumerate(vs):
        no, text = v.get("verseNo"), v["text"]
        if v["kind"] == "refrain":
            proto, txt = refrain_p, text
        elif v["kind"] == "coda":
            proto, txt = verse_p, f"Coda : {text}"
        else:
            proto, txt = verse_p, (f"{no}{sep_style}{text}" if numbered and no else text)
        new = copy.deepcopy(proto._p)
        _set_text(Paragraph(new, proto._parent), txt)
        anchor.addprevious(new)
        if sep is not None and i < len(vs) - 1:
            anchor.addprevious(copy.deepcopy(sep))
    return "replaced"


def update_program(source, entries, date=None):
    """source: path or file-like of YOUR program .docx.
    entries: [{'section','title','verses':[{'kind','verseNo','text'}]}] - songs that should be in the program.
    Returns (docx_bytes, report). Sections whose song already matches are not touched."""
    doc = Document(source)
    paras, blocks = find_blocks(doc)
    by_name = {}
    for b in blocks:
        if b["name"]:
            by_name.setdefault(b["name"], []).append(b)
    # formatting fallbacks (used only if a heading has no body to copy from)
    all_body = [p for b in blocks for p in paras[b["head"] + 1: b["end"]] if p.text.strip()]
    fb = (next((p for p in all_body if _italic(p)), all_body[0] if all_body else None),
          next((p for p in all_body if not _italic(p)), all_body[0] if all_body else None))

    report, used = [], {}
    for e in entries:
        name = e["section"]
        n = used.get(name, 0)
        used[name] = n + 1
        found = by_name.get(name, [])
        if n >= len(found) or fb[0] is None:
            report.append((name, e["title"], "not found in the document - left out"))
            continue
        status = _update_block(paras, found[n], e, fb)
        report.append((name, e["title"], status))

    if date:
        for p in doc.paragraphs:
            if re.match(r"^\s*(Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche)\s*,", p.text, re.I):
                _set_text(p, french_date(date))             # "Dimanche, 05 Octobre 2025"
                break
            if re.match(r"^\s*\d{2}\.\d{2}\.\d{4}\s*$", p.text):
                _set_text(p, datetime.date.fromisoformat(date).strftime("%d.%m.%Y"))   # "05.10.2025"
                break
    out = io.BytesIO()
    doc.save(out)
    return out.getvalue(), report
