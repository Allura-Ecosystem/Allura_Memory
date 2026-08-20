/**
 * ControlPlane-backed Trace API
 * 
 * Replaces the direct PostgreSQL implementation with RuVix controlPlane syscalls.
 * All trace operations now flow through the controlPlane for proof-gated mutation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { forbiddenResponse, requireRole, unauthorizedResponse } from '@/lib/auth/api-auth';
import { logTrace, TraceLog } from '@/lib/postgres/trace-logger';
import { GroupIdValidationError, validateGroupId } from '@/lib/validation/group-id';

/**
 * GET /api/memory/traces
 * 
 * Query traces with group_id enforcement.
 * Query params:
 * - group_id: Required tenant identifier (format: allura-*)
 * - limit: Max number of traces (default: 50)
 * - offset: Pagination offset (default: 0)
 * - type: Trace type filter (memory | decision | action | prompt)
 */
export async function GET(request: NextRequest) {
  // Auth: require viewer or above role
  const roleCheck = requireRole(request, "viewer");
  if (!roleCheck.user) {
    return unauthorizedResponse();
  }
  if (!roleCheck.allowed) {
    return forbiddenResponse(roleCheck);
  }

  try {
    const { searchParams } = new URL(request.url);
    const group_id_param = searchParams.get('group_id');
    
    // Validate group_id is provided
    if (!group_id_param) {
      return NextResponse.json(
        { error: 'group_id is required. Provide a valid tenant identifier (format: allura-*)' },
        { status: 400 }
      );
    }
    
    // Validate group_id format
    let group_id: string;
    try {
      group_id = validateGroupId(group_id_param);
    } catch (error) {
      if (error instanceof GroupIdValidationError) {
        return NextResponse.json(
          { error: `Invalid group_id: ${error.message}` },
          { status: 400 }
        );
      }
      throw error;
    }
    
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const type = searchParams.get('type');

    // TEMP: Still using direct query for GET (controlPlane-backed query not implemented)
    // TODO: Add controlPlane-backed query syscall
    const { queryTraces } = await import('@/lib/postgres/traces');
    const traces = await queryTraces({
      group_id,
      limit,
      offset,
      type: type as 'memory' | 'decision' | 'action' | 'prompt' | undefined
    });

    return NextResponse.json({ traces });
  } catch (error) {
    console.error('Failed to fetch traces:', error);
    return NextResponse.json(
      { error: 'Failed to fetch traces' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/memory/traces
 * 
 * Log a trace with RuVix controlPlane proof-gated mutation.
 * Body:
 * - group_id: Required tenant identifier (format: allura-*)
 * - type: Trace type (memory | decision | action | prompt)
 * - content: Trace content (required)
 * - agent: Agent identifier (default: 'api')
 * - metadata: Optional metadata object
 * - confidence: Confidence score (0.0-1.0, default: 0.5)
 */
export async function POST(request: NextRequest) {
  // Auth: require viewer or above role (trace creation is a write but still viewer-level)
  const roleCheck = requireRole(request, "viewer");
  if (!roleCheck.user) {
    return unauthorizedResponse();
  }
  if (!roleCheck.allowed) {
    return forbiddenResponse(roleCheck);
  }

  try {
    const body = await request.json();
    const { group_id, type, content, agent, metadata, confidence = 0.5 } = body;

    // Validate group_id is provided
    if (!group_id) {
      return NextResponse.json(
        { error: 'group_id is required. Provide a valid tenant identifier (format: allura-*)' },
        { status: 400 }
      );
    }

    // Validate group_id format
    let validatedGroupId: string;
    try {
      validatedGroupId = validateGroupId(group_id);
    } catch (error) {
      if (error instanceof GroupIdValidationError) {
        return NextResponse.json(
          { error: `Invalid group_id: ${error.message}` },
          { status: 400 }
        );
      }
      throw error;
    }

    if (!content) {
      return NextResponse.json(
        { error: 'content is required' },
        { status: 400 }
      );
    }

    // Build controlPlane-backed trace log
    const traceLog: TraceLog = {
      agent_id: agent || 'api',
      group_id: validatedGroupId,
      trace_type: type || 'memory',
      content,
      confidence,
      metadata: metadata || {},
    };

    // Log through controlPlane (proof-gated)
    const trace = await logTrace(traceLog);

    return NextResponse.json({ success: true, trace });
  } catch (error) {
    console.error('Failed to log trace via controlPlane:', error);
    
    // Check if it's a controlPlane initialization error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage.includes('RUVIX_CONTROL_PLANE_SECRET') || errorMessage.includes('controlPlane')) {
      return NextResponse.json(
        { 
          error: 'ControlPlane not initialized', 
          details: 'RUVIX_CONTROL_PLANE_SECRET environment variable must be set',
          hint: 'Add RUVIX_CONTROL_PLANE_SECRET to your .env.local file'
        },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to log trace', details: errorMessage },
      { status: 500 }
    );
  }
}
