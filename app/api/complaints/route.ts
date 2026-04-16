import { NextRequest, NextResponse } from 'next/server';
import { pool } from '../../lib/db';
import { generateHash } from '../../lib/hash';
import { storeHashOnChain } from '../../lib/blockchain';

export async function GET() {
  try {
    const result = await pool.query(
      `SELECT complaint_id, title, description, category, image,
              lat, lng, location_label, upvotes, status,
              progress_stage, routed_to, reporter_id, created_at,
              hash, tx_hash
       FROM complaints
       ORDER BY inserted_at DESC`,
    );

    const complaints = result.rows.map((row) => ({
      id: row.complaint_id,
      title: row.title,
      description: row.description,
      category: row.category,
      image: row.image,
      lat: row.lat,
      lng: row.lng,
      locationLabel: row.location_label,
      upvotes: row.upvotes,
      status: row.status,
      progressStage: row.progress_stage,
      routedTo: row.routed_to,
      reporterId: row.reporter_id,
      createdAt: row.created_at,
      hash: row.hash ?? null,
      txHash: row.tx_hash ?? null,
    }));

    return NextResponse.json(complaints);
  } catch (error) {
    console.error('GET /api/complaints error:', error);
    return NextResponse.json({ error: 'Failed to fetch complaints' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      id,
      title,
      description,
      category,
      image,
      lat,
      lng,
      locationLabel,
      upvotes,
      status,
      progressStage,
      routedTo,
      reporterId,
      createdAt,
    } = body;

    if (!id || !title) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Generate SHA-256 hash of complaint data
    const hash = generateHash({
      id,
      title,
      description,
      category,
      lat,
      lng,
      locationLabel,
      routedTo,
      reporterId,
      createdAt,
    });

    // Insert complaint with hash
    await pool.query(
      `INSERT INTO complaints (
        complaint_id, title, description, category, image,
        lat, lng, location_label, upvotes, status,
        progress_stage, routed_to, reporter_id, created_at, hash
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (complaint_id) DO NOTHING`,
      [
        id, title, description ?? '', category ?? 'General', image ?? '',
        lat ?? 0, lng ?? 0, locationLabel ?? '', upvotes ?? 0, status ?? 'CRITICAL',
        progressStage ?? 0, routedTo ?? 'BBMP', reporterId ?? '', createdAt ?? '', hash,
      ],
    );

    // Fire-and-forget: store hash on blockchain (NON-BLOCKING)
    storeHashOnChain(hash)
      .then(async (txHash) => {
        try {
          await pool.query(
            `UPDATE complaints SET tx_hash = $1 WHERE complaint_id = $2`,
            [txHash, id],
          );
          console.log(`✅ Blockchain tx for ${id}: ${txHash}`);
        } catch (dbError) {
          console.error(`Failed to save txHash for ${id}:`, dbError);
        }
      })
      .catch((chainError) => {
        console.error(`⚠️ Blockchain call failed for ${id}:`, chainError);
        // Complaint is still saved — blockchain can be retried later
      });

    // Return immediately without waiting for blockchain
    return NextResponse.json({
      id,
      title,
      description: description ?? '',
      category: category ?? 'General',
      image: image ?? '',
      lat: lat ?? 0,
      lng: lng ?? 0,
      locationLabel: locationLabel ?? '',
      upvotes: upvotes ?? 0,
      status: status ?? 'CRITICAL',
      progressStage: progressStage ?? 0,
      routedTo: routedTo ?? 'BBMP',
      reporterId: reporterId ?? '',
      createdAt: createdAt ?? '',
      hash,
      txHash: null, // Will be updated asynchronously
    });
  } catch (error) {
    console.error('POST /api/complaints error:', error);
    return NextResponse.json({ error: 'Failed to create complaint' }, { status: 500 });
  }
}
