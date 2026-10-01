
- Live (non-scanned) report PDFs load signatures via authenticated storage download, wait for in-flight signature saves, and refuse to render (logging `signature_missing_on_pdf`) if a saved signature can't load — why: silent unsigned PDFs reached customers.
- The service-worker storage cache never stores opaque responses — why: opaque copies broke later CORS image loads in PDF generators.
- Before/after slots store durable storage references and link existing job photos without copying or deleting the source — why: slot changes must update reports immediately while preserving the job photo library.
