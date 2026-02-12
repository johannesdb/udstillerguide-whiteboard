import { createServer } from 'node:http';

const PORT = 4000;

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const messe = {
  id: 'messe-001',
  navn: 'FoodExpo 2026',
  dato: '2026-09-15',
  lokation: 'Bella Center, København',
};

const haller = [
  {
    id: 'hal-a',
    messe_id: 'messe-001',
    navn: 'Hal A',
    farve: '#2196F3',
    bredde: 600,
    hoejde: 400,
    position: { x: 0, y: 0 },
  },
  {
    id: 'hal-b',
    messe_id: 'messe-001',
    navn: 'Hal B',
    farve: '#FF9800',
    bredde: 500,
    hoejde: 350,
    position: { x: 650, y: 0 },
  },
];

const stande = [
  {
    id: 'stand-a01',
    hal_id: 'hal-a',
    messe_id: 'messe-001',
    nummer: 'A01',
    status: 'bekraeftet',
    bredde: 100,
    hoejde: 80,
    position: { x: 20, y: 20 },
    udstiller_id: 'udstiller-001',
  },
  {
    id: 'stand-a02',
    hal_id: 'hal-a',
    messe_id: 'messe-001',
    nummer: 'A02',
    status: 'bekraeftet',
    bredde: 100,
    hoejde: 80,
    position: { x: 140, y: 20 },
    udstiller_id: 'udstiller-002',
  },
  {
    id: 'stand-a03',
    hal_id: 'hal-a',
    messe_id: 'messe-001',
    nummer: 'A03',
    status: 'ledig',
    bredde: 120,
    hoejde: 80,
    position: { x: 260, y: 20 },
    udstiller_id: null,
  },
  {
    id: 'stand-a04',
    hal_id: 'hal-a',
    messe_id: 'messe-001',
    nummer: 'A04',
    status: 'afventer',
    bredde: 100,
    hoejde: 80,
    position: { x: 20, y: 120 },
    udstiller_id: 'udstiller-003',
  },
  {
    id: 'stand-a05',
    hal_id: 'hal-a',
    messe_id: 'messe-001',
    nummer: 'A05',
    status: 'bekraeftet',
    bredde: 100,
    hoejde: 80,
    position: { x: 140, y: 120 },
    udstiller_id: 'udstiller-004',
  },
  {
    id: 'stand-b01',
    hal_id: 'hal-b',
    messe_id: 'messe-001',
    nummer: 'B01',
    status: 'bekraeftet',
    bredde: 110,
    hoejde: 90,
    position: { x: 20, y: 20 },
    udstiller_id: 'udstiller-005',
  },
  {
    id: 'stand-b02',
    hal_id: 'hal-b',
    messe_id: 'messe-001',
    nummer: 'B02',
    status: 'ledig',
    bredde: 110,
    hoejde: 90,
    position: { x: 150, y: 20 },
    udstiller_id: null,
  },
  {
    id: 'stand-b03',
    hal_id: 'hal-b',
    messe_id: 'messe-001',
    nummer: 'B03',
    status: 'annulleret',
    bredde: 110,
    hoejde: 90,
    position: { x: 280, y: 20 },
    udstiller_id: null,
  },
];

const udstillere = [
  {
    id: 'udstiller-001',
    navn: 'Nordic Foods A/S',
    kontakt_email: 'info@nordicfoods.dk',
    telefon: '+45 33 12 34 56',
    website: 'https://nordicfoods.dk',
    kategori_ids: ['kat-food', 'kat-foodtech'],
  },
  {
    id: 'udstiller-002',
    navn: 'GreenBite ApS',
    kontakt_email: 'hello@greenbite.dk',
    telefon: '+45 33 22 33 44',
    website: 'https://greenbite.dk',
    kategori_ids: ['kat-food'],
  },
  {
    id: 'udstiller-003',
    navn: 'ScandiDrinks',
    kontakt_email: 'contact@scandidrinks.dk',
    telefon: '+45 33 55 66 77',
    website: 'https://scandidrinks.dk',
    kategori_ids: ['kat-drikkevarer'],
  },
  {
    id: 'udstiller-004',
    navn: 'FreshFarm Ltd',
    kontakt_email: 'mail@freshfarm.dk',
    telefon: '+45 33 88 99 00',
    website: 'https://freshfarm.dk',
    kategori_ids: ['kat-food', 'kat-foodtech'],
  },
  {
    id: 'udstiller-005',
    navn: 'TasteWave',
    kontakt_email: 'info@tastewave.dk',
    telefon: '+45 33 11 22 33',
    website: 'https://tastewave.dk',
    kategori_ids: ['kat-food', 'kat-drikkevarer'],
  },
];

const taxonomier = [
  {
    id: 'tax-program',
    navn: 'Program',
    parent_id: null,
    farve: '#9C27B0',
  },
  {
    id: 'tax-seminarer',
    navn: 'Seminarer',
    parent_id: 'tax-program',
    farve: '#BA68C8',
  },
  {
    id: 'tax-workshops',
    navn: 'Workshops',
    parent_id: 'tax-program',
    farve: '#CE93D8',
  },
  {
    id: 'kat-kategorier',
    navn: 'Kategorier',
    parent_id: null,
    farve: '#4CAF50',
  },
  {
    id: 'kat-food',
    navn: 'Food',
    parent_id: 'kat-kategorier',
    farve: '#66BB6A',
  },
  {
    id: 'kat-drikkevarer',
    navn: 'Drikkevarer',
    parent_id: 'kat-kategorier',
    farve: '#03A9F4',
  },
  {
    id: 'kat-foodtech',
    navn: 'FoodTech',
    parent_id: 'kat-kategorier',
    farve: '#FF5722',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(res, data, status = 200) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString();
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/** Simple path matcher -- returns params object or null. */
function match(pattern, pathname) {
  const patternParts = pattern.split('/');
  const pathParts = pathname.split('/');
  if (patternParts.length !== pathParts.length) return null;
  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  // API key validation
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    json(res, { error: 'Missing X-API-Key header' }, 401);
    return;
  }

  console.log(`${method} ${pathname}`);

  try {
    // GET /api/v1/messer/:id
    let params = match('/api/v1/messer/:id', pathname);
    if (params && method === 'GET') {
      if (params.id !== messe.id) {
        return json(res, { error: 'Messe not found' }, 404);
      }
      return json(res, messe);
    }

    // GET /api/v1/messer/:id/full
    params = match('/api/v1/messer/:id/full', pathname);
    if (params && method === 'GET') {
      if (params.id !== messe.id) {
        return json(res, { error: 'Messe not found' }, 404);
      }
      return json(res, {
        messe,
        haller,
        stande,
        udstillere,
        taxonomier,
        version: new Date().toISOString(),
      });
    }

    // GET /api/v1/messer/:id/changes?since=...
    params = match('/api/v1/messer/:id/changes', pathname);
    if (params && method === 'GET') {
      if (params.id !== messe.id) {
        return json(res, { error: 'Messe not found' }, 404);
      }
      const since = url.searchParams.get('since');
      console.log(`  changes since: ${since || '(not provided)'}`);
      return json(res, {
        changes: [],
        version: new Date().toISOString(),
      });
    }

    // PUT /api/v1/stande/:id
    params = match('/api/v1/stande/:id', pathname);
    if (params && method === 'PUT') {
      const body = await parseBody(req);
      console.log(`  PUT stand ${params.id}:`, JSON.stringify(body));
      return json(res, { ok: true });
    }

    // PUT /api/v1/taxonomier/:id
    params = match('/api/v1/taxonomier/:id', pathname);
    if (params && method === 'PUT') {
      const body = await parseBody(req);
      console.log(`  PUT taxonomi ${params.id}:`, JSON.stringify(body));
      return json(res, { ok: true });
    }

    // Fallback -- 404
    json(res, { error: 'Not found', path: pathname }, 404);
  } catch (err) {
    console.error('Server error:', err);
    json(res, { error: 'Internal server error' }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`\nMock UG Core server running on http://localhost:${PORT}\n`);
  console.log('Available endpoints:');
  console.log('  GET  /api/v1/messer/:id');
  console.log('  GET  /api/v1/messer/:id/full');
  console.log('  GET  /api/v1/messer/:id/changes?since=...');
  console.log('  PUT  /api/v1/stande/:id');
  console.log('  PUT  /api/v1/taxonomier/:id');
  console.log('');
  console.log(`Test messe ID: ${messe.id}`);
  console.log('All requests require X-API-Key header.');
  console.log('');
});
