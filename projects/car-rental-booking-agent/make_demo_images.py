"""Draw the demo images used by the benchmark, the seed and the pages, all marked "Demo, not payable".

R1  RM 100.00 to Kereta Sewa Jalan-jalan Sdn Bhd, reference KS-2046, paid 20 Oct 2026 09:50 (case A7)
R2  the same with RM 50.00 (amount difference, case X5)
R3  a drawing of a car (not a receipt; for visitors to try, not scored)
receipt-seed.png  the receipt KS-2047 reported in the seed, waiting for staff
duitnow-qr.png    the fictional DuitNow QR for the deposit (decision 8); not a scannable code

Run: python make_demo_images.py
"""

import os
import random
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "images")
os.makedirs(OUT, exist_ok=True)
F = "C:/Windows/Fonts/"
PAYEE = "Kereta Sewa Jalan-jalan Sdn Bhd"


def font(name, size):
    return ImageFont.truetype(F + name, size)


def centred(d, y, text, f, fill):
    d.text(((600 - d.textlength(text, font=f)) / 2, y), text, font=f, fill=fill)


def demo_band(d, y, text):
    d.rectangle([0, y, 600, y + 70], fill="#FDECEA")
    centred(d, y + 25, text, font("arialbd.ttf", 18), "#B3261E")


def receipt(path, amount, reference, paid_at_text, txn):
    W, H = 600, 860
    im = Image.new("RGB", (W, H), "#F4F6F9")
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 120], fill="#1F4E79")
    d.text((30, 28), "Demo Bank", font=font("arialbd.ttf", 34), fill="white")
    d.text((30, 76), "DuitNow QR payment", font=font("arial.ttf", 22), fill="#D6E4F0")
    d.rounded_rectangle([30, 150, W - 30, 760], radius=18, fill="white", outline="#DBE2EA", width=2)
    d.ellipse([W / 2 - 34, 178, W / 2 + 34, 246], fill="#2E9E5B")
    d.line([W / 2 - 16, 212, W / 2 - 4, 226, W / 2 + 18, 196], fill="white", width=7)
    centred(d, 262, "Payment Successful", font("arialbd.ttf", 28), "#1F2A36")
    centred(d, 312, f"RM {amount:,.2f}", font("arialbd.ttf", 48), "#1F2A36")
    rows = [("Recipient", PAYEE), ("Payment reference", reference), ("Date and time", paid_at_text),
            ("Paid from", "Savings account ****2210"), ("Transaction ID", txn)]
    y = 410
    for k, v in rows:
        d.line([60, y - 14, W - 60, y - 14], fill="#EEF1F5", width=2)
        d.text((60, y), k, font=font("arial.ttf", 20), fill="#5B6878")
        f = font("arialbd.ttf", 20)
        d.text((W - 60 - d.textlength(v, font=f), y), v, font=f, fill="#1F2A36")
        y += 64
    demo_band(d, 790, "DEMO, NOT PAYABLE  ·  sample receipt for a portfolio demo")
    im.save(path)


def car(path):
    W, H = 600, 860
    im = Image.new("RGB", (W, H), "#DDE6EE")
    d = ImageDraw.Draw(im)
    d.rectangle([0, 520, W, 790], fill="#8A929B")                       # the road
    for x in range(20, W, 120):
        d.rectangle([x, 650, x + 60, 662], fill="#F2F2F2")
    d.rounded_rectangle([90, 380, 510, 520], radius=40, fill="#C0392B")    # body
    d.polygon([(180, 380), (240, 300), (390, 300), (450, 380)], fill="#A93226")
    d.polygon([(200, 375), (250, 315), (310, 315), (310, 375)], fill="#BFD7EA")
    d.polygon([(325, 375), (325, 315), (380, 315), (430, 375)], fill="#BFD7EA")
    for cx in (190, 410):
        d.ellipse([cx - 48, 470, cx + 48, 566], fill="#1F2A36")
        d.ellipse([cx - 20, 498, cx + 20, 538], fill="#9AA7B5")
    demo_band(d, 790, "DEMO IMAGE  ·  not a receipt")
    im.save(path)


def qr(path):
    W, H = 600, 860
    im = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 110], fill="#E5005A")
    centred(d, 36, "DuitNow QR", font("arialbd.ttf", 36), "white")
    rnd = random.Random(8)
    x0, y0, n, s = 120, 160, 30, 12
    for i in range(n):
        for j in range(n):
            if rnd.random() < 0.48:
                d.rectangle([x0 + i * s, y0 + j * s, x0 + i * s + s - 1, y0 + j * s + s - 1], fill="#111")
    for (fx, fy) in [(0, 0), (n - 7, 0), (0, n - 7)]:                   # the three finder squares
        X, Y = x0 + fx * s, y0 + fy * s
        d.rectangle([X, Y, X + 7 * s - 1, Y + 7 * s - 1], fill="white")
        d.rectangle([X, Y, X + 7 * s - 1, Y + 7 * s - 1], outline="#111", width=s)
        d.rectangle([X + 2 * s, Y + 2 * s, X + 5 * s - 1, Y + 5 * s - 1], fill="#111")
    centred(d, 560, PAYEE, font("arialbd.ttf", 24), "#1F2A36")
    centred(d, 600, "Deposit RM 100 · use your booking reference", font("arial.ttf", 20), "#5B6878")
    centred(d, 632, "as the payment reference", font("arial.ttf", 20), "#5B6878")
    demo_band(d, 790, "DEMO, NOT PAYABLE  ·  not a real DuitNow code")
    im.save(path)


receipt(os.path.join(OUT, "R1.png"), 100, "KS-2046", "20 Oct 2026, 09:50", "DN2610200950A71")
receipt(os.path.join(OUT, "R2.png"), 50, "KS-2046", "20 Oct 2026, 09:50", "DN2610200950B42")
car(os.path.join(OUT, "R3.png"))
receipt(os.path.join(OUT, "receipt-seed.png"), 100, "KS-2047", "19 Oct 2026, 16:29", "DN2610191629D88")
qr(os.path.join(OUT, "duitnow-qr.png"))
print("Wrote images/R1.png, R2.png, R3.png, receipt-seed.png, duitnow-qr.png")
