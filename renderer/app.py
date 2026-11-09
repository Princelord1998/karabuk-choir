"""Rendering service: JSON in, PDF out. Stateless - it never touches the database."""
import datetime, hashlib, json, os
from flask import Flask, Response, jsonify, request
from docx_edit import update_program
from docx_markers import check_template, fill_markers
from docx_program import fill_template
from docx_to_pdf import convert as docx_to_pdf, warm_up
from program_pdf import register_fonts, render_bytes

app = Flask(__name__)
register_fonts()
BASE_DOCX = os.environ.get("BASE_DOCX")   # your own program .docx, edited in place (preferred)
HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.environ.get("TEMPLATE_DOCX", os.path.join(HERE, "template_markers.docx"))   # marker-pair template
ALLOW_FALLBACK = os.environ.get("ALLOW_FALLBACK", "0") == "1"   # 1 = show the simple drawing when the template cannot be converted
PREVIEW_FROM_WORD = os.environ.get("PREVIEW_FROM_WORD", "1") != "0"   # preview = your Word template converted to PDF
MISSING = os.environ.get("MISSING", "keep")   # keep | remove: what to do with marked parts that have no song
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _template_info():
    """Which file is really in use, so you can tell whether it is YOUR program or the generic sample."""
    path = BASE_DOCX or TEMPLATE
    try:
        from docx import Document
        lines = [p.text.strip()[:70] for p in Document(path).paragraphs if p.text.strip()]
        return dict(path=os.path.abspath(path), size_kb=round(os.path.getsize(path) / 1024),
                    modified=datetime.datetime.fromtimestamp(os.path.getmtime(path)).isoformat(timespec="minutes"),
                    first_lines=lines[:6])
    except Exception as e:
        return dict(path=os.path.abspath(path), error=str(e))


print("[renderer] template in use:", _template_info(), flush=True)
LAST = {"ok": None, "engine": None, "error": None}     # result of the most recent preview
try:
    warm_up()                                           # start Word in the background: first preview is faster
except Exception as _e:
    print("[renderer] could not pre-start Word:", _e, flush=True)


def _validated(body):
    datetime.date.fromisoformat(body["date"])
    entries = body["entries"]
    assert isinstance(entries, list)
    for e in entries:
        assert isinstance(e["section"], str) and isinstance(e["title"], str) and isinstance(e["verses"], list)
    return entries


@app.get("/health")
def health():
    return jsonify(ok=True)


def _build_docx(body, entries):
    """Fill the Word template (or edit BASE_DOCX). Returns (docx_bytes, headers)."""
    headers = {}
    if BASE_DOCX:                            # edit YOUR document in place: only changed sections are touched
        data, report = update_program(BASE_DOCX, entries, body["date"])
        headers["X-Edit-Report"] = "; ".join(f"{s}: {st}" for s, _, st in report).encode("ascii", "ignore").decode()
    elif check_template(TEMPLATE)[0]:        # template with [[START_..]] / [[END_..]] marker pairs
        data, report = fill_markers(TEMPLATE, entries, body["date"], body.get("community") or "", MISSING)
        headers["X-Edit-Report"] = "; ".join(f"{n}: {st}" for n, st in report if st not in ("filled",)).encode("ascii", "ignore").decode()
    else:                                    # older {{MARKER}} template
        data = fill_template(TEMPLATE, entries, body["date"], body.get("community") or "")
    return data, headers


def _entries_or_400(body):
    try:
        return _validated(body), None
    except (KeyError, ValueError, AssertionError, TypeError):
        return None, (jsonify(error="expected {date: 'YYYY-MM-DD', community?: str, entries: [{section, title, verses}]}"), 400)


@app.post("/render")
def render():
    """PDF preview. Normally your Word template converted to PDF; falls back to the built-in drawing."""
    body = request.get_json(silent=True) or {}
    entries, err = _entries_or_400(body)
    if err:
        return err
    if PREVIEW_FROM_WORD:
        try:
            stamp = os.path.getmtime(BASE_DOCX or TEMPLATE) if os.path.exists(BASE_DOCX or TEMPLATE) else 0
            key = hashlib.sha1((json.dumps(body, sort_keys=True) + str(stamp)).encode()).hexdigest()
            data, _ = _build_docx(body, entries)
            pdf, engine = docx_to_pdf(data, key)
            LAST.update(ok=True, engine=engine, error=None)
            return Response(pdf, mimetype="application/pdf", headers={"X-Engine": engine})
        except (RuntimeError, ValueError, OSError) as e:
            reason = str(e)
            LAST.update(ok=False, engine=None, error=reason)
            print(f"[preview] could not make the preview from your Word template: {reason}", flush=True)
            if not ALLOW_FALLBACK:           # do NOT silently show a different-looking page
                return jsonify(error=f"Preview from your Word template failed: {reason}"), 503
    else:
        reason = "PREVIEW_FROM_WORD=0"
    pdf, pages, size = render_bytes(entries, body["date"], body.get("community") or "")
    return Response(pdf, mimetype="application/pdf",
                    headers={"X-Engine": "builtin", "X-Engine-Error": reason.encode("ascii", "ignore").decode()[:300]})


@app.post("/render-docx")
def render_docx():
    """Fill the Word template (TEMPLATE_DOCX) and return the .docx"""
    body = request.get_json(silent=True) or {}
    entries, err = _entries_or_400(body)
    if err:
        return err
    try:
        data, headers = _build_docx(body, entries)
    except (ValueError, OSError) as e:      # missing marker / file not found
        return jsonify(error=str(e)), 500
    return Response(data, mimetype=DOCX_MIME, headers=headers)


@app.get("/preview-status")
def preview_status():
    """What the most recent preview used. No conversion here, so it is instant.
    ok: null = no preview made yet, true = made from your Word template, false = failed (see error)."""
    return jsonify(ok=LAST["ok"], engine=LAST["engine"], error=LAST["error"],
                   hint="Check Word is installed and 'pip install pywin32', or install LibreOffice, then restart app.py",
                   template=_template_info())


@app.get("/check-template")
def check():
    """Validate the Word template: lists its markers and any problem (missing END, bad name...)."""
    try:
        names, problems = check_template(TEMPLATE)
    except OSError as e:
        return jsonify(error=str(e)), 500
    return jsonify(template=_template_info(), markers=names, problems=problems)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port)
