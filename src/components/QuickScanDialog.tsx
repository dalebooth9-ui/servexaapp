import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Camera, Loader2, ScanLine, Trash2, Upload, Plus, Copy, Check, Video, VideoOff, Aperture, Download, Printer, Pencil, Save } from "lucide-react";
import { generateJobSheetPdf } from "@/components/JobSheetPdfExport";
import { fuzzyMatchEngineer } from "@/lib/fuzzyEngineerMatch";
import { cropSignatureFromScanSource } from "@/lib/signatureCrop";
import { useNavigate } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { applyExposedOutletOverrides } from "@/lib/ocrResultNormalization";

interface TemplateField {
  id: string;
  label: string;
  type: string;
  section?: string;
  options?: string[];
  required?: boolean;
  allow_notes?: boolean;
}

export default function QuickScanDialog() {
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<{ file: File; preview: string }[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanStage, setScanStage] = useState<string>("");
  const [result, setResult] = useState<Record<string, any> | null>(null);
  const [header, setHeader] = useState<Record<string, any> | null>(null);
  const [detectedCategory, setDetectedCategory] = useState<{ slug: string; name: string } | null>(null);
  const [matchedTemplate, setMatchedTemplate] = useState<{ id: string; name: string; fields: TemplateField[] } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const [creatingJob, setCreatingJob] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editHeader, setEditHeader] = useState<Record<string, any>>({});
  const [editResult, setEditResult] = useState<Record<string, any>>({});
  const [engineers, setEngineers] = useState<{ user_id: string; full_name: string }[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragCounter = useRef(0);
  const { toast } = useToast();

  // Fetch engineers and customers for dropdowns
  useEffect(() => {
    if (!open) return;
    supabase.from("profiles").select("user_id, full_name").then(({ data }) => {
      if (data) setEngineers(data.filter(p => p.full_name));
    });
    supabase.from("customers").select("id, name").order("name").then(({ data }) => {
      if (data) setCustomers(data);
    });
  }, [open]);
  const navigate = useNavigate();

  const handleFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    const accepted = Array.from(files)
      .filter((f) => f.type.startsWith("image/") || f.type === "application/pdf")
      .slice(0, 5);
    const newImages = accepted.map((file) => ({
      file,
      preview: file.type === "application/pdf" ? "" : URL.createObjectURL(file),
    }));
    setImages((prev) => [...prev, ...newImages].slice(0, 5));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, []);

  const removeImage = (idx: number) => {
    setImages((prev) => {
      if (prev[idx].preview) URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setCameraError(null);
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
        }
      }, 50);
    } catch (err: any) {
      const msg = err.name === "NotAllowedError"
        ? "Camera permission denied. Please allow camera access in your browser settings."
        : err.name === "NotFoundError"
        ? "No camera found on this device."
        : `Camera error: ${err.message}`;
      setCameraError(msg);
      toast({ title: "Camera unavailable", description: msg, variant: "destructive" });
    }
  };

  const captureFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `camera-capture-${Date.now()}.jpg`, { type: "image/jpeg" });
        const preview = URL.createObjectURL(file);
        setImages((prev) => [...prev, { file, preview }].slice(0, 5));
        toast({ title: "Photo captured", description: `${images.length + 1} of 5 max` });
      },
      "image/jpeg",
      0.92
    );
  };

  const reset = () => {
    images.forEach((img) => { if (img.preview) URL.revokeObjectURL(img.preview); });
    setImages([]);
    setResult(null);
    setHeader(null);
    setCopied(false);
    setDetectedCategory(null);
    setMatchedTemplate(null);
    setScanStage("");
    setEditing(false);
    setEditHeader({});
    setEditResult({});
    stopCamera();
  };

  useEffect(() => {
    if (!open) stopCamera();
  }, [open, stopCamera]);

  const fileToBase64 = async (file: File): Promise<{ image_base64: string; mime_type: string }> => {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return {
      image_base64: btoa(binary),
      mime_type: file.type || "image/jpeg",
    };
  };

  const hasStructuredValues = (record?: Record<string, any> | null) =>
    Object.values(record ?? {}).some((value) => value !== undefined && value !== null && value !== "");

  const toOcrFieldPayload = (fields: TemplateField[]) =>
    fields.map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      section: f.section,
      options: f.options,
    }));

  const normalizeScanText = (value: unknown) =>
    typeof value === "string" ? value.trim() : "";

  const normalizeFieldLabel = (value: string) =>
    value
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/\bno of\b/g, "number of")
      .replace(/\bdoes the\b/g, "")
      .replace(/\bdo the\b/g, "")
      .replace(/\bis the\b/g, "")
      .replace(/\bare the\b/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const isCommentLikeField = (field: TemplateField) => {
    const label = normalizeFieldLabel(field.label);
    return label.includes("comment") || label.includes("additional notes");
  };

  const matchesStructuredCommentLabel = (commentLabel: string, fieldLabel: string) => {
    const normalizedCommentLabel = normalizeFieldLabel(commentLabel);
    const normalizedFieldLabel = normalizeFieldLabel(fieldLabel);

    if (!normalizedCommentLabel || !normalizedFieldLabel) return false;
    if (normalizedCommentLabel === normalizedFieldLabel) return true;
    if (normalizedCommentLabel.length >= 8 && normalizedFieldLabel.includes(normalizedCommentLabel)) return true;
    if (normalizedFieldLabel.length >= 8 && normalizedCommentLabel.includes(normalizedFieldLabel)) return true;

    return false;
  };

  const cleanStructuredCommentFields = (
    currentResult: Record<string, any>,
    fields: TemplateField[] = [],
  ) => {
    const nextResult = { ...currentResult };
    const commentFields = fields.filter(isCommentLikeField);

    if (commentFields.length === 0) return nextResult;

    const structuredFields = fields.filter((field) => !commentFields.some((commentField) => commentField.id === field.id));

    for (const commentField of commentFields) {
      const rawValue = normalizeScanText(nextResult[commentField.id]);
      if (!rawValue) continue;

      const unmatchedLines: string[] = [];

      for (const rawLine of rawValue.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;

        const colonIndex = line.indexOf(":");
        if (colonIndex === -1) {
          unmatchedLines.push(line);
          continue;
        }

        const lineLabel = line.slice(0, colonIndex).trim();
        const lineValue = line.slice(colonIndex + 1).trim();

        if (!lineLabel || !lineValue) {
          unmatchedLines.push(line);
          continue;
        }

        const matchedField = structuredFields.find((field) => matchesStructuredCommentLabel(lineLabel, field.label));
        if (!matchedField) {
          unmatchedLines.push(line);
          continue;
        }

        const existingValue = nextResult[matchedField.id];
        if (existingValue === undefined || existingValue === null || existingValue === "") {
          if (matchedField.type === "number") {
            const numericValue = Number(lineValue);
            nextResult[matchedField.id] = Number.isFinite(numericValue) ? numericValue : lineValue;
          } else {
            nextResult[matchedField.id] = lineValue;
          }
        }
      }

      if (unmatchedLines.length > 0) {
        nextResult[commentField.id] = unmatchedLines.join("\n");
      } else {
        delete nextResult[commentField.id];
      }
    }

    return nextResult;
  };

  const getCustomerSignedNameFieldId = (
    fields: TemplateField[] = [],
    currentHeader?: Record<string, any> | null,
    currentResult?: Record<string, any> | null,
  ) =>
    fields.find((field) => {
      const label = normalizeFieldLabel(field.label);
      const headerCustomer = normalizeScanText(currentHeader?.customer);
      const headerSignedName = normalizeScanText(currentHeader?.customer_signed_name);
      const currentValue = normalizeScanText(currentResult?.[field.id]);

      // Only match fields that are specifically about the person who SIGNED,
      // NOT generic "Customer Name" fields (which hold the company name like "ATC").
      return (
        label.includes("signed name") ||
        label.includes("printed name") ||
        label.includes("signatory") ||
        label.includes("sign off name") ||
        ((label === "customer name" || label === "client name") && !!headerSignedName && currentValue === headerSignedName) ||
        ((label === "customer name" || label === "client name") && !!headerCustomer && !!currentValue && currentValue !== headerCustomer)
      );
    })?.id;

  const syncCustomerSignedNameEdits = ({
    nextHeader,
    nextResult,
    previousHeader,
    previousResult,
    fields,
  }: {
    nextHeader: Record<string, any>;
    nextResult: Record<string, any>;
    previousHeader: Record<string, any> | null;
    previousResult: Record<string, any> | null;
    fields: TemplateField[];
  }) => {
    const customerSignedNameFieldId =
      getCustomerSignedNameFieldId(fields, nextHeader, nextResult) ||
      getCustomerSignedNameFieldId(fields, previousHeader, previousResult);

    if (!customerSignedNameFieldId) return { nextHeader, nextResult };

    const previousHeaderName = normalizeScanText(previousHeader?.customer_signed_name);
    const nextHeaderName = normalizeScanText(nextHeader.customer_signed_name);
    const previousFieldName = normalizeScanText(previousResult?.[customerSignedNameFieldId]);
    const nextFieldName = normalizeScanText(nextResult[customerSignedNameFieldId]);

    const headerChanged = nextHeaderName !== previousHeaderName;
    const fieldChanged = nextFieldName !== previousFieldName;

    if (fieldChanged && !headerChanged && nextFieldName) {
      nextHeader.customer_signed_name = nextFieldName;
    } else if (headerChanged && !fieldChanged && nextHeaderName) {
      nextResult[customerSignedNameFieldId] = nextHeaderName;
    }

    return { nextHeader, nextResult };
  };

  const invokeOcr = async (
    imagePayloads: { image_base64: string; mime_type: string }[],
    templateName: string,
    fields: TemplateField[],
  ) => {
    const { data, error } = await supabase.functions.invoke("ocr-job-sheet", {
      body: {
        images: imagePayloads,
        template_name: templateName,
        fields: toOcrFieldPayload(fields),
      },
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    return (data ?? {}) as { extracted?: Record<string, any>; header?: Record<string, any> };
  };

  const chunkFields = (fields: TemplateField[], size: number) => {
    const chunks: TemplateField[][] = [];
    for (let i = 0; i < fields.length; i += size) {
      chunks.push(fields.slice(i, i + size));
    }
    return chunks;
  };

  const scan = async () => {
    if (images.length === 0) return;
    setScanning(true);
    setResult(null);
    setHeader(null);
    setDetectedCategory(null);
    setMatchedTemplate(null);
    stopCamera();

    try {
      const imagePayloads = await Promise.all(images.map((img) => fileToBase64(img.file)));

      setScanStage("Identifying document type…");

      const { data: categories } = await supabase
        .from("job_categories")
        .select("name, slug")
        .order("sort_order");

      const categoryNames = (categories || []).map((c: any) => c.name);
      const categoryIdentifyFields = [
        {
          id: "detected_category",
          label: "Document Category",
          type: "select",
          options: categoryNames,
        },
        {
          id: "confidence",
          label: "Confidence",
          type: "select",
          options: ["high", "medium", "low"],
        },
      ];

      const { data: identifyData, error: identifyError } = await supabase.functions.invoke("ocr-job-sheet", {
        body: {
          images: imagePayloads,
          template_name: "Category Identification",
          fields: categoryIdentifyFields,
        },
      });

      if (identifyError) throw identifyError;
      if (identifyData?.error) throw new Error(identifyData.error);

      const detectedName = identifyData?.extracted?.detected_category;
      const matchedCat = (categories || []).find(
        (c: any) => c.name.toLowerCase() === (detectedName || "").toLowerCase()
      );

      if (matchedCat) {
        setDetectedCategory({ slug: matchedCat.slug, name: matchedCat.name });
      }

      let templateFields: TemplateField[] = [];
      let templateName = "General Inspection Sheet";
      let templateRecord: any = null;

      if (matchedCat) {
        setScanStage(`Detected: ${matchedCat.name} — loading template…`);

        const { data: templates } = await supabase
          .from("job_sheet_templates")
          .select("id, name, fields, job_category")
          .eq("job_category", matchedCat.slug)
          .limit(1);

        if (templates && templates.length > 0) {
          templateRecord = templates[0];
          templateName = templateRecord.name;
          templateFields = (templateRecord.fields as any[] || []).map((f: any) => ({
            id: f.id,
            label: f.label,
            type: f.type,
            section: f.section,
            options: f.options,
            required: f.required,
            allow_notes: f.allow_notes,
          }));
          setMatchedTemplate({ id: templateRecord.id, name: templateName, fields: templateFields });
        }
      }

      if (templateFields.length === 0) {
        templateFields = [
          { id: "description", label: "Description / Notes", type: "text" },
          { id: "findings", label: "Findings / Results", type: "text" },
          { id: "actions_required", label: "Actions Required", type: "text" },
          { id: "materials_used", label: "Materials / Parts Used", type: "text" },
          { id: "overall_result", label: "Overall Result", type: "pass_fail" },
          { id: "additional_notes", label: "Additional Notes / Comments", type: "text" },
        ];
      }

      let extracted: Record<string, any> = {};
      let headerData: Record<string, any> = {};

      if (templateFields.length > 12) {
        const fieldChunks = chunkFields(templateFields, 12);
        for (let index = 0; index < fieldChunks.length; index++) {
          setScanStage(`Extracting data from sheet… (${index + 1}/${fieldChunks.length})`);
          const chunkData = await invokeOcr(imagePayloads, templateName, fieldChunks[index]);

          if (hasStructuredValues(chunkData.extracted)) {
            extracted = { ...extracted, ...(chunkData.extracted || {}) };
          }
          if (hasStructuredValues(chunkData.header)) {
            headerData = { ...headerData, ...(chunkData.header || {}) };
          }
        }
      } else {
        setScanStage("Extracting data from sheet…");
        const data = await invokeOcr(imagePayloads, templateName, templateFields);
        extracted = data.extracted || {};
        headerData = { ...headerData, ...(data.header || {}) };
      }

      if (!hasStructuredValues(extracted)) {
        setScanStage("Re-trying extraction…");
        const retryData = await invokeOcr(imagePayloads, templateName, templateFields);

        if (hasStructuredValues(retryData.extracted)) {
          extracted = { ...extracted, ...(retryData.extracted || {}) };
        }
        if (hasStructuredValues(retryData.header)) {
          headerData = { ...headerData, ...(retryData.header || {}) };
        }
      }

      if (!hasStructuredValues(extracted)) {
        throw new Error("AI could not extract the template fields from this sheet. Please retry with a clearer photo.");
      }

      const isPressureTest = matchedCat?.slug?.includes("pressure_test") || templateName?.toLowerCase().includes("pressure");
      if (isPressureTest) {
        if (!extracted.test_pressure_bar && extracted.test_pressure_bar !== 0) {
          extracted.test_pressure_bar = 12;
        }
        if (!extracted.hold_time_minutes && extracted.hold_time_minutes !== 0) {
          extracted.hold_time_minutes = 15;
        }
      }

      console.log("[QuickScan] OCR header data:", JSON.stringify(headerData));
      const headerToFieldMap: Record<string, string[]> = {
        date: ["date", "inspection_date"],
        riser_location: ["riser_location"],
        po_ref: ["po_number", "po_ref", "reference"],
        site: ["site_details", "site"],
        customer: ["customer_details", "customer_name"],
        engineer: ["technician_name", "engineer_name"],
      };
      for (const [headerKey, fieldKeys] of Object.entries(headerToFieldMap)) {
        if (headerData[headerKey]) {
          const hasExisting = fieldKeys.some((fk) => extracted[fk]);
          if (!hasExisting) {
            const matchingKey = fieldKeys.find((fk) => templateFields.some((f) => f.id === fk)) || fieldKeys[0];
            extracted[matchingKey] = headerData[headerKey];
          }
        }
      }

      if (headerData.engineer && engineers.length > 0) {
        headerData.engineer = fuzzyMatchEngineer(headerData.engineer, engineers);
      }

      const cleanedResult = cleanStructuredCommentFields(extracted, templateFields);
      const normalizedResult = applyExposedOutletOverrides(cleanedResult, templateFields);

      setResult(normalizedResult);
      setHeader(headerData);
      toast({ title: "Scan complete", description: `Detected: ${detectedCategory?.name || matchedCat?.name || "General"} — review the extracted data below.` });
    } catch (err: any) {
      toast({ title: "Scan failed", description: err.message || "Unknown error", variant: "destructive" });
    } finally {
      setScanning(false);
      setScanStage("");
    }
  };

  const copyToClipboard = () => {
    const lines: string[] = [];
    if (detectedCategory) {
      lines.push(`Category: ${detectedCategory.name}`);
      lines.push("");
    }
    if (header) {
      if (header.customer) lines.push(`Customer: ${header.customer}`);
      if (header.site) lines.push(`Site: ${header.site}`);
      if (header.date) lines.push(`Date: ${header.date}`);
      if (header.po_ref) lines.push(`Reference: ${header.po_ref}`);
      if (header.engineer) lines.push(`Engineer: ${header.engineer}`);
      if (header.riser_location) lines.push(`Location: ${header.riser_location}`);
      lines.push("");
    }
    if (result) {
      Object.entries(result).forEach(([key, value]) => {
        if (value) lines.push(`${key.replace(/_/g, " ")}: ${value}`);
      });
    }
    navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied to clipboard" });
  };
  const downloadPdf = async (mode: "download" | "preview") => {
    if (!matchedTemplate || !result) {
      toast({ title: "No template matched", description: "Cannot generate PDF without a matched template.", variant: "destructive" });
      return;
    }
    setGeneratingPdf(true);
    try {
      const template = {
        id: matchedTemplate.id,
        name: matchedTemplate.name,
        description: null as string | null,
        fields: matchedTemplate.fields.map(f => ({
          ...f,
          required: f.required ?? false,
          allow_notes: f.allow_notes ?? false,
          section: f.section ?? "General",
        })),
      };
      const jobInfo = {
        address: header?.site || null,
        customer: header?.customer || null,
        reference_number: header?.po_ref || "",
      };
      const exportResult = applyExposedOutletOverrides(
        cleanStructuredCommentFields(result, matchedTemplate.fields),
        matchedTemplate.fields,
      );

      // Build preloaded signatures from header data so the preview PDF includes them
      const preloadedSignatures: any = {};
      const preloadedSigImages: Record<string, HTMLImageElement> = {};

      // Customer signature from scan header
      if (header?.customer_signed_name) {
        const custSigId = "scan-customer";
        preloadedSignatures.customerSig = { id: custSigId, signer_name: header.customer_signed_name, signer_role: "customer" };

        // Attempt to crop the customer signature image from the scanned sheet
        if (header?.customer_signature_bbox && images.length > 0) {
          try {
            const bbox = header.customer_signature_bbox as any;
            const pageIdx = bbox.page_index || 0;
            const sourceImage = images[pageIdx];
            if (sourceImage) {
              const cropped = await cropSignatureFromScanSource(sourceImage, bbox);
              if (cropped?.image) {
                preloadedSigImages[custSigId] = cropped.image;
              } else {
                console.log("[QuickScan] Customer signature crop could not be refined");
              }
            }
          } catch { /* skip crop failure */ }
        }
      }

      // Engineer signature — try profile lookup
      if (header?.engineer) {
        const engSigId = "scan-engineer";
        preloadedSignatures.engineerSig = { id: engSigId, signer_name: header.engineer, signer_role: "engineer" };

        // Try to load profile signature
        try {
          const { data: profMatch } = await supabase
            .from("profiles")
            .select("user_id, full_name, signature_data")
            .ilike("full_name", header.engineer.trim())
            .maybeSingle();
          if (profMatch?.signature_data) {
            const sigImg = new Image();
            await new Promise<void>((resolve) => {
              sigImg.onload = () => resolve();
              sigImg.onerror = () => resolve();
              sigImg.src = profMatch.signature_data;
            });
            preloadedSigImages[engSigId] = sigImg;
          }
        } catch { /* skip */ }

        // Also try cropping from scan
        if (!preloadedSigImages[engSigId] && header?.engineer_signature_bbox && images.length > 0) {
          try {
            const bbox = header.engineer_signature_bbox as any;
            const pageIdx = bbox.page_index || 0;
            const sourceImage = images[pageIdx];
            if (sourceImage) {
              const cropped = await cropSignatureFromScanSource(sourceImage, bbox);
              if (cropped?.image) {
                preloadedSigImages[engSigId] = cropped.image;
              } else {
                console.log("[QuickScan] Engineer signature crop could not be refined");
              }
            }
          } catch { /* skip */ }
        }
      }

      preloadedSignatures.sigImages = preloadedSigImages;

      const { base64, fileName } = await generateJobSheetPdf(
        template,
        // Inject customer_sign_date into formData so the PDF uses it for the signature date
        {
          ...exportResult,
          _customer_sign_date: header?.customer_sign_date,
          _customer_signed_name: header?.customer_signed_name,
          _number_of_outlets:
            header?.number_of_outlets ??
            exportResult.number_of_outlets ??
            exportResult.no_of_outlets,
        },
        jobInfo,
        "scan-preview",
        header?.engineer,
        null,
        detectedCategory?.name,
        preloadedSignatures,
      );

      const byteCharacters = atob(base64);
      const byteArray = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) byteArray[i] = byteCharacters.charCodeAt(i);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);

      if (mode === "download") {
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast({ title: "PDF downloaded", description: fileName });
      } else {
        window.open(url, "_blank");
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        toast({ title: "PDF opened for printing" });
      }
    } catch (err: any) {
      toast({ title: "PDF generation failed", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingPdf(false);
    }
  };

  const createJobFromScan = async () => {
    if (!header && !result) return;
    setCreatingJob(true);
    try {
      const jobName = header?.customer
        ? `${header.customer} - ${detectedCategory?.name || "Scanned Sheet"}`
        : detectedCategory?.name || "Scanned Sheet";

      const { data: job, error } = await supabase
        .from("jobs")
        .insert({
          name: jobName,
          customer: header?.customer || null,
          address: header?.site || null,
          status: "active",
          priority: "medium",
          category: detectedCategory?.slug || "general",
        })
        .select("id")
        .single();

      if (error) throw error;

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;

      // If we have a matched template and extracted data, create a job_sheet_response
      if (matchedTemplate && result && userId) {
        await supabase
          .from("job_sheet_responses")
          .insert({
            job_id: job.id,
            template_id: matchedTemplate.id,
            submitted_by: userId,
            responses: result,
            status: "draft",
          });
      }

      // Helper: upload a cropped signature blob and create a record
      const uploadSignature = async (
        blob: Blob, jobId: string, signerName: string, role: string, signerId: string
      ) => {
        const sigPath = `${role}/${jobId}-${Date.now()}.png`;
        const { error: uploadErr } = await supabase.storage
          .from("signatures")
          .upload(sigPath, blob, { contentType: "image/png" });
        if (!uploadErr) {
          await supabase.from("job_signatures").insert({
            job_id: jobId,
            signer_id: signerId,
            signer_name: signerName,
            signer_role: role,
            file_path: sigPath,
          });
        }
      };

      // Auto-import engineer signature — prefer cropped image from scan, fall back to profile
      if (header?.engineer && userId) {
        const engineerName = header.engineer.trim();
        if (engineerName) {
          const engineerBbox = header.engineer_signature_bbox;
          let imported = false;

          // Try cropping from scanned image first
          if (engineerBbox && typeof engineerBbox === "object" && "x_min" in engineerBbox) {
            const pageIdx = (engineerBbox as any).page_index || 0;
            const sourceImage = images[pageIdx];
            const cropped = sourceImage ? await cropSignatureFromScanSource(sourceImage, engineerBbox as any) : null;
            if (cropped?.blob) {
              await uploadSignature(cropped.blob, job.id, engineerName, "engineer", userId);
              imported = true;
            }
          }

          // Fall back to profile signature
          if (!imported) {
            const { data: profileMatch } = await supabase
              .from("profiles")
              .select("user_id, signature_data")
              .ilike("full_name", `%${engineerName.split(" ")[0]}%`)
              .limit(1)
              .maybeSingle();

            if (profileMatch?.signature_data) {
              try {
                const res = await fetch(profileMatch.signature_data);
                const blob = await res.blob();
                await uploadSignature(blob, job.id, engineerName, "engineer", profileMatch.user_id);
                imported = true;
              } catch { /* skip */ }
            }
          }

          // Last resort: name-only record
          if (!imported) {
            await supabase.from("job_signatures").insert({
              job_id: job.id, signer_id: userId, signer_name: engineerName, signer_role: "engineer", file_path: "",
            });
          }
        }
      }

      // Auto-import customer signature — crop from scanned image
      console.log("[QuickScan] Customer signed name from header:", header?.customer_signed_name);
      console.log("[QuickScan] Customer signature bbox:", header?.customer_signature_bbox);
      const customerSignedName = header?.customer_signed_name ? (header.customer_signed_name as string).trim() : "";
      if (customerSignedName && userId) {
        const customerBbox = header.customer_signature_bbox;
        let imported = false;

        if (customerBbox && typeof customerBbox === "object" && "x_min" in customerBbox) {
          const pageIdx = (customerBbox as any).page_index || 0;
          const sourceImage = images[pageIdx];
          const cropped = sourceImage ? await cropSignatureFromScanSource(sourceImage, customerBbox as any) : null;
          if (cropped?.blob) {
            await uploadSignature(cropped.blob, job.id, customerSignedName, "customer", userId);
            imported = true;
          }
        }

        if (!imported) {
          await supabase.from("job_signatures").insert({
            job_id: job.id, signer_id: userId, signer_name: customerSignedName, signer_role: "customer", file_path: "",
          });
        }
      }

      toast({ title: "Job created", description: `${jobName}` });
      setOpen(false);
      reset();
      navigate(`/jobs/${job.id}`);
    } catch (err: any) {
      toast({ title: "Failed to create job", description: err.message, variant: "destructive" });
    } finally {
      setCreatingJob(false);
    }
  };

  // Build a label lookup from the matched template
  const fieldLabelMap: Record<string, string> = {};
  if (matchedTemplate) {
    for (const f of matchedTemplate.fields) {
      fieldLabelMap[f.id] = f.label;
    }
  }

  const visibleResultEntries = Object.entries((editing ? editResult : result) || {}).filter(([key, value]) => {
    if (key.startsWith("_") || key.endsWith("_notes")) return false;
    const activeResult = (editing ? editResult : result) || {};
    const hasValue = value !== undefined && value !== null && value !== "";
    const hasNote = !!activeResult[`${key}_notes`];
    return hasValue || hasNote;
  });

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <ScanLine className="mr-2 h-4 w-4" /> Scan Sheet
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); } setOpen(v); }}>
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          aria-describedby="quick-scan-desc"
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current++; setIsDragOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current--; if (dragCounter.current === 0) setIsDragOver(false); }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current = 0; setIsDragOver(false); handleFiles(e.dataTransfer.files); }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-primary" />
              Quick Scan — AI Sheet Reader
            </DialogTitle>
            <DialogDescription id="quick-scan-desc">
              Upload or photograph a handwritten sheet and AI will identify the type and extract the data.
            </DialogDescription>
          </DialogHeader>

          {/* Hidden canvas for camera capture */}
          <canvas ref={canvasRef} className="hidden" />

          {!result ? (
            <div className="space-y-4">
              {/* Live camera viewfinder */}
              {cameraActive ? (
                <div className="relative rounded-lg overflow-hidden border-2 border-primary bg-black">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full max-h-[400px] object-contain"
                  />
                  <div className="absolute inset-4 border-2 border-dashed border-white/40 rounded-lg pointer-events-none" />
                  <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/70 to-transparent flex items-center justify-center gap-3">
                    <Button
                      onClick={captureFrame}
                      size="lg"
                      className="rounded-full h-14 w-14 p-0 bg-white hover:bg-white/90 text-black shadow-lg"
                      disabled={images.length >= 5}
                    >
                      <Aperture className="h-7 w-7" />
                    </Button>
                    <Button
                      onClick={stopCamera}
                      variant="ghost"
                      size="sm"
                      className="text-white hover:text-white hover:bg-white/20"
                    >
                      <VideoOff className="mr-2 h-4 w-4" /> Close Camera
                    </Button>
                  </div>
                  {images.length > 0 && (
                    <div className="absolute top-2 right-2">
                      <Badge variant="secondary" className="bg-black/60 text-white border-0">
                        {images.length}/5 captured
                      </Badge>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Drop zone */}
                  <div
                    onDragEnter={(e) => { e.preventDefault(); dragCounter.current++; setIsDragOver(true); }}
                    onDragLeave={(e) => { e.preventDefault(); dragCounter.current--; if (dragCounter.current === 0) setIsDragOver(false); }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    onClick={() => fileRef.current?.click()}
                    className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors ${
                      isDragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
                    }`}
                  >
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Drop photos of a handwritten sheet, or <span className="text-primary font-medium">click to browse</span>
                    </p>
                    <p className="text-xs text-muted-foreground">Up to 5 files • JPG, PNG, PDF</p>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                  />
                </>
              )}

              {/* Camera / upload buttons */}
              {!cameraActive && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={startCamera}>
                    <Video className="mr-2 h-4 w-4" /> Use Camera
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const inp = document.createElement("input");
                      inp.type = "file";
                      inp.accept = "image/*";
                      inp.capture = "environment";
                      inp.onchange = () => handleFiles(inp.files);
                      inp.click();
                    }}
                  >
                    <Camera className="mr-2 h-4 w-4" /> Take Photo
                  </Button>
                </div>
              )}

              {cameraError && (
                <p className="text-sm text-destructive">{cameraError}</p>
              )}

              {/* Preview thumbnails */}
              {images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative group">
                      {img.file.type === "application/pdf" ? (
                        <div className="h-24 w-24 flex items-center justify-center rounded-md border bg-muted">
                          <span className="text-xs font-medium text-muted-foreground">PDF</span>
                        </div>
                      ) : (
                        <img src={img.preview} alt={`Page ${idx + 1}`} className="h-24 w-24 object-cover rounded-md border" />
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <Button onClick={scan} disabled={images.length === 0 || scanning} className="w-full">
                {scanning ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {scanStage || "Scanning with AI…"}</>
                ) : (
                  <><ScanLine className="mr-2 h-4 w-4" /> Scan & Extract</>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Detected category badge */}
              {detectedCategory && (
                <div className="flex items-center gap-2 justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className="text-xs">📋 {detectedCategory.name}</Badge>
                    {matchedTemplate && (
                      <Badge variant="outline" className="text-xs">Template: {matchedTemplate.name}</Badge>
                    )}
                  </div>
                  <Button
                    variant={editing ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      if (editing) {
                        const nextHeader = { ...(header || {}), ...editHeader };
                        const nextResult = { ...(result || {}), ...editResult };
                        const syncedEdits = syncCustomerSignedNameEdits({
                          nextHeader,
                          nextResult,
                          previousHeader: header,
                          previousResult: result,
                          fields: matchedTemplate?.fields || [],
                        });
                        const cleanedResult = cleanStructuredCommentFields(syncedEdits.nextResult, matchedTemplate?.fields || []);
                        const normalizedResult = applyExposedOutletOverrides(cleanedResult, matchedTemplate?.fields || []);

                        setHeader(syncedEdits.nextHeader);
                        setResult(normalizedResult);
                        setEditing(false);
                        toast({ title: "Changes saved" });
                      } else {
                        setEditHeader({ ...header });
                        setEditResult({ ...result });
                        setEditing(true);
                      }
                    }}
                  >
                    {editing ? <><Save className="mr-2 h-4 w-4" /> Save</> : <><Pencil className="mr-2 h-4 w-4" /> Edit</>}
                  </Button>
                </div>
              )}

              {/* Header info */}
              {(header && Object.values(header).some(Boolean)) && (
                <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Header Info</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {/* Engineer — dropdown from system */}
                    {(header.engineer || editing) && (
                      <div className="col-span-2 sm:col-span-1">
                        <span className="text-muted-foreground text-xs">Engineer:</span>
                        {editing ? (
                          <Select
                            value={editHeader.engineer || ""}
                            onValueChange={(v) => setEditHeader((p) => ({ ...p, engineer: v }))}
                          >
                            <SelectTrigger className="h-8 mt-1">
                              <SelectValue placeholder="Select engineer" />
                            </SelectTrigger>
                            <SelectContent>
                              {engineers.map((eng) => (
                                <SelectItem key={eng.user_id} value={eng.full_name}>
                                  {eng.full_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="font-medium ml-1">{header.engineer}</span>
                        )}
                      </div>
                    )}
                    {/* Customer — dropdown from system */}
                    {(header.customer || editing) && (
                      <div className="col-span-2 sm:col-span-1">
                        <span className="text-muted-foreground text-xs">Customer:</span>
                        {editing ? (
                          <Select
                            value={editHeader.customer || ""}
                            onValueChange={(v) => setEditHeader((p) => ({ ...p, customer: v }))}
                          >
                            <SelectTrigger className="h-8 mt-1">
                              <SelectValue placeholder="Select customer" />
                            </SelectTrigger>
                            <SelectContent>
                              {customers.map((c) => (
                                <SelectItem key={c.id} value={c.name}>
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="font-medium ml-1">{header.customer}</span>
                        )}
                      </div>
                    )}
                    {/* Site — text input */}
                    {(header.site || editing) && (
                      <div>
                        <span className="text-muted-foreground text-xs">Site:</span>
                        {editing ? (
                          <Input className="h-8 mt-1" value={editHeader.site || ""} onChange={(e) => setEditHeader((p) => ({ ...p, site: e.target.value }))} />
                        ) : (
                          <span className="font-medium ml-1">{header.site}</span>
                        )}
                      </div>
                    )}
                    {(header.date || editing) && (
                      <div>
                        <span className="text-muted-foreground text-xs">Date:</span>
                        {editing ? (
                          <Input className="h-8 mt-1" value={editHeader.date || ""} onChange={(e) => setEditHeader((p) => ({ ...p, date: e.target.value }))} />
                        ) : (
                          <span className="font-medium ml-1">{header.date}</span>
                        )}
                      </div>
                    )}
                    {(header.po_ref || editing) && (
                      <div>
                        <span className="text-muted-foreground text-xs">Reference:</span>
                        {editing ? (
                          <Input className="h-8 mt-1" value={editHeader.po_ref || ""} onChange={(e) => setEditHeader((p) => ({ ...p, po_ref: e.target.value }))} />
                        ) : (
                          <span className="font-medium ml-1">{header.po_ref}</span>
                        )}
                      </div>
                    )}
                    {(header.riser_location || editing) && (
                      <div>
                        <span className="text-muted-foreground text-xs">Location:</span>
                        {editing ? (
                          <Input className="h-8 mt-1" value={editHeader.riser_location || ""} onChange={(e) => setEditHeader((p) => ({ ...p, riser_location: e.target.value }))} />
                        ) : (
                          <span className="font-medium ml-1">{header.riser_location}</span>
                        )}
                      </div>
                    )}
                    {(header.customer_signed_name || editing) && (
                      <div>
                        <span className="text-muted-foreground text-xs">Customer Signed Name:</span>
                        {editing ? (
                          <Input className="h-8 mt-1" value={editHeader.customer_signed_name || ""} onChange={(e) => setEditHeader((p) => ({ ...p, customer_signed_name: e.target.value }))} />
                        ) : (
                          <span className="font-medium ml-1">{header.customer_signed_name}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Extracted fields */}
              <div className="rounded-lg border p-4 space-y-3">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Extracted Data</p>
                {visibleResultEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No data could be extracted from this sheet.</p>
                ) : (
                  <div className="space-y-2">
                    {visibleResultEntries.map(([key, value]) => {
                      const fieldDef = matchedTemplate?.fields.find(f => f.id === key);
                      const noteKey = `${key}_notes`;
                      const noteValue = (editing ? editResult : result)?.[noteKey];
                      return (
                        <div key={key} className="flex items-start gap-2">
                          <Badge variant="secondary" className="shrink-0 mt-0.5 text-xs min-w-[100px]">
                            {fieldLabelMap[key] || key.replace(/_/g, " ")}
                          </Badge>
                          <div className="flex-1 space-y-1">
                            {editing ? (
                              fieldDef?.type === "pass_fail" ? (
                                <Select value={editResult[key] || ""} onValueChange={(v) => setEditResult((p) => ({ ...p, [key]: v }))}>
                                  <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="pass">✅ Pass</SelectItem>
                                    <SelectItem value="fail">❌ Fail</SelectItem>
                                    <SelectItem value="n/a">N/A</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : fieldDef?.type === "select" && fieldDef.options?.length ? (
                                <Select value={editResult[key] || ""} onValueChange={(v) => setEditResult((p) => ({ ...p, [key]: v }))}>
                                  <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {fieldDef.options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Input className="h-8 w-full" value={editResult[key] ?? ""} onChange={(e) => setEditResult((p) => ({ ...p, [key]: e.target.value }))} />
                              )
                            ) : (
                              <p className="text-sm">
                                {value === true ? "✅ Yes" : value === false ? "❌ No" : value === "pass" ? "✅ Pass" : value === "fail" ? "❌ Fail" : value === "n/a" ? "N/A" : String(value)}
                              </p>
                            )}

                            {editing ? (
                              <Input
                                className="h-7 w-full text-xs border-dashed"
                                placeholder="Add note..."
                                value={editResult[noteKey] ?? ""}
                                onChange={(e) => setEditResult((p) => ({ ...p, [noteKey]: e.target.value }))}
                              />
                            ) : noteValue ? (
                              <p className="text-xs text-muted-foreground italic">Note: {String(noteValue)}</p>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <Button onClick={copyToClipboard} variant="outline" size="sm">
                  {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                  {copied ? "Copied" : "Copy All"}
                </Button>
                <Button onClick={createJobFromScan} disabled={creatingJob || editing} size="sm">
                  {creatingJob ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…</>
                  ) : (
                    <><Plus className="mr-2 h-4 w-4" /> Create Job from This</>
                  )}
                </Button>
                {matchedTemplate && (
                  <>
                    <Button onClick={() => downloadPdf("preview")} disabled={generatingPdf || editing} variant="outline" size="sm">
                      {generatingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                      Print PDF
                    </Button>
                    <Button onClick={() => downloadPdf("download")} disabled={generatingPdf || editing} variant="outline" size="sm">
                      {generatingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                      Download PDF
                    </Button>
                  </>
                )}
                <Button onClick={() => { setResult(null); setHeader(null); setDetectedCategory(null); setMatchedTemplate(null); }} variant="ghost" size="sm">
                  <ScanLine className="mr-2 h-4 w-4" /> Scan Another
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
