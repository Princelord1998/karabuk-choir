"""Turn a filled .docx into a PDF so the web preview shows exactly your Word template.
Tries, in order: Microsoft Word (via docx2pdf, Windows/macOS), then LibreOffice (headless).
Raises RuntimeError if neither is available - the caller then falls back to the built-in drawing."""
import atexit, glob, hashlib, os, queue, shutil, subprocess, sys, tempfile, threading, time

_lock = threading.Lock()          # Word/LibreOffice cannot convert two files at once
_cache = {}                       # key -> (pdf, engine); keeps the last few previews
WORK = os.path.join(tempfile.gettempdir(), "karabuk_preview")   # our own scratch folder


def _cleanup_old(max_age=600):
    """Best-effort: delete scratch folders older than 10 minutes (Word may still have held them locked)."""
    try:
        now = time.time()
        for name in os.listdir(WORK):
            path = os.path.join(WORK, name)
            if now - os.path.getmtime(path) > max_age:
                shutil.rmtree(path, ignore_errors=True)
    except OSError:
        pass


class _WordWorker:
    """One hidden Word kept alive between previews, so a preview takes ~1 s instead of several.
    A single thread owns the Word COM object (required by COM). Word quits after IDLE seconds of no use."""
    IDLE = 300

    def __init__(self):
        self.q = queue.Queue()
        self.thread = None
        self.guard = threading.Lock()

    def _ensure_thread(self):
        with self.guard:
            if self.thread is None or not self.thread.is_alive():
                self.thread = threading.Thread(target=self._run, name="word-worker", daemon=True)
                self.thread.start()

    def warm(self):
        """Start Word in the background right away (call once at startup)."""
        self._ensure_thread()
        self.q.put({"kind": "warm"})

    def convert(self, src, dst, timeout=180):
        self._ensure_thread()
        job = {"kind": "convert", "src": src, "dst": dst, "done": threading.Event(), "error": None}
        self.q.put(job)
        if not job["done"].wait(timeout):
            raise RuntimeError("Word did not answer in time")
        if job["error"]:
            raise RuntimeError(job["error"])

    def stop(self):
        self.q.put(None)

    def _run(self):
        try:
            import pythoncom
            import win32com.client
        except ImportError:
            while True:                              # no pywin32: answer every job with an error
                job = self.q.get()
                if job is None:
                    return
                if job["kind"] == "convert":
                    job["error"] = "pywin32 is not installed (run: pip install pywin32)"
                    job["done"].set()
        pythoncom.CoInitialize()
        word = None

        def start_word():
            w = win32com.client.DispatchEx("Word.Application")      # private instance, separate from your own Word
            w.Visible = False
            w.DisplayAlerts = 0
            try:
                w.AutomationSecurity = 3
            except Exception:
                pass
            return w

        def quit_word():
            nonlocal word
            try:
                if word is not None:
                    word.Quit(False)
            except Exception:
                pass
            word = None

        try:
            while True:
                try:
                    job = self.q.get(timeout=self.IDLE)
                except queue.Empty:
                    quit_word()                      # idle: free the memory
                    continue
                if job is None:
                    break
                try:
                    if word is None:
                        word = start_word()
                    if job["kind"] == "warm":
                        continue
                    doc = None
                    try:
                        doc = word.Documents.Open(FileName=os.path.abspath(job["src"]), ConfirmConversions=False,
                                                  ReadOnly=True, AddToRecentFiles=False, OpenAndRepair=True,
                                                  NoEncodingDialog=True)
                        if doc is None:
                            raise RuntimeError("Word did not return a document (file blocked, locked or unreadable)")
                        doc.ExportAsFixedFormat(OutputFileName=os.path.abspath(job["dst"]), ExportFormat=17)
                    finally:
                        try:
                            if doc is not None:
                                doc.Close(False)
                        except Exception:
                            pass
                except Exception as e:
                    quit_word()                      # a broken Word is replaced on the next job
                    if job["kind"] == "convert":
                        job["error"] = f"{type(e).__name__}: {e}"
                finally:
                    if job["kind"] == "convert":
                        job["done"].set()
        finally:
            quit_word()
            pythoncom.CoUninitialize()


_word = _WordWorker()
atexit.register(_word.stop)


def warm_up():
    """Start Word in the background so the first preview is fast (Windows only)."""
    if sys.platform == "win32":
        _word.warm()


def _via_word(src, dst, errors):
    try:
        from docx2pdf import convert
    except ImportError:
        errors.append("Word: the docx2pdf package is not installed (run: pip install docx2pdf)")
        return False
    try:
        import pythoncom          # needed when called from a Flask worker thread on Windows
        pythoncom.CoInitialize()
    except ImportError:
        pythoncom = None
    try:
        convert(src, dst)
        if os.path.exists(dst):
            return True
        errors.append("Word: conversion ran but produced no PDF")
        return False
    except Exception as e:
        errors.append(f"Word: conversion failed ({type(e).__name__}: {e})")
        return False
    finally:
        if pythoncom:
            pythoncom.CoUninitialize()


def _via_word_direct(src, dst, errors):
    """Convert with the shared hidden Word (pywin32). Clear error messages."""
    try:
        _word.convert(src, dst)
    except Exception as e:
        errors.append(f"Word(direct): {e}")
        return False
    if os.path.exists(dst):
        return True
    errors.append("Word(direct): export finished but no PDF was written")
    return False


def _soffice():
    found = shutil.which("soffice") or shutil.which("libreoffice")
    if found:
        return found
    for pattern in (r"C:\Program Files\LibreOffice*\program\soffice.exe",
                    r"C:\Program Files (x86)\LibreOffice*\program\soffice.exe",
                    "/Applications/LibreOffice.app/Contents/MacOS/soffice"):
        hits = glob.glob(pattern)
        if hits:
            return hits[0]
    return None


def _via_libreoffice(src, outdir, errors):
    exe = _soffice()
    if not exe:
        errors.append("LibreOffice: not found (install it from libreoffice.org)")
        return False
    try:
        subprocess.run([exe, "--headless", "--convert-to", "pdf", "--outdir", outdir, src],
                       check=True, capture_output=True, timeout=120)
    except Exception as e:
        errors.append(f"LibreOffice: conversion failed ({type(e).__name__}: {e})")
        return False
    return os.path.exists(os.path.join(outdir, "program.pdf"))


def convert(docx_bytes, key=None):
    """Returns (pdf_bytes, engine_name). `key` identifies the content (a .docx is not byte-identical each time)."""
    key = key or hashlib.sha1(docx_bytes).hexdigest()
    if key in _cache:
        return _cache[key]
    with _lock:
        os.makedirs(WORK, exist_ok=True)
        _cleanup_old()
        tmp = tempfile.mkdtemp(dir=WORK)
        try:
            src, dst = os.path.join(tmp, "program.docx"), os.path.join(tmp, "program.pdf")
            with open(src, "wb") as fh:
                fh.write(docx_bytes)
            engine, errors = None, []
            if sys.platform in ("win32", "darwin"):
                for attempt in range(2):          # Word may still be closing from the previous conversion
                    if attempt:
                        time.sleep(1.5)
                    if sys.platform == "win32" and _via_word_direct(src, dst, errors):
                        engine = "word"
                        break
                    if _via_word(src, dst, errors):
                        engine = "word"
                        break
            if engine is None and _via_libreoffice(src, tmp, errors):
                engine = "libreoffice"
            if engine is None:
                raise RuntimeError(" | ".join(errors) or "no converter available")
            with open(dst, "rb") as fh:
                result = (fh.read(), engine)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)   # never let a locked file turn a good PDF into an error
    if len(_cache) >= 12:
        _cache.pop(next(iter(_cache)))
    _cache[key] = result
    return result
