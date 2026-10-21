const crypto = require('crypto');

const EXAM_TYPES = ['ATL', 'Mastery Test', 'Jahresprüfung'];

const HFWI_MODULES = [
  { code: 'AGMP', name: 'Agile Methodik', lektionen: 20 },
  { code: 'APPL', name: 'Applications-Engineering', lektionen: 32 },
  { code: 'AUFK', name: 'Auftrittskompetenz', lektionen: 16 },
  { code: 'BDAI', name: 'Big Data und Artificial Intelligence', lektionen: 32 },
  { code: 'BITD', name: 'Business- und ICT-Development', lektionen: 40 },
  { code: 'CHMG', name: 'Changemanagement', lektionen: 28 },
  { code: 'DSRE', name: 'Datenschutz', lektionen: 16 },
  { code: 'INOM', name: 'Innovationsmanagement', lektionen: 48 },
  { code: 'INWI', name: 'Informations- und Wissensmanagement', lektionen: 40 },
  { code: 'SECM', name: 'ICT-Security-Management', lektionen: 40 },
  { code: 'DA', name: 'Diplomarbeit', lektionen: 8 },
];

const LEGACY_MODULE_MAP = {
  'Modul 042': 'APPL',
  '042': 'APPL',
  APPL: 'APPL',
  'Applications Engineering': 'APPL',
};

function mapLegacyModuleCode(code) {
  if (!code) return null;
  const trimmed = String(code).trim();
  if (LEGACY_MODULE_MAP[trimmed]) return LEGACY_MODULE_MAP[trimmed];
  const byCode = HFWI_MODULES.find((m) => m.code === trimmed);
  if (byCode) return byCode.code;
  return trimmed;
}

function randomAlias() {
  return `Student #${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

function isCatalogModule(code) {
  return HFWI_MODULES.some((m) => m.code === code);
}

module.exports = {
  EXAM_TYPES,
  HFWI_MODULES,
  mapLegacyModuleCode,
  randomAlias,
  isCatalogModule,
};
