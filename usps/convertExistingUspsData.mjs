import fs from "node:fs";
import readline from "node:readline";

export const convertExistingUspsData = async () => {

  async function *iterateJsonlFile(f) {
    const fileStream = fs.createReadStream(f, { autoClose: true });
    const rl = readline.createInterface({
      input: fileStream, // Or process.stdin
      crlfDelay: Infinity
    });
    for await (const line of rl) {
      if (!line) continue;
      yield JSON.parse(line);
    }
  }

  let lastZoneId = null;
  let originZip3 = null;
  let destRangeStartZip3 = null;
  let destRangeLastZip3 = null;
  let records = 0;
  let lastCommitted = false;

  const zoneMapping = [];

  const commitRange = (record, zoneId) => {
    const existingOrigin = zoneMapping.find(zone => zone.originMin === originZip3+"00")
    if (existingOrigin) {
      existingOrigin.destinations?.push({
        destMin: destRangeStartZip3+"00",
        destMax: destRangeLastZip3+"99",
        zoneId: lastZoneId,
      })
    } else {
      zoneMapping.push({
        originMin: originZip3+"00",
        originMax: originZip3+"99",
        destinations: [
          {
            destMin: destRangeStartZip3+"00",
            destMax: destRangeLastZip3+"99",
            zoneId: lastZoneId,
          },
        ],
      })
    }
  }

  const originZip3s = new Set();

  for await (const record of iterateJsonlFile("./exisiting-usps-data.jsonl")) {
    const currentZoneKey = record['carrier_zone_key'];
    const currentZoneMatch = currentZoneKey.match(/^usps\/([0-9]+)$/)
    if (!currentZoneMatch) throw new Error();
    const currentZoneId = Number(currentZoneMatch[1]);

    // FIXME: only coalesce ranges if the numbers are sequential
    if (lastZoneId != currentZoneId) {
      if (lastZoneId) {
        commitRange();
      }
      lastCommitted = false;
      originZip3 = record['origin_zip3'];
      originZip3s.add(originZip3);
      destRangeStartZip3 = record['destination_zip3'];
      records = 1;
    }

    lastZoneId = currentZoneId
    destRangeLastZip3 = record['destination_zip3'];
    records++;
  }

  if (lastZoneId) {
    commitRange();
  }

  return { originZip3s, zoneMapping }
}
