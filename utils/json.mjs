// The default way JSON.stringify pretty-formats the shipping zone trees
// makes them close to useless. This output format is a bit easier on
// the eyes (and shrinks them to about half the size they were):
export function stringifyJSONTreeLessCrappily(tree) {
  // Well, less crappily externally at least.
  const s = (v) => JSON.stringify(v);
  const out = [];
  out.push("{\n");
  out.push(`\t${s("//")}: ${s(tree['//'])},\n`);
  out.push(`\t${s("type")}: ${s(tree.type)},\n`);
  out.push(`\t${s("buildDate")}: ${s(tree.buildDate)},\n`);
  out.push(`\t${s("origins")}: [\n`);
  for (const originIdx in tree.origins) {
    const origin = tree.origins[originIdx];
    const comma = originIdx < tree.origins.length - 1 ? ',' : '';
    out.push(`\t\t{`)
    out.push(`"originMin": ${s(origin.originMin)}, `);
    out.push(`"originMax": ${s(origin.originMax)}, `);
    if (origin.provenance) {
      out.push(`"provenance": ${s(origin.provenance)}, `);
    }
    out.push(`"destinations": [\n`);
    for (const destIdx in origin.destinations) {
      const dest = origin.destinations[destIdx];
      const comma = destIdx < origin.destinations.length - 1 ? ',' : '';
      out.push(`\t\t\t{`)
      out.push(  `"destMin": ${s(dest.destMin)}`);
      out.push(`, "destMax": ${s(dest.destMax)}`);
      if (dest.type) {
        out.push(`, "type": ${s(dest.type)}`);
      }
      for (const key in dest) {
        if (key === "destMin" || key === "destMax" || key === "type") continue;
        out.push(`, ${s(key)}: ${s(dest[key])}`);
      }
      out.push(`}${comma}\n`);
    }
    out.push(`\t\t]}${comma}\n`);
  }
  out.push(`\t],\n`);
  out.push(`\t${s("provenance")}: ${indent(JSON.stringify(tree.provenance, null, '\t'), 1)}\n`);
  out.push("}\n");

  return out.join('');
}

const indent = (s, level) => {
  return s.trim().replaceAll(/\n/g, "\n"+"\t".repeat(level));
}
