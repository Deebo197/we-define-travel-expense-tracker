/**
 * pollSharedMailboxes — DISABLED
 * 
 * This function has been replaced by the Receipt Inbox feature.
 * Email-based expense intake is no longer supported.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (_req) => {
  return Response.json({
    disabled: true,
    message: 'Email mailbox polling is disabled. Please use the Receipt Inbox feature to upload receipts.',
  }, { status: 410 });
});