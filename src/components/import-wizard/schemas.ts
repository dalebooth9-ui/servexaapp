// Target field schemas for the Import Wizard.
// Each entity lists the fields users can map their source columns onto.

export type ImportEntity = "customers" | "sites" | "assets";

export interface TargetField {
  key: string;
  label: string;
  required?: boolean;
  aliases: string[]; // lowercased, punctuation-stripped
  hint?: string;
}

// Helper: normalise a header the same way we match aliases.
export const normaliseHeader = (h: string): string =>
  (h || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

export const ENTITY_SCHEMAS: Record<ImportEntity, {
  label: string;
  description: string;
  fields: TargetField[];
}> = {
  customers: {
    label: "Customers",
    description: "Companies / clients you invoice and schedule work for.",
    fields: [
      { key: "name", label: "Customer name", required: true, aliases: ["name", "company", "companyname", "customer", "customername", "client", "clientname", "business", "account", "accountname"] },
      { key: "contact_name", label: "Contact name", aliases: ["contact", "contactname", "primarycontact", "contactperson", "attention", "attn"] },
      { key: "email", label: "Email", aliases: ["email", "emailaddress", "mail", "contactemail"] },
      { key: "phone", label: "Phone", aliases: ["phone", "telephone", "tel", "mobile", "contactnumber", "phonenumber"] },
      { key: "address", label: "Billing address", aliases: ["address", "billingaddress", "invoiceaddress", "streetaddress", "addressline1", "postaladdress"] },
      { key: "notes", label: "Notes", aliases: ["notes", "comments", "remarks", "description"] },
    ],
  },
  sites: {
    label: "Sites",
    description: "Physical locations / premises where work happens.",
    fields: [
      { key: "name", label: "Site name", required: true, aliases: ["name", "sitename", "site", "location", "locationname", "building", "buildingname", "premises", "property", "propertyname"] },
      { key: "address", label: "Address", aliases: ["address", "siteaddress", "streetaddress", "addressline1"] },
      { key: "postcode", label: "Postcode", aliases: ["postcode", "postalcode", "zip", "zipcode"] },
      { key: "parent_customer", label: "Parent customer", aliases: ["customer", "customername", "client", "clientname", "company", "companyname", "account", "accountname", "parent", "parentcustomer"], hint: "We'll match this to an existing customer by name." },
      { key: "site_type", label: "Site type", aliases: ["type", "sitetype", "kind", "category"], hint: "region / site / building / zone (defaults to site)" },
      { key: "contact_name", label: "Site contact", aliases: ["contact", "contactname", "sitecontact"] },
      { key: "contact_phone", label: "Contact phone", aliases: ["contactphone", "phone", "telephone", "tel", "mobile"] },
      { key: "contact_email", label: "Contact email", aliases: ["contactemail", "email"] },
      { key: "notes", label: "Notes", aliases: ["notes", "comments", "remarks", "description"] },
    ],
  },
  assets: {
    label: "Assets",
    description: "Equipment such as extinguishers, dry risers, sprinklers, alarms.",
    fields: [
      { key: "name", label: "Asset name / type", required: true, aliases: ["name", "assetname", "description", "equipment", "equipmenttype", "type", "item", "product"] },
      { key: "asset_tag", label: "Asset tag / ID", aliases: ["assettag", "tag", "assetid", "id", "barcode", "reference", "ref"] },
      { key: "category", label: "Category", aliases: ["category", "assetcategory", "class", "classification", "group"] },
      { key: "make", label: "Make / manufacturer", aliases: ["make", "manufacturer", "brand"] },
      { key: "model", label: "Model", aliases: ["model", "modelnumber"] },
      { key: "serial_number", label: "Serial number", aliases: ["serial", "serialnumber", "sn"] },
      { key: "site", label: "Site", aliases: ["site", "sitename", "location", "locationname", "building", "premises"], hint: "We'll match this to an existing site by name/address." },
      { key: "install_date", label: "Install date", aliases: ["installdate", "installed", "commissiondate", "installationdate"] },
      { key: "warranty_expiry", label: "Warranty expiry", aliases: ["warranty", "warrantyexpiry", "warrantyend"] },
      { key: "status", label: "Status", aliases: ["status", "condition", "state"], hint: "operational / maintenance / faulty / decommissioned" },
      { key: "notes", label: "Notes", aliases: ["notes", "comments", "remarks", "description"] },
    ],
  },
};

export function getSchema(entity: ImportEntity) {
  return ENTITY_SCHEMAS[entity];
}
