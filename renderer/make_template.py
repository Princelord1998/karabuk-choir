"""Create template_program.docx: A4, music-note page border, title across the page,
then two text columns. Open it in Word to change fonts/colours/spacing, or copy the
five {{MARKER}} paragraphs into your own template instead."""
import copy
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn
from docx.shared import Mm, Pt

FONT = "Times New Roman"

doc = Document()
for p in list(doc.paragraphs):
    p._p.getparent().remove(p._p)
sec = doc.sections[0]
sec.page_width, sec.page_height = Mm(210), Mm(297)
for side in ("left_margin", "right_margin", "top_margin", "bottom_margin"):
    setattr(sec, side, Pt(36))

def run(p, text, size, font=FONT, bold=False, italic=False, underline=False):
    r = p.add_run(text)
    r.font.name, r.font.size, r.bold, r.italic, r.underline = font, Pt(size), bold, italic, underline
    r._r.get_or_add_rPr().rFonts.set(qn("w:cs"), font)
    return r


def para(text, size, font=FONT, bold=False, italic=False, underline=False, align=None, after=0, before=0):
    p = doc.add_paragraph()
    run(p, text, size, font, bold, italic, underline)
    if align is not None:
        p.alignment = align
    p.paragraph_format.space_after, p.paragraph_format.space_before = Pt(after), Pt(before)
    return p

para("{{DATE}}", 9, italic=True, align=WD_ALIGN_PARAGRAPH.RIGHT)
title = para("{{COMMUNITY}}", 14, font="Gloucester MT Extra Condensed", underline=True,
             align=WD_ALIGN_PARAGRAPH.CENTER, after=10, before=4)
head = para("{{HEADING}}", 10, font="Algerian", before=10, after=2)    # section name: Algerian
run(head, " title", 10, bold=True)                                   # song title: Times bold
para("{{REFRAIN}}", 10, italic=True, after=6)
para("{{VERSE}}", 10, after=6)

body = doc.element.body
final = body.find(qn("w:sectPr"))
borders = parse_xml(
    f'<w:pgBorders {nsdecls("w")}>'
    '<w:top w:val="musicNotes" w:sz="13" w:space="1" w:color="auto"/>'
    '<w:left w:val="musicNotes" w:sz="13" w:space="4" w:color="auto"/>'
    '<w:bottom w:val="musicNotes" w:sz="13" w:space="1" w:color="auto"/>'
    '<w:right w:val="musicNotes" w:sz="13" w:space="4" w:color="auto"/></w:pgBorders>')

def configure(sect, n_cols, continuous=False):
    """Schema order inside sectPr must be: type, pgSz, pgMar, pgBorders, cols."""
    for tag in ("w:cols", "w:pgBorders", "w:type"):
        for el in sect.findall(qn(tag)):
            sect.remove(el)
    pg_mar = sect.find(qn("w:pgMar"))
    pg_mar.addnext(copy.deepcopy(borders))
    cols = OxmlElement("w:cols")
    cols.set(qn("w:num"), str(n_cols))
    cols.set(qn("w:space"), "425")
    sect.find(qn("w:pgBorders")).addnext(cols)
    if continuous:
        typ = OxmlElement("w:type")
        typ.set(qn("w:val"), "continuous")
        sect.insert(0, typ)

# section 1 = date + title, one column; it ends inside the title paragraph
first_sect = copy.deepcopy(final)
configure(first_sect, 1)
title._p.get_or_add_pPr().append(first_sect)

# section 2 = songs, two columns, continues on the same page
configure(final, 2, continuous=True)

doc.save("template_program.docx")
print("template_program.docx created")
