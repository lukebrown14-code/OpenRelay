# Task: Add a required locale to rendered receipts

Receipt totals now need a locale so the web and email views format currency correctly. Update the shared receipt formatter API and all live callers. en-US uses $1,234.50; de-DE uses 1.234,50 €. The email view must still include customer and order ID. A legacy preview exists but is no longer called. Do not edit verify.js. Run node verify.js.
