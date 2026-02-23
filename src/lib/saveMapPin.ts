import { supabase } from "@/integrations/supabase/client";

/**
 * Geocode an address via Google Maps Geocoding API, fetch a static map image
 * with a text overlay (ref number + customer), and upload it to the job's
 * submissions folder.  Runs fire-and-forget — callers don't need to await.
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
    // 1. Get API key
    const { data: keyData, error: keyErr } = await supabase.functions.invoke("get-maps-key");
    const apiKey = keyData?.apiKey;
    if (keyErr || !apiKey) return;

    // 2. Geocode the address
    const geoRes = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`
    );
    const geoJson = await geoRes.json();
    const loc = geoJson.results?.[0]?.geometry?.location;
    if (!loc) return;

    const { lat, lng } = loc;

    // 3. Fetch static map
    const staticUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=15&size=600x400&scale=2&markers=color:red%7C${lat},${lng}&key=${apiKey}`;
    const imgRes = await fetch(staticUrl);
    if (!imgRes.ok) return;
    const imgBlob = await imgRes.blob();

    // 4. Draw text overlay on canvas
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

    // 5. Upload to storage
    const fileName = `map-pin-${Date.now()}.png`;
    const filePath = `${jobId}/${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from("submissions")
      .upload(filePath, finalBlob, { contentType: "image/png" });
    if (uploadError) return;

    // 6. Create submission record
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
