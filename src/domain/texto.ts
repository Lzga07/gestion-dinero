// Marcas combinables U+0300..U+036F: lo que queda de las tildes después de normalizar en NFD.
const MARCAS_COMBINADAS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g')

/** Texto apto para nombre de archivo: sin tildes, en minúsculas y con guiones ("Clínica Centro" → "clinica-centro"). */
export const slug = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(MARCAS_COMBINADAS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
