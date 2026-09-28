#!/usr/bin/env python3
"""
Generate the 100 Bishopsgate deal pack used to demo the conflict check.

The pack is the existing sample lease plus two documents about the same property
that disagree with it in a few deliberate places (see the README next to the
output). Everything else is kept consistent with the lease so the planted
conflicts are the only signal.

Needs PyMuPDF, which the backend image already has:

    docker compose run --rm --no-deps \\
        -v "$PWD/scripts:/app/scripts" -v "$PWD/sample-docs:/app/sample-docs" \\
        backend uv run python scripts/generate-deal-pack.py

Text is laid out by hand with TextWriter rather than PyMuPDF's HTML Story: Story
shapes text with ligatures (fi, fl, ffi), which end up in the extracted text layer
and break exact-quote matching against the documents.
"""

from __future__ import annotations

import shutil
from dataclasses import dataclass, field
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent.parent
SAMPLES = ROOT / "sample-docs"
OUT_DIR = SAMPLES / "deal-100-bishopsgate"

PAGE = pymupdf.paper_rect("a4")
LEFT = 64.0
RIGHT = PAGE.width - 64.0
TOP = 84.0
BOTTOM = PAGE.height - 72.0

INK = (0.12, 0.12, 0.12)
MUTED = (0.42, 0.42, 0.42)
RULE = (0.72, 0.72, 0.72)
SHADE = (0.93, 0.93, 0.93)

SERIF = pymupdf.Font("tiro")
SERIF_BOLD = pymupdf.Font("tibo")
SANS = pymupdf.Font("helv")
SANS_BOLD = pymupdf.Font("hebo")


# --------------------------------------------------------------------------- #
# Blocks
# --------------------------------------------------------------------------- #


@dataclass
class Para:
    text: str
    font: pymupdf.Font = SERIF
    size: float = 10.5
    indent: float = 0
    align: str = "justify"  # "justify" | "left" | "center"
    color: tuple[float, float, float] = INK
    before: float = 0
    after: float = 7


def h1(text: str) -> Para:
    return Para(text, SANS_BOLD, 20, align="center", after=10)


def h2(text: str) -> Para:
    return Para(text, SANS_BOLD, 12, align="left", before=10, after=6)


def p(text: str) -> Para:
    return Para(text)


def entry(text: str) -> Para:
    return Para(text, indent=18)


def meta(text: str, size: float = 10, color: tuple[float, float, float] = MUTED) -> Para:
    return Para(text, SANS, size, align="center", color=color, after=4)


def centre(text: str, size: float = 13) -> Para:
    return Para(text, SERIF, size, align="center", after=4)


@dataclass
class Space:
    height: float


@dataclass
class Table:
    rows: list[list[str]]
    widths: list[float]  # fractions of the text width
    header: bool = False
    label_column: bool = False
    numeric: set[int] = field(default_factory=set[int])


class PageBreak:
    pass


Block = Para | Space | Table | PageBreak


# --------------------------------------------------------------------------- #
# Layout
# --------------------------------------------------------------------------- #


def wrap(text: str, font: pymupdf.Font, size: float, width: float) -> list[str]:
    lines: list[str] = []
    line = ""
    for word in text.split():
        candidate = f"{line} {word}" if line else word
        if line and font.text_length(candidate, fontsize=size) > width:
            lines.append(line)
            line = word
        else:
            line = candidate
    if line:
        lines.append(line)
    return lines


class Layout:
    def __init__(self, header: str) -> None:
        self.doc = pymupdf.open()
        self.header = header
        self.page: pymupdf.Page | None = None
        self.writers: dict[tuple[float, float, float], pymupdf.TextWriter] = {}
        self.y = TOP

    def new_page(self) -> None:
        self.flush()
        self.page = self.doc.new_page(width=PAGE.width, height=PAGE.height)
        self.writers = {}
        self.y = TOP

    def flush(self) -> None:
        if self.page is not None:
            for color, writer in self.writers.items():
                writer.write_text(self.page, color=color)

    def writer(self, color: tuple[float, float, float]) -> pymupdf.TextWriter:
        if color not in self.writers:
            self.writers[color] = pymupdf.TextWriter(PAGE)
        return self.writers[color]

    def ensure(self, height: float) -> None:
        if self.page is None or self.y + height > BOTTOM:
            self.new_page()

    def para(self, block: Para) -> None:
        leading = block.size * 1.4
        width = RIGHT - LEFT - block.indent
        lines = wrap(block.text, block.font, block.size, width)
        self.y += block.before
        for i, line in enumerate(lines):
            self.ensure(leading)
            baseline = self.y + block.size
            x = LEFT + block.indent
            line_width = block.font.text_length(line, fontsize=block.size)
            writer = self.writer(block.color)
            last = i == len(lines) - 1
            if block.align == "center":
                writer.append((LEFT + (RIGHT - LEFT - line_width) / 2, baseline), line,
                              font=block.font, fontsize=block.size)
            elif block.align == "justify" and not last and " " in line:
                words = line.split(" ")
                words_width = sum(block.font.text_length(w, fontsize=block.size) for w in words)
                gap = (width - words_width) / (len(words) - 1)
                for word in words:
                    writer.append((x, baseline), word, font=block.font, fontsize=block.size)
                    x += block.font.text_length(word, fontsize=block.size) + gap
            else:
                writer.append((x, baseline), line, font=block.font, fontsize=block.size)
            self.y += leading
        self.y += block.after

    def table(self, block: Table) -> None:
        size, pad, leading = 9.5, 5.0, 9.5 * 1.35
        total = RIGHT - LEFT
        widths = [w * total for w in block.widths]
        self.y += 2
        for r, row in enumerate(block.rows):
            is_header = block.header and (r == 0 or r == len(block.rows) - 1 and row[0] == "Total")
            cells: list[list[str]] = []
            fonts: list[pymupdf.Font] = []
            for c, text in enumerate(row):
                bold = is_header or (block.label_column and c == 0)
                font = SANS_BOLD if bold else SERIF
                fonts.append(font)
                cells.append(wrap(text, font, size, widths[c] - 2 * pad))
            height = max(len(lines) for lines in cells) * leading + 2 * pad
            self.ensure(height)
            assert self.page is not None
            x = LEFT
            for c, lines in enumerate(cells):
                rect = pymupdf.Rect(x, self.y, x + widths[c], self.y + height)
                fill = SHADE if is_header or (block.label_column and c == 0) else None
                self.page.draw_rect(rect, color=RULE, fill=fill, width=0.5)
                for i, line in enumerate(lines):
                    baseline = self.y + pad + size + i * leading - 1
                    lx = x + pad
                    if c in block.numeric:
                        lx = x + widths[c] - pad - fonts[c].text_length(line, fontsize=size)
                    self.writer(INK).append((lx, baseline), line, font=fonts[c], fontsize=size)
                x += widths[c]
            self.y += height
        self.y += 10

    def render(self, blocks: list[Block]) -> pymupdf.Document:
        self.new_page()
        for block in blocks:
            if isinstance(block, PageBreak):
                self.new_page()
            elif isinstance(block, Space):
                self.y += block.height
            elif isinstance(block, Table):
                self.table(block)
            else:
                self.para(block)
        self.flush()
        self.stamp()
        return self.doc

    def stamp(self) -> None:
        """Running header and "Page n of N" footer on every page."""
        total = self.doc.page_count
        for number, page in enumerate(self.doc, start=1):
            writer = pymupdf.TextWriter(PAGE)
            writer.append((LEFT, 48), self.header, font=SANS, fontsize=8.5)
            label = "PRIVATE & CONFIDENTIAL"
            writer.append((RIGHT - SANS.text_length(label, fontsize=8.5), 48), label,
                          font=SANS, fontsize=8.5)
            writer.write_text(page, color=MUTED)
            footer = f"Page {number} of {total}"
            writer = pymupdf.TextWriter(PAGE)
            writer.append(((PAGE.width - SANS.text_length(footer, fontsize=8.5)) / 2,
                           PAGE.height - 38), footer, font=SANS, fontsize=8.5)
            writer.write_text(page, color=INK)
            page.draw_line((LEFT, 56), (RIGHT, 56), color=RULE, width=0.6)
            page.draw_line((LEFT, PAGE.height - 52), (RIGHT, PAGE.height - 52),
                           color=RULE, width=0.6)


def render(path: Path, header: str, blocks: list[Block]) -> None:
    doc = Layout(header).render(blocks)
    doc.set_metadata({"title": header})
    doc.save(str(path), garbage=3, deflate=True)
    print(f"wrote {path.relative_to(ROOT)} ({doc.page_count} pages)")
    doc.close()


# --------------------------------------------------------------------------- #
# Report on Title (Harcourt Lane LLP)
# Planted: the registered proprietor is not the lease's landlord, and a
# covenant limits everything above the seventh floor to hotel use while the
# lease lets floors 8-10 as offices.
# --------------------------------------------------------------------------- #

TITLE_REPORT: list[Block] = [
    Space(110),
    h1("REPORT ON TITLE"),
    centre("100 Bishopsgate, London EC2M 1GT"),
    meta("Freehold · Title Number NGL918274"),
    Space(100),
    meta("Prepared for"),
    centre("Northbank Real Estate Partners LP"),
    meta("in connection with the proposed acquisition of the freehold interest"),
    Space(100),
    meta("Harcourt Lane LLP, Solicitors"),
    meta("7 Gresham Street, London EC2V 7BX"),
    meta("Reference HL/NRE/4471 · 12 March 2024"),
    PageBreak(),
    h2("1. Introduction and Scope"),
    p("1.1 This report is addressed to Northbank Real Estate Partners LP (the \"Client\") and "
      "has been prepared in connection with the Client's proposed acquisition of the freehold "
      "interest in 100 Bishopsgate, London EC2M 1GT (the \"Property\")."),
    p("1.2 This report is based on official copies of the register of title and the title plan "
      "for title number NGL918274 obtained on 4 March 2024, together with copies of the "
      "documents referred to on the register. We have not inspected the Property."),
    p("1.3 This report is confidential to the Client and may not be relied upon by any other "
      "person without our prior written consent."),
    h2("2. Summary of Title"),
    Table(
        [
            ["Property", "100 Bishopsgate, London EC2M 1GT"],
            ["Title number", "NGL918274"],
            ["Tenure", "Freehold"],
            ["Class of title", "Title absolute"],
            ["Registered proprietor",
             "Bishopsgate Nominees (No. 2) Limited (Co. Regn. No. 11873402)"],
            ["Date of registration", "14 June 2019"],
            ["Occupational leases noted", "Floors 8, 9 and 10: Meridian Consulting Group LLP"],
            ["Registered charges", "None"],
        ],
        widths=[0.34, 0.66],
        label_column=True,
    ),
    p("2.1 The Property is registered with title absolute, which is the best class of title "
      "available. The register entries relevant to the Client are summarised in sections 3 to 5 "
      "below."),
    h2("3. Property Register"),
    p("3.1 The Property Register describes the land as the freehold land shown edged with red "
      "on the title plan and known as 100 Bishopsgate, London EC2M 1GT, together with the "
      "building erected on it (the \"Building\")."),
    p("3.2 The land has the benefit of the rights granted by a Transfer of adjoining land dated "
      "9 February 2004, including rights of way on foot over the service yard to Camomile Street "
      "and the right to connect to and use the conducting media within the adjoining land."),
    PageBreak(),
    h2("4. Proprietorship Register"),
    p("4.1 The Proprietorship Register contains the following entries:"),
    entry("1. (14 June 2019) PROPRIETOR: BISHOPSGATE NOMINEES (NO. 2) LIMITED (Co. Regn. No. "
          "11873402) of 1 Poultry, London EC2R 8EJ."),
    entry("2. (14 June 2019) The price stated to have been paid on 30 May 2019 was "
          "£412,000,000."),
    p("4.2 There are no restrictions on the register affecting the proprietor's power of "
      "disposition."),
    p("4.3 The seller will need to be the registered proprietor at completion so that the "
      "transfer to the Client can be registered. We have asked the seller's solicitors to "
      "confirm the identity of the selling entity and to provide evidence of its capacity and "
      "authority."),
    h2("5. Charges Register"),
    p("5.1 The Charges Register contains the following entries:"),
    entry("1. (12 October 1998) A Conveyance of the land in this title dated 28 September 1998 "
          "made between (1) Threadneedle Estates Limited (Vendor) and (2) Broadgate City "
          "Developments Limited (Purchaser) contains the following covenants:"),
    entry("\"The Purchaser hereby covenants with the Vendor for the benefit of the Vendor's "
          "adjoining land known as 104-110 Bishopsgate and each and every part thereof not to "
          "use any part of the building erected on the Property above the seventh floor for any "
          "purpose other than as a hotel or for serviced apartment accommodation falling within "
          "Class C1 of the Town and Country Planning (Use Classes) Order 1987.\""),
    entry("2. (5 March 2001) The land is subject to the rights granted by a Deed dated "
          "19 February 2001 made between (1) Broadgate City Developments Limited and (2) London "
          "Electricity plc in respect of the electricity substation at basement level."),
    entry("3. (22 January 2024) Notice of lease dated 1 January 2024 of Floors 8, 9 and 10 of "
          "the Building in favour of Meridian Consulting Group LLP for a term of 15 years from "
          "1 January 2024."),
    p("5.2 There are no registered charges or notices of any mortgage or other financial "
      "charge on the register."),
    PageBreak(),
    h2("6. Searches and Enquiries"),
    p("6.1 We have carried out the following searches, the results of which are satisfactory "
      "and are held on our file: local authority search (City of London), drainage and water "
      "search (Thames Water), chancel repair search, and a desktop environmental search."),
    p("6.2 The local authority search discloses no enforcement notices, and confirms that the "
      "Property is within the Bank Conservation Area. No planning applications affecting the "
      "Property are pending."),
    p("6.3 We have raised the Commercial Property Standard Enquiries with the seller's "
      "solicitors and will report further on the replies when received."),
    h2("7. Occupational Lease"),
    p("7.1 The Property is sold subject to the lease of Floors 8, 9 and 10 dated 1 January 2024 "
      "in favour of Meridian Consulting Group LLP for a term of 15 years from 1 January 2024 at "
      "an initial rent of £850,000 per annum. The remainder of the Building is sold with vacant "
      "possession or subject to the tenancies listed in the seller's tenancy schedule."),
    h2("8. Conclusion"),
    p("8.1 Subject to the matters referred to in this report and to satisfactory replies to our "
      "outstanding enquiries, we consider that the title to the Property is good and marketable "
      "and may be accepted by the Client."),
    Space(24),
    Para("Harcourt Lane LLP", SERIF_BOLD, align="left", after=2),
    Para("7 Gresham Street, London EC2V 7BX · 12 March 2024", SANS, 9, align="left",
         color=MUTED),
]


# --------------------------------------------------------------------------- #
# Measured Survey and Condition Report (Carter Mitchell Surveyors LLP)
# Planted: the measured NIA of floors 8-10 is 29,850 sq ft; the lease says 32,500.
# --------------------------------------------------------------------------- #

SURVEY_REPORT: list[Block] = [
    Space(110),
    h1("MEASURED SURVEY AND CONDITION REPORT"),
    centre("Floors 8, 9 and 10, 100 Bishopsgate, London EC2M 1GT"),
    Space(100),
    meta("Prepared for"),
    centre("Bishopsgate Property Holdings Limited"),
    Space(100),
    meta("Carter Mitchell Surveyors LLP, Chartered Surveyors"),
    meta("31 Finsbury Circus, London EC2M 7EA"),
    meta("Reference CMS/23/1187 · 4 December 2023"),
    PageBreak(),
    h2("1. Instructions and Scope"),
    p("1.1 We were instructed by Bishopsgate Property Holdings Limited (the \"Client\") to "
      "measure Floors 8, 9 and 10 of 100 Bishopsgate, London EC2M 1GT (the \"Premises\") and to "
      "record their state and condition ahead of the proposed letting of the Premises to "
      "Meridian Consulting Group LLP."),
    p("1.2 Our inspection and measured survey were carried out on 21 and 22 November 2023. The "
      "Premises were vacant at the time of inspection. This report also forms the basis of the "
      "schedule of condition to be annexed to the proposed lease."),
    h2("2. Description of the Premises"),
    p("2.1 100 Bishopsgate is a multi-storey office building of steel frame construction with "
      "glazed curtain walling, completed in 2001 and refurbished in 2018. The Building has a "
      "double-height reception at ground floor, six passenger lifts and a goods lift serving all "
      "floors, and a basement service yard accessed from Camomile Street."),
    p("2.2 The Premises comprise the whole of Floors 8, 9 and 10. Each floor is laid out as "
      "open plan office accommodation with raised access floors, suspended ceilings, LED "
      "lighting and four-pipe fan coil air conditioning, arranged around a central core "
      "containing the lifts, staircases and WCs."),
    PageBreak(),
    h2("3. Measured Areas"),
    p("3.1 The Premises were measured on site using laser measurement equipment in accordance "
      "with the RICS Code of Measuring Practice (6th Edition). Areas are stated on a net "
      "internal area (NIA) basis and exclude the central core, plant rooms and common parts."),
    Table(
        [
            ["Floor", "NIA (sq ft)", "NIA (sq m)"],
            ["Floor 8", "10,105", "938.8"],
            ["Floor 9", "9,980", "927.2"],
            ["Floor 10", "9,765", "907.2"],
            ["Total", "29,850", "2,773.2"],
        ],
        widths=[0.44, 0.28, 0.28],
        header=True,
        numeric={1, 2},
    ),
    p("3.2 The aggregate net internal area of Floors 8, 9 and 10 is 29,850 square feet (2,773 "
      "square metres)."),
    p("3.3 The floor-by-floor variation reflects the stepped curtain wall on the eastern "
      "elevation at Floors 9 and 10. Areas are accurate to within plus or minus 0.5 per cent."),
    h2("4. Structure and External Fabric"),
    p("4.1 The structural frame, floor slabs and curtain walling within and adjoining the "
      "Premises were found to be in good condition, with no evidence of movement, cracking or "
      "water ingress. Sealant joints to the curtain walling were renewed in 2018 and remain "
      "serviceable."),
    PageBreak(),
    h2("5. Internal Condition and Services"),
    p("5.1 Internal finishes are in good condition throughout, consistent with the 2018 "
      "refurbishment. Minor scuffing to wall finishes and isolated stained ceiling tiles were "
      "recorded on Floor 9 and are noted in the photographic schedule."),
    p("5.2 Mechanical and electrical services serving the Premises, including the fan coil "
      "units, lighting and fire detection and alarm systems, were operational at the time of "
      "inspection. Service records for the lifts and air conditioning plant are up to date."),
    h2("6. Environmental and Hazardous Materials"),
    p("6.1 The Building's asbestos register (updated September 2023) records no asbestos "
      "containing materials within the Premises. No deleterious materials were identified "
      "during our inspection."),
    p("6.2 The Premises hold an Energy Performance Certificate with a rating of B, valid until "
      "2028. We are not aware of any contamination affecting the Building or its site."),
    h2("7. Summary"),
    p("7.1 The Premises are in good condition and suitable for occupation as offices without "
      "the need for significant works. The measured areas in section 3 should be used for the "
      "purposes of the proposed letting."),
    Space(24),
    Para("Carter Mitchell Surveyors LLP", SERIF_BOLD, align="left", after=2),
    Para("31 Finsbury Circus, London EC2M 7EA · 4 December 2023", SANS, 9, align="left",
         color=MUTED),
]


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    lease = OUT_DIR / "01-commercial-lease-100-bishopsgate.pdf"
    shutil.copyfile(SAMPLES / "commercial-lease-100-bishopsgate.pdf", lease)
    print(f"copied {lease.relative_to(ROOT)}")
    render(
        OUT_DIR / "02-report-on-title-100-bishopsgate.pdf",
        "Report on Title — 100 Bishopsgate",
        TITLE_REPORT,
    )
    render(
        OUT_DIR / "03-measured-survey-100-bishopsgate.pdf",
        "Measured Survey and Condition Report — 100 Bishopsgate",
        SURVEY_REPORT,
    )


if __name__ == "__main__":
    main()
