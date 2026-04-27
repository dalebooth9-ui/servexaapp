# Swap accreditation row and declaration box on Dry Riser blank template

On the Dry Riser blank template the BS-9990 declaration box currently sits in the middle, with the accreditation logos below it at the page bottom. Swap them so the **declaration box is flush at the bottom** and the **accreditation logos sit in the gap directly above it**.

No other templates change.

## Edit (single file)

`src/components/BlankTemplatePdfExport.tsx`

**1) Lines 347–354** — restore declY to the bottom margin:
```ts
const textH = lines.length * lineH;
const minDeclH = 9;
const declH = Math.max(minDeclH, textH + padY * 2);
// Declaration box sits flush at the bottom; accreditation logos go ABOVE it.
const declY = pageHeight - margin - declH;
```

**2) Lines 364–381** — place the accreditation row in the gap above the declaration box:
```ts
// Accreditation logos. On Dry Riser sheets they sit ABOVE the BS-9990
// declaration box (which is flush at the bottom). On other templates they
// go at the very bottom of the page below the watermark.
const logoH = 9;
const custAccredUrls = await fetchCustomerAccreditationLogos(customerName);
const [watermark, accredLogos] = await Promise.all([
  loadWatermarkImage(),
  loadAccreditationLogos(custAccredUrls),
]);
// addAccreditationLogosToAllPages renders the row at (footerY - logoH - 3).
const dryRiserDeclH = 9; // matches minDeclH
const dryRiserGap = 2;
const footerYForLogos = isDryRiser
  // Land logos in the gap directly above the declaration box.
  ? pageHeight - margin - dryRiserDeclH - dryRiserGap
  // Push non-Dry-Riser logos to the very bottom edge of the page.
  : pageHeight - 1;
```

## Result

```text
…content…
[ accreditation logos row ]
[ Tested and inspected in accordance with BS 9990:2015 ]   ← flush at bottom
```

Approve to apply.
