"""Writes tests/fixtures/encrypted.pdf: a one-page made-up PDF locked with a
throwaway sample phrase. Requires pikepdf. Usage: python3 scripts/make-encrypted-pdf.py"""
import pathlib
import pikepdf

out = pathlib.Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "encrypted.pdf"
pdf = pikepdf.new()
page = pdf.add_blank_page(page_size=(595, 842))
font = pdf.make_indirect(pikepdf.Dictionary(Type=pikepdf.Name.Font, Subtype=pikepdf.Name.Type1, BaseFont=pikepdf.Name.Helvetica))
page.Resources = pikepdf.Dictionary(Font=pikepdf.Dictionary(F1=font))
page.Contents = pdf.make_stream(b"BT /F1 12 Tf 50 750 Td (Locked sample page) Tj ET")
# The lock phrase is a throwaway sample value for tests, not a secret.
lock = pikepdf.Encryption(owner="sample-owner", user="sample-lock", R=6)
# Object streams keep the cross-reference table compressed (no plain digit rows).
pdf.save(out, encryption=lock, object_stream_mode=pikepdf.ObjectStreamMode.generate)
print(out)
