"""Create template_markers_sample.docx: same page as your programs (A4, music-note border, title, 2 columns)
with one marked block per Mass section. Edit fonts/spacing of the SAMPLE text in Word; markers stay."""
import copy
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn
from docx.shared import Mm, Pt

SECTIONS = [("ENTRÉE", "ENTREE"), ("KYRIÉ", "KYRIE"), ("GLORIA", "GLORIA"), ("PSAUME", "PSAUME"),
            ("ACCLAMATION", "ACCLAMATION"), ("PRIÈRE UNIVERSELLE", "PRIERE_UNIVERSELLE"),
            ("OFFERTOIRE", "OFFERTOIRE"), ("SANCTUS", "SANCTUS"), ("AGNUS DEI", "AGNUS_DEI"),
            ("COMMUNION", "COMMUNION"), ("MÉDITATION", "ACTION_DE_GRACE"), ("SORTIE", "SORTIE")]
TNR = "Times New Roman"

doc = Document()
for p in list(doc.paragraphs):
    p._p.getparent().remove(p._p)
s = doc.sections[0]
s.page_width, s.page_height = Mm(210), Mm(297)
for side in ("left_margin", "right_margin", "top_margin", "bottom_margin"):
    setattr(s, side, Pt(36))


def run(p, text, size=10, font=TNR, bold=False, italic=False, underline=False):
    r = p.add_run(text)
    r.font.name, r.font.size, r.bold, r.italic, r.underline = font, Pt(size), bold, italic, underline
    r._r.get_or_add_rPr().rFonts.set(qn("w:cs"), font)
    return r


def para(after=0, before=0, align=None):
    p = doc.add_paragraph()
    p.paragraph_format.space_after, p.paragraph_format.space_before = Pt(after), Pt(before)
    if align is not None:
        p.alignment = align
    return p


run(para(align=WD_ALIGN_PARAGRAPH.RIGHT), "[[DATE]]", 9, italic=True)
title = para(after=10, before=4, align=WD_ALIGN_PARAGRAPH.CENTER)
run(title, "[[COMMUNITY]]", 14, "Gloucester MT Extra Condensed", underline=True)

for label, key in SECTIONS:
    h = para(before=10, after=2)
    h.paragraph_format.keep_with_next = True
    run(h, f"{label} : ", 10, "Algerian")                                   # section name
    run(h, f"[[START_{key}_TITLE]]", 10, bold=True)
    run(h, "Titre du chant", 10, bold=True)                                 # sample = title formatting
    run(h, f"[[END_{key}_TITLE]]", 10, bold=True)
    run(para(), f"[[START_{key}_REFRAIN]]")
    run(para(after=6), "Refrain d'exemple", 10, italic=True)               # sample = refrain formatting
    run(para(), f"[[END_{key}_REFRAIN]]")
    run(para(), f"[[START_{key}_VERSES]]")
    run(para(after=6), "1. Couplet d'exemple", 10)                         # sample = verse formatting
    run(para(), f"[[END_{key}_VERSES]]")

body = doc.element.body
final = body.find(qn("w:sectPr"))
borders = parse_xml(
    f'<w:pgBorders {nsdecls("w")}>'
    '<w:top w:val="musicNotes" w:sz="13" w:space="1" w:color="auto"/>'
    '<w:left w:val="musicNotes" w:sz="13" w:space="4" w:color="auto"/>'
    '<w:bottom w:val="musicNotes" w:sz="13" w:space="1" w:color="auto"/>'
    '<w:right w:val="musicNotes" w:sz="13" w:space="4" w:color="auto"/></w:pgBorders>')


def configure(sect, n_cols, continuous=False):
    for tag in ("w:cols", "w:pgBorders", "w:type"):
        for el in sect.findall(qn(tag)):
            sect.remove(el)
    sect.find(qn("w:pgMar")).addnext(copy.deepcopy(borders))
    cols = OxmlElement("w:cols")
    cols.set(qn("w:num"), str(n_cols))
    cols.set(qn("w:space"), "425")
    sect.find(qn("w:pgBorders")).addnext(cols)
    if continuous:
        t = OxmlElement("w:type")
        t.set(qn("w:val"), "continuous")
        sect.insert(0, t)


first = copy.deepcopy(final)
configure(first, 1)
title._p.get_or_add_pPr().append(first)
configure(final, 2, continuous=True)
doc.save("template_markers_sample.docx")
print("template_markers_sample.docx created")
