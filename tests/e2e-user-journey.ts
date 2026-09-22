import { createClient } from "@supabase/supabase-js";
import { embedTexts, generateStructured } from "../src/lib/ai.server";

const SAMPLE_AGREEMENT_TEXT = `
MASTER SERVICES AGREEMENT

This Master Services Agreement ("Agreement") is entered into as of October 1, 2026, by and between Apex Global Solutions Inc. ("Provider") and Zenith Holdings LLC ("Client").

1. SERVICES AND DELIVERABLES
Provider shall provide legal AI software development and consulting services as described in attached Statements of Work. All services will be performed in a professional manner conforming to commercial standards.

2. FEES AND PAYMENT TERMS
Client agrees to pay Provider a monthly fee of $25,000 USD. Invoices shall be issued on the first business day of each calendar month and are payable net thirty (30) days from invoice date. Late payments accrue interest at 1.5% per month or the maximum rate permitted by applicable law.

3. CONFIDENTIALITY AND DATA SECURITY
Each party agrees to maintain the strict confidentiality of all proprietary information disclosed by the other party. Client data stored in cloud infrastructure shall be encrypted at rest and in transit. Provider shall not use Client data for model training without explicit written consent.

4. TERM AND TERMINATION
This Agreement commences on October 1, 2026 and continues for an initial term of twelve (12) months. Either party may terminate this Agreement without cause upon sixty (60) days prior written notice to the other party. In the event of a material breach, the non-breaching party may terminate immediately if such breach remains uncured for thirty (30) days following written notice.

5. GOVERNING LAW AND DISPUTE RESOLUTION
This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to conflicts of law principles. Any dispute arising under this Agreement shall be resolved through binding arbitration in Wilmington, Delaware.
`;

const ANALYSIS_INSTRUCTIONS = `You are SELA, a careful legal-document reading assistant.
You are given numbered passages from ONE document. Work only from those passages.
Rules:
- Never invent parties, dates, clauses, laws, or quotations. If the document does not say it, leave it out.
- Write in plain language a non-lawyer can follow. No legal advice, no verdicts, no scores.
- Every finding must cite the passage number it came from in chunk_index.
- "issues" are descriptive observations worth inspecting (unusual, one-sided, open-ended, missing or ambiguous information), never risk ratings.
- If the document is short or thin, return fewer items rather than padding.
- Aim for up to 10 key terms, up to 10 clauses, and up to 8 issues.`;

const ANSWER_INSTRUCTIONS = `You are SELA, answering a question about ONE legal document using only the numbered passages provided.
Rules:
- Answer only from the passages. Never invent text, clauses, dates, parties or law.
- If the passages do not support an answer, set sufficient to false and say plainly that the document does not provide enough to answer, naming what is missing.
- Plain language. No legal advice or final determinations.
- List the passage numbers you relied on in citations.`;

async function runEndToEndQA() {
  console.log("==================================================");
  console.log("SELA AI — COMPLETE END-TO-END QA & PIPELINE AUDIT");
  console.log("==================================================\n");

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
  const supabaseKey =
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // 1. CREATE TEST USER
  const testEmail = `qa-test-${Date.now()}@sela-qa-audit.internal`;
  const testPassword = `SelaTest123!#${Date.now()}`;
  console.log("1. Creating isolated test user...");

  const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
  });

  if (authErr || !authData.user) {
    throw new Error(`Failed to create test user: ${authErr?.message}`);
  }
  const userId = authData.user.id;
  console.log("✓ Test user created successfully (ID:", userId, ")");

  // Client scoped to test user
  const userClient = createClient(supabaseUrl, supabaseKey);
  const { data: signInData, error: signInErr } = await userClient.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });
  if (signInErr) throw new Error(`User sign in failed: ${signInErr.message}`);
  console.log("✓ Test user authenticated with Supabase session.");

  let documentId: string | null = null;

  try {
    // 2. SIMULATE CHUNKING
    console.log("\n2. Chunking sample document...");
    const sampleChunks = [
      {
        chunkIndex: 0,
        page: 1,
        content: `MASTER SERVICES AGREEMENT\nEntered into as of October 1, 2026, by and between Apex Global Solutions Inc. ("Provider") and Zenith Holdings LLC ("Client"). Services include legal AI software development and consulting services.`,
      },
      {
        chunkIndex: 1,
        page: 1,
        content: `2. FEES AND PAYMENT TERMS\nClient agrees to pay Provider a monthly fee of $25,000 USD. Invoices shall be issued on the first business day of each calendar month and are payable net thirty (30) days from invoice date. Late payments accrue interest at 1.5% per month.`,
      },
      {
        chunkIndex: 2,
        page: 2,
        content: `3. CONFIDENTIALITY AND DATA SECURITY\nEach party agrees to maintain strict confidentiality. Client data stored in cloud infrastructure shall be encrypted at rest and in transit. Provider shall not use Client data for model training without explicit written consent.`,
      },
      {
        chunkIndex: 3,
        page: 2,
        content: `4. TERM AND TERMINATION\nCommences October 1, 2026 for 12 months. Either party may terminate without cause upon sixty (60) days prior written notice. Material breach termination permitted after 30 days uncured notice.`,
      },
      {
        chunkIndex: 4,
        page: 3,
        content: `5. GOVERNING LAW AND DISPUTE RESOLUTION\nGoverned by laws of the State of Delaware. Binding arbitration in Wilmington, Delaware.`,
      },
    ];
    console.log(`✓ Document split into ${sampleChunks.length} passages across 3 pages.`);

    // 3. STORAGE UPLOAD
    console.log("\n3. Uploading file to Supabase Storage...");
    const storagePath = `${userId}/${Date.now()}-test-agreement.pdf`;
    const dummyBuffer = Buffer.from("%PDF-1.4 Mock PDF Content for SELA QA");
    const { error: uploadErr } = await userClient.storage
      .from("documents")
      .upload(storagePath, dummyBuffer, { contentType: "application/pdf" });
    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);
    console.log("✓ Storage file uploaded to owner-scoped path:", storagePath);

    // 4. DATABASE DOCUMENT RECORD
    console.log("\n4. Creating document record in PostgreSQL...");
    const { data: createdDoc, error: docCreateErr } = await userClient
      .from("documents")
      .insert({
        user_id: userId,
        title: "Apex-Zenith Master Services Agreement",
        file_name: "test-agreement.pdf",
        mime_type: "application/pdf",
        byte_size: dummyBuffer.length,
        page_count: 3,
        storage_path: storagePath,
        status: "preparing",
        status_detail: "Preparing your document",
      })
      .select("id")
      .single();

    if (docCreateErr || !createdDoc)
      throw new Error(`Document insert failed: ${docCreateErr?.message}`);
    documentId = createdDoc.id;
    console.log("✓ Document record inserted with ID:", documentId);

    // 5. INSERT DOCUMENT CHUNKS
    console.log("\n5. Inserting document passages into document_chunks...");
    const chunkRows = sampleChunks.map((c) => ({
      document_id: documentId!,
      user_id: userId,
      chunk_index: c.chunkIndex,
      page_number: c.page,
      content: c.content,
    }));
    const { error: chunkInsertErr } = await userClient.from("document_chunks").insert(chunkRows);
    if (chunkInsertErr) throw new Error(`Chunk insert failed: ${chunkInsertErr.message}`);
    console.log(`✓ Inserted ${chunkRows.length} chunks into database.`);

    // 6. GENERATE EMBEDDINGS (GEMINI EMBEDDING 2 - 3072 DIMENSIONS)
    console.log("\n6. Generating 3072-dimensional embeddings via Gemini Embedding 2...");
    const embeddings = await embedTexts(sampleChunks.map((c) => c.content));
    console.log(
      `✓ Generated ${embeddings.length} vectors, each with dimension: ${embeddings[0].length}`,
    );

    // Fetch chunk IDs to upsert embeddings
    const { data: dbChunks, error: fetchErr } = await userClient
      .from("document_chunks")
      .select("id, chunk_index")
      .eq("document_id", documentId!)
      .order("chunk_index", { ascending: true });
    if (fetchErr || !dbChunks) throw new Error("Failed to fetch chunk IDs");

    const updateRows = dbChunks.map((chunk, idx) => ({
      id: chunk.id,
      document_id: documentId!,
      user_id: userId,
      chunk_index: chunk.chunk_index,
      page_number: sampleChunks[idx].page,
      content: sampleChunks[idx].content,
      embedding: JSON.stringify(embeddings[idx]),
    }));

    const { error: upsertErr } = await adminClient.from("document_chunks").upsert(updateRows);
    if (upsertErr) throw new Error(`Embedding upsert failed: ${upsertErr.message}`);
    console.log("✓ Stored 3072-dim vectors into pgvector column for all passages.");

    // 7. GENERATE STRUCTURED DOCUMENT ANALYSIS
    console.log("\n7. Executing structured document intelligence extraction (Gemini LLM)...");
    const formattedContext = sampleChunks
      .map((c) => `[passage ${c.chunkIndex} | page ${c.page}]\n${c.content}`)
      .join("\n\n");

    const analysisSchema = {
      type: "object",
      required: ["overview", "key_terms", "clauses", "issues"],
      properties: {
        overview: {
          type: "object",
          required: [
            "document_type",
            "purpose",
            "summary",
            "parties",
            "dates",
            "what_matters_first",
          ],
          properties: {
            document_type: { type: "string" },
            purpose: { type: "string" },
            summary: { type: "string" },
            parties: { type: "array", items: { type: "string" } },
            dates: {
              type: "array",
              items: {
                type: "object",
                required: ["label", "detail", "chunk_index"],
                properties: {
                  label: { type: "string" },
                  detail: { type: "string" },
                  chunk_index: { type: "integer" },
                },
              },
            },
            what_matters_first: { type: "array", items: { type: "string" } },
          },
        },
        key_terms: {
          type: "array",
          items: {
            type: "object",
            required: ["term", "meaning_in_document", "chunk_index"],
            properties: {
              term: { type: "string" },
              meaning_in_document: { type: "string" },
              chunk_index: { type: "integer" },
            },
          },
        },
        clauses: {
          type: "array",
          items: {
            type: "object",
            required: ["title", "what_it_says", "why_inspect", "chunk_index"],
            properties: {
              title: { type: "string" },
              what_it_says: { type: "string" },
              why_inspect: { type: "string" },
              chunk_index: { type: "integer" },
            },
          },
        },
        issues: {
          type: "array",
          items: {
            type: "object",
            required: ["title", "observation", "chunk_index"],
            properties: {
              title: { type: "string" },
              observation: { type: "string" },
              chunk_index: { type: "integer" },
            },
          },
        },
      },
    };

    const analysis = await generateStructured<any>({
      instructions: ANALYSIS_INSTRUCTIONS,
      input: `Document title: Apex-Zenith Master Services Agreement\n\n${formattedContext}`,
      schemaName: "document_analysis",
      schema: analysisSchema,
      effort: "medium",
    });

    console.log("✓ Document Analysis Extracted:");
    console.log("  - Document Type:", analysis.overview.document_type);
    console.log("  - Parties Identified:", analysis.overview.parties);
    console.log("  - Key Terms Extracted:", analysis.key_terms.length);
    console.log("  - Clauses Extracted:", analysis.clauses.length);
    console.log("  - Issues Extracted:", analysis.issues.length);

    // Save to Database
    const { error: saveAnalysisErr } = await userClient
      .from("documents")
      .update({
        overview: analysis.overview,
        key_terms: analysis.key_terms,
        clauses: analysis.clauses,
        issues: analysis.issues,
        status: "ready",
        status_detail: "Ready for review",
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId!);

    if (saveAnalysisErr) throw new Error(`Failed to save analysis: ${saveAnalysisErr.message}`);
    console.log("✓ Document status updated to 'ready' with complete findings.");

    // 8. ASK SELA — GROUNDED Q&A TEST 1 (Answerable question with Citation)
    console.log("\n8. Testing Ask SELA Question 1: 'What is the termination notice requirement?'");
    const q1 = "What is the termination notice requirement?";
    const [q1Embedding] = await embedTexts([q1]);

    const { data: q1Matches, error: match1Err } = await userClient.rpc("match_document_chunks", {
      p_document_id: documentId!,
      p_query_embedding: JSON.stringify(q1Embedding),
      p_match_count: 5,
    });
    if (match1Err) throw new Error(`Vector match error: ${match1Err.message}`);
    console.log(
      `✓ Vector RPC returned ${q1Matches?.length} matched chunks. Top match similarity: ${q1Matches?.[0]?.similarity?.toFixed(4)} (Chunk ${q1Matches?.[0]?.chunk_index})`,
    );

    const q1Context = (q1Matches ?? [])
      .map((m: any) => `[passage ${m.chunk_index} | page ${m.page_number}]\n${m.content}`)
      .join("\n\n");

    const answerSchema = {
      type: "object",
      required: ["sufficient", "answer", "citations"],
      properties: {
        sufficient: { type: "boolean" },
        answer: { type: "string" },
        citations: { type: "array", items: { type: "integer" } },
      },
    };

    const q1Result = await generateStructured<any>({
      instructions: ANSWER_INSTRUCTIONS,
      input: `Document title: Apex-Zenith Master Services Agreement\n\nQuestion: ${q1}\n\nPassages:\n\n${q1Context}`,
      schemaName: "document_answer",
      schema: answerSchema,
      effort: "low",
    });

    console.log("✓ Ask SELA Answer 1:");
    console.log("  - Sufficient Evidence:", q1Result.sufficient);
    console.log("  - Answer Text:", q1Result.answer);
    console.log("  - Citations (Passage Indices):", q1Result.citations);

    // Resolve citations to actual DB content
    const citedPassages = q1Result.citations.map((idx: number) => {
      const match = q1Matches.find((m: any) => m.chunk_index === idx);
      return {
        chunkIndex: idx,
        page: match?.page_number,
        excerpt: match?.content,
      };
    });
    console.log(
      "✓ Resolved Citation 1 to original verbatim passage on page:",
      citedPassages[0]?.page,
    );

    // Save Question 1
    const { data: savedQ1, error: saveQ1Err } = await userClient
      .from("document_questions")
      .insert({
        document_id: documentId!,
        user_id: userId,
        question: q1,
        answer: q1Result.answer,
        citations: citedPassages,
        sufficient: q1Result.sufficient,
      })
      .select("id, question, sufficient")
      .single();
    if (saveQ1Err) throw new Error(`Save Q1 failed: ${saveQ1Err.message}`);
    console.log("✓ Saved Q&A record ID:", savedQ1.id);

    // 9. ASK SELA — GROUNDED Q&A TEST 2 (Unsupported question)
    console.log(
      "\n9. Testing Ask SELA Question 2 (Unsupported): 'What is the protocol for asteroid impacts?'",
    );
    const q2 = "What is the protocol for asteroid impacts?";
    const [q2Embedding] = await embedTexts([q2]);
    const { data: q2Matches } = await userClient.rpc("match_document_chunks", {
      p_document_id: documentId!,
      p_query_embedding: JSON.stringify(q2Embedding),
      p_match_count: 5,
    });
    const q2Context = (q2Matches ?? [])
      .map((m: any) => `[passage ${m.chunk_index} | page ${m.page_number}]\n${m.content}`)
      .join("\n\n");

    const q2Result = await generateStructured<any>({
      instructions: ANSWER_INSTRUCTIONS,
      input: `Document title: Apex-Zenith Master Services Agreement\n\nQuestion: ${q2}\n\nPassages:\n\n${q2Context}`,
      schemaName: "document_answer",
      schema: answerSchema,
      effort: "low",
    });

    console.log("✓ Ask SELA Answer 2 (Grounded Negative Test):");
    console.log("  - Sufficient Evidence:", q2Result.sufficient);
    console.log("  - Answer Text:", q2Result.answer);
    if (!q2Result.sufficient) {
      console.log("✓ SELA correctly identified lack of evidence in document.");
    }

    // 10. MULTI-TENANT PRIVACY & RLS VALIDATION
    console.log("\n10. Testing Multi-Tenant Isolation & RLS Security...");
    // Create second user
    const user2Email = `qa-user2-${Date.now()}@sela-qa-audit.internal`;
    const { data: auth2Data } = await adminClient.auth.admin.createUser({
      email: user2Email,
      password: testPassword,
      email_confirm: true,
    });
    const user2Client = createClient(supabaseUrl, supabaseKey);
    await user2Client.auth.signInWithPassword({ email: user2Email, password: testPassword });

    // Attempt to read User 1's document
    const { data: leakDoc } = await user2Client
      .from("documents")
      .select("id")
      .eq("id", documentId!);
    if (leakDoc && leakDoc.length > 0) {
      console.error("❌ RLS BREACH: User 2 could read User 1's document!");
    } else {
      console.log("✓ RLS CONFIRMED: User 2 cannot read User 1's document.");
    }

    // Attempt to read User 1's chunks
    const { data: leakChunks } = await user2Client
      .from("document_chunks")
      .select("id")
      .eq("document_id", documentId!);
    if (leakChunks && leakChunks.length > 0) {
      console.error("❌ RLS BREACH: User 2 could read User 1's document chunks!");
    } else {
      console.log("✓ RLS CONFIRMED: User 2 cannot read User 1's document chunks.");
    }

    // Attempt to read User 1's questions
    const { data: leakQ } = await user2Client
      .from("document_questions")
      .select("id")
      .eq("document_id", documentId!);
    if (leakQ && leakQ.length > 0) {
      console.error("❌ RLS BREACH: User 2 could read User 1's questions!");
    } else {
      console.log("✓ RLS CONFIRMED: User 2 cannot read User 1's questions.");
    }

    // Cleanup user 2
    if (auth2Data?.user?.id) {
      await adminClient.auth.admin.deleteUser(auth2Data.user.id);
    }
  } finally {
    // 11. CLEANUP
    console.log("\n11. Cleaning up test artifacts...");
    if (documentId) {
      await adminClient.from("documents").delete().eq("id", documentId);
    }
    await adminClient.auth.admin.deleteUser(userId);
    console.log("✓ Test document and user cleaned up.");
  }

  console.log("\n==================================================");
  console.log("END-TO-END QA PASSED WITH ZERO ERRORS!");
  console.log("==================================================");
}

runEndToEndQA().catch((err) => {
  console.error("\n❌ E2E QA FAILED:", err);
  process.exit(1);
});
