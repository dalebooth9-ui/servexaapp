import { useAuth } from "@/hooks/useAuth";
import EngineerDashboard from "@/components/EngineerDashboard";
import AdminDashboard from "@/components/AdminDashboard";

export default function Dashboard() {
  const { userRole } = useAuth();

  if (userRole === "engineer") {
    return <EngineerDashboard />;
  }

  if (userRole !== "admin") {
    return null;
  }

  return <AdminDashboard />;
}
