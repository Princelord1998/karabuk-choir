"""Find out why Word cannot make the PDF.   Usage:   python test_word.py "C:\\path\\any_program.docx"
Try it with YOUR ORIGINAL program first. Then with a file downloaded from the web app (Télécharger le Word)."""
import os, shutil, sys, tempfile
import docx_to_pdf as d

if len(sys.argv) != 2:
    sys.exit(__doc__)
tmp = tempfile.mkdtemp()
src = os.path.join(tmp, "test.docx")
shutil.copy(sys.argv[1], src)
for name, fn in (("Word direct (pywin32)", d._via_word_direct), ("Word via docx2pdf", d._via_word)):
    errors, dst = [], os.path.join(tmp, name.split()[0] + str(len(name)) + ".pdf")
    ok = fn(src, dst, errors)
    print(f"{name:24} -> {'OK' if ok else 'FAILED'}  {' | '.join(errors)}")
