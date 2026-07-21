from __future__ import annotations

import os
import re
import sys
import tempfile
import zipfile
from pathlib import Path


# python-docx is installed in this task-local dependency directory.
sys.path.insert(0, "/private/tmp/suvion-docx-deps")

try:
    import fitz  # PyMuPDF
except ImportError as exc:  # pragma: no cover - exercised only on an incomplete host
    fitz = None
    FITZ_IMPORT_ERROR = exc
else:
    FITZ_IMPORT_ERROR = None

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
PROPOSAL = ROOT / "docs" / "proposal-v2-final.pdf"
SOURCE = ROOT / "docs" / "final-report.md"
OUTPUT = ROOT / "docs" / "Suvion_Systems_Final_Report_Rebuilt.docx"

PROPOSAL_PAGE_COUNT = 26
PROPOSAL_RENDER_DPI = 300
LETTER_WIDTH_POINTS = 612.0
LETTER_HEIGHT_POINTS = 792.0

BLACK = "000000"
DARK_GRAY = "434343"
CAPTION_GRAY = "555555"
SUBTITLE_GRAY = "666666"
TABLE_BORDER = "666666"
TABLE_FILL = "F2F2F2"
WHITE = "FFFFFF"

REMOVED_INTEGRATION_RE = re.compile(r"\b" + "A" + "BB" + r"\b", re.IGNORECASE)
IMAGE_RE = re.compile(r"!\[(.*?)\]\((.*?)\)")
INLINE_RE = re.compile(r"(\*\*.+?\*\*|`.+?`)")
HEADING_NUMBER_RE = re.compile(r"^\d+(?:\.\d+)*\.\s+")


def rgb(hex_color: str) -> RGBColor:
    return RGBColor.from_string(hex_color)


def set_run_font(run, name="Arial", size=None, color=None, bold=None, italic=None):
    run.font.name = name
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.rFonts
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.insert(0, rfonts)
    for key in ("ascii", "hAnsi", "eastAsia"):
        rfonts.set(qn(f"w:{key}"), name)
    if size is not None:
        run.font.size = Pt(size)
    if color is not None:
        run.font.color.rgb = rgb(color)
    if bold is not None:
        run.bold = bold
    if italic is not None:
        run.italic = italic


def set_style_font(style, *, name, size, color=BLACK, bold=False, italic=False):
    style.font.name = name
    style.font.size = Pt(size)
    style.font.color.rgb = rgb(color)
    style.font.bold = bold
    style.font.italic = italic
    rpr = style._element.get_or_add_rPr()
    rfonts = rpr.rFonts
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.insert(0, rfonts)
    for key in ("ascii", "hAnsi", "eastAsia"):
        rfonts.set(qn(f"w:{key}"), name)


def setup_styles(doc):
    normal = doc.styles["Normal"]
    set_style_font(normal, name="Arial", size=11)
    normal.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
    normal.paragraph_format.space_before = Pt(0)
    normal.paragraph_format.space_after = Pt(8)
    normal.paragraph_format.line_spacing = 1.15
    normal.paragraph_format.widow_control = True

    heading_specs = {
        "Heading 1": (20, BLACK, 18, 8),
        "Heading 2": (16, BLACK, 14, 6),
        "Heading 3": (14, DARK_GRAY, 10, 5),
    }
    for name, (size, color, before, after) in heading_specs.items():
        style = doc.styles[name]
        set_style_font(style, name="Arial", size=size, color=color, bold=False)
        style.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.line_spacing = 1.0
        style.paragraph_format.keep_with_next = True
        style.paragraph_format.keep_together = True

    subtitle = doc.styles["Subtitle"]
    set_style_font(subtitle, name="Arial", size=15, color=SUBTITLE_GRAY, bold=False)
    subtitle.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
    subtitle.paragraph_format.space_before = Pt(0)
    subtitle.paragraph_format.space_after = Pt(12)
    subtitle.paragraph_format.line_spacing = 1.0
    subtitle.paragraph_format.keep_with_next = True

    caption = doc.styles["Caption"]
    set_style_font(caption, name="Arial", size=11, color=CAPTION_GRAY, italic=True)
    caption.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
    caption.paragraph_format.space_before = Pt(4)
    caption.paragraph_format.space_after = Pt(10)
    caption.paragraph_format.line_spacing = 1.0
    caption.paragraph_format.keep_together = True


def configure_proposal_section(section):
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(0)
    section.bottom_margin = Inches(0)
    section.left_margin = Inches(0)
    section.right_margin = Inches(0)
    section.header_distance = Inches(0)
    section.footer_distance = Inches(0)
    section.different_first_page_header_footer = False


def configure_continuation_section(section):
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(1)
    section.bottom_margin = Inches(1)
    section.left_margin = Inches(1)
    section.right_margin = Inches(1)
    section.header_distance = Inches(0)
    section.footer_distance = Inches(0)
    section.different_first_page_header_footer = False


def set_cell_margins(cell, top=80, start=100, bottom=80, end=100):
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for side, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{side}"))
        if node is None:
            node = OxmlElement(f"w:{side}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def shade_cell(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_width(cell, dxa):
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_w = tc_pr.find(qn("w:tcW"))
    if tc_w is None:
        tc_w = OxmlElement("w:tcW")
        tc_pr.append(tc_w)
    tc_w.set(qn("w:w"), str(dxa))
    tc_w.set(qn("w:type"), "dxa")


def set_table_geometry(table, widths_dxa):
    table.autofit = False
    tbl_pr = table._tbl.tblPr
    tbl_w = tbl_pr.find(qn("w:tblW"))
    if tbl_w is None:
        tbl_w = OxmlElement("w:tblW")
        tbl_pr.append(tbl_w)
    tbl_w.set(qn("w:w"), str(sum(widths_dxa)))
    tbl_w.set(qn("w:type"), "dxa")

    tbl_ind = tbl_pr.find(qn("w:tblInd"))
    if tbl_ind is None:
        tbl_ind = OxmlElement("w:tblInd")
        tbl_pr.append(tbl_ind)
    tbl_ind.set(qn("w:w"), "0")
    tbl_ind.set(qn("w:type"), "dxa")

    layout = tbl_pr.find(qn("w:tblLayout"))
    if layout is None:
        layout = OxmlElement("w:tblLayout")
        tbl_pr.append(layout)
    layout.set(qn("w:type"), "fixed")

    grid = table._tbl.tblGrid
    for child in list(grid):
        grid.remove(child)
    for width in widths_dxa:
        col = OxmlElement("w:gridCol")
        col.set(qn("w:w"), str(width))
        grid.append(col)

    for row in table.rows:
        row_pr = row._tr.get_or_add_trPr()
        if row_pr.find(qn("w:cantSplit")) is None:
            row_pr.append(OxmlElement("w:cantSplit"))
        for cell, width in zip(row.cells, widths_dxa):
            set_cell_width(cell, width)
            set_cell_margins(cell)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER


def set_repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    header = OxmlElement("w:tblHeader")
    header.set(qn("w:val"), "true")
    tr_pr.append(header)


def set_table_borders(table, color=TABLE_BORDER, size="4"):
    tbl_pr = table._tbl.tblPr
    borders = tbl_pr.find(qn("w:tblBorders"))
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        el = borders.find(qn(f"w:{edge}"))
        if el is None:
            el = OxmlElement(f"w:{edge}")
            borders.append(el)
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), size)
        el.set(qn("w:space"), "0")
        el.set(qn("w:color"), color)


def create_numbering(doc):
    numbering = doc.part.numbering_part.element

    def next_id(tag, attr):
        values = [int(el.get(qn(attr))) for el in numbering.findall(qn(tag)) if el.get(qn(attr))]
        return max(values, default=0) + 1

    def add_abstract(fmt, text, font=None):
        abstract_id = next_id("w:abstractNum", "w:abstractNumId")
        abstract = OxmlElement("w:abstractNum")
        abstract.set(qn("w:abstractNumId"), str(abstract_id))
        multi = OxmlElement("w:multiLevelType")
        multi.set(qn("w:val"), "singleLevel")
        abstract.append(multi)

        lvl = OxmlElement("w:lvl")
        lvl.set(qn("w:ilvl"), "0")
        start = OxmlElement("w:start")
        start.set(qn("w:val"), "1")
        num_fmt = OxmlElement("w:numFmt")
        num_fmt.set(qn("w:val"), fmt)
        lvl_text = OxmlElement("w:lvlText")
        lvl_text.set(qn("w:val"), text)
        suff = OxmlElement("w:suff")
        suff.set(qn("w:val"), "tab")

        p_pr = OxmlElement("w:pPr")
        tabs = OxmlElement("w:tabs")
        tab = OxmlElement("w:tab")
        tab.set(qn("w:val"), "num")
        tab.set(qn("w:pos"), "540")
        tabs.append(tab)
        ind = OxmlElement("w:ind")
        ind.set(qn("w:left"), "540")
        ind.set(qn("w:hanging"), "279")
        spacing = OxmlElement("w:spacing")
        spacing.set(qn("w:after"), "80")
        spacing.set(qn("w:line"), "276")
        spacing.set(qn("w:lineRule"), "auto")
        p_pr.extend([tabs, ind, spacing])
        lvl.extend([start, num_fmt, lvl_text, suff, p_pr])

        if font:
            r_pr = OxmlElement("w:rPr")
            fonts = OxmlElement("w:rFonts")
            fonts.set(qn("w:ascii"), font)
            fonts.set(qn("w:hAnsi"), font)
            r_pr.append(fonts)
            lvl.append(r_pr)

        abstract.append(lvl)
        numbering.append(abstract)
        return abstract_id

    def add_instance(abstract_id, *, restart=False):
        num_id = next_id("w:num", "w:numId")
        num = OxmlElement("w:num")
        num.set(qn("w:numId"), str(num_id))
        abs_ref = OxmlElement("w:abstractNumId")
        abs_ref.set(qn("w:val"), str(abstract_id))
        num.append(abs_ref)
        if restart:
            level_override = OxmlElement("w:lvlOverride")
            level_override.set(qn("w:ilvl"), "0")
            start_override = OxmlElement("w:startOverride")
            start_override.set(qn("w:val"), "1")
            level_override.append(start_override)
            num.append(level_override)
        numbering.append(num)
        return num_id

    bullet_abstract = add_abstract("bullet", "•", "Arial")
    decimal_abstract = add_abstract("decimal", "%1.", "Arial")
    return add_instance(bullet_abstract), lambda: add_instance(decimal_abstract, restart=True)


def apply_num(paragraph, num_id):
    p_pr = paragraph._p.get_or_add_pPr()
    num_pr = OxmlElement("w:numPr")
    ilvl = OxmlElement("w:ilvl")
    ilvl.set(qn("w:val"), "0")
    num = OxmlElement("w:numId")
    num.set(qn("w:val"), str(num_id))
    num_pr.extend([ilvl, num])
    p_pr.append(num_pr)
    paragraph.paragraph_format.space_after = Pt(4)
    paragraph.paragraph_format.line_spacing = 1.15


def add_inline(paragraph, text, base_size=None, color=None):
    for part in INLINE_RE.split(text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**"):
            run = paragraph.add_run(part[2:-2])
            set_run_font(run, size=base_size, color=color, bold=True)
        elif part.startswith("`") and part.endswith("`"):
            run = paragraph.add_run(part[1:-1])
            set_run_font(run, name="Consolas", size=(base_size or 11) - 0.5, color=DARK_GRAY)
        else:
            run = paragraph.add_run(part)
            set_run_font(run, size=base_size, color=color)


def table_widths(headers):
    joined = " ".join(headers).lower()
    if headers and headers[0] == "QA ID":
        return [700, 3200, 2100, 3360]
    if "original success criterion" in joined:
        return [3000, 2200, 4160]
    if "proposal or initial design" in joined:
        return [1450, 2750, 5160]
    if len(headers) == 3:
        return [2200, 2200, 4960]
    if len(headers) == 4:
        return [1500, 2300, 2200, 3360]
    return [9360 // len(headers)] * len(headers)


def add_markdown_table(doc, rows):
    headers = rows[0]
    widths = table_widths(headers)
    table = doc.add_table(rows=0, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    table.autofit = False

    for r_idx, values in enumerate(rows):
        if len(values) != len(headers):
            raise ValueError(f"Malformed Markdown table row: expected {len(headers)} cells, got {len(values)}")
        row = table.add_row()
        for c_idx, value in enumerate(values):
            cell = row.cells[c_idx]
            p = cell.paragraphs[0]
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.0
            if r_idx == 0:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                shade_cell(cell, TABLE_FILL)
            elif headers[c_idx] in {"QA ID", "Result", "Final assessment"}:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            else:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            add_inline(p, value, base_size=10 if len(headers) >= 4 else 10.5)
            if r_idx == 0:
                for run in p.runs:
                    run.bold = True
                    run.font.color.rgb = rgb(BLACK)
        if r_idx == 0:
            set_repeat_table_header(row)

    set_table_geometry(table, widths)
    set_table_borders(table)
    after = doc.add_paragraph()
    after.paragraph_format.space_before = Pt(0)
    after.paragraph_format.space_after = Pt(4)
    return table


def set_image_alt(paragraph, title, description):
    for drawing in paragraph._p.findall(".//" + qn("wp:docPr")):
        drawing.set("title", title)
        drawing.set("descr", description)


def referenced_evidence(lines):
    references = []
    malformed = []
    for line_number, line in enumerate(lines, start=1):
        stripped = line.strip()
        if not stripped.startswith("!["):
            continue
        match = IMAGE_RE.fullmatch(stripped)
        if not match:
            malformed.append(f"line {line_number}: {stripped}")
            continue
        _, rel = match.groups()
        references.append((SOURCE.parent / rel).resolve())
    if malformed:
        raise ValueError("Unsupported image references:\n" + "\n".join(malformed))
    return references


def preflight():
    missing_inputs = [path for path in (PROPOSAL, SOURCE) if not path.is_file()]
    if missing_inputs:
        raise FileNotFoundError("Missing report input(s): " + ", ".join(str(path) for path in missing_inputs))
    if fitz is None:
        raise RuntimeError(f"PyMuPDF is required to render the Proposal PDF: {FITZ_IMPORT_ERROR}")

    source_text = SOURCE.read_text(encoding="utf-8")
    if REMOVED_INTEGRATION_RE.search(source_text):
        raise ValueError(f"Retired vendor text remains in {SOURCE}; refusing to build")
    lines = source_text.splitlines()
    evidence = referenced_evidence(lines)
    missing_evidence = [path for path in evidence if not path.is_file()]
    if missing_evidence:
        formatted = "\n".join(f"  - {path}" for path in missing_evidence)
        raise FileNotFoundError(f"Missing referenced QA evidence:\n{formatted}")
    return lines, evidence


def render_proposal_pages(output_dir):
    output_dir.mkdir(parents=True, exist_ok=True)
    pdf = fitz.open(PROPOSAL)
    try:
        if pdf.page_count != PROPOSAL_PAGE_COUNT:
            raise ValueError(
                f"Expected a {PROPOSAL_PAGE_COUNT}-page Proposal, found {pdf.page_count} pages in {PROPOSAL}"
            )
        pages = []
        for index, page in enumerate(pdf):
            if abs(page.rect.width - LETTER_WIDTH_POINTS) > 0.5 or abs(page.rect.height - LETTER_HEIGHT_POINTS) > 0.5:
                raise ValueError(f"Proposal page {index + 1} is not US Letter: {page.rect.width} x {page.rect.height}")
            if REMOVED_INTEGRATION_RE.search(page.get_text("text")):
                raise ValueError(f"Retired vendor text remains on Proposal page {index + 1}; refusing to build")
            pixmap = page.get_pixmap(dpi=PROPOSAL_RENDER_DPI, colorspace=fitz.csRGB, alpha=False)
            path = output_dir / f"proposal-page-{index + 1:02d}.png"
            pixmap.save(path)
            pages.append(path)
        return pages
    finally:
        pdf.close()


def add_proposal_prefix(doc, page_images):
    last_paragraph = None
    for index, image_path in enumerate(page_images):
        p = doc.add_paragraph()
        p.paragraph_format.page_break_before = index > 0
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.left_indent = Inches(0)
        p.paragraph_format.right_indent = Inches(0)
        p.paragraph_format.first_line_indent = Inches(0)
        p.paragraph_format.line_spacing = 1.0
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        run = p.add_run()
        run.add_picture(str(image_path), width=Inches(8.5), height=Inches(11))
        set_image_alt(
            p,
            f"Original Proposal page {index + 1}",
            f"Original Proposal page {index + 1} of {len(page_images)}",
        )
        last_paragraph = p
    if last_paragraph is None:
        raise ValueError("No Proposal pages were rendered")
    return last_paragraph


def begin_continuation_section(doc, last_proposal_paragraph):
    continuation = doc.add_section(WD_SECTION.NEW_PAGE)

    # python-docx creates an empty section-break paragraph. Move its sectPr onto
    # page 26 so it cannot become a blank page between the Proposal and report.
    break_paragraph = doc.paragraphs[-1]
    p_pr = break_paragraph._p.pPr
    sect_pr = p_pr.sectPr if p_pr is not None else None
    if sect_pr is None:
        raise RuntimeError("Unable to locate the Proposal-to-report section break")
    last_proposal_paragraph._p.get_or_add_pPr().append(sect_pr)
    break_paragraph._p.getparent().remove(break_paragraph._p)

    configure_continuation_section(continuation)
    return continuation


def add_code_paragraph(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(0.18)
    p.paragraph_format.right_indent = Inches(0.12)
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.line_spacing = 1.0
    p_pr = p._p.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), TABLE_FILL)
    p_pr.append(shd)
    r = p.add_run(text or " ")
    set_run_font(r, name="Consolas", size=9.5, color=BLACK)
    return p


def normalize_heading(text):
    return HEADING_NUMBER_RE.sub("", text).strip()


def rewrite_figure_caption(text, figure_number):
    plain = text.replace("**", "").replace("`", "").strip()
    return re.sub(r"^Figure\s+\d+\.\s*", f"Figure {figure_number} — ", plain)


def append_continuation(doc, lines):
    bullet_id, new_decimal_id = create_numbering(doc)
    decimal_id = None
    last_block = None
    in_code = False
    code_lines = []
    figure_number = 1  # The Proposal already contains Figure 1.
    last_figure_number = None

    evidence_headings = {
        "Automated Test Evidence",
        "Docker Runtime Evidence",
        "Rendered Dashboard Evidence",
        "Retired Integration Removal Evidence",
        "Additional Test Evidence",
    }

    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if stripped.startswith("```"):
            if in_code:
                for code_line in code_lines:
                    add_code_paragraph(doc, code_line)
                spacer = doc.add_paragraph()
                spacer.paragraph_format.space_after = Pt(6)
                code_lines = []
                in_code = False
            else:
                in_code = True
            last_block = None
            i += 1
            continue
        if in_code:
            code_lines.append(line)
            i += 1
            continue
        if not stripped:
            last_block = None
            i += 1
            continue

        image_match = IMAGE_RE.fullmatch(stripped)
        if image_match:
            alt, rel = image_match.groups()
            image_path = (SOURCE.parent / rel).resolve()
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.keep_with_next = True
            run = p.add_run()
            run.add_picture(str(image_path), width=Inches(6.5))
            figure_number += 1
            last_figure_number = figure_number
            set_image_alt(p, f"Figure {figure_number}", alt)
            last_block = "image"
            i += 1
            continue

        if stripped.startswith("!["):
            raise ValueError(f"Unsupported image syntax on source line {i + 1}: {stripped}")

        if stripped.startswith("|") and i + 1 < len(lines) and re.match(r"^\|[\s:|-]+\|$", lines[i + 1].strip()):
            rows = [[cell.strip() for cell in stripped.strip("|").split("|")]]
            i += 2
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append([cell.strip() for cell in lines[i].strip().strip("|").split("|")])
                i += 1
            add_markdown_table(doc, rows)
            last_block = "table"
            continue

        heading = re.match(r"^(#{1,3})\s+(.+)$", stripped)
        if heading:
            marks, raw_text = heading.groups()
            text = normalize_heading(raw_text)
            if marks == "##" and text == "Environmental Monitoring and Sustainability Dashboard":
                p = doc.add_paragraph(style="Subtitle")
            else:
                style_name = "Heading 1" if len(marks) <= 2 else "Heading 2"
                p = doc.add_paragraph(style=style_name)
            if text in evidence_headings:
                p.paragraph_format.page_break_before = True
            add_inline(p, text)
            last_block = "heading"
            i += 1
            continue

        bullet = re.match(r"^-\s+(.+)$", stripped)
        if bullet:
            p = doc.add_paragraph()
            apply_num(p, bullet_id)
            add_inline(p, bullet.group(1))
            last_block = "bullet"
            i += 1
            continue

        numbered = re.match(r"^\d+\.\s+(.+)$", stripped)
        if numbered:
            if last_block != "numbered":
                decimal_id = new_decimal_id()
            p = doc.add_paragraph()
            apply_num(p, decimal_id)
            add_inline(p, numbered.group(1))
            last_block = "numbered"
            i += 1
            continue

        if stripped.startswith("**Figure"):
            if last_figure_number is None:
                raise ValueError(f"Figure caption has no preceding image on source line {i + 1}")
            p = doc.add_paragraph(style="Caption")
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run(rewrite_figure_caption(stripped, last_figure_number))
            set_run_font(run, name="Arial", size=11, color=CAPTION_GRAY, italic=True)
        else:
            p = doc.add_paragraph()
            if stripped.startswith(
                (
                    "**Report date:**",
                    "**QA execution date:**",
                    "**Test date:**",
                    "**Host:**",
                    "**Node/npm:**",
                    "**Python:**",
                    "**Docker:",
                    "**Docker services:",
                    "**Browser evidence:",
                )
            ):
                p.paragraph_format.space_after = Pt(2)
                p.paragraph_format.line_spacing = 1.1
            add_inline(p, stripped)
        last_block = "paragraph"
        i += 1

    if in_code:
        raise ValueError("Unclosed fenced code block in final-report.md")
    return figure_number


def validate_docx(path, evidence_paths, final_figure_number):
    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
        document_xml = archive.read("word/document.xml").decode("utf-8", errors="replace")
        searchable_parts = []
        for name in names:
            if name.endswith((".xml", ".rels")):
                searchable_parts.append(archive.read(name).decode("utf-8", errors="replace"))
        package_text = "\n".join(searchable_parts)

        if REMOVED_INTEGRATION_RE.search(package_text):
            raise ValueError("Retired vendor text remains in the staged DOCX package")
        if any(name.startswith("word/header") or name.startswith("word/footer") for name in names):
            raise ValueError("The staged DOCX unexpectedly contains a header or footer")
        if re.search(r"<w:instrText[^>]*>\s*(?:PAGE|NUMPAGES)\b", document_xml):
            raise ValueError("The staged DOCX unexpectedly contains a page-number field")

        required_text = (
            "Requirements and Proposed-Design Changes",
            "QA Test Results",
            "Conclusions",
            "Lessons Learned",
            "Future Possible Enhancements",
        )
        missing_text = [text for text in required_text if text not in document_xml]
        if missing_text:
            raise ValueError("Required final-report section(s) missing: " + ", ".join(missing_text))

        proposal_descriptions = document_xml.count("Original Proposal page ")
        if proposal_descriptions != PROPOSAL_PAGE_COUNT * 2:
            # Each image has the phrase once in title and once in description.
            raise ValueError(
                f"Expected {PROPOSAL_PAGE_COUNT} Proposal-page drawings; package marker count was {proposal_descriptions}"
            )

        media = [name for name in names if name.startswith("word/media/")]
        expected_media = PROPOSAL_PAGE_COUNT + len(set(evidence_paths))
        if len(media) != expected_media:
            raise ValueError(f"Expected {expected_media} embedded images, found {len(media)}")
        if final_figure_number != 1 + len(evidence_paths):
            raise ValueError(
                f"Expected figures to end at {1 + len(evidence_paths)}, ended at {final_figure_number}"
            )


def build():
    lines, evidence_paths = preflight()

    with tempfile.TemporaryDirectory(prefix="suvion-proposal-pages-") as render_dir:
        proposal_pages = render_proposal_pages(Path(render_dir))

        doc = Document()
        setup_styles(doc)
        configure_proposal_section(doc.sections[0])
        last_proposal_paragraph = add_proposal_prefix(doc, proposal_pages)
        begin_continuation_section(doc, last_proposal_paragraph)
        final_figure_number = append_continuation(doc, lines)

        props = doc.core_properties
        props.title = "Suvion Systems - Proposal and Final Project Report"
        props.subject = "Environmental Monitoring and Sustainability Dashboard"
        props.author = "Alina Pak"
        props.keywords = "Suvion, maritime, sustainability, QA, final report"
        props.comments = "Original Proposal followed by the final project report and verified QA evidence."

        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        staging_handle = tempfile.NamedTemporaryFile(
            prefix=f".{OUTPUT.stem}-",
            suffix=".docx",
            dir=OUTPUT.parent,
            delete=False,
        )
        staging_path = Path(staging_handle.name)
        staging_handle.close()
        try:
            doc.save(staging_path)
            validate_docx(staging_path, evidence_paths, final_figure_number)
            os.replace(staging_path, OUTPUT)
            os.chmod(OUTPUT, 0o644)
        finally:
            if staging_path.exists():
                staging_path.unlink()

    print(OUTPUT)


if __name__ == "__main__":
    build()
