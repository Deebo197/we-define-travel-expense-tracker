import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { postcodes } = await req.json();
    if (!postcodes || postcodes.length < 2) {
      return Response.json({ error: 'At least 2 postcodes required' }, { status: 400 });
    }

    // Geocode each postcode via Nominatim
    const coords = [];
    for (const pc of postcodes) {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(pc + ', UK')}&format=json&limit=1`,
        { headers: { 'User-Agent': 'WDT-Expenses-App/1.0', 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      console.log(`Geocode ${pc}:`, JSON.stringify(data[0]));
      if (data[0]) coords.push({ lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) });
    }

    if (coords.length < 2) {
      return Response.json({ error: 'Could not geocode postcodes', coords }, { status: 400 });
    }

    // Build static map URL with markers and path
    const markers = coords.map(c => `${c.lat},${c.lon},ol-marker`).join('|');
    const path = coords.map(c => `${c.lat},${c.lon}`).join('|');
    const mapUrl = `https://staticmap.openstreetmap.de/staticmap.php?size=600x400&maptype=mapnik&markers=${markers}&path=color:0xFF0000|weight:3|${path}`;
    console.log('Map URL:', mapUrl);

    const imgRes = await fetch(mapUrl);
    console.log('Map fetch status:', imgRes.status, imgRes.headers.get('content-type'));
    if (!imgRes.ok) return Response.json({ error: 'Failed to fetch map image', status: imgRes.status }, { status: 500 });

    const imgBytes = await imgRes.arrayBuffer();
    console.log('Image bytes:', imgBytes.byteLength);
    const imgBlob = new Blob([imgBytes], { type: 'image/png' });

    const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file: imgBlob });
    console.log('Upload result:', JSON.stringify(uploadResult));

    return Response.json({ file_url: uploadResult.file_url });
  } catch (e) {
    console.error('Error:', e.message, e.stack);
    return Response.json({ error: e.message }, { status: 500 });
  }
});