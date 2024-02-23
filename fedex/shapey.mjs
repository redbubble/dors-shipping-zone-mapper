// pdftotext -tsv -nopgbrk 85000-85099.fedex.pdf 85000-85099.fedex.tsv

import fs from "node:fs";
import readline from "node:readline";

export const shapey = async (fileName) => {

  async function *iterateTsvFile(f) {
    const fileStream = fs.createReadStream(f);
    try {
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      const iter = rl[Symbol.asyncIterator]()
      const hdrLine = await iter.next();
      if (!hdrLine.value.trim()) throw new Error();
      const hdr = hdrLine.value.split("\t");

      for await (let line of iter) {
        line = line.trim()
        if (!line) continue;
        const vals = line.split("\t")
        if (vals.length != hdr.length) throw new Error();

        yield Object.fromEntries(hdr.map((v, i) => [v, vals[i]]));
      }
    } finally {
      fileStream.destroy()
    }
  }

  const items = [];
  for await (const row of iterateTsvFile(fileName)) {
    items.push({
      type: 'item',
      level: Number(row.level),
      pageNum: Number(row.page_num),
      firstPageNum: Number(row.page_num),
      lastPageNum: Number(row.page_num),
      parNum: Number(row.par_num),
      blockNum: Number(row.block_num),
      lineNum: Number(row.line_num),
      wordNum: Number(row.word_num),
      left: Number(row.left),
      top: Number(row.top),
      bottom: Number(row.top) + Number(row.height),
      right: Number(row.left) + Number(row.width),
      width: Number(row.width),
      height: Number(row.height),
      conf: row.conf,
      text: row.text,
    });
  }

  function findByText(items, match) {
    for (const item of items) {
      if (item.text.match(match)) return item;
    }
    return null
  }

  function findAllByText(items, match) {
    const out = []
    for (const item of items) {
      if (item.text.match(match)) out.push(item);
    }
    return out
  }

  function findFirstLineByText(lines, match) {
    if (!lines.length) return;
    if (lines[0].type === 'item') lines = byLine(lines);

    for (const line of lines.lines) {
      if (line.text.match(match)) return line.items;
    }
    return null;
  }

  function findAllLinesByText(lines, match) {
    if (!lines.length) return;
    if (lines[0].type === 'item') lines = byLine(lines);
    const out = []
    for (const line of lines.lines) {
      if (line.text.match(match)) out.push(line.items);
    }
    return out;
  }

  function findOuterBbox(itemsOrBbox) {
    let items = itemsOrBbox;

    if (!Array.isArray(items)) items = [items]; 
    if (items.length === 0) return null;

    let top = 0;
    let bottom = 0;
    let left = 0;
    let right = 0;
    let firstPageNum = 0;
    let lastPageNum = 0;

    let first = true;
    for (const item of items.flatMap(v => v)) {
      if (first) {
        top = item.top;
        bottom = item.top + item.height;
        left = item.left;
        right = item.left + item.width;
        firstPageNum = item.firstPageNum;
        lastPageNum = item.lastPageNum;
        first = false;
      } else {
        if (item.top < top) top = item.top;
        if (item.left < left) left = item.left;
        const nextBottom = item.top + item.height;
        if (nextBottom > bottom) bottom = nextBottom;
        const nextRight = item.left + item.width
        if (nextRight > right) right = nextRight;
        if (item.firstPageNum < firstPageNum) firstPageNum = item.firstPageNum;
        if (item.lastPageNum > lastPageNum) lastPageNum = item.lastPageNum;
      }
    }

    if (firstPageNum === undefined) {
      throw new Error();
    }

    return { 
      type: 'bbox',
      top,
      bottom,
      left,
      right,
      width: right - left,
      height: bottom - top,
      firstPageNum,
      lastPageNum,
    };
  }

  function updateBbox(itemsOrBbox, update) {
    const bbox = findOuterBbox(itemsOrBbox)
    const updated = { ...bbox, ...update };
    updated.width = updated.right - updated.left;
    updated.height = updated.bottom - updated.top;
    return updated
  }

  function findFullyWithin(items, itemsOrBbox) {
    const out = [];
    const bbox = findOuterBbox(itemsOrBbox)
    for (const item of items) {
      if (item.left < bbox.left) continue;
      if (item.left + item.width > bbox.right) continue;
      if (item.top < bbox.top) continue;
      if (item.top + item.height > bbox.bottom) continue;
      out.push(item);
    }
    return out;
  }

  function findBelow(items, belowItem) {
    const bbox = findOuterBbox(belowItem);
    const out = [];
    for (const item of items) {
      if (item.pageNum < bbox.lastPageNum) continue;
      if (item.pageNum === bbox.lastPageNum && item.top < bbox.bottom) continue;
      out.push(item);
    }
    return out;
  }

  function findLowest(items) {
    let lowestBottom = 0;
    let out = null;
    for (const item of items) {
      const bottom = item.top + item.height;
      if (bottom > lowestBottom) {
        lowestBottom = bottom;
        out = item;
      }
    }
    return out;
  }

  function findAbove(items, aboveItem) {
    const bbox = findOuterBbox(aboveItem);
    const out = [];
    for (const item of items) {
      if (item.pageNum > bbox.firstPageNum) continue;
      if (item.pageNum === bbox.firstPageNum && (item.top+item.height) < bbox.top) continue;
      out.push(item);
    }
    return out;
  }

  function byPar(items) {
    const pars = {}
    for (const item of items) {
      const idx =
        `${(item.pageNum+'').padStart(12, '0')}` + `/` +
        `${(item.parNum+'').padStart(12, '0')}`
      if (!(idx in pars)) pars[idx] = [];
      pars[idx].push(item)
    }
    const out = Object.entries(pars)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(v => {
        const items = v[1];
        return {
          text: printableItems(items).join(" "),
          items,
        }
      })
    return { type: 'parindex', pars: out };
  }

  function byBlock(items) {
    const blocks = {}
    for (const item of items) {
      const idx =
        `${(item.pageNum+'').padStart(12, '0')}` + `/` +
        `${(item.parNum+'').padStart(12, '0')}` + `/` +
        `${(item.blockNum+'').padStart(12, '0')}`
      if (!(idx in blocks)) blocks[idx] = [];
      blocks[idx].push(item)
    }
    const out = Object.entries(blocks)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(v => {
        const items = v[1];
        return {
          text: printableItems(items).join(" "),
          items,
        }
      })
    return { type: 'blockindex', blocks: out };
  }

  function byLine(items) {
    const lines = {}
    for (const item of items) {
      const idx =
        `${(item.pageNum+'').padStart(12, '0')}` + `/` +
        `${(item.parNum+'').padStart(12, '0')}` + `/` +
        `${(item.blockNum+'').padStart(12, '0')}` + `/` +
        `${(item.lineNum+'').padStart(12, '0')}`
      if (!(idx in lines)) lines[idx] = [];
      lines[idx].push(item)
    }
    const out = Object.entries(lines)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(v => {
        const items = v[1];
        return {
          text: printableItems(items).join(" "),
          items,
        }
      })
    return { type: 'lineindex', lines: out };
  }

  function printableItems(items) {
    return items.map((v) => printableText(v)).filter(Boolean);
  }

  function printableText(item) {
    const text = item?.text ?? item;
    if (text === '###LINE###') return null;
    if (text === '###FLOW###') return null;
    return text;
  }

  function extractContiguousTableFromPars(pars) {
    const zipMatcher = /^[0-9]{5}(-[0-9]{5})?( [0-9]{5}(-[0-9]{5})?)*$/
    const zoneMatcher = /^([0-9]+|NA|\*)( ([0-9]+|NA|\*))*$/
    const junkMatcher = /(zone|estination|alaska|service guide|^1$)/i

    const mappings = [];

    let zip = null;
    for (const par of pars.pars) {
      if (par.text.match(junkMatcher)) continue;
      if (par.text.match(zipMatcher)) {
        if (zip) throw new Error();
        zip = printableItems(par.items);
      } else if (par.text.match(zoneMatcher)) {
        if (!zip) throw new Error();
        const zone = printableItems(par.items);
        if (zip.length != zone.length) throw new Error();

        for (const i in zip) {
          mappings.push({ zip: zip[i], zone: zone[i] });
        }

        zip = null;
      } else {
        throw new Error();
      }
    }

    return mappings;
  }

  function extractAlaskaTableFromPars(pars) {
    const zipMatcher = /^[0-9]{5}(-[0-9]{5})?( [0-9]{5}(-[0-9]{5})?)*$/
    const zoneMatcher = /^([0-9]+|NA|\*)( ([0-9]+|NA|\*))*$/
    const junkMatcher = /(zone|estination|alaska|service guide|^1$)/i

    const mappings = [];

    let zip = null;
    let zone1 = null;

    for (const par of pars.pars) {
      if (par.text.match(junkMatcher)) continue;
      if (par.text.match(zipMatcher)) {
        if (zip) throw new Error();
        zip = printableItems(par.items);

      } else if (par.text.match(zoneMatcher)) {
        if (!zip) throw new Error();
        if (zone1 === null) {
          zone1 = printableItems(par.items);
        } else {
          const zone2 = printableItems(par.items);
          if (zip.length != zone1.length) throw new Error();
          if (zip.length != zone2.length) throw new Error();

          for (const i in zip) {
            mappings.push({ zip: zip[i], expressZone: zone1[i], groundZone: zone2[i] });
          }

          zip = null;
          zone1 = null;
        }

      } else {
        throw new Error(par.text);
      }
    }

    return mappings;
  }

  const extent = findOuterBbox(items);
  const contiguous = findOuterBbox(findFirstLineByText(items, /Contiguous U\.S\./i))
  const alaska = findOuterBbox(findFirstLineByText(items, /Alaska, Hawaii/i))

  const firstTableSearchBox = updateBbox(
    findOuterBbox([contiguous, alaska]),
    { left: 0, right: extent.right },
  );

  const firstTable = findFullyWithin(items, firstTableSearchBox)
  const firstTablePars = byPar(firstTable);
  const contiguousTable = extractContiguousTableFromPars(firstTablePars);

  const belowAlaska = findBelow(items, alaska);
  const footer = findFirstLineByText(belowAlaska, /FedEx reserves the right/i);
  const secondTableSearchBox = updateBbox(
    findOuterBbox([alaska, footer]),
    { left: 0, right: extent.right },
  );

  const secondTable = findFullyWithin(items, secondTableSearchBox)
  const secondTablePars = byPar(secondTable);
  const alaskaTable = extractAlaskaTableFromPars(secondTablePars);

  return ({
    contiguous: contiguousTable,
    alaska: alaskaTable,
  })

}