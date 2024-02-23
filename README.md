# How to generate shipping zones!

### To generate Fedex zone mappings:

1. Download zone mapping pdf from [the Fedex website](https://www.fedex.com/ratetools/RateToolsMain.do).
2. Save the pdf into `fedex/fedex-zones-pdf`, following the existing naming convention.
3. Open a terminal and navigate to `dors-shipping-zone-mapper/fedex`.
4. Convert the PDF to TSV using `node convert_pdfs_to_tsvs.mjs`.
5. Convert the TSVs to the Fedex zone mapping tree using `node convert_fedex_zones.mjs`.
6. Check the git diff of `fedex.json` to ensure the file generated correctly
7. Replace existing `fedex.json` file in DORS (`dynamic-fulfillment-router/app/src/staticdata/carrierzone`) with the newly generated tree.

### To generate USPS and UPS - MI zone mappings:

1. Add the new zip3 to gimme.sh (zip3 uses the first 3 digits of a typical 5 digit zip code).
2. Open a terminal and navigate to `dors-shipping-zone-mapper/usps`.
3. Run `sh gimme.sh` to download data to `/usps-zones-json`.
4. Convert zone jsons to tree using `node convert_usps_zones.mjs`.
5. Check the git diff of `usps.json` and `usps-upsmi-overlay.json` to ensure the file generated correctly.
6. Replace existing `usps.json` and `usps-upsmi-overlay.json` file in DORS (`dynamic-fulfillment-router/app/src/staticdata/carrierzone`) with the newly generated trees.