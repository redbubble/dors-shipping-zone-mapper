export function checkTree(tree) {
  for (const origin of tree.origins) {
    // Check for overlap of destinations
    const invalidData = []

    for (let i = 0; i < origin.destinations.length - 1; i++) {
      const prevMax = origin.destinations[i].destMax;
      const nextMin = origin.destinations[i+1].destMin;
      if (Number(prevMax) >= Number(nextMin)) {
        invalidData.push({ type: 'destination-overlap', prevMax, nextMin })
      }
    }

    if (invalidData.length) {
      throw new Error(
        `Error! There is overlapping data in the zone mapping, take a closer look at this destination: `+
        JSON.stringify(invalidData));
    }
  }

  // Check for overlap of origins
  const invalidData = []

  for (let i = 0; i < tree.origins.length - 1; i++) {
    const prevMax = tree.origins[i].originMax;
    const nextMin = tree.origins[i+1].originMin;
    if (Number(prevMax) >= Number(nextMin)) {
      invalidData.push({ type: 'origin-overlap', prevMax, nextMin })
    }
  }

  if (invalidData.length) {
    throw new Error(
      `Error! There is overlapping data in the zone mapping, take a closer look at this Origin: `+
      JSON.stringify(invalidData));
  }
}
