import fs from 'node:fs'
import { stringifyJSONTreeLessCrappily } from '../utils/json.mjs'
import { convertExistingUspsData } from "./convertExistingUspsData.mjs"
import { checkTree } from "../utils/tree.mjs"

const explodeIfPropertyUndefined = (name, target) => {
  return new Proxy(Object.freeze(target), {
    get: function (target, property) {
      if (!(property in target)) throw new Error(`undefined property ${property} for ${name}`);
      return target[property];
    },
  });
};

// The USPS downloader only lets us specify a single zip3, and it doesn't tell
// us what the applicable origin range is, we just have to presume, for say,
// zip3 912, that the range is 91200-91299.
//
// Here, we sort each of the source files we loaded by the origin min zip, then
// see if the zip3 and zip5 tables that come back are identical for runs of
// origin mins. If they're the same, we collapse them into one source.
//
// NOTE(bw): As at 20230809, we don't use this routine, as I couldn't find any
// instance where two adjacent files would actually be merged after all. I suspect
// the tables are generated automatically using distance calculations, and that all
// 1,000 tables will be distinct. But let's hang on to this anyway.
function mergeOrigins(allSources) {
  const hashZips = (source) => {
    const zip3s = [...source.zip3s]
      .map(v => explodeIfPropertyUndefined('zip3', v))
      .map(v => `${v.ZipCodes}|${v.Zone}`)
      .sort();
    const zip5s = [...source.zip5s]
      .map(v => explodeIfPropertyUndefined('zip3', v))
      .map(v => `${v.ZipCodes}|${v.Zone}`)
      .sort();
    return zip3s + "|" + zip5s;
  };

  allSources = [...allSources].sort((a, b) => a.originMin.localeCompare(b.originMin))

  let lastSource = null;
  const sources = [];

  for (const source of allSources) {
    if (!('zip3s' in source) || !('zip5s' in source)) {
      throw new Error();
    }

    if (!lastSource) {
      lastSource = source;
      continue;
    }

    let merge = false;

    // If the sources are adjacent
    if (Number(lastSource.originMax)+1 === Number(source.originMin)) {
      // And if the sources have the exact same zip3s and zip5s:
      if (hashZips(lastSource) === hashZips(source)) {
        // Then merge the sources
        merge = true;
      }
    }

    if (merge) {
      lastSource.originMax = source.originMax;
    } else {
      sources.push(lastSource);
      lastSource = source;
    }
  }

  if (lastSource) sources.push(lastSource);
}

const useExistingUpsData = false;
const uspsFiles = fs.readdirSync('./usps-zones-json/')
const sourcesByOriginMin = {};

for (const fileName of uspsFiles) {
  const sourceRaw = fs.readFileSync(`./usps-zones-json/${fileName}`, { encoding: 'utf8' })
  const source = JSON.parse(sourceRaw);
  if (source.originMin in sourcesByOriginMin) {
    throw new Error(`duplicate origin min ${source.originMin}`)
  }
  source.fileName = fileName;
  sourcesByOriginMin[source.originMin] = source;
}

// Don't bother merging. See mergeOrigins comments for more details:
// const sources = mergeOrigins(Object.values(sourcesByOriginMin));

const sources = Object.values(sourcesByOriginMin);

// console.log(sources.map(v => `${v.originMin}-${v.originMax}`));

// Either a range, or a single number. Bottom and top of range are separated
// by (probably) three hyphens, but we'll tolerate "2 or more".
const rangePattern = /^(?:([0-9]+)--+([0-9]+)|([0-9]+))$/

// A number, followed by '*', '+', or either combination of both.
const zonePattern = /^([0-9]+)(\+|\*|\+\*|\*\+)?$/

const { originZip3s: existingOriginZip3s, zoneMapping: existingOrigins } = await convertExistingUspsData();

const uspsOrigins = useExistingUpsData ? existingOrigins : [];

const provenanceDetails = {};

for (const source of sources) {
  const { originMin, originMax } = source;

  const provenance = source.fileName;
  const origin = { originMin, originMax, provenance, destinations: [] }
  provenanceDetails[provenance] = {
    url: source.url,
    effectiveDateRaw: source.effectiveDateRaw,
  };

  if (useExistingUpsData && existingOriginZip3s.has(originMin.slice(0, 3))) {
    continue;
  }

  for (const zip3Record of source.zip3s.map(v => explodeIfPropertyUndefined('zip3', v))) {
    const zone = zip3Record.Zone;
    const range = zip3Record.ZipCodes;
    if (zip3Record.MailService) throw new Error(`unexpected MailService for zip3 ${range}/${zone} `);

    const zoneMatch = zone.match(zonePattern);
    if (!zoneMatch) throw new Error(`invalid zone for zip3 ${range}/${zone} `);

    const rangeMatch = range.match(rangePattern);
    if (!rangeMatch) throw new Error(`invalid range for zip3 ${range}/${zone} `);

    const hasZip5 = (zoneMatch[2]??'').includes('*');

    // This is a bit cryptic. If the second form of rangePattern matches (single number,
    // rather than range), the third group will set and represent the 'start'.
    // If not, then the first group will be set as we are matching '123---456
    const startZip3 = rangeMatch[3] || rangeMatch[1];
    const endZip3 = rangeMatch[2] || startZip3;

    if (startZip3.length !== 3) throw new Error(`start ${startZip3} is not a zip3`);
    if (endZip3.length !== 3) throw new Error(`end ${endZip3} is not a zip3`);

    const zoneId = Number(zoneMatch[1]);
    if (!isFinite(zoneId) || isNaN(zoneId)) throw new Error();

    origin.destinations.push({
      destMin: startZip3.padEnd(5, '0'),
      destMax: endZip3.padEnd(5, '99'),
      zoneId,
    });
  }

  origin.destinations.sort((a, b) => Number(a.destMax) - Number(b.destMin))
  uspsOrigins.push(origin)
}

uspsOrigins.sort((a, b) => Number(a.originMax) - Number(b.originMin))


const buildDate = (new Date()).toISOString();

const uspsTree = {
  "//": "This is generated by scripts in the 20230721-zone-mapping-tools task in dors-shipping-zone-mapper. Do not edit by hand.",
  "type": "single-zone",
  "description": "USPS zone data",
  "buildDate": buildDate,
  "origins": uspsOrigins,
  "provenance": provenanceDetails,
};

// UPS-MI uses zone 9 for all these destination zip3s:
const upsMiZone9DestinationZip3 = ['967', '968', '995', '996', '997', '998', '999'];

const upsMiOrigins = [];
for (const uspsOrigin of uspsOrigins) {
  const { originMin, originMax } = uspsOrigin;
  const upsMiOrigin = { originMin, originMax, destinations: [] }
  for (const zip3 of upsMiZone9DestinationZip3) {
    upsMiOrigin.destinations.push({
      destMin: zip3+"00",
      destMax: zip3+"99",
      zoneId: 9,
    });
  }
  upsMiOrigin.destinations.sort((a, b) => Number(a.destMax) - Number(b.destMin))
  upsMiOrigins.push(upsMiOrigin);
}
upsMiOrigins.sort((a, b) => Number(a.originMax) - Number(b.originMin))

const upsMiOverlayTree = {
  "//": "This is generated by scripts in the 20230721-zone-mapping-tools task in dors-shipping-zone-mapper. Do not edit by hand.",
  "type": "single-zone",
  "description": "UPS-MI overlay for non-contiguous US zones. Intended to be used ahead of the USPS tree, with the USPS tree used when no match is found here.",
  "buildDate": buildDate,
  "origins": upsMiOrigins,
  "provenance": "These UPS overrides are manually handled in the convert_usps_zones.mjs ephemera script"
};

checkTree(uspsTree);
checkTree(upsMiOverlayTree);

fs.writeFileSync('usps.json', stringifyJSONTreeLessCrappily(uspsTree));
fs.writeFileSync('usps-upsmi-overlay.json', stringifyJSONTreeLessCrappily(upsMiOverlayTree));
