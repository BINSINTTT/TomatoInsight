"""Convert DATA_TABLES.md into DATA_TABLES.pdf."""
from __future__ import annotations

import re
from pathlib import Path

from fpdf import FPDF

ROOT = Path(__file__).resolve().parents[1]
MD_PATH = ROOT / "DATA_TABLES.md"
OUT_PATH = ROOT / "DATA_TABLES.pdf"

REPL = {
    "\u2014": "-",
    "\u2013": "-",
    "\u2018": "'",
    "\u2019": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u2022": "-",
    "\u2192": "->",
    "\u2500": "-",
    "\u2502": "|",
    "\u251c": "+",
    "\u2514": "+",
    "\u250c": "+",
    "\u2510": "+",
    "\u2518": "+",
    "\u2524": "+",
    "\u2534": "+",
    "\u252c": "+",
    "\u253c": "+",
    "\u25bc": "v",
    "\u00a0": " ",
    "\u2212": "-",
    "\u2264": "<=",
    "\u2265": ">=",
    "\u2502": "|",
}


class PDF(FPDF):
    def footer(self) -> None:
        self.set_y(-12)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 8, f"TomatoInsight Data Tables  |  Page {self.page_no()}", align="C")


def clean(value: str) -> str:
    text = value or ""
    for src, dst in REPL.items():
        text = text.replace(src, dst)
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    return text.encode("latin-1", "replace").decode("latin-1")


def parse_table(lines: list[str], start: int) -> tuple[list[list[str]], int]:
    rows: list[list[str]] = []
    i = start
    while i < len(lines):
        line = lines[i].rstrip()
        if not line.startswith("|"):
            break
        cells = [c.strip() for c in line.strip("|").split("|")]
        if all(re.fullmatch(r":?-+:?", c.replace(" ", "") or "-") for c in cells):
            i += 1
            continue
        rows.append(cells)
        i += 1
    return rows, i


def main() -> None:
    text = MD_PATH.read_text(encoding="utf-8")
    lines = text.splitlines()

    pdf = PDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.add_page()
    pdf.set_margins(14, 14, 14)

    def write_para(s: str, size: int = 10, style: str = "", color=(40, 40, 40), after: float = 3) -> None:
        pdf.set_font("Helvetica", style, size)
        pdf.set_text_color(*color)
        pdf.multi_cell(0, 5, clean(s))
        pdf.ln(after)

    def write_heading(s: str, level: int = 1) -> None:
        pdf.ln(2 if level > 1 else 1)
        if level == 1:
            pdf.set_font("Helvetica", "B", 16)
            pdf.set_text_color(30, 90, 50)
            pdf.multi_cell(0, 8, clean(s))
            pdf.ln(2)
            y = pdf.get_y()
            pdf.set_draw_color(46, 125, 50)
            pdf.set_line_width(0.4)
            pdf.line(14, y, 196, y)
            pdf.ln(3)
        elif level == 2:
            pdf.set_font("Helvetica", "B", 12)
            pdf.set_text_color(45, 100, 55)
            pdf.multi_cell(0, 7, clean(s))
            pdf.ln(2)
        else:
            pdf.set_font("Helvetica", "B", 11)
            pdf.set_text_color(60, 60, 60)
            pdf.multi_cell(0, 6, clean(s))
            pdf.ln(1)

    def draw_table(rows: list[list[str]]) -> None:
        if not rows:
            return
        cols = max(len(r) for r in rows)
        rows = [r + [""] * (cols - len(r)) for r in rows]
        usable = 182.0
        if cols == 4:
            widths = [usable * 0.22, usable * 0.18, usable * 0.12, usable * 0.48]
        elif cols == 3:
            widths = [usable * 0.28, usable * 0.22, usable * 0.50]
        elif cols == 2:
            widths = [usable * 0.40, usable * 0.60]
        else:
            widths = [usable / cols] * cols

        def row_height(cells: list[str], header: bool = False) -> float:
            pdf.set_font("Helvetica", "B" if header else "", 8)
            h = 6.0
            for w, c in zip(widths, cells):
                text = clean(c)
                chars = max(1, int(w / 1.7))
                lines_needed = max(1, (len(text) + chars - 1) // chars)
                h = max(h, 4.2 * lines_needed + 2)
            return min(h, 28.0)

        for ri, row in enumerate(rows):
            header = ri == 0
            h = row_height(row, header)
            if pdf.get_y() + h > pdf.h - 18:
                pdf.add_page()
            x0 = pdf.get_x()
            y0 = pdf.get_y()
            for ci, cell in enumerate(row):
                w = widths[ci]
                x = x0 + sum(widths[:ci])
                if header:
                    pdf.set_fill_color(46, 125, 50)
                    pdf.set_text_color(255, 255, 255)
                    pdf.set_font("Helvetica", "B", 8)
                else:
                    if ri % 2 == 0:
                        pdf.set_fill_color(245, 248, 245)
                    else:
                        pdf.set_fill_color(255, 255, 255)
                    pdf.set_text_color(35, 35, 35)
                    pdf.set_font("Helvetica", "", 8)
                pdf.set_xy(x, y0)
                pdf.rect(x, y0, w, h, style="DF")
                pdf.set_xy(x + 1.2, y0 + 1)
                pdf.multi_cell(w - 2.4, 4, clean(cell), border=0)
            pdf.set_xy(x0, y0 + h)
        pdf.ln(4)

    i = 0
    in_code = False
    code_buf: list[str] = []

    while i < len(lines):
        raw = lines[i].rstrip()

        if raw.startswith("```"):
            if not in_code:
                in_code = True
                code_buf = []
            else:
                in_code = False
                pdf.set_fill_color(245, 245, 245)
                pdf.set_font("Courier", "", 8)
                pdf.set_text_color(40, 40, 40)
                pdf.multi_cell(0, 4, clean("\n".join(code_buf)), fill=True)
                pdf.ln(3)
            i += 1
            continue

        if in_code:
            code_buf.append(raw)
            i += 1
            continue

        if not raw or raw == "---":
            if raw == "---":
                pdf.ln(1)
            i += 1
            continue

        if raw.startswith("# "):
            write_heading(raw[2:], 1)
            i += 1
            continue
        if raw.startswith("## "):
            write_heading(raw[3:], 2)
            i += 1
            continue
        if raw.startswith("### "):
            write_heading(raw[4:], 3)
            i += 1
            continue

        if raw.startswith("|"):
            rows, i = parse_table(lines, i)
            draw_table(rows)
            continue

        if raw.startswith("> "):
            pdf.set_fill_color(235, 245, 235)
            pdf.set_font("Helvetica", "I", 9)
            pdf.set_text_color(50, 80, 50)
            pdf.multi_cell(0, 5, clean(raw[2:]), fill=True)
            pdf.ln(3)
            i += 1
            continue

        if raw.startswith("- "):
            write_para("  - " + raw[2:], size=9, after=1)
            i += 1
            continue

        if raw.startswith("**") and raw.endswith("**") and raw.count("**") == 2:
            write_para(raw, size=10, style="B", color=(45, 100, 55), after=2)
            i += 1
            continue

        write_para(raw, size=9, after=2)
        i += 1

    pdf.output(str(OUT_PATH))
    print(f"Wrote {OUT_PATH}")
    print(f"Size {OUT_PATH.stat().st_size} bytes")


if __name__ == "__main__":
    main()
