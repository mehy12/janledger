import { NextRequest, NextResponse } from 'next/server';
import { pool } from '../../../lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const result = await pool.query(
      `SELECT complaint_id, title, description, category, image,
              lat, lng, location_label, upvotes, status,
              progress_stage, routed_to, reporter_id, created_at,
              hash, tx_hash
       FROM complaints
       WHERE complaint_id = $1`,
      [id],
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Complaint not found' }, { status: 404 });
    }

    const row = result.rows[0];
    return NextResponse.json({
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
    });
  } catch (error) {
    console.error('GET /api/complaints/[id] error:', error);
    return NextResponse.json({ error: 'Failed to fetch complaint' }, { status: 500 });
  }
}
