import { shapey } from './shapey.mjs'
import { stringifyJSONTreeLessCrappily } from '../utils/json.mjs'
import { checkTree } from "../utils/tree.mjs"
import fs from 'node:fs'

function mustParseInt(s) {
  if (!s.match(/^[0-9]+$/)) throw new Error(`'${s}' is not numeric`);
  return Number(s);
}

const fedexFiles = fs.readdirSync('./fedex-zones-tsv/')
const result = []

const provenanceDetails = {};

for (const fileName of fedexFiles) {
  if (!fileName.endsWith('.tsv')) continue;
  
  const nameWithoutFile = fileName.replace(/\.tsv$/, '')
  const metaFile = `./fedex-zones-tsv/${nameWithoutFile}.meta.json`;
  const metadata = JSON.parse(fs.readFileSync(metaFile, 'utf8'));

  console.log('Starting on: ' + fileName)
  const rows = await shapey('./fedex-zones-tsv/' + fileName)

  const { contiguous, alaska } = rows
  const origins = fileName.replace('.tsv', '').split('-')

  const provenance = nameWithoutFile+".pdf";
  const zone = { originMin: origins[0], originMax: origins[1], provenance }

  provenanceDetails[provenance] = metadata;

  const destinations = []
  for (const contiguousRow of contiguous) {
    if (contiguousRow.zone !== 'NA') {
      const zips = contiguousRow.zip.split('-')
      destinations.push({
        destMin: zips[0],
        destMax: zips[1],
        zoneId: mustParseInt(contiguousRow.zone),
        type: 'contiguous'
      })
    }
  }

  for (const alaskaRow of alaska) {
    const alaskaZip = alaskaRow.zip.split('-')
    const formattedAlaskaRow = {
      destMin: alaskaZip[0],
      destMax: alaskaZip.length > 1 ? alaskaZip[1] : alaskaZip[0],
      type: "non-contiguous",
      expressZoneId: null,
      groundZoneId: null,
    }
    let expressZoneValid = false
    let groundZoneValid = false
    if (alaskaRow.expressZone !== 'NA' && alaskaRow.expressZone !== '*') {
      formattedAlaskaRow.expressZoneId = mustParseInt(alaskaRow.expressZone);
      expressZoneValid = true
    }
    if (alaskaRow.groundZone !== 'NA' && alaskaRow.groundZone !== '*') {
      formattedAlaskaRow.groundZoneId = mustParseInt(alaskaRow.groundZone);
      groundZoneValid = true
    }
    if (expressZoneValid || groundZoneValid) {
      destinations.push(formattedAlaskaRow)
    }
  }

  destinations.sort((a, b) => a.destMin.localeCompare(b.destMin))
  zone.destinations = destinations
  result.push(zone)
  console.log('Finished up with file: ' + fileName)
}

result.sort((a, b) => a.originMin.localeCompare(b.originMin))

const tree = {
  "//": "This is generated by scripts in the 20230721-zone-mapping-tools task in dors-shipping-zone-mapper. Do not edit by hand.",
  "type": "fedex",
  "buildDate": (new Date()).toISOString(),
  "origins": result,
  "provenance": provenanceDetails,
}

checkTree(tree);

fs.writeFileSync('fedex.json', stringifyJSONTreeLessCrappily(tree));
