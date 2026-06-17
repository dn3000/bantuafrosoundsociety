// Maps a Supabase RPC error (from the approve_and_promote_* functions) to an
// HTTP status + clean message. The RPC RAISEs bare tokens
// ('submission_not_found', 'source_not_found', 'invalid_type', 'forbidden');
// 'forbidden' carries SQLSTATE 42501, the rest default to P0001.

type RpcLikeError = { message?: string | null; code?: string | null }

export function mapRpcError(error: RpcLikeError): { status: number; message: string } {
  const msg = (error.message || '').toLowerCase()
  const code = error.code || ''

  if (code === '42501' || msg.includes('forbidden')) {
    return { status: 403, message: 'Forbidden' }
  }
  if (msg.includes('submission_not_found') || msg.includes('source_not_found') || msg.includes('not_found')) {
    return { status: 404, message: 'Source row not found' }
  }
  if (msg.includes('invalid_type')) {
    return { status: 400, message: "type must be 'submission' or 'video'" }
  }
  return { status: 500, message: error.message || 'Promotion failed' }
}
