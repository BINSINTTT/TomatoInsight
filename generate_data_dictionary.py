"""Generate TomatoInsight data dictionary with PK/FK keys and PHP currency."""
from docx import Document
from docx.shared import Pt, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

OUT = r"C:\Users\SPARK-PC-05\Desktop\TomatoInsightMObileApplication\TomatoInsight_Data_Dictionary.docx"

TABLES = [
    (
        "Table 1",
        "User",
        "Stores the account and farmer profile of every registered TomatoInsight user. This is the parent entity referenced by farm, scan, credit, and payment records.",
        [
            ("userID (PK)", "VARCHAR", "128", "NOT NULL", "Primary key; unique identifier for each user (Firebase Auth uid)."),
            ("firstName", "VARCHAR", "50", "NOT NULL", "User's first name."),
            ("middleInitial", "VARCHAR", "1", "YES", "Single-letter middle initial."),
            ("lastName", "VARCHAR", "50", "NOT NULL", "User's last name."),
            ("email", "VARCHAR", "100", "NOT NULL UNIQUE", "User's email address used for login."),
            ("password", "VARCHAR", "255", "NOT NULL", "Encrypted password managed by Firebase Authentication."),
            ("farmName", "VARCHAR", "100", "YES", "Display name of the user's farm or garden."),
            ("profileImage", "TEXT", "", "YES", "Path or encoded data of the user's profile picture."),
            ("selectedFarmWeek", "INT", "3", "NOT NULL", "Active farm monitoring week currently selected (4-12)."),
            ("createdAt", "DATETIME", "", "NOT NULL", "Date and time the account was created."),
            ("updatedAt", "DATETIME", "", "NOT NULL", "Date and time the account was last updated."),
        ],
    ),
    (
        "Table 2",
        "Credits",
        "Stores the scan credit balance of each user. One credit record belongs to one user.",
        [
            ("creditID (PK)", "INT", "11", "NOT NULL", "Primary key; unique identifier of the credit record."),
            ("userID (FK)", "VARCHAR", "128", "NOT NULL UNIQUE", "Foreign key referencing User.userID; owner of the credits."),
            ("balance", "INT", "11", "NOT NULL", "Current number of remaining scan credits."),
            ("signupGranted", "BOOLEAN", "", "NOT NULL", "True after one-time signup credits (+10) are granted."),
            ("profileBonusGranted", "BOOLEAN", "", "NOT NULL", "True after one-time farm-setup bonus (+5) is granted."),
            ("updatedAt", "DATETIME", "", "NOT NULL", "Date and time the credit balance was last changed."),
        ],
    ),
    (
        "Table 3",
        "FarmLayout",
        "Stores the farm grid configuration of each user. One layout belongs to one user.",
        [
            ("layoutID (PK)", "INT", "11", "NOT NULL", "Primary key; unique identifier of the farm layout."),
            ("userID (FK)", "VARCHAR", "128", "NOT NULL UNIQUE", "Foreign key referencing User.userID; owner of the farm layout."),
            ("rows", "INT", "5", "NOT NULL", "Number of rows in the farm grid."),
            ("columns", "INT", "5", "NOT NULL", "Number of columns in the farm grid."),
            ("updatedAt", "DATETIME", "", "NOT NULL", "Date and time the layout was last saved."),
        ],
    ),
    (
        "Table 4",
        "Plant",
        "Stores each tomato plant or farm tile registered by a user. Every plant belongs to one user.",
        [
            ("plantID (PK)", "INT", "11", "NOT NULL", "Primary key; unique identifier of the registered tomato plant."),
            ("userID (FK)", "VARCHAR", "128", "NOT NULL", "Foreign key referencing User.userID; owner of the plant."),
            ("tileNumber", "INT", "5", "NOT NULL", "Position of the plant on the farm layout grid."),
            ("plantName", "VARCHAR", "100", "NOT NULL", "User-assigned name of the tomato plant."),
            ("status", "VARCHAR", "30", "NOT NULL", "Current health status based on the latest scan result."),
            ("updatedAt", "DATETIME", "", "NOT NULL", "Date and time the plant record was last updated."),
            ("createdAt", "DATETIME", "", "NOT NULL", "Date and time the plant record was created."),
        ],
    ),
    (
        "Table 5",
        "ScanCalendar",
        "Stores the optional scan reminder schedule of each user. Week numbers are derived from anchor and nextDue.",
        [
            ("calendarID (PK)", "INT", "11", "NOT NULL", "Primary key; unique identifier of the scan calendar."),
            ("userID (FK)", "VARCHAR", "128", "NOT NULL UNIQUE", "Foreign key referencing User.userID; owner of the calendar."),
            ("enabled", "BOOLEAN", "", "NOT NULL", "Whether custom scan reminders are turned on."),
            ("anchor", "DATE", "", "YES", "Date treated as Week 4 start."),
            ("nextDue", "DATE", "", "YES", "Next scheduled scan due date."),
            ("selected", "DATE", "", "YES", "Currently selected calendar date."),
        ],
    ),
    (
        "Table 6",
        "Scan",
        "Records every leaf scan saved for a plant. Each scan belongs to one user and one plant.",
        [
            ("scanID (PK)", "INT", "11", "NOT NULL", "Primary key; unique identifier of each scan."),
            ("userID (FK)", "VARCHAR", "128", "NOT NULL", "Foreign key referencing User.userID; user who performed the scan."),
            ("plantID (FK)", "INT", "11", "NOT NULL", "Foreign key referencing Plant.plantID; scanned tomato plant."),
            ("tileNumber", "INT", "5", "NOT NULL", "Farm tile number of the scanned plant."),
            ("weekNumber", "INT", "3", "NOT NULL", "Farm monitoring week of the scan (4-12)."),
            ("imagePath", "TEXT", "", "YES", "Leaf image path or encoded image data."),
            ("topBarKey", "VARCHAR", "30", "YES", "Top disease or health class key."),
            ("topPct", "DECIMAL", "5,2", "NOT NULL", "Top class confidence percentage (0-100)."),
            ("healthyPct", "DECIMAL", "5,2", "YES", "Healthy class confidence percentage."),
            ("tlcvPct", "DECIMAL", "5,2", "YES", "Yellow leaf curl virus confidence percentage."),
            ("earlyBlightPct", "DECIMAL", "5,2", "YES", "Early blight confidence percentage."),
            ("spottedWiltPct", "DECIMAL", "5,2", "YES", "Spotted wilt confidence percentage."),
            ("savedAt", "DATETIME", "", "NOT NULL", "Date and time the scan was saved."),
        ],
    ),
    (
        "Table 7",
        "Recommendation",
        "Stores care guidance generated after disease classification. Each recommendation belongs to one user, plant, and related scan.",
        [
            ("recommendationID (PK)", "INT", "11", "NOT NULL", "Primary key; unique identifier of the recommendation."),
            ("userID (FK)", "VARCHAR", "128", "NOT NULL", "Foreign key referencing User.userID; owner of the recommendation."),
            ("plantID (FK)", "INT", "11", "NOT NULL", "Foreign key referencing Plant.plantID; plant the guide applies to."),
            ("scanID (FK)", "INT", "11", "YES", "Foreign key referencing Scan.scanID; related scan result."),
            ("diseaseName", "VARCHAR", "100", "YES", "Disease this guide targets; may be blank when Healthy."),
            ("urgencyNote", "VARCHAR", "400", "NOT NULL", "Urgency or priority note for treatment."),
            ("summary", "TEXT", "", "NOT NULL", "Short summary of recommended care."),
            ("actionSteps", "TEXT", "", "NOT NULL", "Recommended treatment or management actions."),
            ("preventionTips", "TEXT", "", "YES", "Prevention tips to reduce future infection."),
            ("isCriticalRemoval", "BOOLEAN", "", "NOT NULL", "True when immediate leaf or plant removal is advised."),
            ("topBarKey", "VARCHAR", "30", "YES", "Top class key linked to this guide."),
            ("topPct", "DECIMAL", "5,2", "YES", "Top confidence percentage when saved."),
            ("weekNumber", "INT", "3", "YES", "Farm week associated with the guide."),
            ("source", "VARCHAR", "20", "YES", "Guide source: groq or rules."),
            ("savedAt", "DATETIME", "", "NOT NULL", "Date and time the recommendation was saved."),
        ],
    ),
    (
        "Table 8",
        "PlantDeletion",
        "Stores archive records when a plant or tile is removed so deleted plants are not restored during sync.",
        [
            ("deletionID (PK)", "VARCHAR", "50", "NOT NULL", "Primary key; unique identifier of the deletion record."),
            ("userID (FK)", "VARCHAR", "128", "NOT NULL", "Foreign key referencing User.userID; user who deleted the plant."),
            ("plantID (FK)", "INT", "11", "YES", "Foreign key referencing Plant.plantID when retained."),
            ("tileNumber", "INT", "5", "NOT NULL", "Farm tile number that was removed."),
            ("plantName", "VARCHAR", "100", "NOT NULL", "Plant name at the time of deletion."),
            ("deletedAt", "DATETIME", "", "NOT NULL", "Date and time the plant was deleted."),
        ],
    ),
    (
        "Table 9",
        "Payment",
        "Stores credit top-up transactions linked to a user account. Amounts are recorded in Philippine peso (PHP).",
        [
            ("paymentID (PK)", "VARCHAR", "128", "NOT NULL", "Primary key; unique identifier of the payment transaction."),
            ("userID (FK)", "VARCHAR", "128", "NOT NULL", "Foreign key referencing User.userID; user who purchased credits."),
            ("email", "VARCHAR", "100", "YES", "User email at purchase time."),
            ("packId", "VARCHAR", "30", "NOT NULL", "Credit pack id (starter, grower, season)."),
            ("packName", "VARCHAR", "50", "NOT NULL", "Display name of the purchased pack."),
            ("credits", "INT", "11", "NOT NULL", "Number of credits added by the purchase."),
            ("listPricePhp", "DECIMAL", "10,2", "NOT NULL", "Listed pack price in Philippine peso."),
            ("amountChargedPhp", "DECIMAL", "10,2", "NOT NULL", "Amount charged in Philippine peso (0 for demo checkout)."),
            ("currency", "VARCHAR", "10", "NOT NULL", "Currency code (PHP)."),
            ("status", "VARCHAR", "20", "NOT NULL", "Payment status (e.g., paid)."),
            ("method", "VARCHAR", "50", "NOT NULL", "Payment method used (e.g., demo)."),
            ("isDemo", "BOOLEAN", "", "NOT NULL", "True for demo or no-card checkout."),
            ("balanceBefore", "INT", "11", "YES", "Credit balance before the purchase."),
            ("balanceAfter", "INT", "11", "YES", "Credit balance after the purchase."),
            ("createdAt", "DATETIME", "", "NOT NULL", "Date and time the payment was processed."),
        ],
    ),
    (
        "Table 10",
        "Notification",
        "Stores farm alerts shown to the user, including disease warnings on a plant and scan-due reminders from the scan calendar. Notifications may be displayed in-app or sent as device push alerts.",
        [
            ("notificationID (PK)", "INT", "11", "NOT NULL", "Primary key; unique identifier of the notification."),
            ("userID (FK)", "VARCHAR", "128", "NOT NULL", "Foreign key referencing User.userID; recipient of the notification."),
            ("plantID (FK)", "INT", "11", "YES", "Foreign key referencing Plant.plantID when the alert is plant-specific."),
            ("scanID (FK)", "INT", "11", "YES", "Foreign key referencing Scan.scanID when the alert comes from a scan result."),
            ("title", "VARCHAR", "100", "NOT NULL", "Notification title shown to the user."),
            ("message", "TEXT", "", "NOT NULL", "Notification body (disease warning or scan-due reminder)."),
            ("type", "VARCHAR", "30", "NOT NULL", "Notification type (e.g., disease_alert, scan_reminder)."),
            ("weekNumber", "INT", "3", "YES", "Farm week related to a scan-due reminder."),
            ("isRead", "BOOLEAN", "", "NOT NULL", "True when the user has viewed or confirmed the notification."),
            ("createdAt", "DATETIME", "", "NOT NULL", "Date and time the notification was created."),
        ],
    ),
]


def set_cell_shading(cell, fill_hex):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), fill_hex)
    shd.set(qn("w:val"), "clear")
    tcPr.append(shd)


def set_cell_borders(cell):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcBorders = OxmlElement("w:tcBorders")
    for edge in ("top", "left", "bottom", "right"):
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), "4")
        el.set(qn("w:space"), "0")
        el.set(qn("w:color"), "000000")
        tcBorders.append(el)
    tcPr.append(tcBorders)


def style_run(run, bold=False, size=11):
    run.bold = bold
    run.font.size = Pt(size)
    run.font.name = "Times New Roman"
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.append(rFonts)
    rFonts.set(qn("w:ascii"), "Times New Roman")
    rFonts.set(qn("w:hAnsi"), "Times New Roman")


def main():
    doc = Document()
    section = doc.sections[0]
    section.left_margin = Inches(1)
    section.right_margin = Inches(1)

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run("TomatoInsight Data Dictionary")
    style_run(run, bold=True, size=14)

    intro = doc.add_paragraph()
    run = intro.add_run(
        "This data dictionary presents the TomatoInsight data model with primary keys and foreign keys. "
        "Every dependent table includes userID as a foreign key to User. Payment amounts use Philippine peso (PHP). "
        "Unused conceptual fields such as phone and datePlanted are excluded."
    )
    style_run(run, size=11)

    for number, name, description, rows in TABLES:
        heading = doc.add_paragraph()
        run = heading.add_run(f"{number}: {name}")
        style_run(run, bold=True, size=12)

        desc = doc.add_paragraph()
        run = desc.add_run(description)
        style_run(run, size=11)

        table = doc.add_table(rows=1 + len(rows), cols=5)
        headers = ["Column Name", "Data Type", "Field Size", "Null", "Description"]
        for i, header in enumerate(headers):
            cell = table.rows[0].cells[i]
            cell.text = ""
            p = cell.paragraphs[0]
            run = p.add_run(header)
            style_run(run, bold=True, size=10)
            set_cell_shading(cell, "D9EAD3")
            set_cell_borders(cell)

        for r_i, row in enumerate(rows, start=1):
            for c_i, value in enumerate(row):
                cell = table.rows[r_i].cells[c_i]
                cell.text = ""
                p = cell.paragraphs[0]
                run = p.add_run(value)
                style_run(run, bold=(c_i == 0), size=10)
                set_cell_borders(cell)

        doc.add_paragraph()

    doc.save(OUT)
    print("Saved:", OUT)
    for number, name, _, rows in TABLES:
        print(f"  {number}: {name} ({len(rows)} columns)")


if __name__ == "__main__":
    main()
