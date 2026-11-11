import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { file_url } = await req.json();
        
        if (!file_url) {
            return Response.json({ error: 'File URL required' }, { status: 400 });
        }

        const fileResponse = await fetch(file_url);
        if (!fileResponse.ok) {
            return Response.json({ error: 'Failed to fetch file' }, { status: 400 });
        }

        const arrayBuffer = await fileResponse.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        const md5Buffer = await crypto.subtle.digest('SHA-1', arrayBuffer);
        const md5Array = Array.from(new Uint8Array(md5Buffer));
        const md5Hex = md5Array.map(b => b.toString(16).padStart(2, '0')).join('');

        return Response.json({
            sha256: hashHex,
            sha1: md5Hex,
            file_size: arrayBuffer.byteLength,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});