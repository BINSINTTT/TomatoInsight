"""Generate Activity 3 submission document."""
from docx import Document
from docx.shared import Pt, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH

OUT_PATH = r"C:\Users\SPARK-PC-05\Downloads\Activity 3 - Answers.docx"


def add_heading(doc, text, level=1):
    doc.add_heading(text, level=level)


def add_para(doc, text, bold=False):
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.bold = bold
    run.font.size = Pt(11)
    return p


def add_bullet(doc, text):
    p = doc.add_paragraph(text, style="List Bullet")
    for run in p.runs:
        run.font.size = Pt(11)


def main():
    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    t_run = title.add_run(
        "IT-FREISM – Free Elective 4: Information Storage Management\nActivity 3"
    )
    t_run.bold = True
    t_run.font.size = Pt(14)

    doc.add_paragraph()

    add_heading(doc, "I. Written Answers", level=1)

    add_heading(doc, "1. Advantages of a virtualized data center over a traditional data center", level=2)
    add_bullet(doc, "Higher resource utilization — multiple virtual machines share physical CPU, memory, and storage, reducing idle hardware.")
    add_bullet(doc, "Lower cost — less physical hardware, floor space, power, and cooling.")
    add_bullet(doc, "Greater agility — VMs can be provisioned, cloned, moved, or resized quickly without new physical servers.")
    add_bullet(doc, "Improved availability and recovery — live migration, snapshots, and VM-level backup support better uptime and DR.")
    add_bullet(doc, "Centralized management — provisioning, monitoring, and patching from a unified management layer.")
    add_bullet(doc, "Easier scalability — add capacity to the resource pool instead of one server per application.")
    add_bullet(doc, "Workload isolation — logical separation of applications on shared infrastructure.")
    add_bullet(doc, "Standardization — template-based deployments reduce configuration drift.")

    add_heading(doc, "2. RAID levels optimal for efficiency, cost, and R/W performance (with justification)", level=2)
    add_para(
        doc,
        "No single RAID level is optimal for efficiency, cost, and read/write performance simultaneously; "
        "the best choice depends on the workload.",
    )
    add_para(doc, "Read-heavy workloads (efficiency + read performance + reasonable cost):", bold=True)
    add_bullet(doc, "RAID 5 or RAID 6 — good capacity efficiency (one or two parity disks), strong read performance, moderate cost.")
    add_bullet(doc, "RAID 6 tolerates two disk failures but has slightly lower capacity efficiency than RAID 5.")
    add_para(doc, "Write-heavy workloads (write performance):", bold=True)
    add_bullet(doc, "RAID 10 (1+0) — best random write performance and low write penalty; usable capacity ≈ 50%.")
    add_bullet(doc, "RAID 1 — good read performance; each write updates both mirrors (2× write I/O).")
    add_para(doc, "Maximum capacity efficiency (lowest cost per GB):", bold=True)
    add_bullet(doc, "RAID 5 / RAID 6 — highest usable space for a given disk count; writes incur read-modify-write penalty.")
    add_para(doc, "Summary:", bold=True)
    add_bullet(doc, "RAID 5 — balanced cost, capacity, and read performance.")
    add_bullet(doc, "RAID 6 — better fault tolerance with similar read benefits; slower writes than RAID 5.")
    add_bullet(doc, "RAID 10 — best overall R/W performance, especially writes; higher cost per usable GB.")
    add_bullet(doc, "RAID 1 — simple mirroring; good reads, double writes, ~50% usable capacity.")

    add_heading(doc, "II. Problems — Requirements and Solutions", level=1)

    add_heading(doc, "Problem 1 — Maximum IOPS for 64 KB I/O", level=2)
    add_para(doc, "Given:", bold=True)
    add_bullet(doc, "Average I/O size = 64 KB")
    add_bullet(doc, "Average seek time = 5 ms")
    add_bullet(doc, "Rotational speed = 7,200 RPM")
    add_bullet(doc, "Transfer rate = 40 MB/s")
    add_para(doc, "Required: Maximum IOPS for this application (seek + rotation + transfer).", bold=True)
    add_para(doc, "Solution:", bold=True)
    add_para(doc, "1) Average rotational latency: T_rot = 60 / (2 × RPM) = 60 / 14,400 ≈ 4.17 ms")
    add_para(doc, "2) Transfer time: 64 KB = 65,536 bytes; 40 MB/s = 41,943,040 bytes/s")
    add_para(doc, "   T_transfer = 65,536 / 41,943,040 ≈ 0.00156 s ≈ 1.56 ms")
    add_para(doc, "3) Time per I/O: T_IO = 5 + 4.17 + 1.56 ≈ 10.73 ms")
    add_para(doc, "4) Maximum IOPS: IOPS = 1 / T_IO = 1000 / 10.73 ≈ 93 IOPS")
    add_para(doc, "Answer: approximately 93 IOPS (≈ 94 IOPS depending on rounding).", bold=True)

    add_heading(doc, "Problem 2 — Disk load (IOPS) for RAID 1, RAID 5, and RAID 6", level=2)
    add_para(doc, "Given:", bold=True)
    add_bullet(doc, "1,000 heavy users × 2 IOPS peak = 2,000 IOPS")
    add_bullet(doc, "2,000 typical users × 1 IOPS peak = 2,000 IOPS")
    add_bullet(doc, "20% overhead for other workloads")
    add_bullet(doc, "R/W ratio = 2:1 (read : write)")
    add_para(doc, "Required: Total disk load in IOPS for RAID 1, RAID 5, and RAID 6.", bold=True)
    add_para(doc, "Solution:", bold=True)
    add_para(doc, "Step 1 — Application peak IOPS (with overhead):")
    add_para(doc, "User IOPS = (1000 × 2) + (2000 × 1) = 4,000")
    add_para(doc, "Total application IOPS = 4,000 × 1.20 = 4,800 IOPS")
    add_para(doc, "Step 2 — Split reads and writes (2:1):")
    add_para(doc, "Read IOPS = 4,800 × (2/3) = 3,200")
    add_para(doc, "Write IOPS = 4,800 × (1/3) = 1,600")
    add_para(doc, "Step 3 — Disk load (RAID I/O multipliers):")
    add_para(doc, "RAID 1: R + 2W = 3,200 + (2 × 1,600) = 6,400 IOPS")
    add_para(doc, "RAID 5: R + 4W = 3,200 + (4 × 1,600) = 9,600 IOPS")
    add_para(doc, "RAID 6: R + 6W = 3,200 + (6 × 1,600) = 12,800 IOPS")

    add_heading(doc, "Summary", level=2)
    table = doc.add_table(rows=5, cols=2)
    table.style = "Table Grid"
    headers = [("Item", "Result"), ("Problem 1 — Max IOPS", "≈ 93 IOPS"), ("Problem 2 — RAID 1", "6,400 IOPS"), ("Problem 2 — RAID 5", "9,600 IOPS"), ("Problem 2 — RAID 6", "12,800 IOPS")]
    for i, (a, b) in enumerate(headers):
        row = table.rows[i].cells
        row[0].text = a
        row[1].text = b
        if i == 0:
            for cell in row:
                for p in cell.paragraphs:
                    for run in p.runs:
                        run.bold = True

    doc.save(OUT_PATH)
    print(f"Saved: {OUT_PATH}")


if __name__ == "__main__":
    main()
