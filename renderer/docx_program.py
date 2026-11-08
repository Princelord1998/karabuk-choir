"""Fill a Word template with a program. The template keeps all the formatting
(page border, columns, fonts); Python only replaces marker paragraphs.

Markers a template must contain (each alone in its own paragraph):
  {{DATE}}       date line                       (e.g. right-aligned, italic)
  {{COMMUNITY}}  title line                      (e.g. centred, bold, underlined)
  {{HEADING}}    example of a song heading: put it in the FIRST run (section name, e.g. Algerian font)
                 and type any text in a SECOND run (song title, e.g. Times bold). One run also works.
  {{REFRAIN}}    example of a refrain            (e.g. italic)
  {{VERSE}}      example of a verse
The three song paragraphs are used as formatting prototypes: each song's heading,
refrain and verses are copies of them, so changing their look in Word changes every program.
"""
import copy, datetime, io
from docx import Document
from docx.text.paragraph import Paragraph

FR_DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
FR_MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
             "septembre", "octobre", "novembre", "décembre"]
MARKERS = ("{{DATE}}", "{{COMMUNITY}}", "{{HEADING}}", "{{REFRAIN}}", "{{VERSE}}")


def french_date(iso):
    d = datetime.date.fromisoformat(iso)
    return f"{FR_DAYS[d.weekday()]}, {d.day:02d} {FR_MONTHS[d.month - 1].capitalize()} {d.year}"   # Dimanche, 05 Octobre 2025


def _set_text(paragraph, text):
    """Replace the paragraph's text but keep the formatting of its first run."""
    runs = paragraph.runs
    if not runs:
        paragraph.add_run(text)
        return
    for r in runs[1:]:
        r._r.getparent().remove(r._r)
    runs[0].text = text          # '\n' becomes a Word line break


def _clone(proto, text, keep_with_next=False):
    p = copy.deepcopy(proto._p)
    para = Paragraph(p, proto._parent)
    _set_text(para, text)
    if keep_with_next:
        para.paragraph_format.keep_with_next = True
    return p


def _clone_heading(proto, section, title):
    p = copy.deepcopy(proto._p)
    para = Paragraph(p, proto._parent)
    runs = para.runs
    if len(runs) >= 2:                      # section name and title can use different fonts
        runs[0].text = f"{section.upper()} :"
        runs[1].text = f" {title.upper()}"
        for r in runs[2:]:
            r._r.getparent().remove(r._r)
    else:
        _set_text(para, f"{section.upper()} : {title.upper()}")
    para.paragraph_format.keep_with_next = True
    return p


def fill_template(template, entries, date, community):
    """template: path or file-like. entries: [{'section','title','verses':[{'kind','verseNo','text'}]}]."""
    doc = Document(template)
    found = {}
    for p in doc.paragraphs:
        for m in MARKERS:
            if m in p.text:
                found[m] = p
    missing = [m for m in MARKERS if m not in found]
    if missing:
        raise ValueError("Template is missing marker paragraph(s): " + ", ".join(missing))

    _set_text(found["{{DATE}}"], french_date(date))
    _set_text(found["{{COMMUNITY}}"], community)

    protos = [found["{{HEADING}}"], found["{{REFRAIN}}"], found["{{VERSE}}"]]
    body = doc.element.body
    first = min(protos, key=lambda p: list(body).index(p._p))._p
    head, refrain, verse = protos

    for e in entries:
        first.addprevious(_clone_heading(head, e["section"], e["title"]))
        vs = e["verses"]
        numbered = sum(1 for v in vs if v["kind"] == "verse") > 1
        for v in vs:
            no, text = v.get("verseNo"), v["text"]
            if v["kind"] == "refrain":
                first.addprevious(_clone(refrain, text))
            elif v["kind"] == "coda":
                first.addprevious(_clone(verse, f"Coda : {text}"))
            else:
                first.addprevious(_clone(verse, f"{no}. {text}" if numbered and no else text))
    for p in protos:
        p._p.getparent().remove(p._p)

    out = io.BytesIO()
    doc.save(out)
    return out.getvalue()
