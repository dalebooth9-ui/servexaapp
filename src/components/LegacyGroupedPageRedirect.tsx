import { Navigate, useLocation } from "react-router-dom";
import { groupedPageUrl } from "@/lib/groupedPages";

export default function LegacyGroupedPageRedirect() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={groupedPageUrl(pathname, search, hash)} replace />;
}