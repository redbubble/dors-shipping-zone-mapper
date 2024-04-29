# How to generate shipping zones!

### Requirements
Requires `pdftotext`. You can get that by installing `poppler`: `brew install poppler`

### To generate Fedex zone mappings:

1. Download zone mapping pdf from [the Fedex website](https://www.fedex.com/ratetools/RateToolsMain.do).
1. Save the pdf into `fedex/fedex-zones-pdf`, following the existing naming convention.
1. Add and commit the new PDF using `git`
1. Open a terminal and navigate to `dors-shipping-zone-mapper/fedex`.
1. Convert the PDF to TSV using `node convert_pdfs_to_tsvs.mjs`.
1. Convert the TSVs to the Fedex zone mapping tree using `node convert_fedex_zones.mjs`.
1. Check the git diff of `fedex.json` to ensure the file generated correctly
1. Replace existing `fedex.json` file in DORS (`dynamic-fulfillment-router/app/src/staticdata/carrierzone`) with the newly generated tree.

### To generate USPS and UPS - MI zone mappings:

1. Add the new zip3 to gimme.sh (zip3 uses the first 3 digits of a typical 5 digit zip code).
1. Open a terminal and navigate to `dors-shipping-zone-mapper/usps`.
1. Run `sh gimme.sh` to download data to `/usps-zones-json`.
1. Convert zone jsons to tree using `node convert_usps_zones.mjs`.
1. Check the git diff of `usps.json` and `usps-upsmi-overlay.json` to ensure the file generated correctly.
1. Replace existing `usps.json` and `usps-upsmi-overlay.json` file in DORS (`dynamic-fulfillment-router/app/src/staticdata/carrierzone`) with the newly generated trees.