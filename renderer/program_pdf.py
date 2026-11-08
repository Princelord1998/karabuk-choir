#!/usr/bin/env python3
"""PDF drawing for the mass program. Input is plain data; no database knowledge here."""
import datetime, io, os, sys
from xml.sax.saxutils import escape

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate, Paragraph,
                                Spacer, FrameBreak, NextPageTemplate)

# ----------------------------------------------------------------- settings
COMMUNITY = "COMMUNAUTÉ CHRÉTIENNE CATHOLIQUE DE KARABÜK"

# Fonts: first existing path wins. Add your own (e.g. Times New Roman on Windows).
FONT_CANDIDATES = {
    "body":        ["/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
                    "C:/Windows/Fonts/times.ttf", "/Library/Fonts/Times New Roman.ttf"],
    "body-bold":   ["/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
                    "C:/Windows/Fonts/timesbd.ttf", "/Library/Fonts/Times New Roman Bold.ttf"],
    "body-italic": ["/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf",
                    "C:/Windows/Fonts/timesi.ttf", "/Library/Fonts/Times New Roman Italic.ttf"],
    "body-bi":     ["/usr/share/fonts/truetype/liberation/LiberationSerif-BoldItalic.ttf",
                    "C:/Windows/Fonts/timesbi.ttf", "/Library/Fonts/Times New Roman Bold Italic.ttf"],
    "symbols":     ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                    "C:/Windows/Fonts/seguisym.ttf", "/Library/Fonts/Arial Unicode.ttf"],
}
NOTE = "\u266B"  # ♫

FR_DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
FR_MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
             "septembre", "octobre", "novembre", "décembre"]


def register_fonts():
    for name, paths in FONT_CANDIDATES.items():
        for p in paths:
            if os.path.exists(p):
                pdfmetrics.registerFont(TTFont(name, p))
                break
        else:
            sys.exit(f"No font found for '{name}'. Edit FONT_CANDIDATES in the script.")
    pdfmetrics.registerFontFamily("body", normal="body", bold="body-bold",
                                  italic="body-italic", boldItalic="body-bi")


def french_date(iso):
    d = datetime.date.fromisoformat(iso)
    return f"{FR_DAYS[d.weekday()]}, {d.day} {FR_MONTHS[d.month - 1]} {d.year}"


# ------------------------------------------------------------------ drawing
def draw_border(canvas, doc):
    w, h = A4
    canvas.saveState()
    canvas.setFont("symbols", 11)
    step = 11.5
    m = 20                                   # distance from page edge
    n_x = int((w - 2 * m) // step)
    for i in range(n_x + 1):                 # top and bottom rows
        x = m + i * step
        canvas.drawString(x, h - m - 9, NOTE)
        canvas.drawString(x, m, NOTE)
    n_y = int((h - 2 * m - 18) // 15)
    for j in range(1, n_y):                  # left and right columns
        y = m + 4 + j * 15
        canvas.drawString(m, y, NOTE)
        canvas.drawString(w - m - step + 1, y, NOTE)
    canvas.restoreState()


def make_pdf(program, date, community, font_size):
    w, h = A4
    buf = io.BytesIO()
    doc = BaseDocTemplate(buf, pagesize=A4, title=f"Programme {date}")
    left, right, top, bottom, gap = 48, 48, 44, 44, 24
    col_w = (w - left - right - gap) / 2
    header_h = 78
    col_h_first = h - top - bottom - header_h
    col_h = h - top - bottom
    f = lambda x, y, ww, hh, i: Frame(x, y, ww, hh, id=i, leftPadding=0, rightPadding=0,
                                      topPadding=0, bottomPadding=0)
    first = PageTemplate("first", onPage=draw_border, frames=[
        f(left, h - top - header_h + 4, w - left - right, header_h - 4, "head"),
        f(left, bottom, col_w, col_h_first, "c1"),
        f(left + col_w + gap, bottom, col_w, col_h_first, "c2")])
    later = PageTemplate("later", onPage=draw_border, frames=[
        f(left, bottom, col_w, col_h, "l1"), f(left + col_w + gap, bottom, col_w, col_h, "l2")])
    doc.addPageTemplates([first, later])

    lead = font_size * 1.22
    st = dict(
        date=ParagraphStyle("date", fontName="body-italic", fontSize=9, alignment=TA_RIGHT),
        title=ParagraphStyle("title", fontName="body-bold", fontSize=13.5, alignment=TA_CENTER,
                             spaceBefore=6, leading=17),
        head=ParagraphStyle("head", fontName="body-bold", fontSize=font_size + 0.5, leading=lead + 1,
                            spaceBefore=font_size * 1.1, spaceAfter=2, keepWithNext=1),
        refrain=ParagraphStyle("refrain", fontName="body-italic", fontSize=font_size, leading=lead,
                               spaceAfter=font_size * 0.6),
        verse=ParagraphStyle("verse", fontName="body", fontSize=font_size, leading=lead,
                             spaceAfter=font_size * 0.6),
    )
    story = [Paragraph(french_date(date), st["date"]),
             Paragraph(f"<u>{escape(community)}</u>", st["title"]),
             FrameBreak(), NextPageTemplate("later")]

    for section, song in program:
        head = f"{escape(section.upper())} : {escape(song['title'].upper())}"
        story.append(Paragraph(head, st["head"]))
        vs = song["verses"]
        n_verses = sum(1 for v in vs if v["kind"] == "verse")
        for v in vs:
            text = escape(v["text"]).replace("\n", "<br/>")
            if v["kind"] == "refrain":
                story.append(Paragraph(text, st["refrain"]))
            elif v["kind"] == "coda":
                story.append(Paragraph(f"<i>Coda :</i> {text}", st["verse"]))
            else:
                no = v.get("verseNo")
                numbered = n_verses > 1 and no not in (None, "")
                story.append(Paragraph(f"{no}. {text}" if numbered else text, st["verse"]))
    doc.build(story)
    return buf.getvalue(), doc.page


def render(program, date, community, out_path, max_pages=2):
    size = 10.0
    while True:
        pdf, pages = make_pdf(program, date, community, size)
        if pages <= max_pages or size <= 7.5:
            break
        size -= 0.5
    with open(out_path, "wb") as fh:
        fh.write(pdf)
    return pages, size




def render_bytes(entries, date, community, max_pages=2):
    """entries: [{'section': str, 'title': str, 'verses': [{'kind','verseNo','text'}]}] in Mass order."""
    program = [(e["section"], {"title": e["title"], "verses": e["verses"]}) for e in entries]
    size = 10.0
    while True:
        pdf, pages = make_pdf(program, date, community, size)
        if pages <= max_pages or size <= 7.5:
            return pdf, pages, size
        size -= 0.5
