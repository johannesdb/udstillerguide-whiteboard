// UG Plugin - Mock messe-data for demo/development
// Simulerer data der normalt ville komme fra UG Core REST API

export const MOCK_MESSE = {
    id: 'messe-001',
    navn: 'FoodExpo 2026',
    dato: '2026-09-15',
    lokation: 'Bella Center, København',
};

export const MOCK_HALLER = [
    {
        id: 'hal-a',
        navn: 'Hal A',
        messeId: 'messe-001',
        bredde: 600,
        hoejde: 400,
        farve: '#2196F3',
    },
    {
        id: 'hal-b',
        navn: 'Hal B',
        messeId: 'messe-001',
        bredde: 500,
        hoejde: 350,
        farve: '#FF9800',
    },
];

// Status: bekraeftet, afventer, annulleret, ledig
export const MOCK_STANDE = [
    { id: 'stand-a01', standnummer: 'A01', halId: 'hal-a', udstillerId: 'udst-001', status: 'bekraeftet', bredde: 120, hoejde: 80 },
    { id: 'stand-a02', standnummer: 'A02', halId: 'hal-a', udstillerId: null, status: 'ledig', bredde: 120, hoejde: 80 },
    { id: 'stand-a03', standnummer: 'A03', halId: 'hal-a', udstillerId: 'udst-002', status: 'bekraeftet', bredde: 100, hoejde: 80 },
    { id: 'stand-a04', standnummer: 'A04', halId: 'hal-a', udstillerId: 'udst-003', status: 'afventer', bredde: 140, hoejde: 80 },
    { id: 'stand-a05', standnummer: 'A05', halId: 'hal-a', udstillerId: null, status: 'ledig', bredde: 120, hoejde: 80 },
    { id: 'stand-b01', standnummer: 'B01', halId: 'hal-b', udstillerId: 'udst-004', status: 'bekraeftet', bredde: 130, hoejde: 80 },
    { id: 'stand-b02', standnummer: 'B02', halId: 'hal-b', udstillerId: 'udst-005', status: 'annulleret', bredde: 120, hoejde: 80 },
    { id: 'stand-b03', standnummer: 'B03', halId: 'hal-b', udstillerId: null, status: 'ledig', bredde: 110, hoejde: 80 },
];

export const MOCK_UDSTILLERE = [
    { id: 'udst-001', firmanavn: 'Nordic Foods A/S', kontakt: 'Anna Jensen', email: 'anna@nordicfoods.dk', moduler: 2 },
    { id: 'udst-002', firmanavn: 'GreenBite ApS', kontakt: 'Lars Nielsen', email: 'lars@greenbite.dk', moduler: 1 },
    { id: 'udst-003', firmanavn: 'ScandiDrinks', kontakt: 'Maria Petersen', email: 'maria@scandidrinks.dk', moduler: 3 },
    { id: 'udst-004', firmanavn: 'FreshFarm Ltd', kontakt: 'Erik Holm', email: 'erik@freshfarm.dk', moduler: 2 },
    { id: 'udst-005', firmanavn: 'TasteWave', kontakt: 'Sofie Berg', email: 'sofie@tastewave.dk', moduler: 1 },
];

export const MOCK_TAXONOMIER = [
    { id: 'tax-prog', navn: 'Program', type: 'kategori', parent: null, children: ['tax-sem', 'tax-work'] },
    { id: 'tax-sem', navn: 'Seminarer', type: 'underkategori', parent: 'tax-prog', children: [] },
    { id: 'tax-work', navn: 'Workshops', type: 'underkategori', parent: 'tax-prog', children: [] },
    { id: 'tax-kat', navn: 'Kategorier', type: 'kategori', parent: null, children: ['tax-food', 'tax-drink', 'tax-tech'] },
    { id: 'tax-food', navn: 'Food', type: 'underkategori', parent: 'tax-kat', children: [] },
    { id: 'tax-drink', navn: 'Drikkevarer', type: 'underkategori', parent: 'tax-kat', children: [] },
    { id: 'tax-tech', navn: 'FoodTech', type: 'underkategori', parent: 'tax-kat', children: [] },
];

// Farver baseret på stand-status
export const STATUS_FARVER = {
    bekraeftet: '#4CAF50',
    afventer:   '#FF9800',
    annulleret: '#f44336',
    ledig:      '#9E9E9E',
};

// Hjælpefunktioner til opslag
export function getUdstiller(id) {
    return MOCK_UDSTILLERE.find(u => u.id === id) || null;
}

export function getStandeForHal(halId) {
    return MOCK_STANDE.filter(s => s.halId === halId);
}

export function getStatusTaelling() {
    const counts = { bekraeftet: 0, afventer: 0, annulleret: 0, ledig: 0 };
    for (const stand of MOCK_STANDE) {
        counts[stand.status]++;
    }
    return counts;
}
