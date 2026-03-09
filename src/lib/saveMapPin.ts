import { supabase } from "@/integrations/supabase/client";

/**
 * Geocode an address via the server-side Maps proxy, fetch a static map image
 * through the same proxy (so the API key is never exposed to the browser),
 * draw a text overlay, and upload it to the job's submissions folder.
 * Runs fire-and-forget — callers don't need to await.
 */
export async function saveMapPinForJob({
  jobId,
  address,
  refNumber,
  customerName,
  userId,
}: {
  jobId: string;
  address: string;
  refNumber: string;
  customerName: string;
  userId: string;
}) {
  try {
    // 1. Geocode the address via server-side proxy (no API key in browser)
    const { data: geoData, error: geoErr } = await supabase.functions.invoke("get-maps-key", {
      body: { address },
    });
    if (geoErr || !geoData) return;
    const loc = geoData.results?.[0]?.geometry?.location;
    if (!loc) return;

    const { lat, lng } = loc;

    // 2. Fetch static map via server-side proxy (API key stays on the server)
    const staticmapQs = `center=${lat},${lng}&zoom=15&size=600x400&scale=2&markers=color:red%7C${lat},${lng}`;
    const { data: imgData, error: imgErr } = await supabase.functions.invoke("get-maps-key", {
      body: { staticmap: staticmapQs },
    });
    if (imgErr || !imgData) return;

    // The edge function returns an ArrayBuffer for binary responses
    const imgBlob = imgData instanceof Blob ? imgData : new Blob([imgData], { type: "image/png" });

    // 3. Draw text overlay on canvas
    const finalBlob: Blob = await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      const bitmapUrl = URL.createObjectURL(imgBlob);
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);

        // Semi-transparent banner
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(0, 0, canvas.width, 64);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 28px system-ui, sans-serif";
        ctx.textBaseline = "middle";
        const label = [refNumber, customerName].filter(Boolean).join(" — ");
        ctx.fillText(label, 16, 32, canvas.width - 32);

        URL.revokeObjectURL(bitmapUrl);
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
          "image/png"
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(bitmapUrl);
        reject(new Error("Image load failed"));
      };
      img.src = bitmapUrl;
    });

    // 4. Upload to storage
    const fileName = `map-pin-${Date.now()}.png`;
    const filePath = `${jobId}/${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from("submissions")
      .upload(filePath, finalBlob, { contentType: "image/png" });
    if (uploadError) return;

    // 5. Create submission record
    const { data: urlData } = supabase.storage.from("submissions").getPublicUrl(filePath);
    await supabase.from("submissions").insert({
      job_id: jobId,
      engineer_id: userId,
      type: "photo",
      file_url: urlData.publicUrl,
      file_name: fileName,
      content: `Map pin — ${address}`,
    });
  } catch {
    // Silently fail — map pin is a nice-to-have
  }
}
