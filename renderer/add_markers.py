"""Insert [[START_..]] / [[END_..]] markers into YOUR existing program, without touching its formatting.

    python add_markers.py 15_12_2024.docx template_markers.docx

For every section heading found (ENTRÉE, KYRIÉ, GLORIA, PSAUME ... SORTIE) it marks:
  * TITLE   the song title in the heading line (for a psalm: the psalm number)
  * REFRAIN the leading italic paragraph(s)  (an empty marked slot if the section has none)
  * VERSES  everything else down to the next heading
and replaces the date by [[DATE]]. Nothing else is changed; your sample songs stay as sample text.
"""
import copy, re, sys
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.text.paragraph import Paragraph
import docx_edit as de
import docx_markers as dm

DATE_RX = re.compile(r"(Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche)\s*,?\s*\d{1,2}\s+\S+\s+\d{4}", re.I)


def _marker_par(proto, text):
    node = dm._fresh(proto._p)
    para = Paragraph(node, proto._parent)
    runs = para.runs
    for r in runs[1:]:
        r._r.getparent().remove(r._r)
    if runs:
        runs[0].text = text
    else:
        para.add_run(text)
    return node


def _title_span(head, name):
    t = de._fix(head.text)
    m = de.HEAD.match(t)
    if name == "Psaume":                           # the number is part of the title: "PSAUME 120(121) :"
        pm = re.search(r"\d+\s*(?:\(\d+\))?", t[: m.end()])
        if pm:
            return pm.start(), pm.end()
    a = m.end()
    while a < len(t) and t[a].isspace():
        a += 1
    return a, max(a, len(t.rstrip()))


def add_markers(src, dst):
    doc = Document(src)
    paras, blocks = de.find_blocks(doc)
    blocks = [b for b in blocks if b["name"]]
    if not blocks:
        raise SystemExit("No section headings found (ENTRÉE, KYRIÉ, ...).")

    # formatting donors taken from the document itself
    donor_rpr = None
    for b in blocks:
        runs = [r for r in paras[b["head"]].runs if r.text.strip()]
        if len(runs) > 1 and (runs[-1].font.name or "") != "Algerian" and runs[-1]._r.rPr is not None:
            donor_rpr = copy.deepcopy(runs[-1]._r.rPr)
            break
    body_paras = [p for b in blocks for p in paras[b["head"] + 1: b["end"]]]
    refrain_proto = next((p for p in body_paras if p.text.strip() and de._italic(p)), None)
    verse_proto = next((p for p in body_paras if p.text.strip() and not de._italic(p)), None)
    blank_proto = next((p for p in body_paras if not p.text.strip() and not p._p.xpath(".//w:sectPr")), None)
    refrain_proto = refrain_proto or verse_proto
    verse_proto = verse_proto or refrain_proto

    seen, report = {}, []
    for b in blocks:
        key = dm.section_key(b["name"])
        seen[key] = seen.get(key, 0) + 1
        k = key if seen[key] == 1 else f"{key}_{seen[key]}"
        head = paras[b["head"]]
        body = paras[b["head"] + 1: b["end"]]

        # --- title (inline in the heading) ---
        a, e = _title_span(head, b["name"])
        total = len(head.text)
        start_m, end_m = f"[[START_{k}_TITLE]]", f"[[END_{k}_TITLE]]"
        if a >= total and a == e:                  # empty title: add a run that uses a title-like format
            r = OxmlElement("w:r")
            if donor_rpr is not None:
                r.append(copy.deepcopy(donor_rpr))
            t = OxmlElement("w:t")
            t.text = start_m + end_m
            t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
            r.append(t)
            head._p.append(r)
        else:
            dm._splice(head, e, e, end_m)
            dm._splice(head, a, a, start_m)

        # --- refrain / verses (blocks of paragraphs) ---
        ne = [i for i, p in enumerate(body) if p.text.strip()]
        refrain_idx = []
        if ne and de._italic(body[ne[0]]):
            j = ne[0]
            while j < len(body) and body[j].text.strip() and de._italic(body[j]):
                refrain_idx.append(j)
                j += 1
        last_consumed = -1
        if refrain_idx:
            r_first, r_last = refrain_idx[0], refrain_idx[-1]
            if r_last + 1 < len(body) and not body[r_last + 1].text.strip():
                r_last += 1                        # the blank line after the refrain belongs to it
            last_consumed = r_last
            s_el = _marker_par(refrain_proto, f"[[START_{k}_REFRAIN]]")
            e_el = _marker_par(refrain_proto, f"[[END_{k}_REFRAIN]]")
            body[r_first]._p.addprevious(s_el)
            body[r_last]._p.addnext(e_el)
            after_refrain = e_el
        else:                                      # empty slot straight after the heading
            s_el = _marker_par(refrain_proto, f"[[START_{k}_REFRAIN]]")
            e_el = _marker_par(refrain_proto, f"[[END_{k}_REFRAIN]]")
            head._p.addnext(s_el)
            if blank_proto is not None:
                blank = dm._fresh(blank_proto._p)
                s_el.addnext(blank)
                blank.addnext(e_el)
            else:
                s_el.addnext(e_el)
            after_refrain = e_el
        rest = [i for i in ne if i > last_consumed]
        vs = _marker_par(verse_proto, f"[[START_{k}_VERSES]]")
        ve = _marker_par(verse_proto, f"[[END_{k}_VERSES]]")
        if rest:
            body[rest[0]]._p.addprevious(vs)
            body[rest[-1]]._p.addnext(ve)
        else:
            after_refrain.addnext(vs)
            vs.addnext(ve)
        report.append(k)

    for p in doc.paragraphs:                       # date line -> [[DATE]]
        m = DATE_RX.search(p.text)
        if m:
            dm._splice(p, m.start(), m.end(), "[[DATE]]")
            break
    doc.save(dst)
    return report


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    keys = add_markers(sys.argv[1], sys.argv[2])
    print("marked sections:", ", ".join(keys))
