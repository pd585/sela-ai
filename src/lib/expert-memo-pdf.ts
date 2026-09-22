import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  ClauseFinding,
  DocumentOverview,
  IssueFinding,
  KeyTerm,
  SelaVersion,
  Citation,
} from "./sela.functions";

interface AutoTableDoc extends jsPDF {
  lastAutoTable?: {
    finalY: number;
  };
}

function getFinalY(doc: jsPDF): number {
  return (doc as AutoTableDoc).lastAutoTable?.finalY ?? 0;
}

export type ExpertMemoData = {
  documentTitle: string;
  fileName: string;
  pageCount?: number | null;
  overview?: DocumentOverview | null;
  keyTerms?: KeyTerm[] | null;
  clauses?: ClauseFinding[] | null;
  issues?: IssueFinding[] | null;
  selaVersion?: SelaVersion | null;
  questions?: Array<{
    question: string;
    answer: string;
    sufficient?: boolean | null;
    citations?: Citation[] | null;
    external_verification?: {
      status: string;
      summary: string;
      how_they_relate?: string;
      sources?: Array<{ title: string; url: string; published_date?: string }>;
    } | null;
  }> | null;
  originalPassages?: Array<{ chunkIndex: number; page: number; content: string }> | null;
};

export function exportExpertMemoPdf(data: ExpertMemoData): void {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let cursorY = margin;

  const brassColor: [number, number, number] = [163, 116, 43]; // #A3742B
  const darkColor: [number, number, number] = [30, 30, 30];
  const mutedColor: [number, number, number] = [100, 100, 100];
  const lightBg: [number, number, number] = [248, 246, 241];

  const checkPageBreak = (neededHeight: number) => {
    if (cursorY + neededHeight > pageHeight - margin) {
      doc.addPage();
      cursorY = margin + 10;
    }
  };

  // ----------------------------------------------------
  // Header / Title Banner
  // ----------------------------------------------------
  doc.setFillColor(...lightBg);
  doc.rect(margin, cursorY, contentWidth, 26, "F");
  doc.setDrawColor(...brassColor);
  doc.setLineWidth(0.5);
  doc.rect(margin, cursorY, contentWidth, 26, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...brassColor);
  doc.text("SELA AI · LEGAL DOCUMENT INTELLIGENCE", margin + 6, cursorY + 7);

  doc.setFont("times", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...darkColor);
  const truncatedTitle =
    data.documentTitle.length > 55 ? `${data.documentTitle.slice(0, 52)}…` : data.documentTitle;
  doc.text(`EXPERT REVIEW MEMORANDUM: ${truncatedTitle}`, margin + 6, cursorY + 15);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...mutedColor);
  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  doc.text(
    `File: ${data.fileName} ${data.pageCount ? `· ${data.pageCount} pages` : ""} · Generated: ${dateStr}`,
    margin + 6,
    cursorY + 21,
  );

  cursorY += 32;

  // ----------------------------------------------------
  // 1. Executive Summary & Purpose
  // ----------------------------------------------------
  if (data.overview) {
    checkPageBreak(35);
    doc.setFont("times", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...darkColor);
    doc.text("1. EXECUTIVE OVERVIEW & PURPOSE", margin, cursorY);
    cursorY += 6;

    const overviewText = [
      `Document Classification: ${data.overview.document_type || "Legal Instrument"}`,
      `Core Purpose: ${data.overview.purpose}`,
      `Summary: ${data.overview.summary}`,
    ].join("\n\n");

    const splitOverview = doc.splitTextToSize(overviewText, contentWidth - 8);
    const boxHeight = splitOverview.length * 4.5 + 8;
    checkPageBreak(boxHeight);

    doc.setFillColor(252, 252, 252);
    doc.rect(margin, cursorY, contentWidth, boxHeight, "F");
    doc.setDrawColor(220, 220, 220);
    doc.rect(margin, cursorY, contentWidth, boxHeight, "S");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...darkColor);
    doc.text(splitOverview, margin + 4, cursorY + 6);
    cursorY += boxHeight + 8;

    // Parties involved
    if (data.overview.parties && data.overview.parties.length > 0) {
      checkPageBreak(25);
      doc.setFont("times", "bold");
      doc.setFontSize(10);
      doc.text("Parties Named in Document:", margin, cursorY);
      cursorY += 4;

      autoTable(doc, {
        startY: cursorY,
        margin: { left: margin, right: margin },
        head: [["Party Name / Entity", "Role / Designation"]],
        body: data.overview.parties.map((p) => [p, "Named Entity"]),
        theme: "plain",
        headStyles: { fillColor: lightBg, textColor: darkColor, fontStyle: "bold", fontSize: 8 },
        bodyStyles: { textColor: darkColor, fontSize: 8 },
        styles: { cellPadding: 2, lineColor: [230, 230, 230], lineWidth: 0.2 },
      });
      cursorY = getFinalY(doc) + 8;
    }

    // Important Dates
    if (data.overview.dates && data.overview.dates.length > 0) {
      checkPageBreak(30);
      doc.setFont("times", "bold");
      doc.setFontSize(10);
      doc.text("Binding Dates & Deadlines:", margin, cursorY);
      cursorY += 4;

      autoTable(doc, {
        startY: cursorY,
        margin: { left: margin, right: margin },
        head: [["Date / Milestone", "Binding Detail", "Source"]],
        body: data.overview.dates.map((d) => [d.label, d.detail, `Passage ${d.chunk_index}`]),
        theme: "plain",
        headStyles: { fillColor: lightBg, textColor: darkColor, fontStyle: "bold", fontSize: 8 },
        bodyStyles: { textColor: darkColor, fontSize: 8 },
        styles: { cellPadding: 2, lineColor: [230, 230, 230], lineWidth: 0.2 },
      });
      cursorY = getFinalY(doc) + 8;
    }
  }

  // ----------------------------------------------------
  // 2. Key Defined Terms
  // ----------------------------------------------------
  if (data.keyTerms && data.keyTerms.length > 0) {
    checkPageBreak(35);
    doc.setFont("times", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...darkColor);
    doc.text("2. KEY DEFINED TERMS", margin, cursorY);
    cursorY += 4;

    autoTable(doc, {
      startY: cursorY,
      margin: { left: margin, right: margin },
      head: [["Defined Term", "Meaning in Context of Agreement", "Source"]],
      body: data.keyTerms.map((t) => [t.term, t.meaning_in_document, `Passage ${t.chunk_index}`]),
      theme: "plain",
      headStyles: { fillColor: lightBg, textColor: darkColor, fontStyle: "bold", fontSize: 8 },
      bodyStyles: { textColor: darkColor, fontSize: 8 },
      columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: 114 }, 2: { cellWidth: 25 } },
      styles: { cellPadding: 2.5, lineColor: [230, 230, 230], lineWidth: 0.2 },
    });
    cursorY = getFinalY(doc) + 8;
  }

  // ----------------------------------------------------
  // 3. Significant Clauses & Inspection Rationale
  // ----------------------------------------------------
  if (data.clauses && data.clauses.length > 0) {
    checkPageBreak(35);
    doc.setFont("times", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...darkColor);
    doc.text("3. KEY CLAUSES & INSPECTION RATIONALE", margin, cursorY);
    cursorY += 4;

    autoTable(doc, {
      startY: cursorY,
      margin: { left: margin, right: margin },
      head: [["Clause Title", "What It Says", "Why Inspect / Operational Context", "Source"]],
      body: data.clauses.map((c) => [
        c.title,
        c.what_it_says,
        c.why_inspect,
        `Passage ${c.chunk_index}`,
      ]),
      theme: "plain",
      headStyles: { fillColor: lightBg, textColor: darkColor, fontStyle: "bold", fontSize: 8 },
      bodyStyles: { textColor: darkColor, fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 67 },
        2: { cellWidth: 52 },
        3: { cellWidth: 20 },
      },
      styles: { cellPadding: 2.5, lineColor: [230, 230, 230], lineWidth: 0.2 },
    });
    cursorY = getFinalY(doc) + 8;
  }

  // ----------------------------------------------------
  // 4. Issues & Descriptive Observations
  // ----------------------------------------------------
  if (data.issues && data.issues.length > 0) {
    checkPageBreak(35);
    doc.setFont("times", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...darkColor);
    doc.text("4. ISSUES & OBSERVATIONS WORTH INSPECTING", margin, cursorY);
    cursorY += 4;

    autoTable(doc, {
      startY: cursorY,
      margin: { left: margin, right: margin },
      head: [["Area / Issue", "Descriptive Observation", "Source"]],
      body: data.issues.map((i) => [i.title, i.observation, `Passage ${i.chunk_index}`]),
      theme: "plain",
      headStyles: { fillColor: lightBg, textColor: darkColor, fontStyle: "bold", fontSize: 8 },
      bodyStyles: { textColor: darkColor, fontSize: 8 },
      columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 109 }, 2: { cellWidth: 25 } },
      styles: { cellPadding: 2.5, lineColor: [230, 230, 230], lineWidth: 0.2 },
    });
    cursorY = getFinalY(doc) + 8;
  }

  // ----------------------------------------------------
  // 5. SELA'S VERSION
  // ----------------------------------------------------
  if (data.selaVersion && data.selaVersion.sections && data.selaVersion.sections.length > 0) {
    checkPageBreak(35);
    doc.setFont("times", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...darkColor);
    doc.text("5. SELA'S VERSION (STRUCTURED BREAKDOWN)", margin, cursorY);
    cursorY += 3;

    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...mutedColor);
    doc.text(
      "Notice: SELA'S VERSION is generated for understanding and review. The original document remains the authoritative text.",
      margin,
      cursorY,
    );
    cursorY += 5;

    const selaRows: string[][] = [];
    for (const sec of data.selaVersion.sections) {
      const details = [
        sec.what_it_says ? `WHAT IT SAYS: ${sec.what_it_says}` : "",
        sec.why_it_matters ? `WHY IT MATTERS: ${sec.why_it_matters}` : "",
        sec.who_it_affects ? `WHO IT AFFECTS: ${sec.who_it_affects}` : "",
        sec.what_happens ? `WHAT HAPPENS: ${sec.what_happens}` : "",
        sec.important_dates ? `IMPORTANT DATES: ${sec.important_dates}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      selaRows.push([sec.section_title, details, `Page ${sec.page_number}`]);
    }

    autoTable(doc, {
      startY: cursorY,
      margin: { left: margin, right: margin },
      head: [["Section", "SELA'S VERSION Explanation", "Location"]],
      body: selaRows,
      theme: "plain",
      headStyles: { fillColor: lightBg, textColor: darkColor, fontStyle: "bold", fontSize: 8 },
      bodyStyles: { textColor: darkColor, fontSize: 8 },
      columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 109 }, 2: { cellWidth: 25 } },
      styles: { cellPadding: 3, lineColor: [230, 230, 230], lineWidth: 0.2 },
    });
    cursorY = getFinalY(doc) + 8;
  }

  // ----------------------------------------------------
  // 6. ORIGINAL DOCUMENT ↔ SELA'S VERSION COMPARISON
  // ----------------------------------------------------
  checkPageBreak(40);
  doc.setFont("times", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...darkColor);
  doc.text("6. ORIGINAL DOCUMENT ↔ SELA'S VERSION COMPARISON", margin, cursorY);
  cursorY += 4;

  const comparisonRows: string[][] = [];

  // Build comparison items from clauses & original passages or selaVersion sections
  const compareSections =
    data.selaVersion?.sections && data.selaVersion.sections.length > 0
      ? data.selaVersion.sections
      : (data.clauses || []).map((c) => ({
          section_title: c.title,
          chunk_index: c.chunk_index,
          page_number: 1,
          what_it_says: c.what_it_says,
          why_it_matters: c.why_inspect,
          who_it_affects: "",
          what_happens: "",
          important_dates: "",
        }));

  for (const item of compareSections.slice(0, 8)) {
    const originalChunk = data.originalPassages?.find((p) => p.chunkIndex === item.chunk_index);
    const originalText = originalChunk?.content
      ? originalChunk.content.length > 350
        ? `${originalChunk.content.slice(0, 350)}…`
        : originalChunk.content
      : `[Original provision in passage ${item.chunk_index}]`;

    const selaExp = [
      item.what_it_says ? `WHAT IT SAYS:\n${item.what_it_says}` : "",
      item.why_it_matters ? `WHY IT MATTERS:\n${item.why_it_matters}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    comparisonRows.push([
      item.section_title,
      `${originalText}\n\n(Source: Page ${item.page_number || originalChunk?.page || 1})`,
      selaExp,
    ]);
  }

  if (comparisonRows.length > 0) {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: margin, right: margin },
      head: [
        ["Provision / Topic", "Original Document Text", "SELA'S VERSION (Faithful Explanation)"],
      ],
      body: comparisonRows,
      theme: "plain",
      headStyles: { fillColor: lightBg, textColor: darkColor, fontStyle: "bold", fontSize: 8 },
      bodyStyles: { textColor: darkColor, fontSize: 8 },
      columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: 69 }, 2: { cellWidth: 70 } },
      styles: { cellPadding: 3, lineColor: [220, 220, 220], lineWidth: 0.3 },
    });
    cursorY = getFinalY(doc) + 8;
  }

  // ----------------------------------------------------
  // 7. Grounded Inquiries & External Verification
  // ----------------------------------------------------
  if (data.questions && data.questions.length > 0) {
    checkPageBreak(35);
    doc.setFont("times", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...darkColor);
    doc.text("7. GROUNDED INQUIRIES & EXTERNAL VERIFICATION", margin, cursorY);
    cursorY += 4;

    const qaRows: string[][] = [];
    for (const q of data.questions) {
      let citationsStr = "No explicit citation";
      if (q.citations && q.citations.length > 0) {
        citationsStr = q.citations
          .map((c) => `Page ${c.page}: "${c.excerpt.slice(0, 80)}…"`)
          .join("\n");
      }

      let answerBody = q.answer;
      if (q.sufficient === false) {
        answerBody +=
          "\n\n[SELA Note: Answer could not be fully supported by document text alone.]";
      }

      if (q.external_verification && q.external_verification.status !== "UNAVAILABLE") {
        answerBody += `\n\n--- LAYER 2: FROM EXTERNAL SOURCES [${q.external_verification.status}] ---\n${q.external_verification.summary}`;
        if (q.external_verification.how_they_relate) {
          answerBody += `\n\nHow They Relate:\n${q.external_verification.how_they_relate}`;
        }
        if (q.external_verification.sources && q.external_verification.sources.length > 0) {
          answerBody += `\n\nRetrieved Public Sources:\n${q.external_verification.sources.map((s) => `- ${s.title}: ${s.url}`).join("\n")}`;
        }
      }

      qaRows.push([q.question, answerBody, citationsStr]);
    }

    autoTable(doc, {
      startY: cursorY,
      margin: { left: margin, right: margin },
      head: [["User Question", "Answer & Verification Finding", "Citations / Evidence"]],
      body: qaRows,
      theme: "plain",
      headStyles: { fillColor: lightBg, textColor: darkColor, fontStyle: "bold", fontSize: 8 },
      bodyStyles: { textColor: darkColor, fontSize: 8 },
      columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: 89 }, 2: { cellWidth: 40 } },
      styles: { cellPadding: 2.5, lineColor: [230, 230, 230], lineWidth: 0.2 },
    });
    cursorY = getFinalY(doc) + 8;
  }

  // ----------------------------------------------------
  // Legal Disclaimer Box (at end)
  // ----------------------------------------------------
  checkPageBreak(30);
  doc.setFillColor(...lightBg);
  doc.rect(margin, cursorY, contentWidth, 20, "F");
  doc.setDrawColor(200, 200, 200);
  doc.rect(margin, cursorY, contentWidth, 20, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...darkColor);
  doc.text("IMPORTANT LEGAL REVIEW DISCLAIMER", margin + 4, cursorY + 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...mutedColor);
  const disclaimerText =
    "SELA is an automated review aid and not a licensed attorney. SELA does not provide legal advice, formal opinions, or binding determinations. For consequential legal or financial transactions, please consult with a qualified legal professional.";
  const splitDisclaimer = doc.splitTextToSize(disclaimerText, contentWidth - 8);
  doc.text(splitDisclaimer, margin + 4, cursorY + 10);

  // ----------------------------------------------------
  // Page Numbers Footer
  // ----------------------------------------------------
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `SELA AI Expert Memo · ${data.documentTitle} · Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: "center" },
    );
  }

  // Save the generated PDF
  const safeTitle = data.documentTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  doc.save(`${safeTitle}-sela-expert-memo.pdf`);
}
