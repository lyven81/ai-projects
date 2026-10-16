"""Draw the demo receipt images used by the benchmark and the seed, all marked "Demo, not payable".

R1  RM 100.00 to Subang Badminton Arena, reference BK-2051 (the A1 request), paid 16 Oct 2026 10:05
R2  the same with RM 50.00 (amount difference)
R3  the same with reference BK-1999 (reference difference; for visitors to try, not scored)
R4  a photo-style drawing of a badminton racket (not a receipt; for visitors to try, not scored)
R5  RM 50.00 for BK-2050, paid 09:58 after its hold expired at 09:30 (the F3 case)
receipt-seed.png  the receipt already waiting for staff in the seed (RC-001)

The pages draw the same receipt on a canvas for the visitor's own request (assistant.template.html).
Run: python make_demo_images.py
"""

import json
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "images")
os.makedirs(OUT, exist_ok=True)
F = "C:/Windows/Fonts/"


def font(name, size):
    return ImageFont.truetype(F + name, size)


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
    tw = d.textlength("Payment Successful", font=font("arialbd.ttf", 28))
    d.text(((W - tw) / 2, 262), "Payment Successful", font=font("arialbd.ttf", 28), fill="#1F2A36")
    amt = f"RM {amount:,.2f}"
    tw = d.textlength(amt, font=font("arialbd.ttf", 48))
    d.text(((W - tw) / 2, 312), amt, font=font("arialbd.ttf", 48), fill="#1F2A36")
    rows = [("Recipient", "Subang Badminton Arena"), ("Payment reference", reference),
            ("Date and time", paid_at_text), ("Paid from", "Savings account ****2210"), ("Transaction ID", txn)]
    y = 410
    for k, v in rows:
        d.line([60, y - 14, W - 60, y - 14], fill="#EEF1F5", width=2)
        d.text((60, y), k, font=font("arial.ttf", 21), fill="#5B6878")
        tw = d.textlength(v, font=font("arialbd.ttf", 22))
        d.text((W - 60 - tw, y), v, font=font("arialbd.ttf", 22), fill="#1F2A36")
        y += 64
    d.rectangle([0, 790, W, H], fill="#FDECEA")
    t = "DEMO, NOT PAYABLE  ·  sample receipt for a portfolio demo"
    tw = d.textlength(t, font=font("arialbd.ttf", 18))
    d.text(((W - tw) / 2, 815), t, font=font("arialbd.ttf", 18), fill="#B3261E")
    im.save(path)


def racket(path):
    W, H = 600, 860
    im = Image.new("RGB", (W, H), "#E9E4DA")
    d = ImageDraw.Draw(im)
    for i in range(0, H, 40):                       # a wooden floor
        d.line([0, i, W, i], fill="#DDD5C6", width=2)
    cx, cy, rx, ry = 300, 270, 150, 195
    strings = Image.new("RGB", (W, H), "#9AA7B5")
    mask = Image.new("L", (W, H), 0)
    md = ImageDraw.Draw(mask)
    for k in range(-rx, rx, 22):
        md.line([cx + k, cy - ry, cx + k, cy + ry], fill=255, width=2)
    for k in range(-ry, ry, 22):
        md.line([cx - rx, cy + k, cx + rx, cy + k], fill=255, width=2)
    inside = Image.new("L", (W, H), 0)
    ImageDraw.Draw(inside).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)
    im.paste(strings, (0, 0), Image.composite(mask, inside.point(lambda v: 0), inside))
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], outline="#1F2A36", width=16)
    d.polygon([(cx - 18, cy + ry - 4), (cx + 18, cy + ry - 4), (cx + 8, cy + ry + 40), (cx - 8, cy + ry + 40)], fill="#1F2A36")
    d.rectangle([cx - 8, cy + ry + 40, cx + 8, 700], fill="#4A5563")
    d.rounded_rectangle([cx - 20, 640, cx + 20, 800], radius=10, fill="#C0392B")
    d.rectangle([0, 820, W, H], fill="#FDECEA")
    t = "DEMO IMAGE  ·  not a receipt"
    tw = d.textlength(t, font=font("arialbd.ttf", 18))
    d.text(((W - tw) / 2, 830), t, font=font("arialbd.ttf", 18), fill="#B3261E")
    im.save(path)


receipt(os.path.join(OUT, "R1.png"), 100, "BK-2051", "16 Oct 2026, 10:05", "DN2610161005A71")
receipt(os.path.join(OUT, "R2.png"), 50, "BK-2051", "16 Oct 2026, 10:05", "DN2610161005B42")
receipt(os.path.join(OUT, "R3.png"), 100, "BK-1999", "16 Oct 2026, 10:05", "DN2610161005C13")
racket(os.path.join(OUT, "R4.png"))
# R5: the receipt the F3 case uploads for BK-2050, whose hold expired at 09:30
receipt(os.path.join(OUT, "R5.png"), 50, "BK-2050", "16 Oct 2026, 09:58", "DN2610160958E05")
# The receipts waiting in the pages' first view (make_demo_queue.mjs): RM 50 against RM 100 due
receipt(os.path.join(OUT, "receipt-queue.png"), 50, "BK-2051", "16 Oct 2026, 09:56", "DN2610160956F27")
# ...and RM 50 with the wrong reference, for the second request in the queue (BK-2052)
receipt(os.path.join(OUT, "receipt-queue-ref.png"), 50, "BK-1999", "16 Oct 2026, 09:51", "DN2610160951G64")

seed = json.load(open(os.path.join(HERE, "badminton_bookings.json"), encoding="utf-8"))
rc = seed["receipts"][0]
receipt(os.path.join(OUT, "receipt-seed.png"), rc["fields"]["amount_rm"], rc["booking_ref"], "16 Oct 2026, 09:46", "DN2610160946D88")
print("Wrote images/R1.png to R4.png and receipt-seed.png")
