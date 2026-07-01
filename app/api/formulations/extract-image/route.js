import { NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { requireAdmin } from "../../../../lib/apiGuard";

/**
 * Accepts a base64 image (a photographed/screenshotted batch sheet) and
 * asks Claude to extract structured rows: raw material name, percent,
 * rate (price per kg). Each extracted row is then matched against the
 * existing raw_materials table by fuzzy name so the frontend can show a
 * pre-filled but fully editable review table — nothing is saved or
 * auto-created here; this endpoint only reads and matches.
 *
 * Body: { imageBase64, mediaType }  e.g. mediaType: "image/jpeg"
 */
export async function POST(request) {
  const user = requireAdmin(request);
  if (user instanceof NextResponse) return user;

  const { imageBase64, mediaType } = await request.json();
  if (!imageBase64 || !mediaType) {
    return NextResponse.json({ error: "An image is required." }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Image extraction isn't configured yet. Add ANTHROPIC_API_KEY to your environment variables — see README." },
      { status: 500 }
    );
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
              {
                type: "text",
                text: `This image shows a paint batch sheet / formulation table. Extract every raw material row.
For each row, extract: the raw material name exactly as written, its percent value, and its rate (price per kg) if shown.
Also extract, if present anywhere on the sheet: a product/shade name, a customer name, a batch size or total quantity, and a "weight per litre" or density figure.

Respond ONLY with JSON, no other text, no markdown fences, in this exact shape:
{
  "productName": string or null,
  "customerName": string or null,
  "batchSizeKg": number or null,
  "litreDensityKgPerL": number or null,
  "rows": [
    { "name": string, "percent": number, "rate": number or null }
  ]
}`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", errText);
      return NextResponse.json({ error: "Could not read the image. Please try again." }, { status: 502 });
    }

    const data = await response.json();
    const textBlock = data.content?.find((c) => c.type === "text");
    if (!textBlock) {
      return NextResponse.json({ error: "No data could be extracted from the image." }, { status: 502 });
    }

    let parsed;
    try {
      const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (err) {
      console.error("Failed to parse extraction JSON:", textBlock.text);
      return NextResponse.json({ error: "Could not understand the extracted data. Please try a clearer image." }, { status: 502 });
    }

    // Fuzzy-match each extracted row name against existing raw materials.
    const materialsResult = await query(`SELECT id, name, price_per_kg FROM raw_materials WHERE is_active = true`);
    const materials = materialsResult.rows;

    function normalize(s) {
      return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    }

    const rows = (parsed.rows || []).map((row) => {
      const normName = normalize(row.name);
      let match = materials.find((m) => normalize(m.name) === normName);
      if (!match) {
        // Loose contains-match fallback.
        match = materials.find((m) => normalize(m.name).includes(normName) || normName.includes(normalize(m.name)));
      }
      return {
        extractedName: row.name,
        percent: row.percent ?? null,
        rate: row.rate ?? null,
        matchedRawMaterialId: match ? match.id : null,
        matchedRawMaterialName: match ? match.name : null,
        matchedPricePerKg: match ? Number(match.price_per_kg) : null,
      };
    });

    return NextResponse.json({
      productName: parsed.productName || null,
      customerName: parsed.customerName || null,
      batchSizeKg: parsed.batchSizeKg || null,
      litreDensityKgPerL: parsed.litreDensityKgPerL || null,
      rows,
    });
  } catch (err) {
    console.error("Image extraction error:", err);
    return NextResponse.json({ error: "Could not process the image. Please try again." }, { status: 500 });
  }
}
