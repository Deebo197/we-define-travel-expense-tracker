/**
 * moveDriveFolderToRoot — one-time utility to move the existing WDT Receipts
 * folder into the authenticated user's My Drive root so it appears in the
 * normal folder tree.
 *
 * Call once from Dashboard → Code → Functions → moveDriveFolderToRoot → Test.
 * Admin only.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const WDT_RECEIPTS_FOLDER_ID = '1rK7tPgxKwJ4THP65hMPVzoNR3Qy3A2k4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    // Get My Drive root ID
    const rootRes = await fetch('https://www.googleapis.com/drive/v3/files/root?fields=id', {
      headers: authHeader,
    });
    const { id: rootId } = await rootRes.json();

    // Get current parents of the WDT Receipts folder
    const fileRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${WDT_RECEIPTS_FOLDER_ID}?fields=id,name,parents`,
      { headers: authHeader }
    );
    const fileData = await fileRes.json();
    const currentParents = (fileData.parents || []).join(',');

    // Move: add My Drive root as parent, remove existing parents
    const moveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${WDT_RECEIPTS_FOLDER_ID}?addParents=${rootId}&removeParents=${currentParents}&fields=id,name,parents`,
      {
        method: 'PATCH',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    );
    const moved = await moveRes.json();

    if (moved.error) {
      return Response.json({ error: moved.error }, { status: 500 });
    }

    return Response.json({
      success: true,
      message: 'WDT Receipts folder moved to My Drive root',
      folder: moved,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});