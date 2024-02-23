// Uses our new zone trees to build the intermediate data needed to update the
// old carrier_service_zone_map table that we are trying to deprecate, in
// jsonl format so it can be a bit more useful.
//
// The output of this can be fed to ../oldmapjson2sql.mjs to get SQL queries.
//
// See also the equivalent script in fedex/
//
// This is a stop-gap.

import fs from "node:fs";
import { makeDbPool } from "../utils.mjs"

const uspsTree = JSON.parse(fs.readFileSync("./uspsZoneMapping.json", "utf8"));

const upsMiZone9DestinationZip3 = new Set(['967', '968', '995', '996', '997', '998', '999']);

const zip3WithinZip5Range = (zip3, min, max) => {
  return (min.localeCompare(zip3+"00") <= 0 &&
    max.localeCompare(zip3+"00") >= 0);
}

const findOriginByZip3 = (tree, originZip3) => {
  return tree.origins.find((v) => {
    return zip3WithinZip5Range(originZip3, v.originMin, v.originMax);
  });
}

const dbPool = makeDbPool();

async function *buildMappings(db, zip3s, withUpsOverlay) {
  for (const zip3 of zip3s) {
    if (!zip3.match(/^[0-9]{3}$/)) throw new Error("oi! that is not a zip3!")
    
    const origin = findOriginByZip3(uspsTree, zip3);

    const startOriginZip3 = origin.originMin.slice(0, 3);
    const lastOriginZip3 = origin.originMax.slice(0, 3);
    for (
      let currentNumericOriginZip3 = Number(startOriginZip3);
      currentNumericOriginZip3 <= Number(lastOriginZip3);
      currentNumericOriginZip3++
    ) {
      for (const dest of origin.destinations) {
        const startDestZip3 = dest.destMin.slice(0, 3);
        const lastDestZip3 = dest.destMax.slice(0, 3);

        for (
          let currentNumericDestZip3 = Number(startDestZip3);
          currentNumericDestZip3 <= Number(lastDestZip3);
          currentNumericDestZip3++
        ) {
          const currentDestZip3 = currentNumericDestZip3.toString().padStart(3, '0');
          const zoneId = (withUpsOverlay && upsMiZone9DestinationZip3.has(currentDestZip3)) ? 9 : dest.zoneId;
          const zoneKey = (withUpsOverlay ? 'ups/' : 'usps/')+zoneId;
          const result = await db.query(
            "SELECT * FROM carrier_service_zone WHERE carrier_zone_key = $1",
            [zoneKey],
          );

          for (const carrierServiceZoneRow of result.rows) {
            const mapping = {
              "carrier_service_zone_id": carrierServiceZoneRow["carrier_service_zone_id"],
              "is_us_mapping": true,
              "origin_zip3": currentNumericOriginZip3.toString().padStart(3, '0'),
              "destination_zip3": currentDestZip3,
              "origin_country": "UNITED STATES",
              "destination_country": "UNITED STATES",
              "is_active": true,
              "_shipping_zone_name": carrierServiceZoneRow['shipping_zone_name'],
              "_tree_zone": zoneKey,
            }
            yield mapping;
          }
        }
      }
    }
  }
}

async function main() {
  const cmd = process.argv[2];

  const zip3s = process.argv.slice(3);
  const db = await dbPool.connect();

  try {
    if (cmd === "dump") {
      for await (const mapping of buildMappings(db, zip3s, !'withUpsOverlay')) {
        console.log(JSON.stringify(mapping));
      }
      for await (const mapping of buildMappings(db, zip3s, !!'withUpsOverlay')) {
        console.log(JSON.stringify(mapping));
      }
    } else {
      throw new Error("not a command")
    }
    //
  } catch (e) {
    console.error(e.stack);
    process.exitCode = 2;
  } finally {
    db.release();
  }
}

main();
