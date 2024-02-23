import { parseArgs } from "util";

class CivilDate {
  constructor(y, m, d) {
    if (!(y >=0 && y <= 9999)) throw new Error("year must be between 0 and 9999");
    if (!(m >=1 && m <= 12)) throw new Error("month must be between 1 and 12");
    if (!(d >=1 && d <= 31)) throw new Error("day must be between 1 and 31");
    this.y = y;
    this.m = m;
    this.d = d;
  }
  toObject() {
    return { y: this.y, m: this.m, d: this.d };
  }
  static parse(raw) {
    const groups = raw.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/);
    if (!groups) throw new Error("date ${raw} must be in format YYYY-MM-DD");
    return new CivilDate(Number(groups[1]), Number(groups[2]), Number(groups[3]));
  }
  static today() {
    const now = new Date();
    return new CivilDate(now.getFullYear(), now.getMonth()+1, now.getDate());
  }
}

async function downloadRawTable(zip, date) {
  if (typeof zip !== 'string' || zip.length < 5) {
    throw new Error("zip must be a 5-character or greater string, none of this zip3 stuff please");
  }
  if (!(date instanceof CivilDate)) throw new Error("date must be a CivilDate");

  const zip3 = zip.slice(0, 3);
  const originMin = zip3 + "00";
  const originMax = zip3 + "99";

  const input = {
    "zipCode3Digit": zip3,
    "shippingDate": (date.m)+"/"+(date.d)+"/"+(date.y), // US-format
  };
  const qs = new URLSearchParams({
    ...input,
    "_": Date.now().toString(),
  });

  const url = "https://postcalc.usps.com/DomesticZoneChart/GetZoneChart?"+qs;
  const rs = await fetch(
    url,
    {
      "credentials": "include",
      "headers": {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/115.0",
          "Accept": "application/json, text/javascript, */*; q=0.01",
          "Accept-Language": "en-US,en;q=0.5",
          "X-Requested-With": "XMLHttpRequest",
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "same-origin",
          "Pragma": "no-cache",
          "Cache-Control": "no-cache"
      },
      "referrer": "https://postcalc.usps.com/domesticzonechart",
      "method": "GET",
      "mode": "cors"
  });
  if (rs.status !== 200) {
    const txt = await rs.text().catch(() => null);
    throw new Error(`usps request to ${url} failed with status ${rs.status}: ${txt}`);
  }

  const data = await rs.json();
  for (const k of Object.keys(data)) {
    if (k.toLowerCase().endsWith("error")) {
      if (data[k]) {
        throw new Error(`usps request to ${url} failed with error ${data[k]}`);
      } else {
        delete data[k];
      }
    }
  }

  return {
    input,
    url,
    originMin,
    originMax,
    date: date.toObject(),
    raw: data,
  };
}

function processRawTable(rawTable) {
  const { originMin, originMax, date, input, url } = rawTable;

  const raw = { ...rawTable.raw };

  const zip3s = [];
  for (const k of Object.keys(raw)) {
    if (k.toLowerCase().endsWith("error")) {
      if (raw[k]) {
        throw new Error(`usps request to ${url} failed with error ${raw[k]}`);
      } else {
        delete raw[k];
      }
      //
    } else if (k.toLowerCase().startsWith("column")) {
      zip3s.push(...raw[k]);
      delete raw[k];
    }
  }

  if (!('EffectiveDate' in raw)) throw new Error('effective date not found');
  const effectiveDateRaw = raw['EffectiveDate'];
  delete raw['EffectiveDate'];

  if (!('Zip5Digit' in raw)) throw new Error('Zip5Digit not found');
  const zip5s = raw['Zip5Digit'];
  delete raw['Zip5Digit'];

  if (Object.keys(raw).length) {
    throw new Error("unclaimed keys:\n"+JSON.stringify(raw, null, 2));
  }

  return {
    input,
    url,
    originMin,
    originMax,
    requestedDate: date,
    effectiveDateRaw,
    zip3s,
    zip5s,
  };
}

const args = parseArgs({
  strict: true,
  options: {
    zip: { type: 'string' },
    date: { type: 'string' },
  },
});

const rawTable = await downloadRawTable(
  args.values.zip || '',
  args.values.date ? CivilDate.parse(args.values.date) : CivilDate.today(),
);

const data = processRawTable(rawTable);

console.log(JSON.stringify(data, null, 2));
