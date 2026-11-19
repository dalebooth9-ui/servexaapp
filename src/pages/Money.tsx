import { lazy } from "react";
import GroupedPageTabs from "@/components/GroupedPageTabs";

const Quotes = lazy(() => import("./Quotes"));
const Invoices = lazy(() => import("./Invoices"));
const Agreements = lazy(() => import("./ContractAgreements"));
const Contracts = lazy(() => import("./ServiceContracts"));
const Renewals = lazy(() => import("./Renewals"));

export default function Money() {
  return <GroupedPageTabs title="Money" tabs={[
    { value: "quotes", label: "Quotes", content: <Quotes /> },
    { value: "invoices", label: "Invoices", content: <Invoices /> },
    { value: "agreements", label: "Agreements", content: <Agreements /> },
    { value: "contracts", label: "Contracts", content: <Contracts /> },
    { value: "renewals", label: "Renewals", content: <Renewals /> },
  ]} />;
}